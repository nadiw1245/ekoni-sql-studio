'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SqlEngine, splitSqlStatements } = require('../server/sql-engine');
const { QueryHistoryStore } = require('../server/history');
const { BookmarkStore } = require('../server/bookmarks');
const { MySqlManager } = require('../server/mysql-connector');
const pro = require('../server/pro-features');

async function runTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ekoni-sql-test-'));
  const engine = new SqlEngine(tmpDir);
  const history = new QueryHistoryStore(path.join(tmpDir, 'history.json'));

  let passed = 0;
  const test = (name, fn) => {
    fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  };

  console.log('\nRunning EKONI SQL Studio Test Suite...\n');

  try {
    test('SQL Splitter: handles quotes, comments, multi-queries, and triggers', () => {
      const stmts = splitSqlStatements(`
        -- Comment with ; semicolon
        SELECT 'hello; world' AS msg;
        /* block comment ; */
        SELECT 1 + 2 AS sum_val;
      `);
      assert.strictEqual(stmts.length, 2);
      assert.ok(stmts[0].includes("'hello; world'"));
      assert.ok(stmts[1].includes('1 + 2'));

      const trigStmts = splitSqlStatements(`
        CREATE TRIGGER log_ins AFTER INSERT ON items BEGIN INSERT INTO audit VALUES (NEW.id); END;
        SELECT * FROM items;
      `);
      assert.strictEqual(trigStmts.length, 2);
    });

    test('Starter Databases & Schema Introspection (tables, views, foreign keys)', () => {
      const dbs = engine.listDatabases();
      assert.ok(dbs.some((d) => d.name === 'ecommerce.db'));
      assert.ok(dbs.some((d) => d.name === 'tech_hr.db'));
      assert.ok(dbs.some((d) => d.name === ':memory:'));

      const schema = engine.getSchema('ecommerce.db');
      assert.ok(schema.tables.length >= 5);
      assert.ok(schema.views.some((v) => v.name === 'v_revenue_by_category'));
      assert.ok(schema.relations.length >= 4);
      const ordersTbl = schema.tables.find((t) => t.name === 'orders');
      assert.ok(ordersTbl.rowCount >= 25);
      assert.ok(ordersTbl.columns.some((c) => c.name === 'id' && c.pk));
      assert.ok(ordersTbl.columns.some((c) => c.name === 'customer_id' && c.fk));
    });

    test('Complex Analytics: JOINs, CTEs, and Window Functions (RANK / SUM OVER)', () => {
      const res = engine.executeQuery(
        'ecommerce.db',
        `
        WITH cat_rev AS (
          SELECT p.category, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS rev
          FROM order_items oi JOIN products p ON p.id = oi.product_id
          GROUP BY p.category
        )
        SELECT RANK() OVER (ORDER BY rev DESC) AS rnk, category, rev FROM cat_rev;
        `
      );
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.results.length, 1);
      assert.strictEqual(res.results[0].kind, 'select');
      assert.strictEqual(res.results[0].rowCount, 4);
      assert.strictEqual(res.results[0].rows[0].rnk, 1);
    });

    test('Multi-statement script returns multiple result sets + mutation counts', () => {
      const res = engine.executeQuery(
        ':memory:',
        `
        CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);
        INSERT INTO notes (body) VALUES ('first'), ('second');
        SELECT * FROM notes ORDER BY id;
        `
      );
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.results.length, 3);
      assert.strictEqual(res.results[1].kind, 'mutation');
      assert.strictEqual(res.results[1].changes, 2);
      assert.strictEqual(res.results[2].kind, 'select');
      assert.strictEqual(res.results[2].rowCount, 2);
      assert.strictEqual(res.schemaChanged, true);
    });

    test('SQL Error reporting returns failing statement index & message', () => {
      const res = engine.executeQuery('ecommerce.db', 'SELECT 1; SELECT * FROM nonexistent_tbl;');
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.failedStatementIndex, 2);
      assert.ok(res.error.toLowerCase().includes('no such table'));
    });

    test('EXPLAIN QUERY PLAN detects indexed lookup', () => {
      const exp = engine.explainQuery('ecommerce.db', 'SELECT * FROM orders WHERE customer_id = 1');
      assert.strictEqual(exp.ok, true);
      assert.ok(exp.plan.length >= 1);
      assert.strictEqual(exp.plan[0].usesIndex, true);
    });

    test('CSV & JSON Import infers INTEGER / REAL / TEXT types and queries cleanly', () => {
      const csvRes = engine.importData(
        ':memory:',
        'cities',
        'csv',
        'city,pop,score\nTokyo,13960000,96.4\nBengaluru,13193000,94.8'
      );
      assert.strictEqual(csvRes.ok, true);
      assert.strictEqual(csvRes.rowCount, 2);
      assert.strictEqual(csvRes.columns[1].type, 'INTEGER');
      assert.strictEqual(csvRes.columns[2].type, 'REAL');

      const q1 = engine.executeQuery(':memory:', 'SELECT city, pop FROM cities ORDER BY pop DESC');
      assert.strictEqual(q1.results[0].rows[0].city, 'Tokyo');
      assert.strictEqual(q1.results[0].rows[0].pop, 13960000);

      const jsonRes = engine.importData(
        ':memory:',
        'metrics',
        'json',
        JSON.stringify([{ env: 'prod', latency: 12.4 }, { env: 'dev', latency: 4.2 }])
      );
      assert.strictEqual(jsonRes.ok, true);
      assert.strictEqual(jsonRes.rowCount, 2);
    });

    test('Query History persistence & filtering', () => {
      history.add({ db: 'ecommerce.db', sql: 'SELECT * FROM customers;', ok: true, rowCount: 16, durationMs: 0.4 });
      history.add({ db: 'tech_hr.db', sql: 'SELECT * FROM employees;', ok: true, rowCount: 10, durationMs: 0.3 });
      const reloaded = new QueryHistoryStore(path.join(tmpDir, 'history.json'));
      assert.strictEqual(reloaded.list().length, 2);
      assert.strictEqual(reloaded.list('employees').length, 1);
    });

    test('phpMyAdmin / MySQL Meta-Commands: SHOW DATABASES, SHOW TABLES, DESCRIBE, SHOW CREATE, SHOW INDEX, USE', () => {
      let r = engine.executeQuery('ecommerce.db', 'SHOW DATABASES; SHOW TABLES; DESCRIBE customers; SHOW CREATE TABLE products; SHOW INDEX FROM orders; SHOW VARIABLES;');
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.results.length, 6);
      assert.ok(r.results[0].rows.some((row) => row.Database === 'ecommerce.db'));
      assert.ok(r.results[1].rowCount >= 5);
      assert.ok(r.results[2].rows.some((row) => row.Field === 'email' && row.Null === 'NO'));
      assert.ok(r.results[3].rows[0]['Create Table'].includes('CREATE TABLE'));
      assert.ok(r.results[4].rowCount >= 1);
      assert.ok(r.results[5].rowCount >= 4);

      r = engine.executeQuery('ecommerce.db', 'CREATE DATABASE school; USE school;');
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.db, 'school.db');
    });

    test('MySQL / phpMyAdmin DDL Transpiler + 30+ MySQL Functions (AUTO_INCREMENT, ENGINE, ENUM, NOW, CONCAT, IF, MD5, TRUNCATE)', () => {
      const ddl = `
        SET NAMES utf8mb4;
        CREATE TABLE students (
          id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          full_name VARCHAR(120) NOT NULL,
          grade ENUM('A', 'B', 'C') DEFAULT 'A',
          joined_at TIMESTAMP DEFAULT NOW()
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Student roster';
        INSERT IGNORE INTO students (full_name, grade) VALUES ('Aarav', 'A'), ('Maya', 'B');
        SELECT
          CONCAT(full_name, ' (', grade, ')') AS label,
          IF(grade = 'A', 'Honors', 'Standard') AS track,
          YEAR(NOW()) AS yr,
          LEFT(full_name, 3) AS prefix,
          MD5(full_name) AS hash_val,
          VERSION() AS ver
        FROM students ORDER BY id;
      `;
      const r = engine.executeQuery('school.db', ddl);
      assert.strictEqual(r.ok, true, r.error);
      const sel = r.results[r.results.length - 1];
      assert.strictEqual(sel.rowCount, 2);
      assert.strictEqual(sel.rows[0].label, 'Aarav (A)');
      assert.strictEqual(sel.rows[0].track, 'Honors');
      assert.strictEqual(sel.rows[0].prefix, 'Aar');
      assert.strictEqual(sel.rows[0].hash_val.length, 32);

      const tr = engine.executeQuery('school.db', 'TRUNCATE TABLE students; SELECT COUNT(*) AS c FROM students;');
      assert.strictEqual(tr.ok, true);
      assert.strictEqual(tr.results[1].rows[0].c, 0);
    });

    test('phpMyAdmin Visual CRUD, Structure Alter, QBE Search, Operations & Full SQL Dump Import/Export', () => {
      const ct = engine.createTableVisual(':memory:', {
        name: 'tasks',
        columns: [
          { name: 'id', type: 'INTEGER', pk: true, ai: true, notnull: true },
          { name: 'title', type: 'VARCHAR(200)', notnull: true },
          { name: 'priority', type: 'INTEGER', defaultVal: '1' },
        ],
      });
      assert.strictEqual(ct.ok, true);

      const ins = engine.insertRow(':memory:', 'tasks', { title: 'Ship SQL Pro', priority: 5 });
      assert.strictEqual(ins.ok, true);

      const dup = engine.duplicateRow(':memory:', 'tasks', ins.lastInsertRowid);
      assert.strictEqual(dup.ok, true);

      const upd = engine.updateRow(':memory:', 'tasks', dup.lastInsertRowid, { title: 'Verify Zero Bugs', priority: 3 });
      assert.strictEqual(upd.ok, true);

      const br = engine.browseTable(':memory:', 'tasks', { filters: [{ column: 'priority', op: '>=', value: 4 }] });
      assert.strictEqual(br.ok, true);
      assert.strictEqual(br.total, 1);
      assert.strictEqual(br.rows[0].title, 'Ship SQL Pro');

      const addCol = engine.alterStructure(':memory:', 'tasks', 'addColumn', { name: 'done', type: 'INTEGER', defaultVal: '0' });
      assert.strictEqual(addCol.ok, true);

      const addIdx = engine.alterStructure(':memory:', 'tasks', 'createIndex', { name: 'idx_tasks_prio', columns: ['priority'], unique: false });
      assert.strictEqual(addIdx.ok, true);

      const dump = engine.exportSqlDump(':memory:');
      assert.ok(dump.includes('CREATE TABLE "tasks"'));
      assert.ok(dump.includes('INSERT INTO "tasks"'));

      const reimp = engine.importData(':memory:', '', 'sql', dump);
      assert.strictEqual(reimp.ok, true);

      const del = engine.deleteRows(':memory:', 'tasks', [ins.lastInsertRowid]);
      assert.strictEqual(del.ok, true);
      assert.strictEqual(del.changes, 1);
    });

    test('Startup Pro Features: Overview, Data Profiler, Mock Seeder, Triggers/Views, Snapshots, Codegen & Bookmarks', () => {
      const ov = pro.getDatabaseOverview(engine, 'ecommerce.db');
      assert.strictEqual(ov.ok, true);
      assert.ok(ov.tableCount >= 5);
      assert.ok(ov.totalRows >= 100);

      const prof = pro.profileTable(engine, 'ecommerce.db', 'products');
      assert.strictEqual(prof.ok, true);
      const priceCol = prof.columns.find((c) => c.name === 'unit_price');
      assert.strictEqual(priceCol.isNumeric, true);
      assert.ok(priceCol.avg > 0);
      assert.strictEqual(priceCol.completenessPct, 100);

      const mock = pro.generateMockRows(engine, 'ecommerce.db', 'customers', 5);
      assert.strictEqual(mock.ok, true);
      assert.strictEqual(mock.inserted, 5);

      const vw = pro.createView(engine, 'ecommerce.db', { name: 'v_vip_users', selectSql: "SELECT * FROM customers WHERE tier = 'Enterprise'", replace: true });
      assert.strictEqual(vw.ok, true);

      const tr = pro.createTrigger(engine, 'ecommerce.db', { name: 'trg_noop_test', table: 'customers', timing: 'AFTER', event: 'INSERT', body: 'SELECT 1' });
      assert.strictEqual(tr.ok, true);
      assert.strictEqual(pro.dropTrigger(engine, 'ecommerce.db', 'trg_noop_test').ok, true);

      const snap = pro.createSnapshot(engine, tmpDir, 'ecommerce.db', 'v1_test');
      assert.strictEqual(snap.ok, true);
      assert.ok(pro.listSnapshots(tmpDir, 'ecommerce.db').length >= 1);
      assert.strictEqual(pro.restoreSnapshot(engine, tmpDir, 'ecommerce.db', snap.id).ok, true);

      const cg = pro.generateCodeModels(engine.getSchema('ecommerce.db'), 'customers', 'http://localhost:3344');
      assert.strictEqual(cg.ok, true);
      assert.ok(cg.typescript.includes('export interface Customer'));
      assert.ok(cg.prisma.includes('model Customer'));
      assert.ok(cg.drizzle.includes("sqliteTable('customers'"));
      assert.ok(cg.python.includes('class Customer(BaseModel)'));

      const bmStore = new BookmarkStore(path.join(tmpDir, 'bookmarks.json'));
      const added = bmStore.add({ title: 'My KPI', tag: 'KPI', db: 'ecommerce.db', sql: 'SELECT COUNT(*) FROM orders;' });
      assert.strictEqual(added.ok, true);
      assert.ok(bmStore.list('My KPI').length === 1);
    });

    test('MySQL 9.7 LTS AI VECTOR(N) Type & Distance Functions + VERSION()', () => {
      const vecSql = `
        CREATE TABLE embeddings (
          id INT AUTO_INCREMENT PRIMARY KEY,
          label VARCHAR(64) NOT NULL,
          vec VECTOR(3) NOT NULL
        ) ENGINE=InnoDB;
        INSERT INTO embeddings (label, vec) VALUES
          ('north', STRING_TO_VECTOR('[1, 0, 0]')),
          ('east',  STRING_TO_VECTOR('[0, 1, 0]')),
          ('diag',  STRING_TO_VECTOR('[1, 1, 0]'));
        SELECT
          label,
          VECTOR_TO_STRING(vec) AS str_vec,
          VECTOR_DIM(vec) AS dims,
          DISTANCE(vec, STRING_TO_VECTOR('[1, 0, 0]')) AS cos_default,
          DISTANCE(vec, STRING_TO_VECTOR('[1, 0, 0]'), 'EUCLIDEAN') AS euc_dist,
          DISTANCE(vec, STRING_TO_VECTOR('[1, 0, 0]'), 'DOT') AS dot_val,
          VERSION() AS ver
        FROM embeddings ORDER BY cos_default ASC;
      `;
      const r = engine.executeQuery(':memory:', vecSql);
      assert.strictEqual(r.ok, true, r.error);
      const sel = r.results[r.results.length - 1];
      assert.strictEqual(sel.rowCount, 3);
      assert.strictEqual(sel.rows[0].label, 'north');
      assert.strictEqual(sel.rows[0].dims, 3);
      assert.strictEqual(sel.rows[0].cos_default, 0);
      assert.strictEqual(sel.rows[0].euc_dist, 0);
      assert.strictEqual(sel.rows[0].dot_val, 1);
      assert.ok(sel.rows[0].ver.includes('9.7.4-LTS'));
      assert.strictEqual(sel.rows[2].label, 'east');
      assert.strictEqual(sel.rows[2].cos_default, 1);
    });

    test('MySqlManager: Profile CRUD, Password Masking & Local Binary Detection', () => {
      const mgr = new MySqlManager(tmpDir);
      const det = mgr.detectLocalBinaries();
      assert.strictEqual(det.driverInstalled, true);
      assert.ok(Array.isArray(det.localBinaries));

      const saved = mgr.saveProfile({
        id: 'cloud-prod',
        name: 'Cloud MySQL 9.7',
        host: 'db.example.com',
        port: 3306,
        user: 'admin',
        password: 'super-secret-password',
        database: 'app_db',
        ssl: true,
      });
      assert.strictEqual(saved.ok, true);
      assert.strictEqual(saved.profile.hasPassword, true);
      assert.strictEqual(saved.profile.password, undefined);

      const reloaded = new MySqlManager(tmpDir);
      const listed = reloaded.listProfiles();
      const found = listed.find((p) => p.id === 'cloud-prod');
      assert.ok(found);
      assert.strictEqual(found.ssl, true);
      assert.strictEqual(found.hasPassword, true);
      assert.strictEqual('password' in found, false);

      reloaded.deleteProfile('cloud-prod');
      assert.strictEqual(reloaded.listProfiles().some((p) => p.id === 'cloud-prod'), false);
      mgr.closeAll();
      reloaded.closeAll();
    });

    test('Security Hardening: Path Traversal Blocking, WAL Snapshot Safety & HTTP Security Headers', () => {
      // 1. Database name traversal attempts cannot escape dataDir
      const safe1 = engine.resolveDbName('../../etc/passwd');
      assert.strictEqual(safe1.includes('..'), false);
      assert.strictEqual(safe1.includes('/'), false);
      assert.strictEqual(safe1.includes('\\'), false);
      const safe2 = engine.resolveDbName('C:evil..db');
      assert.strictEqual(safe2.includes(':'), false);
      assert.strictEqual(safe2.includes('..'), false);
      assert.strictEqual(engine.resolveDbName(':memory:'), ':memory:');

      // 2. Snapshot API rejects path traversal & non-.db IDs
      const badRestore = pro.restoreSnapshot(engine, tmpDir, '../../evil.db', '../package.json');
      assert.strictEqual(badRestore.ok, false);
      const badDelete = pro.deleteSnapshot(tmpDir, 'ecommerce.db', '../../server.js');
      assert.strictEqual(badDelete.ok, false);

      // 3. HTTP security headers exported & properly configured
      const srv = require('../server');
      assert.strictEqual(srv.SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
      assert.strictEqual(srv.SECURITY_HEADERS['X-Frame-Options'], 'SAMEORIGIN');
      assert.ok(srv.SECURITY_HEADERS['Content-Security-Policy'].includes("script-src 'self'"));
      srv.engine.closeAll();
    });

    await (async () => {
      const vercelHandler = require('../api/index');
      const invoke = (method, url, body) =>
        new Promise((resolve) => {
          let status = 200;
          let headers = {};
          let chunks = [];
          const req = { method, url, headers: { host: 'ekoni-sql-studio.vercel.app', 'x-forwarded-proto': 'https' }, body };
          const res = {
            headersSent: false,
            writeHead(s, h) { status = s; headers = h || {}; this.headersSent = true; },
            end(data) {
              if (data) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
              resolve({ status, headers, body: Buffer.concat(chunks).toString('utf8') });
            },
          };
          vercelHandler(req, res);
        });

      const h = await invoke('GET', '/api/index?__ekoni_path=health');
      assert.strictEqual(h.status, 200);
      assert.strictEqual(JSON.parse(h.body).app, 'ekoni-sql-studio');

      const dbs = await invoke('GET', '/api/index?__ekoni_path=databases&connId=builtin');
      assert.strictEqual(dbs.status, 200);
      assert.ok(JSON.parse(dbs.body).databases.some((d) => d.name === 'ecommerce.db'));

      const q = await invoke('POST', '/api/index?__ekoni_path=query', {
        db: 'ecommerce.db',
        skipHistory: true,
        sql: "SELECT VERSION() AS ver, VECTOR_DIM(STRING_TO_VECTOR('[1,2,3]')) AS d;",
      });
      assert.strictEqual(q.status, 200);
      const qJson = JSON.parse(q.body);
      assert.strictEqual(qJson.ok, true, qJson.error);
      assert.strictEqual(qJson.results[0].rows[0].d, 3);
      assert.ok(qJson.results[0].rows[0].ver.includes('9.7.4-LTS-EkoniSQL'));

      const rest = await invoke('GET', '/api/index?__ekoni_path=rest/ecommerce.db/products&limit=5');
      assert.strictEqual(rest.status, 200);
      assert.strictEqual(JSON.parse(rest.body).data.length, 5);

      const rootHtml = await invoke('GET', '/api/index?__ekoni_path=__root__');
      assert.strictEqual(rootHtml.status, 200);
      assert.ok(rootHtml.body.includes('EKONI SQL'));

      require('../server').engine.closeAll();
      passed++;
      console.log('  \x1b[32m✓\x1b[0m Vercel Serverless Entrypoint (api/index.js, root HTML, rewrites & pre-parsed POST body)');
    })();

    await (async () => {
      const wasmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ekoni-wasm-test-'));
      const wasmEngine = new SqlEngine(wasmDir, { forceWasm: true, lazyInit: true });
      try {
        const drv = await wasmEngine.ensureReady();
        assert.strictEqual(drv, 'sql.js-wasm');

        const schema = wasmEngine.getSchema('ecommerce.db');
        assert.ok(schema.tables.length >= 5);

        const q = wasmEngine.executeQuery(
          ':memory:',
          `
          CREATE TABLE docs (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(80), vec VECTOR(3)) ENGINE=InnoDB;
          INSERT INTO docs (title, vec) VALUES ('a', STRING_TO_VECTOR('[1,0,0]')), ('b', STRING_TO_VECTOR('[0,1,0]'));
          SELECT CONCAT(title, ':', VECTOR_DIM(vec)) AS tag, DISTANCE(vec, STRING_TO_VECTOR('[1,0,0]')) AS d, VERSION() AS v FROM docs ORDER BY d ASC;
          `
        );
        assert.strictEqual(q.ok, true, q.error);
        const sel = q.results[q.results.length - 1];
        assert.strictEqual(sel.rows[0].tag, 'a:3');
        assert.strictEqual(sel.rows[0].d, 0);
        assert.strictEqual(sel.rows[1].d, 1);
        assert.ok(sel.rows[0].v.includes('9.7.4-LTS-EkoniSQL'));

        passed++;
        console.log('  \x1b[32m✓\x1b[0m Pure-WASM sql.js Fallback Driver (universal Node 18/20/22/24 & Vercel compatibility)');
      } finally {
        wasmEngine.closeAll();
        fs.rmSync(wasmDir, { recursive: true, force: true });
      }
    })();

    console.log(`\n\x1b[1;32mAll ${passed} SQL Studio test suites passed!\x1b[0m\n`);
  } finally {
    engine.closeAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests();

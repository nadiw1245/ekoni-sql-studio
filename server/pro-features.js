'use strict';

const fs = require('fs');
const path = require('path');

function quoteIdent(name) {
  return `"${String(name || '').replace(/"/g, '""')}"`;
}

function safeIdent(name) {
  const clean = String(name || 'item').trim().replace(/[^A-Za-z0-9_]/g, '_');
  return quoteIdent(/^[0-9]/.test(clean) ? `n_${clean}` : clean || 'item');
}

function getDatabaseOverview(engine, dbName) {
  const db = engine.getDb(dbName);
  const schema = engine.getSchema(dbName);
  const dbs = engine.listDatabases();
  const dbMeta = dbs.find((d) => d.name === schema.db) || { size: 0, isMemory: schema.db === ':memory:' };

  const triggers = db
    .prepare(`SELECT name, tbl_name AS tableName, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name`)
    .all();

  const totalIndexes = schema.tables.reduce((acc, t) => acc + (t.indexes ? t.indexes.length : 0), 0);
  const totalRows = schema.tables.reduce((acc, t) => acc + (t.rowCount || 0), 0);

  const pragmas = {};
  for (const key of ['foreign_keys', 'journal_mode', 'synchronous', 'page_size', 'page_count', 'cache_size', 'auto_vacuum']) {
    try {
      const row = db.prepare(`PRAGMA ${key}`).get();
      pragmas[key] = row ? Object.values(row)[0] : null;
    } catch {
      pragmas[key] = null;
    }
  }

  return {
    ok: true,
    db: schema.db,
    sqliteVersion: schema.sqliteVersion,
    sizeBytes: dbMeta.size || 0,
    isMemory: Boolean(dbMeta.isMemory),
    databaseCount: dbs.length,
    tableCount: schema.tables.length,
    viewCount: schema.views.length,
    triggerCount: triggers.length,
    indexCount: totalIndexes,
    relationCount: schema.relations.length,
    totalRows,
    tables: schema.tables.map((t) => ({
      name: t.name,
      rows: t.rowCount,
      columns: t.columns.length,
      indexes: t.indexes.length,
      foreignKeys: t.foreignKeys.length,
      triggers: triggers.filter((tr) => tr.tableName === t.name).length,
    })),
    views: schema.views.map((v) => ({
      name: v.name,
      rows: v.rowCount,
      columns: v.columns.length,
      sql: v.sql,
    })),
    triggers,
    pragmas,
  };
}

function setPragma(engine, dbName, key, value) {
  const allowed = new Set(['foreign_keys', 'journal_mode', 'synchronous']);
  if (!allowed.has(key)) return { ok: false, error: `PRAGMA '${key}' is not editable` };
  const db = engine.getDb(dbName);
  try {
    const safeVal = String(value).replace(/[^A-Za-z0-9_]/g, '');
    db.exec(`PRAGMA ${key} = ${safeVal};`);
    return { ok: true, key, value: safeVal };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// =========================================================================
// Triggers & Views Managers (Full phpMyAdmin parity)
// =========================================================================
function listTriggersAndViews(engine, dbName) {
  const db = engine.getDb(dbName);
  const schema = engine.getSchema(dbName);
  const triggers = db
    .prepare(`SELECT name, tbl_name AS tableName, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name`)
    .all();
  return {
    ok: true,
    triggers,
    views: schema.views,
    tables: schema.tables.map((t) => t.name),
  };
}

function createTrigger(engine, dbName, { name, table, timing, event, body }) {
  const db = engine.getDb(dbName);
  if (!name || !table || !body) return { ok: false, error: 'Name, table, and trigger SQL body are required' };
  const safeTiming = ['BEFORE', 'AFTER'].includes(String(timing).toUpperCase()) ? String(timing).toUpperCase() : 'AFTER';
  const safeEvent = ['INSERT', 'UPDATE', 'DELETE'].includes(String(event).toUpperCase()) ? String(event).toUpperCase() : 'INSERT';
  let cleanBody = String(body).trim();
  if (!cleanBody.endsWith(';')) cleanBody += ';';
  const sql = `CREATE TRIGGER ${safeIdent(name)} ${safeTiming} ${safeEvent} ON ${quoteIdent(table)} FOR EACH ROW BEGIN\n  ${cleanBody}\nEND;`;
  try {
    db.exec(sql);
    return { ok: true, sql };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function dropTrigger(engine, dbName, name) {
  const db = engine.getDb(dbName);
  try {
    db.exec(`DROP TRIGGER IF EXISTS ${quoteIdent(name)};`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function createView(engine, dbName, { name, selectSql, replace }) {
  const db = engine.getDb(dbName);
  if (!name || !selectSql) return { ok: false, error: 'View name and SELECT query are required' };
  const qName = safeIdent(name);
  const cleanSelect = String(selectSql).trim().replace(/;+$/, '');
  try {
    if (replace) db.exec(`DROP VIEW IF EXISTS ${qName};`);
    const sql = `CREATE VIEW ${qName} AS\n${cleanSelect};`;
    db.exec(sql);
    return { ok: true, sql };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function dropView(engine, dbName, name) {
  const db = engine.getDb(dbName);
  try {
    db.exec(`DROP VIEW IF EXISTS ${quoteIdent(name)};`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// =========================================================================
// Next-Gen Data Profiler (Column Completeness, Cardinality, Stats, Top Values)
// =========================================================================
function profileTable(engine, dbName, tableName) {
  const db = engine.getDb(dbName);
  const schema = engine.getSchema(dbName);
  const obj = [...schema.tables, ...schema.views].find((t) => t.name === tableName);
  if (!obj) return { ok: false, error: `Table '${tableName}' not found` };

  const qTbl = quoteIdent(obj.name);
  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM ${qTbl}`).get();
  const total = Number(totalRow ? totalRow.c : 0);

  const columns = obj.columns.map((c) => {
    const qCol = quoteIdent(c.name);
    const isNumeric = /INT|REAL|DEC|FLOAT|DOUBLE|NUM/i.test(c.type || '');
    const stats = db
      .prepare(
        `SELECT
          COUNT(${qCol}) AS non_null,
          COUNT(DISTINCT ${qCol}) AS distinct_cnt,
          MIN(${qCol}) AS min_val,
          MAX(${qCol}) AS max_val
          ${isNumeric ? `, ROUND(AVG(${qCol}), 2) AS avg_val, ROUND(SUM(${qCol}), 2) AS sum_val` : ''}
         FROM ${qTbl}`
      )
      .get();

    const nonNull = Number(stats.non_null || 0);
    const nullCount = Math.max(0, total - nonNull);
    const distinctCount = Number(stats.distinct_cnt || 0);

    const topValues = db
      .prepare(
        `SELECT ${qCol} AS val, COUNT(*) AS cnt
         FROM ${qTbl}
         WHERE ${qCol} IS NOT NULL
         GROUP BY ${qCol}
         ORDER BY cnt DESC
         LIMIT 5`
      )
      .all()
      .map((r) => ({
        value: r.val === null ? 'NULL' : String(r.val),
        count: Number(r.cnt),
        pct: total > 0 ? Math.round((Number(r.cnt) / total) * 100) : 0,
      }));

    return {
      name: c.name,
      type: c.type || 'ANY',
      pk: c.pk,
      fk: c.fk,
      total,
      nonNull,
      nullCount,
      completenessPct: total > 0 ? Math.round((nonNull / total) * 100) : 100,
      distinctCount,
      uniquenessPct: nonNull > 0 ? Math.round((distinctCount / nonNull) * 100) : 0,
      isNumeric,
      min: stats.min_val,
      max: stats.max_val,
      avg: isNumeric ? stats.avg_val : null,
      sum: isNumeric ? stats.sum_val : null,
      topValues,
    };
  });

  return { ok: true, table: obj.name, totalRows: total, columns };
}

// =========================================================================
// Smart Column-Aware Mock Data Generator
// =========================================================================
const FIRST_NAMES = ['Aarav', 'Elena', 'Marcus', 'Hana', 'Lucas', 'Sofia', 'Liam', 'Priya', 'Noah', 'Chloe', 'Mateo', 'Amara', 'Zara', 'Kai', 'Nadia', 'Rohan'];
const LAST_NAMES = ['Sharma', 'Rostova', 'Vance', 'Takahashi', 'Meyer', 'Alvarez', 'Nair', 'Kim', 'Laurent', 'Silva', 'Okafor', 'Patel', 'Chen', 'Lindqvist', 'Rao'];
const COUNTRIES = ['India', 'USA', 'Japan', 'Germany', 'Sweden', 'UK', 'France', 'Canada', 'South Korea', 'Brazil', 'Singapore', 'Ireland'];
const CITIES = ['Bengaluru', 'Tokyo', 'San Francisco', 'Stockholm', 'Berlin', 'London', 'Toronto', 'Seoul', 'Singapore', 'Dublin', 'Austin'];
const CATEGORIES = ['Hardware', 'Software', 'Audio', 'Cloud', 'Accessories', 'AI Tools'];
const STATUSES = ['delivered', 'shipped', 'processing', 'active', 'completed'];
const TIERS = ['Starter', 'Pro', 'Enterprise'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateMockRows(engine, dbName, tableName, count = 10) {
  const db = engine.getDb(dbName);
  const schema = engine.getSchema(dbName);
  const tbl = schema.tables.find((t) => t.name === tableName);
  if (!tbl) return { ok: false, error: `Table '${tableName}' not found` };

  const safeCount = Math.max(1, Math.min(200, parseInt(count, 10) || 10));
  const insertCols = tbl.columns.filter((c) => !(c.pk && /INT/i.test(c.type || '')));
  if (!insertCols.length) return { ok: false, error: 'Table has no insertable non-auto-increment columns' };

  // Pre-fetch valid foreign key parent IDs so mock data ALWAYS obeys FK constraints!
  const fkChoices = new Map();
  for (const fk of tbl.foreignKeys || []) {
    try {
      const vals = db.prepare(`SELECT ${quoteIdent(fk.to)} AS v FROM ${quoteIdent(fk.table)} LIMIT 200`).all().map((r) => r.v);
      if (vals.length) fkChoices.set(fk.from, vals);
    } catch {}
  }

  const colSql = insertCols.map((c) => quoteIdent(c.name)).join(', ');
  const stmt = db.prepare(`INSERT INTO ${quoteIdent(tableName)} (${colSql}) VALUES (${insertCols.map(() => '?').join(', ')})`);

  let inserted = 0;
  try {
    db.exec('BEGIN TRANSACTION');
    for (let i = 0; i < safeCount; i++) {
      const fn = pick(FIRST_NAMES);
      const ln = pick(LAST_NAMES);
      const randTag = Math.floor(1000 + Math.random() * 9000);
      const vals = insertCols.map((c) => {
        if (fkChoices.has(c.name)) return pick(fkChoices.get(c.name));
        const n = c.name.toLowerCase();
        const t = (c.type || '').toUpperCase();

        if (n.includes('email')) return `${fn.toLowerCase()}.${ln.toLowerCase()}${randTag}@cloudlab.io`;
        if (n.includes('full_name') || n === 'name' || n.includes('author')) return `${fn} ${ln}`;
        if (n.includes('first')) return fn;
        if (n.includes('last')) return ln;
        if (n.includes('country')) return pick(COUNTRIES);
        if (n.includes('city') || n.includes('location')) return pick(CITIES);
        if (n.includes('tier') || n.includes('plan')) return pick(TIERS);
        if (n.includes('category') || n.includes('dept')) return pick(CATEGORIES);
        if (n.includes('status')) return pick(STATUSES);
        if (n.includes('sku') || n.includes('code')) return `SKU-${randTag}-${i}`;
        if (n.includes('phone')) return `+1-555-${randTag}`;
        if (n.includes('date') || n.includes('_at')) {
          const m = String(1 + Math.floor(Math.random() * 11)).padStart(2, '0');
          const d = String(1 + Math.floor(Math.random() * 27)).padStart(2, '0');
          return `2026-${m}-${d}`;
        }
        if (n.includes('star') || n.includes('rating')) return Number((3.8 + Math.random() * 1.2).toFixed(1));
        if (n.includes('discount')) return pick([0, 5, 10, 15]);
        if (n.includes('price') || n.includes('cost') || n.includes('salary') || n.includes('budget')) {
          return Number((49 + Math.random() * 950).toFixed(2));
        }
        if (n.includes('qty') || n.includes('quantity') || n.includes('stock') || n.includes('count')) {
          return 1 + Math.floor(Math.random() * 50);
        }
        if (/INT/.test(t)) return 1 + Math.floor(Math.random() * 100);
        if (/REAL|DEC|FLOAT|DOUBLE|NUM/.test(t)) return Number((Math.random() * 500).toFixed(2));
        if (/BOOL/.test(t)) return Math.random() > 0.5 ? 1 : 0;
        return `Sample ${c.name} #${randTag}`;
      });
      stmt.run(...vals);
      inserted++;
    }
    db.exec('COMMIT');
    return { ok: true, inserted };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    return { ok: false, error: err.message };
  }
}

// =========================================================================
// Database Time-Travel Snapshots (1-Click Backup & Instant Restore)
// =========================================================================
function getSnapshotsDir(dataDir) {
  const dir = path.resolve(dataDir, 'snapshots');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeResolveChild(parentDir, childName) {
  const base = path.resolve(parentDir);
  const safeBaseName = path.basename(String(childName || '')).replace(/\.{2,}/g, '_');
  if (!safeBaseName || safeBaseName === '.' || safeBaseName === '..') return null;
  const full = path.resolve(base, safeBaseName);
  return full.startsWith(base + path.sep) ? full : null;
}

function listSnapshots(dataDir, dbName) {
  const dir = getSnapshotsDir(dataDir);
  const safeDb = path.basename(String(dbName || '')).replace(/[^A-Za-z0-9_.-]/g, '_');
  const prefix = `${safeDb.replace(/\.db$/, '')}__`;
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.db') && (!safeDb || f.startsWith(prefix)))
      .map((name) => {
        const st = fs.statSync(path.join(dir, name));
        const label = name.slice(prefix.length, -3);
        return { id: name, label, size: st.size, createdAt: st.mtimeMs };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

function createSnapshot(engine, dataDir, dbName, label) {
  const safeDb = engine.resolveDbName(dbName);
  if (safeDb === ':memory:') return { ok: false, error: 'Snapshots require a disk database (.db)' };
  const src = safeResolveChild(dataDir, safeDb);
  if (!src || !fs.existsSync(src)) return { ok: false, error: 'Database file not found on disk' };
  // Flush WAL journal before copying so snapshot is 100% consistent
  try {
    const db = engine.getDb(safeDb);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {}
  const dir = getSnapshotsDir(dataDir);
  const cleanLabel = String(label || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  const fileName = `${safeDb.replace(/\.db$/, '')}__${cleanLabel || 'snap'}.db`;
  const dest = safeResolveChild(dir, fileName);
  if (!dest) return { ok: false, error: 'Invalid snapshot name' };
  fs.copyFileSync(src, dest);
  return { ok: true, id: fileName, snapshots: listSnapshots(dataDir, safeDb) };
}

function restoreSnapshot(engine, dataDir, dbName, snapshotId) {
  const safeDb = engine.resolveDbName(dbName);
  if (safeDb === ':memory:') return { ok: false, error: 'Cannot restore snapshot into :memory:' };
  if (!String(snapshotId || '').endsWith('.db')) return { ok: false, error: 'Invalid snapshot ID' };
  const snapFile = safeResolveChild(getSnapshotsDir(dataDir), snapshotId);
  const targetDb = safeResolveChild(dataDir, safeDb);
  if (!snapFile || !targetDb || !fs.existsSync(snapFile)) return { ok: false, error: 'Snapshot not found' };
  if (engine.connections.has(safeDb)) {
    try { engine.connections.get(safeDb).close(); } catch {}
    engine.connections.delete(safeDb);
  }
  // Remove stale WAL/SHM sidecars before restoring clean snapshot
  for (const suffix of ['-wal', '-shm']) {
    try { if (fs.existsSync(targetDb + suffix)) fs.unlinkSync(targetDb + suffix); } catch {}
  }
  fs.copyFileSync(snapFile, targetDb);
  engine.getDb(safeDb);
  return { ok: true, schema: engine.getSchema(safeDb) };
}

function deleteSnapshot(dataDir, dbName, snapshotId) {
  if (!String(snapshotId || '').endsWith('.db')) return { ok: false, error: 'Invalid snapshot ID' };
  const snapFile = safeResolveChild(getSnapshotsDir(dataDir), snapshotId);
  if (snapFile && fs.existsSync(snapFile)) fs.unlinkSync(snapFile);
  return { ok: true, snapshots: listSnapshots(dataDir, dbName) };
}

// =========================================================================
// Next-Gen Code Generator (TypeScript, Prisma, Drizzle, Python, REST API)
// =========================================================================
function pascalCase(str) {
  return String(str || 'Model')
    .replace(/(?:^|[_-])(\w)/g, (_, c) => c.toUpperCase())
    .replace(/s$/, '') || 'Model';
}

function generateCodeModels(schema, tableName, origin = 'http://localhost:3344') {
  const tables = tableName ? schema.tables.filter((t) => t.name === tableName) : schema.tables;
  if (!tables.length) return { ok: false, error: 'No tables available for code generation' };

  const tsLines = [];
  const prismaLines = ['datasource db {\n  provider = "sqlite"\n  url      = "file:./' + schema.db + '"\n}\n'];
  const drizzleLines = ["import { sqliteTable, integer, real, text } from 'drizzle-orm/sqlite-core';\n"];
  const pyLines = ['from pydantic import BaseModel\nfrom typing import Optional\n'];

  for (const t of tables) {
    const model = pascalCase(t.name);

    // TypeScript
    tsLines.push(`export interface ${model} {`);
    for (const c of t.columns) {
      const tsType = /INT|REAL|DEC|FLOAT|DOUBLE|NUM/i.test(c.type) ? 'number' : /BOOL/i.test(c.type) ? 'boolean' : 'string';
      tsLines.push(`  ${c.name}${c.notnull || c.pk ? '' : '?'}: ${tsType}${c.notnull || c.pk ? '' : ' | null'};`);
    }
    tsLines.push('}\n');

    // Prisma
    prismaLines.push(`model ${model} {`);
    for (const c of t.columns) {
      const pType = /INT/i.test(c.type) ? 'Int' : /REAL|DEC|FLOAT|DOUBLE/i.test(c.type) ? 'Float' : /BOOL/i.test(c.type) ? 'Boolean' : 'String';
      const opt = c.notnull || c.pk ? '' : '?';
      const attrs = c.pk ? (/INT/i.test(c.type) ? ' @id @default(autoincrement())' : ' @id') : '';
      prismaLines.push(`  ${c.name.padEnd(16)} ${pType}${opt}${attrs}`);
    }
    prismaLines.push(`  @@map("${t.name}")\n}\n`);

    // Drizzle ORM
    drizzleLines.push(`export const ${t.name} = sqliteTable('${t.name}', {`);
    for (const c of t.columns) {
      const fn = /INT/i.test(c.type) ? 'integer' : /REAL|DEC|FLOAT|DOUBLE/i.test(c.type) ? 'real' : 'text';
      let chain = `${fn}('${c.name}')`;
      if (c.pk) chain += /INT/i.test(c.type) ? '.primaryKey({ autoIncrement: true })' : '.primaryKey()';
      else if (c.notnull) chain += '.notNull()';
      drizzleLines.push(`  ${c.name}: ${chain},`);
    }
    drizzleLines.push('});\n');

    // Python Pydantic
    pyLines.push(`class ${model}(BaseModel):`);
    for (const c of t.columns) {
      const pyT = /INT/i.test(c.type) ? 'int' : /REAL|DEC|FLOAT|DOUBLE/i.test(c.type) ? 'float' : /BOOL/i.test(c.type) ? 'bool' : 'str';
      pyLines.push(`    ${c.name}: ${c.notnull || c.pk ? pyT : `Optional[${pyT}] = None`}`);
    }
    pyLines.push('');
  }

  const focusTbl = tables[0].name;
  const endpoint = `${origin}/api/rest/${encodeURIComponent(schema.db)}/${encodeURIComponent(focusTbl)}?limit=25`;

  return {
    ok: true,
    table: focusTbl,
    endpoint,
    typescript: tsLines.join('\n'),
    prisma: prismaLines.join('\n'),
    drizzle: drizzleLines.join('\n'),
    python: pyLines.join('\n'),
    curl: `curl -s "${endpoint}"`,
    fetchJs: `const res = await fetch("${endpoint}");\nconst { data, total } = await res.json();\nconsole.table(data);`,
  };
}

module.exports = {
  getDatabaseOverview,
  setPragma,
  listTriggersAndViews,
  createTrigger,
  dropTrigger,
  createView,
  dropView,
  profileTable,
  generateMockRows,
  listSnapshots,
  createSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  generateCodeModels,
};

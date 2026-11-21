'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { SqlEngine } = require('./server/sql-engine');
const { QueryHistoryStore } = require('./server/history');
const { BookmarkStore } = require('./server/bookmarks');
const { MySqlManager } = require('./server/mysql-connector');
const pro = require('./server/pro-features');
const { COOKBOOK } = require('./server/seed-data');

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_PORT = parseInt(process.env.PORT || '3344', 10);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const engine = new SqlEngine(DATA_DIR);
const history = new QueryHistoryStore(path.join(DATA_DIR, 'query_history.json'));
const bookmarks = new BookmarkStore(path.join(DATA_DIR, 'bookmarks.json'));
const mysqlMgr = new MySqlManager(DATA_DIR);

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 25 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
};

function sendCompressed(req, res, status, extraHeaders, bodyBuf) {
  const buf = Buffer.isBuffer(bodyBuf) ? bodyBuf : Buffer.from(String(bodyBuf), 'utf8');
  const acceptEnc = String((req && req.headers && req.headers['accept-encoding']) || '');
  if (buf.length > 1024 && /\bgzip\b/i.test(acceptEnc)) {
    const gz = zlib.gzipSync(buf, { level: 6 });
    res.writeHead(status, { ...SECURITY_HEADERS, ...extraHeaders, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    res.end(gz);
    return;
  }
  res.writeHead(status, { ...SECURITY_HEADERS, ...extraHeaders });
  res.end(buf);
}

function sendJson(res, status, payload, req) {
  sendCompressed(
    req,
    res,
    status,
    { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    JSON.stringify(payload)
  );
}

async function handleApi(req, res, urlObj) {
  const p = urlObj.pathname;

  // Health probe for single-instance & autostart verification
  if (p === '/api/health') {
    return sendJson(res, 200, { ok: true, app: 'ekoni-sql-studio', version: '2.5.0', uptime: process.uptime() });
  }

  // Real Live MySQL 9.7 / 8.4 / 26.x / MariaDB Connection Manager
  if (p === '/api/mysql/status' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      ...mysqlMgr.detectLocalBinaries(),
      profiles: mysqlMgr.listProfiles(),
    });
  }
  if (p === '/api/mysql/profiles' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const r = mysqlMgr.saveProfile(body);
    return sendJson(res, 200, { ...r, profiles: mysqlMgr.listProfiles() });
  }
  if (p === '/api/mysql/profiles/delete' && req.method === 'POST') {
    const body = await readJsonBody(req);
    mysqlMgr.deleteProfile(body.id);
    return sendJson(res, 200, { ok: true, profiles: mysqlMgr.listProfiles() });
  }
  if (p === '/api/mysql/test' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const r = await mysqlMgr.testConnection(body.id && !body.host ? body.id : body);
    return sendJson(res, 200, r);
  }
  if (p === '/api/mysql/start-xampp' && req.method === 'POST') {
    return sendJson(res, 200, mysqlMgr.startLocalXampp());
  }

  // Databases (supports both Built-in engine and Live MySQL Server!)
  if (p === '/api/databases' && req.method === 'GET') {
    const connId = urlObj.searchParams.get('connId') || 'builtin';
    if (connId !== 'builtin') {
      try {
        const databases = await mysqlMgr.listDatabases(connId);
        return sendJson(res, 200, { databases });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message, databases: [] });
      }
    }
    return sendJson(res, 200, { databases: engine.listDatabases() });
  }
  if (p === '/api/databases' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (body.connId && body.connId !== 'builtin') {
      const clean = String(body.name || '').replace(/[^A-Za-z0-9_]/g, '_');
      const r = await mysqlMgr.executeQuery(body.connId, '', `CREATE DATABASE IF NOT EXISTS \`${clean}\``);
      const databases = await mysqlMgr.listDatabases(body.connId);
      return sendJson(res, r.ok ? 200 : 400, { ok: r.ok, name: clean, error: r.error, databases });
    }
    const r = engine.createDatabase(body.name);
    return sendJson(res, r.ok ? 200 : 400, { ...r, databases: engine.listDatabases() });
  }
  if (p === '/api/databases/reset' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const r = engine.resetDatabase(body.db || 'ecommerce.db');
    return sendJson(res, 200, { ...r, schema: engine.getSchema(r.name), databases: engine.listDatabases() });
  }
  if (p === '/api/databases/delete' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const r = engine.deleteDatabase(body.db);
    return sendJson(res, r.ok ? 200 : 400, { ...r, databases: engine.listDatabases() });
  }

  // Schema
  if (p === '/api/schema' && req.method === 'GET') {
    const connId = urlObj.searchParams.get('connId') || 'builtin';
    const db = urlObj.searchParams.get('db') || (connId === 'builtin' ? 'ecommerce.db' : '');
    try {
      if (connId !== 'builtin') {
        return sendJson(res, 200, await mysqlMgr.getSchema(connId, db));
      }
      return sendJson(res, 200, engine.getSchema(db));
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  // SQL Runner & Explain
  if (p === '/api/query' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const connId = body.connId || 'builtin';
    const db = body.db || (connId === 'builtin' ? 'ecommerce.db' : '');
    const sql = String(body.sql || '');

    if (connId !== 'builtin') {
      const result = await mysqlMgr.executeQuery(connId, db, sql);
      if (!body.skipHistory && sql.trim()) {
        history.add({ db: `mysql:${db}`, sql, ok: result.ok, rowCount: result.totalRows || 0, durationMs: result.totalDurationMs || 0, error: result.ok ? null : result.error });
      }
      let schema = null;
      let databases = null;
      try {
        schema = await mysqlMgr.getSchema(connId, db);
        databases = await mysqlMgr.listDatabases(connId);
      } catch {}
      return sendJson(res, 200, { ...result, db, schema, databases });
    }

    const result = engine.executeQuery(db, sql);
    if (!body.skipHistory && sql.trim()) {
      history.add({
        db: result.db || db,
        sql,
        ok: result.ok,
        rowCount: result.totalRows || 0,
        durationMs: result.totalDurationMs || 0,
        error: result.ok ? null : result.error,
      });
    }

    const activeDb = result.db || db;
    const schema = engine.getSchema(activeDb);
    const databases = engine.listDatabases();
    return sendJson(res, 200, { ...result, db: activeDb, schema, databases });
  }

  if (p === '/api/explain' && req.method === 'POST') {
    const body = await readJsonBody(req);
    return sendJson(res, 200, engine.explainQuery(body.db || 'ecommerce.db', body.sql || ''));
  }

  // phpMyAdmin Table Browse & Visual Search (QBE)
  if (p === '/api/table/browse' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const connId = body.connId || 'builtin';
    const db = body.db || 'ecommerce.db';
    if (connId !== 'builtin') {
      return sendJson(res, 200, await mysqlMgr.browseTable(connId, db, body.table, body));
    }
    return sendJson(res, 200, engine.browseTable(db, body.table, body));
  }

  // phpMyAdmin Visual Row CRUD
  if (p === '/api/table/insert' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const db = body.db || 'ecommerce.db';
    const r = engine.insertRow(db, body.table, body.values);
    return sendJson(res, 200, { ...r, schema: engine.getSchema(db) });
  }
  if (p === '/api/table/update' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const db = body.db || 'ecommerce.db';
    const r = engine.updateRow(db, body.table, body.rowid, body.updates);
    return sendJson(res, 200, { ...r, schema: engine.getSchema(db) });
  }
  if (p === '/api/table/delete' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const db = body.db || 'ecommerce.db';
    const r = engine.deleteRows(db, body.table, body.rowids);
    return sendJson(res, 200, { ...r, schema: engine.getSchema(db) });
  }
  if (p === '/api/table/duplicate' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const db = body.db || 'ecommerce.db';
    const r = engine.duplicateRow(db, body.table, body.rowid);
    return sendJson(res, 200, { ...r, schema: engine.getSchema(db) });
  }

  // phpMyAdmin Visual Table Creator, Structure & Operations
  if (p === '/api/table/create' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const db = body.db || 'ecommerce.db';
    const r = engine.createTableVisual(db, body);
    return sendJson(res, 200, { ...r, schema: engine.getSchema(db) });
  }
  if (p === '/api/table/structure' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const db = body.db || 'ecommerce.db';
    const r = engine.alterStructure(db, body.table, body.action, body);
    return sendJson(res, 200, { ...r, schema: engine.getSchema(db) });
  }
  if (p === '/api/table/operation' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const db = body.db || 'ecommerce.db';
    const r = engine.tableOperation(db, body.table, body.op, body);
    return sendJson(res, 200, { ...r, schema: engine.getSchema(db), databases: engine.listDatabases() });
  }

  // Full SQL Dump Export (Database or Single Table)
  if (p === '/api/export/sql' && req.method === 'GET') {
    const db = urlObj.searchParams.get('db') || 'ecommerce.db';
    const table = urlObj.searchParams.get('table') || null;
    try {
      const dump = engine.exportSqlDump(db, table);
      const rawName = table ? `${table}.sql` : `${db.replace(/\.db$/, '')}_dump.sql`;
      const filename = rawName.replace(/[^A-Za-z0-9._-]/g, '_');
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      });
      res.end(dump);
      return true;
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  // Import (.sql / .csv / .json)
  if (p === '/api/import' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const db = body.db || 'ecommerce.db';
    const r = engine.importData(db, body.table || 'imported_data', body.format || 'csv', body.data || '');
    const activeDb = r.db || db;
    return sendJson(res, r.ok ? 200 : 400, {
      ...r,
      db: activeDb,
      schema: engine.getSchema(activeDb),
      databases: engine.listDatabases(),
    });
  }

  // History & Cookbook
  if (p === '/api/history' && req.method === 'GET') {
    return sendJson(res, 200, { items: history.list(urlObj.searchParams.get('q') || '', 80) });
  }
  if (p === '/api/history/clear' && req.method === 'POST') {
    history.clear();
    return sendJson(res, 200, { ok: true });
  }
  if (p === '/api/cookbook' && req.method === 'GET') {
    return sendJson(res, 200, { items: COOKBOOK });
  }

  // Bookmarks (phpMyAdmin Bookmarks + Saved Queries)
  if (p === '/api/bookmarks' && req.method === 'GET') {
    return sendJson(res, 200, { items: bookmarks.list(urlObj.searchParams.get('q') || '') });
  }
  if (p === '/api/bookmarks' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const r = bookmarks.add(body);
    return sendJson(res, r.ok ? 200 : 400, { ...r, items: bookmarks.list() });
  }
  if (p === '/api/bookmarks/delete' && req.method === 'POST') {
    const body = await readJsonBody(req);
    bookmarks.remove(body.id);
    return sendJson(res, 200, { ok: true, items: bookmarks.list() });
  }

  // Database Overview & Server PRAGMA Variables
  if (p === '/api/overview' && req.method === 'GET') {
    const db = urlObj.searchParams.get('db') || 'ecommerce.db';
    try { return sendJson(res, 200, pro.getDatabaseOverview(engine, db)); }
    catch (err) { return sendJson(res, 400, { ok: false, error: err.message }); }
  }
  if (p === '/api/pragma' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const r = pro.setPragma(engine, body.db || 'ecommerce.db', body.key, body.value);
    return sendJson(res, r.ok ? 200 : 400, r);
  }

  // Triggers & Views Managers
  if (p === '/api/triggers-views' && req.method === 'GET') {
    const db = urlObj.searchParams.get('db') || 'ecommerce.db';
    return sendJson(res, 200, pro.listTriggersAndViews(engine, db));
  }
  if (p === '/api/triggers/create' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const db = body.db || 'ecommerce.db';
    const r = pro.createTrigger(engine, db, body);
    return sendJson(res, r.ok ? 200 : 400, { ...r, schema: engine.getSchema(db) });
  }
  if (p === '/api/triggers/drop' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const db = body.db || 'ecommerce.db';
    const r = pro.dropTrigger(engine, db, body.name);
    return sendJson(res, r.ok ? 200 : 400, { ...r, schema: engine.getSchema(db) });
  }
  if (p === '/api/views/create' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const db = body.db || 'ecommerce.db';
    const r = pro.createView(engine, db, body);
    return sendJson(res, r.ok ? 200 : 400, { ...r, schema: engine.getSchema(db) });
  }
  if (p === '/api/views/drop' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const db = body.db || 'ecommerce.db';
    const r = pro.dropView(engine, db, body.name);
    return sendJson(res, r.ok ? 200 : 400, { ...r, schema: engine.getSchema(db) });
  }

  // Data Profiler & Smart Mock Data Seeder
  if (p === '/api/table/profile' && req.method === 'GET') {
    const db = urlObj.searchParams.get('db') || 'ecommerce.db';
    const table = urlObj.searchParams.get('table') || '';
    return sendJson(res, 200, pro.profileTable(engine, db, table));
  }
  if (p === '/api/table/mock' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const db = body.db || 'ecommerce.db';
    const r = pro.generateMockRows(engine, db, body.table, body.count || 10);
    return sendJson(res, r.ok ? 200 : 400, { ...r, schema: engine.getSchema(db) });
  }

  // Database Time-Travel Snapshots
  if (p === '/api/snapshots' && req.method === 'GET') {
    const db = urlObj.searchParams.get('db') || 'ecommerce.db';
    return sendJson(res, 200, { ok: true, snapshots: pro.listSnapshots(DATA_DIR, db) });
  }
  if (p === '/api/snapshots/create' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const r = pro.createSnapshot(engine, DATA_DIR, body.db || 'ecommerce.db', body.label);
    return sendJson(res, r.ok ? 200 : 400, r);
  }
  if (p === '/api/snapshots/restore' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const r = pro.restoreSnapshot(engine, DATA_DIR, body.db || 'ecommerce.db', body.id);
    return sendJson(res, r.ok ? 200 : 400, r);
  }
  if (p === '/api/snapshots/delete' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const r = pro.deleteSnapshot(DATA_DIR, body.db || 'ecommerce.db', body.id);
    return sendJson(res, 200, r);
  }

  // Code Generator (TypeScript, Prisma, Drizzle, Python, cURL, Fetch)
  if (p === '/api/codegen' && req.method === 'GET') {
    const db = urlObj.searchParams.get('db') || 'ecommerce.db';
    const table = urlObj.searchParams.get('table') || null;
    const host = req.headers.host || `localhost:${DEFAULT_PORT}`;
    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const schema = engine.getSchema(db);
    return sendJson(res, 200, pro.generateCodeModels(schema, table, `${proto}://${host}`));
  }

  // Instant Live REST API Endpoint (Supabase-style auto-API for ANY table!)
  const restMatch = p.match(/^\/api\/rest\/([^/]+)\/([^/]+)$/);
  if (restMatch && req.method === 'GET') {
    const dbName = decodeURIComponent(restMatch[1]);
    const tableName = decodeURIComponent(restMatch[2]);
    const limit = Math.max(1, Math.min(250, parseInt(urlObj.searchParams.get('limit') || '25', 10)));
    const page = Math.max(1, parseInt(urlObj.searchParams.get('page') || '1', 10));
    const sortCol = urlObj.searchParams.get('sort') || null;
    const sortDir = urlObj.searchParams.get('order') || 'ASC';
    const search = urlObj.searchParams.get('q') || '';
    const r = engine.browseTable(dbName, tableName, { page, pageSize: limit, sortCol, sortDir, search });
    if (!r.ok) return sendJson(res, 404, r);
    return sendJson(res, 200, {
      ok: true,
      database: dbName,
      table: tableName,
      total: r.total,
      page: r.page,
      limit: r.pageSize,
      durationMs: r.durationMs,
      data: r.rows.map(({ _rowid_, ...clean }) => clean),
    });
  }

  return false;
}

async function handleRequest(req, res) {
  const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
  if (urlObj.pathname.startsWith('/api/')) {
    const handled = await handleApi(req, res, urlObj);
    if (handled !== false) return;
  }

  const safeRel = urlObj.pathname === '/' ? 'index.html' : urlObj.pathname.replace(/^\/+/, '');
  const fullPath = path.resolve(PUBLIC_DIR, safeRel);
  if (fullPath !== PUBLIC_DIR && !fullPath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    sendCompressed(req, res, 200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    }, data);
  });
}

function createServer() {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      try {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      } catch {}
    });
  });
}

if (require.main === module) {
  const server = createServer();
  const listenPort = (port) => {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Check if EKONI SQL Studio is already running on this port (prevents duplicates on reboot/double-click!)
        http.get(`http://127.0.0.1:${port}/api/health`, (r) => {
          let body = '';
          r.on('data', (c) => (body += c));
          r.on('end', () => {
            if (body.includes('ekoni-sql-studio')) {
              console.log(`EKONI SQL Studio is already running at http://localhost:${port}`);
              process.exit(0);
            } else {
              listenPort(port + 1);
            }
          });
        }).on('error', () => listenPort(port + 1));
      } else {
        console.error(err);
        process.exit(1);
      }
    });
    server.listen(port, () => {
      console.log(`\n  \x1b[1;38;2;122;162;247mEKONI SQL Studio · MySQL 9.7 & phpMyAdmin Pro\x1b[0m`);
      console.log(`  Running at \x1b[1;36mhttp://localhost:${port}\x1b[0m (and http://127.0.0.1:${port})`);
      console.log(`  Press Ctrl+C to stop the server.\n`);
    });
  };
  listenPort(DEFAULT_PORT);

  const shutdown = () => {
    try { server.close(); } catch {}
    try { engine.closeAll(); } catch {}
    try { mysqlMgr.closeAll(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createServer, engine, SECURITY_HEADERS };

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let mysql2 = null;
function getMysqlDriver() {
  if (!mysql2) {
    try {
      mysql2 = require('mysql2/promise');
    } catch {
      return null;
    }
  }
  return mysql2;
}

function escapeBacktick(id) {
  return '`' + String(id || '').replace(/`/g, '``') + '`';
}

const DEFAULT_CONNECTIONS = [
  {
    id: 'local-mysql',
    name: 'Local MySQL / XAMPP (3306)',
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: '',
    ssl: false,
  },
];

class MySqlManager {
  constructor(dataDir) {
    this.filePath = path.join(dataDir, 'connections.json');
    this.profiles = [];
    this.pools = new Map(); // id -> { pool, config }
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        if (Array.isArray(parsed) && parsed.length) {
          this.profiles = parsed;
          return;
        }
      }
    } catch {}
    this.profiles = DEFAULT_CONNECTIONS.slice();
    this._save();
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.profiles, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch {}
  }

  detectLocalBinaries() {
    const found = [];
    const mysqlRoot = 'C:\\Program Files\\MySQL';
    try {
      if (fs.existsSync(mysqlRoot)) {
        for (const entry of fs.readdirSync(mysqlRoot)) {
          const exe = path.join(mysqlRoot, entry, 'bin', 'mysqld.exe');
          if (fs.existsSync(exe)) found.push(exe);
        }
      }
    } catch {}
    const xamppExe = 'C:\\xampp\\mysql\\bin\\mysqld.exe';
    if (fs.existsSync(xamppExe)) found.push(xamppExe);
    return {
      driverInstalled: Boolean(getMysqlDriver()),
      localBinaries: found,
      hasXampp: fs.existsSync(xamppExe),
    };
  }

  startLocalXampp() {
    const exe = 'C:\\xampp\\mysql\\bin\\mysqld.exe';
    if (!fs.existsSync(exe)) {
      return { ok: false, error: 'XAMPP MySQL not found at C:\\xampp\\mysql\\bin\\mysqld.exe' };
    }
    try {
      const child = spawn(exe, ['--defaults-file=C:\\xampp\\mysql\\bin\\my.ini', '--standalone'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
      return { ok: true, message: 'Started local XAMPP MySQL/MariaDB server on port 3306. Wait 2 seconds then click Connect.' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  listProfiles() {
    return this.profiles.map((p) => ({
      id: p.id,
      name: p.name,
      host: p.host,
      port: p.port,
      user: p.user,
      hasPassword: Boolean(p.password),
      database: p.database || '',
      ssl: Boolean(p.ssl),
    }));
  }

  getProfile(id) {
    return this.profiles.find((p) => p.id === id) || null;
  }

  saveProfile(input) {
    const id = input.id || 'mysql-' + Date.now();
    const existing = this.getProfile(id);
    const profile = {
      id,
      name: String(input.name || `${input.host || '127.0.0.1'}:${input.port || 3306}`).trim(),
      host: String(input.host || '127.0.0.1').trim(),
      port: parseInt(input.port, 10) || 3306,
      user: String(input.user || 'root').trim(),
      password: input.password !== undefined ? String(input.password) : existing ? existing.password : '',
      database: String(input.database || '').trim(),
      ssl: Boolean(input.ssl),
    };
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx >= 0) this.profiles[idx] = profile;
    else this.profiles.push(profile);
    this._closePool(id);
    this._save();
    return { ok: true, profile: { ...profile, password: undefined, hasPassword: Boolean(profile.password) } };
  }

  deleteProfile(id) {
    this._closePool(id);
    this.profiles = this.profiles.filter((p) => p.id !== id);
    this._save();
    return { ok: true };
  }

  _closePool(id) {
    const prefix = `${id}::`;
    for (const [key, pool] of this.pools.entries()) {
      if (key === id || key.startsWith(prefix)) {
        try { pool.end(); } catch {}
        this.pools.delete(key);
      }
    }
  }

  closeAll() {
    for (const pool of this.pools.values()) {
      try { pool.end(); } catch {}
    }
    this.pools.clear();
  }

  async _getPool(profileId, dbOverride) {
    const driver = getMysqlDriver();
    if (!driver) throw new Error('mysql2 driver is still installing or missing. Run "npm install mysql2".');
    const p = this.getProfile(profileId);
    if (!p) throw new Error('MySQL connection profile not found.');

    const key = `${profileId}::${dbOverride || p.database || ''}`;
    if (this.pools.has(key)) return this.pools.get(key);

    const pool = driver.createPool({
      host: p.host,
      port: p.port,
      user: p.user,
      password: p.password,
      database: dbOverride || p.database || undefined,
      ssl: p.ssl ? { rejectUnauthorized: false } : undefined,
      multipleStatements: true,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 6000,
    });
    this.pools.set(key, pool);
    return pool;
  }

  async testConnection(configOrId) {
    const driver = getMysqlDriver();
    if (!driver) return { ok: false, error: 'mysql2 driver not installed yet.' };
    const cfg = typeof configOrId === 'string' ? this.getProfile(configOrId) : configOrId;
    if (!cfg) return { ok: false, error: 'Invalid connection settings' };

    const t0 = Date.now();
    let conn = null;
    try {
      conn = await driver.createConnection({
        host: cfg.host || '127.0.0.1',
        port: parseInt(cfg.port, 10) || 3306,
        user: cfg.user || 'root',
        password: cfg.password || '',
        database: cfg.database || undefined,
        ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 6000,
      });
      const [[verRow]] = await conn.query('SELECT VERSION() AS version, DATABASE() AS current_db');
      const [dbRows] = await conn.query('SHOW DATABASES');
      const databases = dbRows.map((r) => Object.values(r)[0]);
      await conn.end();
      return {
        ok: true,
        version: verRow.version,
        currentDb: verRow.current_db || databases.find((d) => !['information_schema', 'mysql', 'performance_schema', 'sys'].includes(d)) || databases[0] || '',
        databases,
        latencyMs: Date.now() - t0,
      };
    } catch (err) {
      if (conn) try { await conn.end(); } catch {}
      return { ok: false, error: err.message || String(err) };
    }
  }

  async listDatabases(profileId) {
    const pool = await this._getPool(profileId, '');
    const [rows] = await pool.query('SHOW DATABASES');
    return rows.map((r) => ({ name: Object.values(r)[0], size: 0, isMemory: false, isMysql: true }));
  }

  async getSchema(profileId, dbName) {
    const pool = await this._getPool(profileId, dbName);
    const [[verRow]] = await pool.query('SELECT VERSION() AS ver');
    if (!dbName) {
      return { db: '', sqliteVersion: `MySQL ${verRow.ver}`, isMysql: true, tables: [], views: [], relations: [] };
    }

    const [tblRows] = await pool.query(
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS type, COALESCE(TABLE_ROWS, 0) AS rowCount
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_TYPE, TABLE_NAME`,
      [dbName]
    );

    const [colRows] = await pool.query(
      `SELECT TABLE_NAME AS tbl, COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
              COLUMN_KEY AS colKey, COLUMN_DEFAULT AS dflt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [dbName]
    );

    const [fkRows] = await pool.query(
      `SELECT TABLE_NAME AS fromTable, COLUMN_NAME AS fromColumn,
              REFERENCED_TABLE_NAME AS toTable, REFERENCED_COLUMN_NAME AS toColumn
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [dbName]
    );

    const colsByTbl = new Map();
    for (const c of colRows) {
      if (!colsByTbl.has(c.tbl)) colsByTbl.set(c.tbl, []);
      colsByTbl.get(c.tbl).push({
        name: c.name,
        type: c.type || '',
        notnull: c.nullable === 'NO',
        pk: c.colKey === 'PRI',
        fk: false,
        dflt: c.dflt,
      });
    }

    const fksByTbl = new Map();
    for (const fk of fkRows) {
      if (!fksByTbl.has(fk.fromTable)) fksByTbl.set(fk.fromTable, []);
      fksByTbl.get(fk.fromTable).push({ from: fk.fromColumn, table: fk.toTable, to: fk.toColumn });
    }

    const tables = [];
    const views = [];
    for (const t of tblRows) {
      const cols = colsByTbl.get(t.name) || [];
      const fks = fksByTbl.get(t.name) || [];
      const fkSet = new Set(fks.map((f) => f.from));
      cols.forEach((c) => { c.fk = fkSet.has(c.name); });
      const isView = String(t.type).toUpperCase().includes('VIEW');
      if (isView) {
        views.push({ name: t.name, type: 'view', rowCount: Number(t.rowCount || 0), columns: cols, sql: '' });
      } else {
        tables.push({ name: t.name, type: 'table', rowCount: Number(t.rowCount || 0), columns: cols, foreignKeys: fks, indexes: [], sql: '' });
      }
    }

    return {
      db: dbName,
      sqliteVersion: `MySQL ${verRow.ver}`,
      isMysql: true,
      tables,
      views,
      relations: fkRows,
    };
  }

  async executeQuery(profileId, dbName, rawSql) {
    const pool = await this._getPool(profileId, dbName);
    const t0 = process.hrtime.bigint();
    try {
      const [res, fields] = await pool.query(rawSql);
      const durationMs = Number((Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2));
      const results = [];

      const pushOne = (idx, r, f) => {
        if (Array.isArray(r)) {
          const cols = Array.isArray(f) && f.length
            ? f.map((c) => ({ name: c.name, type: '', table: c.table || '' }))
            : r[0]
            ? Object.keys(r[0]).map((n) => ({ name: n, type: '', table: '' }))
            : [];
          results.push({
            index: idx,
            statement: rawSql,
            kind: 'select',
            columns: cols,
            rows: r.slice(0, 5000),
            rowCount: r.length,
            truncated: r.length > 5000,
            durationMs,
          });
        } else if (r && typeof r === 'object') {
          results.push({
            index: idx,
            statement: rawSql,
            kind: 'mutation',
            changes: Number(r.affectedRows || 0),
            lastInsertRowid: r.insertId ? Number(r.insertId) : null,
            message: r.info || `OK (${r.affectedRows || 0} rows affected)`,
            durationMs,
          });
        }
      };

      // Handle both single result and multi-statement arrays from mysql2
      if (Array.isArray(res) && res.length > 0 && (Array.isArray(res[0]) || (res[0] && typeof res[0].affectedRows === 'number'))) {
        res.forEach((sub, i) => pushOne(i + 1, sub, Array.isArray(fields) ? fields[i] : null));
      } else {
        pushOne(1, res, fields);
      }

      const totalRows = results.reduce((acc, r) => acc + (r.rowCount || 0), 0);
      return { ok: true, db: dbName, results, totalRows, totalDurationMs: durationMs };
    } catch (err) {
      const durationMs = Number((Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2));
      return { ok: false, db: dbName, error: err.sqlMessage || err.message, totalDurationMs: durationMs };
    }
  }

  async browseTable(profileId, dbName, tableName, opts = {}) {
    const pool = await this._getPool(profileId, dbName);
    const schema = await this.getSchema(profileId, dbName);
    const obj = [...schema.tables, ...schema.views].find((t) => t.name === tableName);
    if (!obj) return { ok: false, error: `Table '${tableName}' not found` };

    const qTbl = escapeBacktick(tableName);
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const pageSize = Math.max(5, Math.min(250, parseInt(opts.pageSize, 10) || 25));
    const offset = (page - 1) * pageSize;

    const validCols = new Set(obj.columns.map((c) => c.name));
    const sortCol = opts.sortCol && validCols.has(opts.sortCol) ? opts.sortCol : null;
    const sortDir = String(opts.sortDir || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const orderSql = sortCol ? `ORDER BY ${escapeBacktick(sortCol)} ${sortDir}` : '';

    const t0 = process.hrtime.bigint();
    try {
      const [[cntRow]] = await pool.query(`SELECT COUNT(*) AS cnt FROM ${qTbl}`);
      const total = Number(cntRow.cnt || 0);
      const [rows] = await pool.query(`SELECT * FROM ${qTbl} ${orderSql} LIMIT ? OFFSET ?`, [pageSize, offset]);
      const pkCol = obj.columns.find((c) => c.pk)?.name || null;
      const mapped = rows.map((r, i) => ({ ...r, _rowid_: pkCol ? r[pkCol] : i }));
      const durationMs = Number((Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2));
      return {
        ok: true,
        table: tableName,
        isView: obj.type === 'view',
        editable: Boolean(pkCol) && obj.type === 'table',
        pkCol,
        columns: obj.columns,
        rows: mapped,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        generatedSql: `SELECT * FROM ${qTbl} ${orderSql} LIMIT ${pageSize} OFFSET ${offset};`.trim(),
        durationMs,
      };
    } catch (err) {
      return { ok: false, error: err.sqlMessage || err.message };
    }
  }
}

module.exports = { MySqlManager };

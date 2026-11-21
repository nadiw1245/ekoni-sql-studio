'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { ECOMMERCE_SEED, HR_ANALYTICS_SEED } = require('./seed-data');
const { registerCompatFunctions, transpileSql, tryHandleMetaCommand } = require('./mysql-compat');

const MAX_RESULT_ROWS = 5000;

function splitSqlStatements(sql) {
  const statements = [];
  const text = String(sql || '');
  const len = text.length;
  let current = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let beginDepth = 0;

  while (i < len) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += '/';
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inSingle) {
      current += ch;
      if (ch === "'") {
        if (next === "'") { current += "'"; i += 2; continue; }
        inSingle = false;
      }
      i++;
      continue;
    }
    if (inDouble) {
      current += ch;
      if (ch === '"') {
        if (next === '"') { current += '"'; i += 2; continue; }
        inDouble = false;
      }
      i++;
      continue;
    }

    if (ch === '-' && next === '-') { inLineComment = true; current += '--'; i += 2; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; current += '/*'; i += 2; continue; }
    if (ch === "'") { inSingle = true; current += ch; i++; continue; }
    if (ch === '"') { inDouble = true; current += ch; i++; continue; }

    if (/[A-Za-z]/.test(ch) && (i === 0 || !/[A-Za-z0-9_]/.test(text[i - 1]))) {
      const rest = text.slice(i);
      const wordMatch = rest.match(/^(BEGIN|END)\b/i);
      if (wordMatch) {
        const kw = wordMatch[1].toUpperCase();
        if (kw === 'BEGIN' && /\bCREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i.test(current)) {
          beginDepth++;
        } else if (kw === 'END' && beginDepth > 0) {
          beginDepth--;
        }
      }
    }

    if (ch === ';' && beginDepth === 0) {
      const trimmed = current.trim();
      if (hasExecutableSql(trimmed)) statements.push(trimmed);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const tail = current.trim();
  if (hasExecutableSql(tail)) statements.push(tail);
  return statements;
}

function hasExecutableSql(stmt) {
  if (!stmt) return false;
  return stmt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').trim().length > 0;
}

function sanitizeDbName(name) {
  let clean = String(name || 'ecommerce.db').trim().replace(/[^A-Za-z0-9_.:-]/g, '_');
  if (!clean || clean === ':memory:') return ':memory:';
  if (!clean.endsWith('.db') && !clean.endsWith('.sqlite')) clean += '.db';
  return clean;
}

function quoteIdent(name) {
  return `"${String(name || '').replace(/"/g, '""')}"`;
}

function safeNewIdent(name) {
  const clean = String(name || 'table_1').trim().replace(/[^A-Za-z0-9_]/g, '_');
  const prefixed = /^[0-9]/.test(clean) ? `t_${clean}` : clean || 'table_1';
  return quoteIdent(prefixed);
}

function toPlainRow(row) {
  const plain = {};
  for (const key of Object.keys(row)) {
    const val = row[key];
    plain[key] = typeof val === 'bigint' ? Number(val) : Buffer.isBuffer(val) ? `<BLOB ${val.length}B>` : val;
  }
  return plain;
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const text = String(csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

function inferSqliteType(values) {
  let hasInt = false;
  let hasFloat = false;
  for (const v of values) {
    if (v === null || v === undefined || String(v).trim() === '') continue;
    const s = String(v).trim();
    if (/^-?\d+$/.test(s)) hasInt = true;
    else if (/^-?\d+\.\d+$/.test(s)) hasFloat = true;
    else return 'TEXT';
  }
  if (hasFloat) return 'REAL';
  if (hasInt) return 'INTEGER';
  return 'TEXT';
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

class SqlEngine {
  constructor(dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.connections = new Map();
    this._ensureStarterDbs();
  }

  _ensureStarterDbs() {
    const ecomPath = path.join(this.dataDir, 'ecommerce.db');
    if (!fs.existsSync(ecomPath)) {
      const db = new DatabaseSync(ecomPath);
      db.exec(ECOMMERCE_SEED);
      db.close();
    }
    const hrPath = path.join(this.dataDir, 'tech_hr.db');
    if (!fs.existsSync(hrPath)) {
      const db = new DatabaseSync(hrPath);
      db.exec(HR_ANALYTICS_SEED);
      db.close();
    }
  }

  resolveDbName(name) {
    return sanitizeDbName(name);
  }

  getDb(dbName = 'ecommerce.db') {
    const clean = sanitizeDbName(dbName);
    if (this.connections.has(clean)) {
      return this.connections.get(clean);
    }
    const location = clean === ':memory:' ? ':memory:' : path.join(this.dataDir, clean);
    const db = new DatabaseSync(location);
    db.exec('PRAGMA foreign_keys = ON;');
    registerCompatFunctions(db, () => clean);
    this.connections.set(clean, db);
    return db;
  }

  listDatabases() {
    let files = [];
    try {
      files = fs.readdirSync(this.dataDir).filter((f) => f.endsWith('.db') || f.endsWith('.sqlite')).sort();
    } catch {
      files = [];
    }
    const dbs = files.map((name) => {
      const full = path.join(this.dataDir, name);
      let size = 0;
      try { size = fs.statSync(full).size; } catch {}
      return { name, size, isMemory: false };
    });
    dbs.push({ name: ':memory:', size: 0, isMemory: true });
    return dbs;
  }

  createDatabase(name) {
    const clean = sanitizeDbName(name);
    if (clean === ':memory:') return { ok: true, name: ':memory:' };
    const db = this.getDb(clean);
    db.exec('PRAGMA user_version = 1;');
    return { ok: true, name: clean };
  }

  resetDatabase(dbName) {
    const clean = sanitizeDbName(dbName);
    if (this.connections.has(clean)) {
      try { this.connections.get(clean).close(); } catch {}
      this.connections.delete(clean);
    }
    if (clean === ':memory:') {
      this.getDb(':memory:');
      return { ok: true, name: ':memory:' };
    }
    const full = path.join(this.dataDir, clean);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    const db = this.getDb(clean);
    if (clean === 'ecommerce.db') db.exec(ECOMMERCE_SEED);
    else if (clean === 'tech_hr.db') db.exec(HR_ANALYTICS_SEED);
    return { ok: true, name: clean };
  }

  deleteDatabase(dbName) {
    const clean = sanitizeDbName(dbName);
    if (clean === ':memory:' || clean === 'ecommerce.db') {
      return { ok: false, error: 'Cannot drop built-in ecommerce.db or :memory:' };
    }
    if (this.connections.has(clean)) {
      try { this.connections.get(clean).close(); } catch {}
      this.connections.delete(clean);
    }
    const full = path.join(this.dataDir, clean);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return { ok: true };
  }

  getSchema(dbName = 'ecommerce.db') {
    const db = this.getDb(dbName);
    const sqliteVerRow = db.prepare('SELECT sqlite_version() AS ver').get();
    const objects = db
      .prepare(
        `SELECT type, name, tbl_name, sql
         FROM sqlite_master
         WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
         ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`
      )
      .all();

    const tables = [];
    const views = [];
    const relations = [];

    for (const obj of objects) {
      const qName = quoteIdent(obj.name);
      let cols = [];
      let fks = [];
      let indexes = [];
      let rowCount = 0;

      try {
        cols = db.prepare(`PRAGMA table_info(${qName})`).all().map((c) => ({
          name: c.name,
          type: c.type || 'ANY',
          notnull: Boolean(c.notnull),
          pk: Boolean(c.pk),
          dflt: c.dflt_value,
        }));
      } catch {
        cols = [];
      }

      try {
        const cnt = db.prepare(`SELECT COUNT(*) AS c FROM ${qName}`).get();
        rowCount = Number(cnt ? cnt.c : 0);
      } catch {
        rowCount = 0;
      }

      if (obj.type === 'table') {
        try {
          fks = db.prepare(`PRAGMA foreign_key_list(${qName})`).all().map((fk) => ({
            from: fk.from,
            table: fk.table,
            to: fk.to,
          }));
          for (const fk of fks) {
            relations.push({
              fromTable: obj.name,
              fromColumn: fk.from,
              toTable: fk.table,
              toColumn: fk.to,
            });
          }
        } catch {
          fks = [];
        }

        try {
          const idxRaw = db.prepare(`PRAGMA index_list(${qName})`).all();
          indexes = idxRaw.map((idx) => {
            let idxCols = [];
            try {
              idxCols = db.prepare(`PRAGMA index_info(${quoteIdent(idx.name)})`).all().map((ci) => ci.name);
            } catch {}
            return {
              name: idx.name,
              unique: Boolean(idx.unique),
              origin: idx.origin || 'c',
              columns: idxCols,
            };
          });
        } catch {
          indexes = [];
        }

        const fkSet = new Set(fks.map((f) => f.from));
        cols.forEach((c) => { c.fk = fkSet.has(c.name); });
        tables.push({ name: obj.name, type: 'table', rowCount, columns: cols, foreignKeys: fks, indexes, sql: obj.sql });
      } else {
        views.push({ name: obj.name, type: 'view', rowCount, columns: cols, sql: obj.sql });
      }
    }

    return {
      db: sanitizeDbName(dbName),
      sqliteVersion: sqliteVerRow ? sqliteVerRow.ver : '3',
      tables,
      views,
      relations,
    };
  }

  executeQuery(dbName, rawSql) {
    let activeDb = sanitizeDbName(dbName);
    const statements = splitSqlStatements(rawSql);
    if (statements.length === 0) {
      return { ok: false, error: 'No SQL statement to execute.' };
    }

    const results = [];
    let totalDurationMs = 0;
    let totalRows = 0;
    let schemaChanged = false;
    let databasesChanged = false;

    for (let idx = 0; idx < statements.length; idx++) {
      const rawStmt = statements[idx];
      const t0 = process.hrtime.bigint();

      try {
        // 1. Intercept phpMyAdmin / MySQL / Postgres meta-commands (SHOW, USE, DESCRIBE, TRUNCATE, CREATE/DROP DATABASE)
        const metaRes = tryHandleMetaCommand(rawStmt, activeDb, this);
        if (metaRes) {
          totalDurationMs += metaRes.durationMs || 0;
          if (metaRes.kind === 'select') totalRows += metaRes.rowCount || 0;
          if (metaRes.schemaChanged) schemaChanged = true;
          if (metaRes.databasesChanged) databasesChanged = true;
          if (metaRes.switchedDb) {
            activeDb = metaRes.switchedDb;
            databasesChanged = true;
            schemaChanged = true;
          }
          results.push({ index: idx + 1, statement: rawStmt, ...metaRes });
          continue;
        }

        // 2. Transpile MySQL / Postgres syntax smoothly to SQLite
        const transpiled = transpileSql(rawStmt);
        if (transpiled.noop) {
          const durationMs = Number((Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2));
          totalDurationMs += durationMs;
          results.push({
            index: idx + 1,
            statement: rawStmt,
            kind: 'mutation',
            changes: 0,
            lastInsertRowid: null,
            message: transpiled.noopMessage,
            durationMs,
          });
          continue;
        }

        const db = this.getDb(activeDb);
        const prepared = db.prepare(transpiled.sql);
        const colMeta = typeof prepared.columns === 'function' ? prepared.columns() : [];

        if (colMeta && colMeta.length > 0) {
          const allRows = [];
          let truncated = false;
          for (const row of prepared.iterate()) {
            if (allRows.length >= MAX_RESULT_ROWS) {
              truncated = true;
              break;
            }
            allRows.push(toPlainRow(row));
          }
          const durationMs = Number((Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2));
          totalDurationMs += durationMs;
          totalRows += allRows.length;

          results.push({
            index: idx + 1,
            statement: rawStmt,
            kind: 'select',
            columns: colMeta.map((c) => ({ name: c.name, type: c.type || '', table: c.table || '' })),
            rows: allRows,
            rowCount: allRows.length,
            truncated,
            durationMs,
          });
        } else {
          const info = prepared.run();
          const durationMs = Number((Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2));
          totalDurationMs += durationMs;
          if (/^\s*(CREATE|DROP|ALTER|ATTACH|DETACH|VACUUM)\b/i.test(transpiled.sql)) {
            schemaChanged = true;
          }
          results.push({
            index: idx + 1,
            statement: rawStmt,
            kind: 'mutation',
            changes: Number(info.changes || 0),
            lastInsertRowid: info.lastInsertRowid !== undefined ? Number(info.lastInsertRowid) : null,
            durationMs,
          });
        }
      } catch (err) {
        const durationMs = Number((Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2));
        return {
          ok: false,
          db: activeDb,
          error: err.message || String(err),
          failedStatementIndex: idx + 1,
          failedStatement: rawStmt,
          results,
          totalDurationMs: Number((totalDurationMs + durationMs).toFixed(2)),
        };
      }
    }

    return {
      ok: true,
      db: activeDb,
      results,
      totalRows,
      totalDurationMs: Number(totalDurationMs.toFixed(2)),
      schemaChanged,
      databasesChanged,
    };
  }

  explainQuery(dbName, rawSql) {
    const db = this.getDb(dbName);
    const statements = splitSqlStatements(rawSql);
    if (!statements.length) return { ok: false, error: 'Enter a query to explain.' };
    const firstRaw = statements[0].replace(/^\s*EXPLAIN\s+(QUERY\s+PLAN\s+)?/i, '');
    const first = transpileSql(firstRaw).sql;
    try {
      const plan = db.prepare(`EXPLAIN QUERY PLAN ${first}`).all().map((r) => ({
        id: r.id,
        parent: r.parent,
        detail: r.detail,
        isFullScan: /\bSCAN\b/i.test(r.detail) && !/\bUSING\s+(COVERING\s+)?INDEX\b/i.test(r.detail),
        usesIndex: /\bUSING\s+(COVERING\s+)?INDEX\b|\bINTEGER\s+PRIMARY\s+KEY\b/i.test(r.detail),
      }));
      return { ok: true, statement: first, plan };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // =========================================================================
  // phpMyAdmin Visual Table Browser, Row CRUD, Search & Operations
  // =========================================================================
  browseTable(dbName, tableName, opts = {}) {
    const db = this.getDb(dbName);
    const schema = this.getSchema(dbName);
    const obj = [...schema.tables, ...schema.views].find((t) => t.name === tableName);
    if (!obj) return { ok: false, error: `Table '${tableName}' not found` };

    const isView = obj.type === 'view';
    const qTbl = quoteIdent(obj.name);
    const page = Math.max(1, parseInt(opts.page, 10) || 1);
    const pageSize = Math.max(5, Math.min(250, parseInt(opts.pageSize, 10) || 50));
    const offset = (page - 1) * pageSize;

    const validCols = new Set(obj.columns.map((c) => c.name));
    const sortCol = opts.sortCol && validCols.has(opts.sortCol) ? opts.sortCol : null;
    const sortDir = String(opts.sortDir || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const whereClauses = [];
    const params = [];

    if (opts.search && String(opts.search).trim()) {
      const term = `%${String(opts.search).trim()}%`;
      const orParts = obj.columns.map((c) => `CAST(${quoteIdent(c.name)} AS TEXT) LIKE ?`);
      if (orParts.length) {
        whereClauses.push(`(${orParts.join(' OR ')})`);
        obj.columns.forEach(() => params.push(term));
      }
    }

    // phpMyAdmin Visual Search (QBE) filters
    if (Array.isArray(opts.filters)) {
      for (const f of opts.filters) {
        if (!f || !validCols.has(f.column)) continue;
        const col = quoteIdent(f.column);
        const op = String(f.op || '=').toUpperCase();
        if (op === 'IS NULL' || op === 'IS NOT NULL') {
          whereClauses.push(`${col} ${op}`);
        } else if (op === 'LIKE %...%') {
          whereClauses.push(`CAST(${col} AS TEXT) LIKE ?`);
          params.push(`%${f.value ?? ''}%`);
        } else if (['=', '!=', '<', '<=', '>', '>=', 'LIKE'].includes(op)) {
          whereClauses.push(`${col} ${op} ?`);
          params.push(f.value ?? '');
        } else if (op === 'IN') {
          const vals = String(f.value || '').split(',').map((s) => s.trim()).filter(Boolean);
          if (vals.length) {
            whereClauses.push(`${col} IN (${vals.map(() => '?').join(', ')})`);
            params.push(...vals);
          }
        }
      }
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const orderSql = sortCol ? `ORDER BY ${quoteIdent(sortCol)} ${sortDir}` : '';

    const t0 = process.hrtime.bigint();
    try {
      const totalRow = db.prepare(`SELECT COUNT(*) AS cnt FROM ${qTbl} ${whereSql}`).get(...params);
      const total = Number(totalRow ? totalRow.cnt : 0);

      let hasRowid = !isView;
      let selectSql = hasRowid
        ? `SELECT rowid AS _rowid_, * FROM ${qTbl} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`
        : `SELECT * FROM ${qTbl} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`;

      let rawRows;
      try {
        rawRows = db.prepare(selectSql).all(...params, pageSize, offset);
      } catch {
        hasRowid = false;
        selectSql = `SELECT * FROM ${qTbl} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`;
        rawRows = db.prepare(selectSql).all(...params, pageSize, offset);
      }

      const durationMs = Number((Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2));
      return {
        ok: true,
        table: obj.name,
        isView,
        editable: hasRowid,
        columns: obj.columns,
        rows: rawRows.map(toPlainRow),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        generatedSql: `SELECT * FROM ${qTbl} ${whereSql} ${orderSql} LIMIT ${pageSize} OFFSET ${offset};`.replace(/\s+/g, ' ').trim(),
        durationMs,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  insertRow(dbName, tableName, values) {
    const db = this.getDb(dbName);
    const schema = this.getSchema(dbName);
    const tbl = schema.tables.find((t) => t.name === tableName);
    if (!tbl) return { ok: false, error: `Table '${tableName}' not found` };

    const validCols = new Set(tbl.columns.map((c) => c.name));
    const cols = [];
    const vals = [];
    for (const [k, v] of Object.entries(values || {})) {
      if (!validCols.has(k)) continue;
      if (v === undefined) continue;
      cols.push(quoteIdent(k));
      vals.push(v);
    }

    try {
      const sql = cols.length
        ? `INSERT INTO ${quoteIdent(tableName)} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
        : `INSERT INTO ${quoteIdent(tableName)} DEFAULT VALUES`;
      const info = db.prepare(sql).run(...vals);
      return { ok: true, changes: Number(info.changes || 1), lastInsertRowid: Number(info.lastInsertRowid || 0) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  updateRow(dbName, tableName, rowid, updates) {
    const db = this.getDb(dbName);
    const schema = this.getSchema(dbName);
    const tbl = schema.tables.find((t) => t.name === tableName);
    if (!tbl) return { ok: false, error: `Table '${tableName}' not found` };

    const validCols = new Set(tbl.columns.map((c) => c.name));
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(updates || {})) {
      if (!validCols.has(k)) continue;
      sets.push(`${quoteIdent(k)} = ?`);
      vals.push(v);
    }
    if (!sets.length) return { ok: false, error: 'No columns to update' };
    vals.push(rowid);

    try {
      const info = db.prepare(`UPDATE ${quoteIdent(tableName)} SET ${sets.join(', ')} WHERE rowid = ?`).run(...vals);
      return { ok: true, changes: Number(info.changes || 0) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  deleteRows(dbName, tableName, rowids) {
    const db = this.getDb(dbName);
    const list = Array.isArray(rowids) ? rowids.filter((id) => id !== null && id !== undefined) : [];
    if (!list.length) return { ok: false, error: 'No rows selected' };
    try {
      const info = db
        .prepare(`DELETE FROM ${quoteIdent(tableName)} WHERE rowid IN (${list.map(() => '?').join(', ')})`)
        .run(...list);
      return { ok: true, changes: Number(info.changes || 0) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  duplicateRow(dbName, tableName, rowid) {
    const db = this.getDb(dbName);
    const schema = this.getSchema(dbName);
    const tbl = schema.tables.find((t) => t.name === tableName);
    if (!tbl) return { ok: false, error: `Table '${tableName}' not found` };

    try {
      const row = db.prepare(`SELECT * FROM ${quoteIdent(tableName)} WHERE rowid = ?`).get(rowid);
      if (!row) return { ok: false, error: 'Row not found' };
      const copyCols = tbl.columns.filter((c) => !(c.pk && /INT/i.test(c.type || '')));
      const colNames = copyCols.map((c) => quoteIdent(c.name));
      const vals = copyCols.map((c) => row[c.name]);
      const info = db
        .prepare(`INSERT INTO ${quoteIdent(tableName)} (${colNames.join(', ')}) VALUES (${colNames.map(() => '?').join(', ')})`)
        .run(...vals);
      return { ok: true, lastInsertRowid: Number(info.lastInsertRowid || 0) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  createTableVisual(dbName, { name, columns }) {
    const db = this.getDb(dbName);
    if (!name || !String(name).trim()) return { ok: false, error: 'Table name is required' };
    if (!Array.isArray(columns) || columns.length === 0) return { ok: false, error: 'Add at least one column' };

    const qTable = safeNewIdent(name);
    const colDefs = [];
    for (const c of columns) {
      if (!c.name || !String(c.name).trim()) continue;
      const qCol = safeNewIdent(c.name);
      let type = String(c.type || 'TEXT').trim().toUpperCase();
      if (c.pk && c.ai) {
        colDefs.push(`${qCol} INTEGER PRIMARY KEY AUTOINCREMENT`);
        continue;
      }
      const parts = [qCol, type];
      if (c.pk) parts.push('PRIMARY KEY');
      if (c.notnull && !c.pk) parts.push('NOT NULL');
      if (c.unique && !c.pk) parts.push('UNIQUE');
      if (c.defaultVal !== undefined && String(c.defaultVal).trim() !== '') {
        const dv = String(c.defaultVal).trim();
        const isRaw = /^(-?\d+(\.\d+)?|CURRENT_TIMESTAMP|CURRENT_DATE|NULL)$/i.test(dv);
        parts.push(`DEFAULT ${isRaw ? dv : sqlLiteral(dv)}`);
      }
      colDefs.push(parts.join(' '));
    }

    if (!colDefs.length) return { ok: false, error: 'Provide valid column names' };
    const sql = `CREATE TABLE ${qTable} (\n  ${colDefs.join(',\n  ')}\n);`;
    try {
      db.exec(sql);
      return { ok: true, table: qTable.slice(1, -1), sql };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  alterStructure(dbName, tableName, action, payload = {}) {
    const db = this.getDb(dbName);
    const qTbl = quoteIdent(tableName);
    try {
      if (action === 'addColumn') {
        const qCol = safeNewIdent(payload.name);
        const type = String(payload.type || 'TEXT').toUpperCase();
        let def = `${qCol} ${type}`;
        if (payload.notnull) {
          const fallback = payload.defaultVal !== undefined && String(payload.defaultVal) !== '' ? payload.defaultVal : /INT|REAL|DEC|NUM/i.test(type) ? 0 : '';
          def += ` NOT NULL DEFAULT ${sqlLiteral(fallback)}`;
        } else if (payload.defaultVal !== undefined && String(payload.defaultVal).trim() !== '') {
          const dv = String(payload.defaultVal).trim();
          const isRaw = /^(-?\d+(\.\d+)?|CURRENT_TIMESTAMP|NULL)$/i.test(dv);
          def += ` DEFAULT ${isRaw ? dv : sqlLiteral(dv)}`;
        }
        db.exec(`ALTER TABLE ${qTbl} ADD COLUMN ${def};`);
        return { ok: true };
      }
      if (action === 'dropColumn') {
        db.exec(`ALTER TABLE ${qTbl} DROP COLUMN ${quoteIdent(payload.column)};`);
        return { ok: true };
      }
      if (action === 'createIndex') {
        const idxName = safeNewIdent(payload.name || `idx_${tableName}_${(payload.columns || [])[0] || 'col'}`);
        const cols = (payload.columns || []).map(quoteIdent).join(', ');
        if (!cols) return { ok: false, error: 'Select at least one column for the index' };
        const uniq = payload.unique ? 'UNIQUE ' : '';
        db.exec(`CREATE ${uniq}INDEX ${idxName} ON ${qTbl} (${cols});`);
        return { ok: true };
      }
      if (action === 'dropIndex') {
        db.exec(`DROP INDEX ${quoteIdent(payload.indexName)};`);
        return { ok: true };
      }
      return { ok: false, error: 'Unknown structure action' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  tableOperation(dbName, tableName, op, payload = {}) {
    const db = this.getDb(dbName);
    const qTbl = quoteIdent(tableName);
    try {
      if (op === 'rename') {
        const nextName = safeNewIdent(payload.newName);
        db.exec(`ALTER TABLE ${qTbl} RENAME TO ${nextName};`);
        return { ok: true, table: nextName.slice(1, -1) };
      }
      if (op === 'copy') {
        const nextName = safeNewIdent(payload.newName || `${tableName}_copy`);
        const withData = payload.withData !== false;
        db.exec(`CREATE TABLE ${nextName} AS SELECT * FROM ${qTbl}${withData ? '' : ' WHERE 1=0'};`);
        return { ok: true, table: nextName.slice(1, -1) };
      }
      if (op === 'truncate') {
        const info = db.prepare(`DELETE FROM ${qTbl}`).run();
        try { db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(tableName); } catch {}
        return { ok: true, changes: Number(info.changes || 0) };
      }
      if (op === 'drop') {
        const schema = this.getSchema(dbName);
        const isView = schema.views.some((v) => v.name === tableName);
        db.exec(`DROP ${isView ? 'VIEW' : 'TABLE'} IF EXISTS ${qTbl};`);
        return { ok: true };
      }
      if (op === 'optimize') {
        db.exec('ANALYZE;');
        db.exec('VACUUM;');
        return { ok: true };
      }
      return { ok: false, error: 'Unknown operation' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  exportSqlDump(dbName, singleTable = null) {
    const db = this.getDb(dbName);
    const schema = this.getSchema(dbName);
    const lines = [
      `-- EKONI SQL Studio SQL Dump`,
      `-- Database: ${schema.db}`,
      `-- Generated: ${new Date().toISOString()}`,
      `PRAGMA foreign_keys = OFF;`,
      `BEGIN TRANSACTION;`,
      '',
    ];

    const tables = singleTable ? schema.tables.filter((t) => t.name === singleTable) : schema.tables;
    for (const t of tables) {
      lines.push(`-- Table structure for \`${t.name}\``);
      lines.push(`DROP TABLE IF EXISTS ${quoteIdent(t.name)};`);
      if (t.sql) lines.push(`${t.sql};`);
      const rows = db.prepare(`SELECT * FROM ${quoteIdent(t.name)}`).all();
      if (rows.length) {
        const cols = t.columns.map((c) => c.name);
        const colList = cols.map(quoteIdent).join(', ');
        lines.push(`-- Dumping ${rows.length} rows for \`${t.name}\``);
        for (const r of rows) {
          const vals = cols.map((c) => sqlLiteral(r[c])).join(', ');
          lines.push(`INSERT INTO ${quoteIdent(t.name)} (${colList}) VALUES (${vals});`);
        }
      }
      lines.push('');
    }

    if (!singleTable) {
      const idxRows = db
        .prepare(`SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL`)
        .all();
      if (idxRows.length) {
        lines.push('-- Indexes');
        idxRows.forEach((r) => lines.push(`${r.sql};`));
        lines.push('');
      }
      for (const v of schema.views) {
        if (v.sql) {
          lines.push(`DROP VIEW IF EXISTS ${quoteIdent(v.name)};`);
          lines.push(`${v.sql};`);
          lines.push('');
        }
      }
    }

    lines.push('COMMIT;');
    lines.push('PRAGMA foreign_keys = ON;');
    return lines.join('\n');
  }

  importData(dbName, tableName, format, rawData) {
    if (format === 'sql') {
      const res = this.executeQuery(dbName, rawData);
      if (!res.ok) return res;
      return {
        ok: true,
        format: 'sql',
        statementsRun: res.results.length,
        db: res.db,
      };
    }

    const db = this.getDb(dbName);
    let headers = [];
    let records = [];

    if (format === 'json') {
      let parsed;
      try { parsed = JSON.parse(rawData); } catch (err) { return { ok: false, error: `Invalid JSON: ${err.message}` }; }
      if (!Array.isArray(parsed) || parsed.length === 0 || typeof parsed[0] !== 'object') {
        return { ok: false, error: 'JSON must be a non-empty array of objects.' };
      }
      const keySet = new Set();
      parsed.forEach((obj) => Object.keys(obj || {}).forEach((k) => keySet.add(k)));
      headers = Array.from(keySet);
      records = parsed.map((obj) =>
        headers.map((h) => (obj[h] === undefined ? null : typeof obj[h] === 'object' && obj[h] !== null ? JSON.stringify(obj[h]) : obj[h]))
      );
    } else {
      const rows = parseCsv(rawData);
      if (rows.length < 2) return { ok: false, error: 'CSV must contain a header row and at least one data row.' };
      headers = rows[0].map((h, idx) => h.trim() || `col_${idx + 1}`);
      records = rows.slice(1).map((r) => headers.map((_, idx) => (r[idx] !== undefined && r[idx] !== '' ? r[idx] : null)));
    }

    const colTypes = headers.map((_, idx) => inferSqliteType(records.slice(0, 200).map((r) => r[idx])));
    const qTable = safeNewIdent(tableName);
    const colDefs = headers.map((h, idx) => `${safeNewIdent(h)} ${colTypes[idx]}`).join(', ');
    const placeholders = headers.map(() => '?').join(', ');

    try {
      db.exec('BEGIN TRANSACTION');
      db.exec(`DROP TABLE IF EXISTS ${qTable}`);
      db.exec(`CREATE TABLE ${qTable} (${colDefs})`);
      const insertStmt = db.prepare(`INSERT INTO ${qTable} VALUES (${placeholders})`);
      for (const rec of records) {
        const coerced = rec.map((val, idx) => {
          if (val === null || val === undefined || val === '') return null;
          if (colTypes[idx] === 'INTEGER') return parseInt(val, 10);
          if (colTypes[idx] === 'REAL') return parseFloat(val);
          return String(val);
        });
        insertStmt.run(...coerced);
      }
      db.exec('COMMIT');
      return {
        ok: true,
        table: qTable.slice(1, -1),
        rowCount: records.length,
        columns: headers.map((h, i) => ({ name: h, type: colTypes[i] })),
      };
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch {}
      return { ok: false, error: err.message };
    }
  }

  closeAll() {
    for (const db of this.connections.values()) {
      try { db.close(); } catch {}
    }
    this.connections.clear();
  }
}

module.exports = { SqlEngine, splitSqlStatements, parseCsv };

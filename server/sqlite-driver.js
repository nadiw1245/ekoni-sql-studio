'use strict';

const fs = require('fs');
const path = require('path');

let nativeDatabaseSync = null;
try {
  const mod = require('node:sqlite');
  if (mod && typeof mod.DatabaseSync === 'function') {
    nativeDatabaseSync = mod.DatabaseSync;
  }
} catch {
  nativeDatabaseSync = null;
}

let sqlJsPromise = null;
let sqlJsModule = null;

function initSqlJsSingleton() {
  if (sqlJsModule) return Promise.resolve(sqlJsModule);
  if (!sqlJsPromise) {
    sqlJsPromise = (async () => {
      const initSqlJs = require('sql.js');
      const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
      const wasmBinary = fs.readFileSync(wasmPath);
      sqlJsModule = await initSqlJs({ wasmBinary });
      return sqlJsModule;
    })();
  }
  return sqlJsPromise;
}

function normalizeBindParams(params) {
  return params.map((v) => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'bigint') return Number(v);
    return v;
  });
}

class WasmStatementSync {
  constructor(wrapper, sql) {
    this.wrapper = wrapper;
    this.sql = sql;
  }

  columns() {
    const stmt = this.wrapper.db.prepare(this.sql);
    try {
      const names = stmt.getColumnNames();
      return names.map((name) => ({ name, type: '', table: '' }));
    } finally {
      stmt.free();
    }
  }

  *iterate(...params) {
    const stmt = this.wrapper.db.prepare(this.sql);
    try {
      if (params.length) stmt.bind(normalizeBindParams(params));
      while (stmt.step()) {
        yield stmt.getAsObject();
      }
    } finally {
      stmt.free();
    }
  }

  all(...params) {
    const stmt = this.wrapper.db.prepare(this.sql);
    try {
      if (params.length) stmt.bind(normalizeBindParams(params));
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  get(...params) {
    const stmt = this.wrapper.db.prepare(this.sql);
    try {
      if (params.length) stmt.bind(normalizeBindParams(params));
      return stmt.step() ? stmt.getAsObject() : undefined;
    } finally {
      stmt.free();
    }
  }

  run(...params) {
    const stmt = this.wrapper.db.prepare(this.sql);
    try {
      if (params.length) stmt.bind(normalizeBindParams(params));
      stmt.step();
    } finally {
      stmt.free();
    }
    const changes = this.wrapper.db.getRowsModified();
    let lastInsertRowid = 0;
    try {
      const r = this.wrapper.db.exec('SELECT last_insert_rowid()');
      if (r && r[0] && r[0].values && r[0].values[0]) {
        lastInsertRowid = Number(r[0].values[0][0] || 0);
      }
    } catch {}
    this.wrapper._persist();
    return { changes, lastInsertRowid };
  }
}

class WasmDatabaseSync {
  constructor(SQL, location) {
    this.location = location;
    let initialData = null;
    if (location && location !== ':memory:') {
      try {
        if (fs.existsSync(location)) {
          initialData = fs.readFileSync(location);
        }
      } catch {}
    }
    this.db = initialData ? new SQL.Database(initialData) : new SQL.Database();
  }

  _persist() {
    if (!this.location || this.location === ':memory:') return;
    try {
      fs.mkdirSync(path.dirname(this.location), { recursive: true });
      fs.writeFileSync(this.location, Buffer.from(this.db.export()));
    } catch {
      // Safe no-op if underlying disk is read-only; stays live in memory
    }
  }

  exec(sql) {
    this.db.exec(sql);
    if (!/^\s*(?:SELECT|PRAGMA\s+[A-Za-z0-9_]+\s*;?\s*$)/i.test(String(sql || ''))) {
      this._persist();
    }
  }

  prepare(sql) {
    return new WasmStatementSync(this, sql);
  }

  function(name, optsOrFn, maybeFn) {
    const isVarargs = typeof optsOrFn === 'object' && optsOrFn && optsOrFn.varargs;
    const fn = typeof optsOrFn === 'function' ? optsOrFn : maybeFn;
    if (typeof fn !== 'function') return;

    const safeCall = (...args) => {
      const res = fn(...args);
      return res === undefined ? null : res;
    };

    if (!isVarargs) {
      // Preserve exact declared arity so sql.js registers matching nArg
      const wrappers = [
        () => safeCall(),
        (a) => safeCall(a),
        (a, b) => safeCall(a, b),
        (a, b, c) => safeCall(a, b, c),
        (a, b, c, d) => safeCall(a, b, c, d),
        (a, b, c, d, e) => safeCall(a, b, c, d, e),
      ];
      const arity = Math.min(fn.length, wrappers.length - 1);
      this.db.create_function(name, wrappers[arity]);
      return;
    }

    // Register overloaded arities 0..8 for vararg functions (CONCAT, DISTANCE, GREATEST, etc.)
    const varWrappers = [
      () => safeCall(),
      (a) => safeCall(a),
      (a, b) => safeCall(a, b),
      (a, b, c) => safeCall(a, b, c),
      (a, b, c, d) => safeCall(a, b, c, d),
      (a, b, c, d, e) => safeCall(a, b, c, d, e),
      (a, b, c, d, e, f) => safeCall(a, b, c, d, e, f),
      (a, b, c, d, e, f, g) => safeCall(a, b, c, d, e, f, g),
      (a, b, c, d, e, f, g, h) => safeCall(a, b, c, d, e, f, g, h),
    ];
    for (const w of varWrappers) {
      try { this.db.create_function(name, w); } catch {}
    }
  }

  close() {
    this._persist();
    try { this.db.close(); } catch {}
  }
}

function hasNativeSqlite() {
  return Boolean(nativeDatabaseSync);
}

async function ensureDriverReady(forceWasm = false) {
  if (!forceWasm && nativeDatabaseSync) {
    return 'node:sqlite';
  }
  await initSqlJsSingleton();
  return 'sql.js-wasm';
}

function openDatabase(location, forceWasm = false) {
  if (!forceWasm && nativeDatabaseSync) {
    return new nativeDatabaseSync(location);
  }
  if (!sqlJsModule) {
    throw new Error('SQLite WASM driver not initialized yet. Call await ensureDriverReady() first.');
  }
  return new WasmDatabaseSync(sqlJsModule, location);
}

module.exports = {
  hasNativeSqlite,
  ensureDriverReady,
  openDatabase,
};

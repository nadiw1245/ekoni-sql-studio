'use strict';

const crypto = require('crypto');

/**
 * Register 30+ MySQL / MariaDB / PostgreSQL compatible SQL functions onto a node:sqlite DatabaseSync connection
 * so phpMyAdmin & standard SQL tutorials run natively with zero "no such function" errors.
 */
function registerCompatFunctions(db, getDbName) {
  const safeReg = (name, opts, fn) => {
    try {
      if (typeof opts === 'function') {
        db.function(name, opts);
      } else {
        db.function(name, opts, fn);
      }
    } catch {
      // Ignore if function already exists or reserved
    }
  };

  const nowStr = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  // Date & Time functions
  safeReg('NOW', () => nowStr());
  safeReg('SYSDATE', () => nowStr());
  safeReg('CURDATE', () => nowStr().slice(0, 10));
  safeReg('CURTIME', () => nowStr().slice(11));
  safeReg('YEAR', (d) => (d ? Number(String(d).slice(0, 4)) || null : null));
  safeReg('MONTH', (d) => (d ? Number(String(d).slice(5, 7)) || null : null));
  safeReg('DAY', (d) => (d ? Number(String(d).slice(8, 10)) || null : null));
  safeReg('DAYOFMONTH', (d) => (d ? Number(String(d).slice(8, 10)) || null : null));
  safeReg('HOUR', (d) => (d && String(d).length >= 13 ? Number(String(d).slice(11, 13)) : 0));
  safeReg('MINUTE', (d) => (d && String(d).length >= 16 ? Number(String(d).slice(14, 16)) : 0));
  safeReg('SECOND', (d) => (d && String(d).length >= 19 ? Number(String(d).slice(17, 19)) : 0));
  safeReg('DATEDIFF', (a, b) => {
    if (!a || !b) return null;
    const da = new Date(String(a).replace(' ', 'T'));
    const db2 = new Date(String(b).replace(' ', 'T'));
    if (Number.isNaN(da.getTime()) || Number.isNaN(db2.getTime())) return null;
    return Math.round((da.getTime() - db2.getTime()) / 86400000);
  });
  safeReg('DATE_FORMAT', (d, fmt) => {
    if (!d || !fmt) return null;
    const dt = new Date(String(d).replace(' ', 'T'));
    if (Number.isNaN(dt.getTime())) return String(d);
    const p = (n) => String(n).padStart(2, '0');
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const shortM = months.map((m) => m.slice(0, 3));
    return String(fmt)
      .replace(/%Y/g, String(dt.getFullYear()))
      .replace(/%y/g, String(dt.getFullYear()).slice(-2))
      .replace(/%m/g, p(dt.getMonth() + 1))
      .replace(/%M/g, months[dt.getMonth()])
      .replace(/%b/g, shortM[dt.getMonth()])
      .replace(/%d/g, p(dt.getDate()))
      .replace(/%H/g, p(dt.getHours()))
      .replace(/%i/g, p(dt.getMinutes()))
      .replace(/%s/g, p(dt.getSeconds()));
  });
  safeReg('UNIX_TIMESTAMP', { varargs: true }, (d) => {
    const dt = d ? new Date(String(d).replace(' ', 'T')) : new Date();
    return Number.isNaN(dt.getTime()) ? null : Math.floor(dt.getTime() / 1000);
  });
  safeReg('FROM_UNIXTIME', (ts) => {
    if (ts === null || ts === undefined) return null;
    const d = new Date(Number(ts) * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  });

  // String functions
  safeReg('CONCAT', { varargs: true }, (...args) => {
    if (args.some((a) => a === null || a === undefined)) return null;
    return args.map((a) => String(a)).join('');
  });
  safeReg('CONCAT_WS', { varargs: true }, (sep, ...args) => {
    if (sep === null || sep === undefined) return null;
    return args.filter((a) => a !== null && a !== undefined).map(String).join(String(sep));
  });
  safeReg('LEFT', (s, n) => (s === null || s === undefined ? null : String(s).slice(0, Math.max(0, Number(n) || 0))));
  safeReg('RIGHT', (s, n) => {
    if (s === null || s === undefined) return null;
    const len = Math.max(0, Number(n) || 0);
    return len === 0 ? '' : String(s).slice(-len);
  });
  safeReg('MID', (s, pos, len) => {
    if (s === null || s === undefined) return null;
    const start = Math.max(0, (Number(pos) || 1) - 1);
    return len === undefined ? String(s).slice(start) : String(s).slice(start, start + Number(len));
  });
  safeReg('REVERSE', (s) => (s === null || s === undefined ? null : [...String(s)].reverse().join('')));
  safeReg('REPEAT', (s, n) => (s === null || s === undefined ? null : String(s).repeat(Math.max(0, Math.min(1000, Number(n) || 0)))));
  safeReg('LPAD', (s, len, pad) => (s === null ? null : String(s).padStart(Number(len) || 0, String(pad ?? ' '))));
  safeReg('RPAD', (s, len, pad) => (s === null ? null : String(s).padEnd(Number(len) || 0, String(pad ?? ' '))));
  safeReg('LOCATE', (sub, s) => (sub === null || s === null ? null : String(s).indexOf(String(sub)) + 1));
  safeReg('CHAR_LENGTH', (s) => (s === null || s === undefined ? null : [...String(s)].length));
  safeReg('CHARACTER_LENGTH', (s) => (s === null || s === undefined ? null : [...String(s)].length));
  safeReg('SPACE', (n) => ' '.repeat(Math.max(0, Math.min(1000, Number(n) || 0))));
  safeReg('REGEXP', (pat, str) => {
    if (pat === null || str === null) return 0;
    try { return new RegExp(String(pat), 'i').test(String(str)) ? 1 : 0; } catch { return 0; }
  });

  // Conditional & Math functions
  safeReg('IF', (cond, a, b) => (cond ? a : b));
  safeReg('ISNULL', (x) => (x === null || x === undefined ? 1 : 0));
  safeReg('POW', (x, y) => (x === null || y === null ? null : Math.pow(Number(x), Number(y))));
  safeReg('POWER', (x, y) => (x === null || y === null ? null : Math.pow(Number(x), Number(y))));
  safeReg('SQRT', (x) => (x === null || Number(x) < 0 ? null : Math.sqrt(Number(x))));
  safeReg('CEIL', (x) => (x === null ? null : Math.ceil(Number(x))));
  safeReg('CEILING', (x) => (x === null ? null : Math.ceil(Number(x))));
  safeReg('FLOOR', (x) => (x === null ? null : Math.floor(Number(x))));
  safeReg('MOD', (a, b) => (a === null || b === null || Number(b) === 0 ? null : Number(a) % Number(b)));
  safeReg('TRUNCATE', (x, d) => {
    if (x === null) return null;
    const factor = Math.pow(10, Number(d) || 0);
    return Math.trunc(Number(x) * factor) / factor;
  });
  safeReg('RAND', { varargs: true }, () => Math.random());
  safeReg('PI', () => Math.PI);
  safeReg('LOG10', (x) => (x === null || Number(x) <= 0 ? null : Math.log10(Number(x))));
  safeReg('EXP', (x) => (x === null ? null : Math.exp(Number(x))));
  safeReg('SIGN', (x) => (x === null ? null : Math.sign(Number(x))));
  safeReg('GREATEST', { varargs: true }, (...args) => {
    const nums = args.filter((v) => v !== null && v !== undefined);
    if (!nums.length) return null;
    return nums.reduce((a, b) => (a > b ? a : b));
  });
  safeReg('LEAST', { varargs: true }, (...args) => {
    const nums = args.filter((v) => v !== null && v !== undefined);
    if (!nums.length) return null;
    return nums.reduce((a, b) => (a < b ? a : b));
  });

  // Crypto, MySQL 9.7 LTS Vector AI & System functions
  safeReg('MD5', (s) => (s === null || s === undefined ? null : crypto.createHash('md5').update(String(s)).digest('hex')));
  safeReg('SHA1', (s) => (s === null || s === undefined ? null : crypto.createHash('sha1').update(String(s)).digest('hex')));
  safeReg('SHA2', (s, bits) => {
    if (s === null || s === undefined) return null;
    const algo = Number(bits) === 512 ? 'sha512' : Number(bits) === 384 ? 'sha384' : 'sha256';
    return crypto.createHash(algo).update(String(s)).digest('hex');
  });
  safeReg('UUID', () => crypto.randomUUID());
  safeReg('VERSION', () => '9.7.4-LTS-EkoniSQL (MySQL 9.7 Compat · SQLite 3)');
  safeReg('DATABASE', () => (typeof getDbName === 'function' ? getDbName() : 'ecommerce.db'));
  safeReg('USER', () => 'root@localhost');
  safeReg('CURRENT_USER', () => 'root@localhost');

  // MySQL 9.x Native VECTOR AI functions (STRING_TO_VECTOR, VECTOR_TO_STRING, VECTOR_DIM, DISTANCE)
  const parseVec = (v) => {
    if (v === null || v === undefined) return null;
    try {
      const arr = typeof v === 'string' ? JSON.parse(v) : v;
      return Array.isArray(arr) ? arr.map(Number) : null;
    } catch { return null; }
  };
  safeReg('STRING_TO_VECTOR', (s) => {
    const arr = parseVec(s);
    return arr ? JSON.stringify(arr) : null;
  });
  safeReg('VECTOR_TO_STRING', (v) => {
    const arr = parseVec(v);
    return arr ? `[${arr.join(', ')}]` : null;
  });
  safeReg('VECTOR_DIM', (v) => {
    const arr = parseVec(v);
    return arr ? arr.length : null;
  });
  safeReg('DISTANCE', { varargs: true }, (v1, v2, metric) => {
    const a = parseVec(v1);
    const b = parseVec(v2);
    if (!a || !b || a.length !== b.length || !a.length) return null;
    const m = String(metric || 'COSINE').toUpperCase();
    if (m === 'EUCLIDEAN') {
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
      return Number(Math.sqrt(sum).toFixed(6));
    }
    if (m === 'DOT') {
      let dot = 0;
      for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
      return Number(dot.toFixed(6));
    }
    // COSINE distance = 1 - cosine_similarity
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 1 : Number((1 - dot / denom).toFixed(6));
  });
}

/**
 * Strip leading comments from a SQL statement to inspect the leading keyword cleanly.
 */
function stripLeadingComments(sql) {
  let s = String(sql || '').trim();
  while (true) {
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n');
      s = nl === -1 ? '' : s.slice(nl + 1).trim();
    } else if (s.startsWith('/*')) {
      const end = s.indexOf('*/');
      s = end === -1 ? '' : s.slice(end + 2).trim();
    } else {
      break;
    }
  }
  return s;
}

/**
 * Safely mask string literals and comments so DDL/DML regex rewrites never alter user data strings.
 */
function rewriteOutsideStrings(sql, transformFn) {
  const tokens = [];
  const masked = String(sql).replace(/(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*')/g, (m) => {
    const idx = tokens.length;
    tokens.push(m);
    return `__STR_MASK_${idx}__`;
  });
  const transformed = transformFn(masked);
  return transformed.replace(/__STR_MASK_(\d+)__/g, (_, i) => tokens[Number(i)]);
}

/**
 * Transpile MySQL / MariaDB / PostgreSQL syntax nuances into clean SQLite-executable SQL.
 */
function transpileSql(rawSql) {
  const clean = stripLeadingComments(rawSql);

  // Silent no-op MySQL dump directives so phpMyAdmin .sql dumps import cleanly with zero errors
  if (/^(SET\s+(NAMES|SQL_MODE|TIME_ZONE|FOREIGN_KEY_CHECKS|UNIQUE_CHECKS|AUTOCOMMIT|CHARACTER_SET_CLIENT|CHARACTER_SET_RESULTS|COLLATION_CONNECTION|@)|LOCK\s+TABLES|UNLOCK\s+TABLES|START\s+TRANSACTION)/i.test(clean)) {
    if (/^START\s+TRANSACTION\b/i.test(clean)) return { sql: 'BEGIN TRANSACTION', noop: false };
    if (/^SET\s+FOREIGN_KEY_CHECKS\s*=\s*([01])/i.test(clean)) {
      const val = clean.match(/([01])/)[1];
      return { sql: `PRAGMA foreign_keys = ${val === '1' ? 'ON' : 'OFF'}`, noop: false };
    }
    return { sql: clean, noop: true, noopMessage: `Directive accepted (${clean.slice(0, 48)})` };
  }

  // RENAME TABLE a TO b
  const renameMatch = clean.match(/^RENAME\s+TABLE\s+[`"]?([A-Za-z0-9_]+)[`"]?\s+TO\s+[`"]?([A-Za-z0-9_]+)[`"]?$/i);
  if (renameMatch) {
    return { sql: `ALTER TABLE "${renameMatch[1]}" RENAME TO "${renameMatch[2]}"`, noop: false };
  }

  const rewritten = rewriteOutsideStrings(rawSql, (s) => {
    let out = s;

    // Postgres SERIAL / BIGSERIAL -> INTEGER PRIMARY KEY AUTOINCREMENT
    out = out.replace(/\b(?:BIG|SMALL)?SERIAL\s+PRIMARY\s+KEY\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
    out = out.replace(/\b(?:BIG|SMALL)?SERIAL\b/gi, 'INTEGER');

    // MySQL INT(11) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY -> INTEGER PRIMARY KEY AUTOINCREMENT
    out = out.replace(
      /\b(?:TINY|SMALL|MEDIUM|BIG)?INT(?:EGER)?(?:\s*\(\d+\))?(?:\s+UNSIGNED)?(?:\s+NOT\s+NULL)?\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi,
      'INTEGER PRIMARY KEY AUTOINCREMENT'
    );
    out = out.replace(
      /\b(?:TINY|SMALL|MEDIUM|BIG)?INT(?:EGER)?(?:\s*\(\d+\))?(?:\s+UNSIGNED)?(?:\s+NOT\s+NULL)?\s+PRIMARY\s+KEY\s+AUTO_INCREMENT\b/gi,
      'INTEGER PRIMARY KEY AUTOINCREMENT'
    );
    // MySQL column has AUTO_INCREMENT while PRIMARY KEY(id) is declared at bottom of CREATE TABLE
    if (/\bAUTO_INCREMENT\b/i.test(out) && /\bCREATE\s+TABLE\b/i.test(out)) {
      const pkBottom = out.match(/,\s*PRIMARY\s+KEY\s*\(\s*[`"]?([A-Za-z0-9_]+)[`"]?\s*\)/i);
      if (pkBottom) {
        const pkCol = pkBottom[1];
        const colRe = new RegExp(`([\`"]?${pkCol}[\`"]?\\s+)(?:TINY|SMALL|MEDIUM|BIG)?INT(?:EGER)?(?:\\s*\\(\\d+\\))?(?:\\s+UNSIGNED)?(?:\\s+NOT\\s+NULL)?\\s+AUTO_INCREMENT`, 'i');
        if (colRe.test(out)) {
          out = out.replace(colRe, '$1INTEGER PRIMARY KEY AUTOINCREMENT');
          out = out.replace(pkBottom[0], '');
        }
      }
      out = out.replace(/\bAUTO_INCREMENT\b/gi, '');
    }

    // MySQL 9 VECTOR(N) & ENUM('a','b') -> TEXT
    out = out.replace(/\bVECTOR\s*\(\s*\d+\s*\)/gi, 'TEXT');
    out = out.replace(/\bENUM\s*\([^)]*\)/gi, 'TEXT');

    // Strip MySQL column/table clauses SQLite doesn't accept
    out = out.replace(/\bUNSIGNED\b/gi, '');
    out = out.replace(/\bZEROFILL\b/gi, '');
    out = out.replace(/\bON\s+UPDATE\s+CURRENT_TIMESTAMP(?:\(\))?\b/gi, '');
    out = out.replace(/\bDEFAULT\s+NOW\s*\(\s*\)/gi, 'DEFAULT CURRENT_TIMESTAMP');
    out = out.replace(/\bDEFAULT\s+CURRENT_TIMESTAMP\s*\(\s*\)/gi, 'DEFAULT CURRENT_TIMESTAMP');
    out = out.replace(/\bCHARACTER\s+SET\s+[A-Za-z0-9_]+/gi, '');
    out = out.replace(/\bCOLLATE\s+[A-Za-z0-9_]+/gi, '');
    out = out.replace(/\bCOMMENT\s*=?\s*__STR_MASK_\d+__/gi, '');

    // Strip MySQL CREATE TABLE trailing options: ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 AUTO_INCREMENT=10
    if (/^\s*CREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\b/i.test(out)) {
      out = out.replace(/\bENGINE\s*=\s*[A-Za-z0-9_]+/gi, '');
      out = out.replace(/\bDEFAULT\s+CHARSET\s*=\s*[A-Za-z0-9_]+/gi, '');
      out = out.replace(/\bCHARSET\s*=\s*[A-Za-z0-9_]+/gi, '');
      out = out.replace(/\bAUTO_INCREMENT\s*=\s*\d+/gi, '');
      out = out.replace(/\bROW_FORMAT\s*=\s*[A-Za-z0-9_]+/gi, '');
      // Strip MySQL inline KEY / INDEX definitions inside CREATE TABLE(...)
      out = out.replace(/,\s*(?:KEY|INDEX)\s+[`"]?[A-Za-z0-9_]+[`"]?\s*\([^)]+\)/gi, '');
    }

    // INSERT IGNORE -> INSERT OR IGNORE
    out = out.replace(/\bINSERT\s+IGNORE\s+INTO\b/gi, 'INSERT OR IGNORE INTO');

    // PostgreSQL ILIKE -> LIKE (SQLite LIKE is case-insensitive for ASCII)
    out = out.replace(/\bILIKE\b/gi, 'LIKE');

    // Cleanup leftover double commas before ')'
    out = out.replace(/,\s*\)/g, ')');

    return out.trim();
  });

  return { sql: rewritten, noop: false };
}

/**
 * Check if a statement is a phpMyAdmin / MySQL / Postgres meta-command (SHOW DATABASES, SHOW TABLES,
 * USE db, DESCRIBE tbl, SHOW COLUMNS, SHOW CREATE TABLE, SHOW INDEX, CREATE/DROP DATABASE, TRUNCATE)
 * and execute it directly against SqlEngine!
 * Returns null if it's a normal SQL statement.
 */
function tryHandleMetaCommand(rawStmt, dbName, engine) {
  const clean = stripLeadingComments(rawStmt);
  const t0 = process.hrtime.bigint();
  const elapsed = () => Number((Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2));

  // 1. SHOW DATABASES / SHOW SCHEMAS
  if (/^SHOW\s+(?:DATABASES|SCHEMAS)\b/i.test(clean) || clean === '\\l') {
    const dbs = engine.listDatabases();
    return {
      kind: 'select',
      columns: [
        { name: 'Database', type: 'TEXT', table: '' },
        { name: 'Type', type: 'TEXT', table: '' },
        { name: 'Size_KB', type: 'REAL', table: '' },
      ],
      rows: dbs.map((d) => ({
        Database: d.name,
        Type: d.isMemory ? 'IN-MEMORY' : 'SQLITE3',
        Size_KB: Number((d.size / 1024).toFixed(1)),
      })),
      rowCount: dbs.length,
      truncated: false,
      durationMs: elapsed(),
    };
  }

  // 2. USE <database>
  const useMatch = clean.match(/^USE\s+[`"]?([A-Za-z0-9_.:-]+)[`"]?$/i);
  if (useMatch) {
    const target = engine.resolveDbName(useMatch[1]);
    engine.createDatabase(target);
    return {
      kind: 'mutation',
      changes: 0,
      lastInsertRowid: null,
      switchedDb: target,
      message: `Database changed to "${target}"`,
      schemaChanged: true,
      durationMs: elapsed(),
    };
  }

  // 3. CREATE DATABASE / SCHEMA
  const createDbMatch = clean.match(/^CREATE\s+(?:DATABASE|SCHEMA)\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([A-Za-z0-9_.-]+)[`"]?/i);
  if (createDbMatch) {
    const created = engine.createDatabase(createDbMatch[1]);
    return {
      kind: 'mutation',
      changes: 1,
      lastInsertRowid: null,
      message: `Database "${created.name}" created`,
      databasesChanged: true,
      durationMs: elapsed(),
    };
  }

  // 4. DROP DATABASE / SCHEMA
  const dropDbMatch = clean.match(/^DROP\s+(?:DATABASE|SCHEMA)\s+(?:IF\s+EXISTS\s+)?[`"]?([A-Za-z0-9_.-]+)[`"]?/i);
  if (dropDbMatch) {
    const r = engine.deleteDatabase(dropDbMatch[1]);
    if (!r.ok) throw new Error(r.error);
    return {
      kind: 'mutation',
      changes: 1,
      lastInsertRowid: null,
      message: `Database "${dropDbMatch[1]}" dropped`,
      databasesChanged: true,
      durationMs: elapsed(),
    };
  }

  // 5. SHOW [FULL] TABLES [LIKE 'pattern'] / \dt
  const showTablesMatch = clean.match(/^SHOW\s+(?:FULL\s+)?TABLES(?:\s+LIKE\s+'([^']+)')?$/i);
  if (showTablesMatch || clean === '\\dt') {
    const schema = engine.getSchema(dbName);
    const likePat = showTablesMatch && showTablesMatch[1]
      ? new RegExp('^' + showTablesMatch[1].replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i')
      : null;
    const all = [
      ...schema.tables.map((t) => ({ Name: t.name, Table_type: 'BASE TABLE', Rows: t.rowCount, Columns: t.columns.length })),
      ...schema.views.map((v) => ({ Name: v.name, Table_type: 'VIEW', Rows: v.rowCount, Columns: v.columns.length })),
    ].filter((r) => !likePat || likePat.test(r.Name));
    return {
      kind: 'select',
      columns: [
        { name: `Tables_in_${schema.db}`, type: 'TEXT', table: '' },
        { name: 'Table_type', type: 'TEXT', table: '' },
        { name: 'Rows', type: 'INTEGER', table: '' },
        { name: 'Columns', type: 'INTEGER', table: '' },
      ],
      rows: all.map((r) => ({
        [`Tables_in_${schema.db}`]: r.Name,
        Table_type: r.Table_type,
        Rows: r.Rows,
        Columns: r.Columns,
      })),
      rowCount: all.length,
      truncated: false,
      durationMs: elapsed(),
    };
  }

  // 6. DESCRIBE / DESC / SHOW [FULL] COLUMNS FROM <table> / \d <table>
  const descMatch =
    clean.match(/^(?:DESCRIBE|DESC)\s+[`"]?([A-Za-z0-9_]+)[`"]?$/i) ||
    clean.match(/^SHOW\s+(?:FULL\s+)?(?:COLUMNS|FIELDS)\s+(?:FROM|IN)\s+[`"]?([A-Za-z0-9_]+)[`"]?$/i) ||
    clean.match(/^\\d\+?\s+([A-Za-z0-9_]+)$/);
  if (descMatch) {
    const tblName = descMatch[1];
    const schema = engine.getSchema(dbName);
    const obj = [...schema.tables, ...schema.views].find((t) => t.name.toLowerCase() === tblName.toLowerCase());
    if (!obj) throw new Error(`Table '${tblName}' doesn't exist in '${dbName}'`);
    const rows = obj.columns.map((c) => ({
      Field: c.name,
      Type: c.type || 'ANY',
      Null: c.notnull ? 'NO' : 'YES',
      Key: c.pk ? 'PRI' : c.fk ? 'MUL' : '',
      Default: c.dflt,
      Extra: c.pk && /INT/i.test(c.type || '') ? 'auto_increment' : '',
    }));
    return {
      kind: 'select',
      columns: [
        { name: 'Field', type: 'TEXT', table: '' },
        { name: 'Type', type: 'TEXT', table: '' },
        { name: 'Null', type: 'TEXT', table: '' },
        { name: 'Key', type: 'TEXT', table: '' },
        { name: 'Default', type: 'TEXT', table: '' },
        { name: 'Extra', type: 'TEXT', table: '' },
      ],
      rows,
      rowCount: rows.length,
      truncated: false,
      durationMs: elapsed(),
    };
  }

  // 7. SHOW CREATE TABLE / VIEW <table>
  const showCreateMatch = clean.match(/^SHOW\s+CREATE\s+(?:TABLE|VIEW)\s+[`"]?([A-Za-z0-9_]+)[`"]?$/i);
  if (showCreateMatch) {
    const tblName = showCreateMatch[1];
    const schema = engine.getSchema(dbName);
    const obj = [...schema.tables, ...schema.views].find((t) => t.name.toLowerCase() === tblName.toLowerCase());
    if (!obj) throw new Error(`Table '${tblName}' doesn't exist`);
    return {
      kind: 'select',
      columns: [
        { name: 'Table', type: 'TEXT', table: '' },
        { name: 'Create Table', type: 'TEXT', table: '' },
      ],
      rows: [{ Table: obj.name, 'Create Table': (obj.sql || '') + ';' }],
      rowCount: 1,
      truncated: false,
      durationMs: elapsed(),
    };
  }

  // 8. SHOW INDEX / INDEXES / KEYS FROM <table>
  const showIdxMatch = clean.match(/^SHOW\s+(?:INDEX|INDEXES|KEYS)\s+(?:FROM|IN)\s+[`"]?([A-Za-z0-9_]+)[`"]?$/i);
  if (showIdxMatch) {
    const tblName = showIdxMatch[1];
    const db = engine.getDb(dbName);
    const idxs = db.prepare(`PRAGMA index_list("${tblName.replace(/"/g, '""')}")`).all();
    const rows = [];
    for (const idx of idxs) {
      const info = db.prepare(`PRAGMA index_info("${String(idx.name).replace(/"/g, '""')}")`).all();
      for (const col of info) {
        rows.push({
          Table: tblName,
          Non_unique: idx.unique ? 0 : 1,
          Key_name: idx.name,
          Seq_in_index: col.seqno + 1,
          Column_name: col.name,
        });
      }
    }
    return {
      kind: 'select',
      columns: [
        { name: 'Table', type: 'TEXT', table: '' },
        { name: 'Non_unique', type: 'INTEGER', table: '' },
        { name: 'Key_name', type: 'TEXT', table: '' },
        { name: 'Seq_in_index', type: 'INTEGER', table: '' },
        { name: 'Column_name', type: 'TEXT', table: '' },
      ],
      rows,
      rowCount: rows.length,
      truncated: false,
      durationMs: elapsed(),
    };
  }

  // 9. SHOW TABLE STATUS
  if (/^SHOW\s+TABLE\s+STATUS\b/i.test(clean)) {
    const schema = engine.getSchema(dbName);
    const rows = schema.tables.map((t) => ({
      Name: t.name,
      Engine: 'SQLite3',
      Rows: t.rowCount,
      Columns: t.columns.length,
      Indexes: t.indexes.length,
      Foreign_Keys: t.foreignKeys.length,
    }));
    return {
      kind: 'select',
      columns: Object.keys(rows[0] || { Name: '' }).map((n) => ({ name: n, type: '', table: '' })),
      rows,
      rowCount: rows.length,
      truncated: false,
      durationMs: elapsed(),
    };
  }

  // 10. SHOW VARIABLES / SHOW STATUS
  if (/^SHOW\s+(?:GLOBAL\s+|SESSION\s+)?(?:VARIABLES|STATUS)\b/i.test(clean)) {
    const db = engine.getDb(dbName);
    const ver = db.prepare('SELECT sqlite_version() AS v').get().v;
    const fk = db.prepare('PRAGMA foreign_keys').get().foreign_keys;
    const jm = db.prepare('PRAGMA journal_mode').get().journal_mode;
    const rows = [
      { Variable_name: 'version', Value: `9.7.4-LTS-EkoniSQL (MySQL 9.7 Compat · SQLite ${ver})` },
      { Variable_name: 'compatibility_mode', Value: 'MySQL 9.7 LTS / phpMyAdmin / PostgreSQL / SQLite' },
      { Variable_name: 'active_database', Value: dbName },
      { Variable_name: 'foreign_keys', Value: fk ? 'ON' : 'OFF' },
      { Variable_name: 'journal_mode', Value: jm },
      { Variable_name: 'character_set_server', Value: 'utf8mb4' },
    ];
    return {
      kind: 'select',
      columns: [
        { name: 'Variable_name', type: 'TEXT', table: '' },
        { name: 'Value', type: 'TEXT', table: '' },
      ],
      rows,
      rowCount: rows.length,
      truncated: false,
      durationMs: elapsed(),
    };
  }

  // 11. TRUNCATE [TABLE] <table>
  const truncMatch = clean.match(/^TRUNCATE\s+(?:TABLE\s+)?[`"]?([A-Za-z0-9_]+)[`"]?$/i);
  if (truncMatch) {
    const tbl = truncMatch[1];
    const db = engine.getDb(dbName);
    const qTbl = `"${tbl.replace(/"/g, '""')}"`;
    const info = db.prepare(`DELETE FROM ${qTbl}`).run();
    try {
      db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(tbl);
    } catch {
      // sqlite_sequence only exists when AUTOINCREMENT is used
    }
    return {
      kind: 'mutation',
      changes: Number(info.changes || 0),
      lastInsertRowid: null,
      message: `Truncated table "${tbl}" (${info.changes} rows removed)`,
      schemaChanged: true,
      durationMs: elapsed(),
    };
  }

  return null;
}

module.exports = {
  registerCompatFunctions,
  transpileSql,
  tryHandleMetaCommand,
};

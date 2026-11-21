(function (global) {
  'use strict';

  const SQL_KEYWORDS = new Set([
    'SELECT','FROM','WHERE','JOIN','INNER','LEFT','RIGHT','FULL','OUTER','CROSS','ON','USING',
    'GROUP','BY','HAVING','ORDER','ASC','DESC','NULLS','FIRST','LAST','LIMIT','OFFSET',
    'INSERT','INTO','VALUES','UPDATE','SET','DELETE','REPLACE','UPSERT','RETURNING','IGNORE',
    'CREATE','TABLE','VIEW','INDEX','TRIGGER','DATABASE','SCHEMA','DROP','ALTER','ADD','COLUMN','RENAME','TO',
    'SHOW','DATABASES','SCHEMAS','TABLES','COLUMNS','FIELDS','INDEXES','KEYS','STATUS','VARIABLES','USE','DESCRIBE','TRUNCATE',
    'IF','NOT','EXISTS','PRIMARY','KEY','FOREIGN','REFERENCES','UNIQUE','CHECK','DEFAULT','AUTOINCREMENT','AUTO_INCREMENT',
    'AS','AND','OR','IN','BETWEEN','LIKE','ILIKE','GLOB','REGEXP','IS','NULL','CASE','WHEN','THEN','ELSE','END',
    'DISTINCT','ALL','UNION','INTERSECT','EXCEPT','WITH','RECURSIVE','OVER','PARTITION','ROWS','RANGE',
    'PRECEDING','FOLLOWING','UNBOUNDED','CURRENT','ROW','BEGIN','START','COMMIT','ROLLBACK','TRANSACTION',
    'EXPLAIN','QUERY','PLAN','PRAGMA','CAST','VACUUM','ANALYZE',
    'INTEGER','INT','BIGINT','SMALLINT','TINYINT','VARCHAR','CHAR','REAL','DECIMAL','DOUBLE','FLOAT','TEXT','BLOB','NUMERIC','BOOLEAN','DATE','DATETIME','TIMESTAMP','ENUM','SERIAL',
    'CASCADE','RESTRICT','TEMP','TEMPORARY','WITHOUT','ROWID','TRUE','FALSE','UNSIGNED','ENGINE','CHARSET',
  ]);

  const SQL_FUNCTIONS = new Set([
    'COUNT','SUM','AVG','MIN','MAX','TOTAL','GROUP_CONCAT','ROUND','ABS','COALESCE','IFNULL','NULLIF','IF','ISNULL',
    'LENGTH','CHAR_LENGTH','LOWER','UPPER','SUBSTR','SUBSTRING','MID','LEFT','RIGHT','TRIM','LTRIM','RTRIM','REPLACE','INSTR','LOCATE','PRINTF',
    'CONCAT','CONCAT_WS','REVERSE','REPEAT','LPAD','RPAD','SPACE',
    'DATE','TIME','DATETIME','JULIANDAY','STRFTIME','UNIXEPOCH','NOW','SYSDATE','CURDATE','CURTIME','YEAR','MONTH','DAY','HOUR','MINUTE','SECOND','DATEDIFF','DATE_FORMAT','UNIX_TIMESTAMP','FROM_UNIXTIME',
    'ROW_NUMBER','RANK','DENSE_RANK','NTILE','LAG','LEAD','FIRST_VALUE','LAST_VALUE',
    'POW','POWER','SQRT','CEIL','CEILING','FLOOR','MOD','RAND','PI','LOG10','EXP','SIGN','GREATEST','LEAST',
    'MD5','SHA1','SHA2','UUID','VERSION','DATABASE','USER','CURRENT_USER',
    'JSON','JSON_EXTRACT','JSON_ARRAY','JSON_OBJECT','JSON_TYPE','JSON_EACH','TYPEOF','IIF','RANDOM',
  ]);

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function highlightSql(code, schema) {
    if (!code) return '\u200b';
    const tableNames = new Set();
    if (schema) {
      (schema.tables || []).forEach((t) => tableNames.add(t.name.toLowerCase()));
      (schema.views || []).forEach((v) => tableNames.add(v.name.toLowerCase()));
    }

    let out = '';
    let i = 0;
    const len = code.length;

    while (i < len) {
      const ch = code[i];
      const next = code[i + 1];

      // Line comment --
      if (ch === '-' && next === '-') {
        const start = i;
        while (i < len && code[i] !== '\n') i++;
        out += `<span class="sql-comment">${escapeHtml(code.slice(start, i))}</span>`;
        continue;
      }

      // Block comment /* ... */
      if (ch === '/' && next === '*') {
        const start = i;
        i += 2;
        while (i < len && !(code[i] === '*' && code[i + 1] === '/')) i++;
        if (i < len) i += 2;
        out += `<span class="sql-comment">${escapeHtml(code.slice(start, i))}</span>`;
        continue;
      }

      // Single-quoted string
      if (ch === "'") {
        const start = i++;
        while (i < len) {
          if (code[i] === "'" && code[i + 1] === "'") { i += 2; continue; }
          if (code[i] === "'") { i++; break; }
          i++;
        }
        out += `<span class="sql-str">${escapeHtml(code.slice(start, i))}</span>`;
        continue;
      }

      // Double-quoted identifier
      if (ch === '"') {
        const start = i++;
        while (i < len && code[i] !== '"') i++;
        if (i < len) i++;
        out += `<span class="sql-table">${escapeHtml(code.slice(start, i))}</span>`;
        continue;
      }

      // Numbers
      if (/\d/.test(ch) && (i === 0 || !/[A-Za-z0-9_]/.test(code[i - 1]))) {
        const start = i;
        while (i < len && /[\d.]/.test(code[i])) i++;
        out += `<span class="sql-num">${escapeHtml(code.slice(start, i))}</span>`;
        continue;
      }

      // Identifiers / Keywords / Functions / Tables
      if (/[A-Za-z_]/.test(ch)) {
        const start = i;
        while (i < len && /[A-Za-z0-9_]/.test(code[i])) i++;
        const word = code.slice(start, i);
        const upper = word.toUpperCase();
        const lower = word.toLowerCase();

        // Peek ahead for '(' -> SQL function
        let k = i;
        while (k < len && code[k] === ' ') k++;
        const isCall = code[k] === '(';

        if (isCall && SQL_FUNCTIONS.has(upper)) {
          out += `<span class="sql-fn">${escapeHtml(word)}</span>`;
        } else if (SQL_KEYWORDS.has(upper)) {
          out += `<span class="sql-kw">${escapeHtml(word)}</span>`;
        } else if (tableNames.has(lower)) {
          out += `<span class="sql-table">${escapeHtml(word)}</span>`;
        } else {
          out += escapeHtml(word);
        }
        continue;
      }

      // Operators
      if ('=<>!+-*/%|,.;()'.includes(ch)) {
        out += `<span class="sql-op">${escapeHtml(ch)}</span>`;
        i++;
        continue;
      }

      out += escapeHtml(ch);
      i++;
    }

    if (code.endsWith('\n')) out += '\u200b';
    return out;
  }

  /**
   * Parse table aliases from SQL query: e.g. `FROM orders o JOIN customers AS c`
   * returns Map { 'o' => 'orders', 'c' => 'customers', 'orders' => 'orders', ... }
   */
  function extractTableAliases(sql, schema) {
    const map = new Map();
    const allObjs = [...(schema?.tables || []), ...(schema?.views || [])];
    const known = new Map(allObjs.map((t) => [t.name.toLowerCase(), t]));
    allObjs.forEach((t) => map.set(t.name.toLowerCase(), t));

    const re = /\b(?:FROM|JOIN|UPDATE|INTO)\s+["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?/gi;
    let m;
    while ((m = re.exec(sql)) !== null) {
      const tbl = known.get(m[1].toLowerCase());
      if (tbl && m[2]) {
        const aliasUpper = m[2].toUpperCase();
        if (!SQL_KEYWORDS.has(aliasUpper)) {
          map.set(m[2].toLowerCase(), tbl);
        }
      }
    }
    return map;
  }

  /**
   * Smart context-aware SQL Autocomplete engine.
   */
  function getSqlCompletions(code, cursorPos, schema) {
    const before = code.slice(0, cursorPos);

    // 1. Check dot-qualified completion: `table.col` or `alias.col`
    const dotMatch = before.match(/([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z0-9_]*)$/);
    if (dotMatch && schema) {
      const qualifier = dotMatch[1].toLowerCase();
      const colPrefix = dotMatch[2].toLowerCase();
      const replaceStart = cursorPos - dotMatch[2].length;
      const aliasMap = extractTableAliases(code, schema);
      const tableObj = aliasMap.get(qualifier);
      if (tableObj) {
        const items = (tableObj.columns || [])
          .filter((c) => c.name.toLowerCase().startsWith(colPrefix))
          .map((c) => ({
            insert: c.name,
            label: c.name,
            kind: 'column',
            desc: `${tableObj.name}.${c.name} (${c.type}${c.pk ? ', PK' : ''}${c.fk ? ', FK' : ''})`,
          }));
        return { replaceStart, replaceEnd: cursorPos, items };
      }
    }

    // 2. General word completion
    const wordMatch = before.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
    const frag = wordMatch ? wordMatch[1] : '';
    const lower = frag.toLowerCase();
    const replaceStart = cursorPos - frag.length;
    const items = [];

    // Check if preceded immediately by FROM / JOIN / INTO / UPDATE -> prioritize tables & views!
    const prevClause = before.slice(0, replaceStart).trimEnd();
    const expectTable = /\b(FROM|JOIN|INTO|UPDATE|TABLE|VIEW)$/i.test(prevClause);

    const tables = [...(schema?.tables || []), ...(schema?.views || [])];
    for (const t of tables) {
      if (!lower || t.name.toLowerCase().startsWith(lower)) {
        items.push({
          insert: t.name,
          label: t.name,
          kind: t.type === 'view' ? 'view' : 'table',
          desc: `${t.type} · ${t.rowCount} rows · ${(t.columns || []).length} cols`,
          rank: expectTable ? 0 : 1,
        });
      }
    }

    // Columns from tables referenced in query (or all tables if short query)
    const referenced = extractTableAliases(code, schema);
    const seenCols = new Set();
    const colSources = referenced.size > tables.length ? Array.from(new Set(referenced.values())) : tables;
    for (const t of colSources) {
      for (const c of t.columns || []) {
        const key = `${t.name}.${c.name}`;
        if (seenCols.has(key)) continue;
        if (lower && c.name.toLowerCase().startsWith(lower)) {
          seenCols.add(key);
          items.push({
            insert: c.name,
            label: c.name,
            kind: 'column',
            desc: `${t.name} · ${c.type}${c.pk ? ' · PK' : ''}`,
            rank: 2,
          });
        }
      }
    }

    // SQL Functions
    for (const fn of SQL_FUNCTIONS) {
      if (!lower || fn.toLowerCase().startsWith(lower)) {
        items.push({
          insert: `${fn}()`,
          label: `${fn}()`,
          kind: 'fn',
          desc: 'SQLite built-in function',
          rank: 3,
        });
      }
    }

    // SQL Keywords
    for (const kw of SQL_KEYWORDS) {
      if (!lower || kw.toLowerCase().startsWith(lower)) {
        items.push({
          insert: kw + ' ',
          label: kw,
          kind: 'keyword',
          desc: 'SQL keyword',
          rank: 4,
        });
      }
    }

    items.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.label.localeCompare(b.label)));
    return { replaceStart, replaceEnd: cursorPos, items: items.slice(0, 35) };
  }

  /**
   * Clean built-in SQL auto-formatter (uppercases keywords and indents major clauses).
   */
  function formatSql(sql) {
    if (!sql || !sql.trim()) return sql;
    // Preserve strings and comments while normalizing whitespace & uppercasing keywords
    const placeholders = [];
    let masked = sql.replace(/(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*')/g, (m) => {
      const idx = placeholders.length;
      placeholders.push(m);
      return `__SQL_PH_${idx}__`;
    });

    masked = masked.replace(/\s+/g, ' ').trim();
    masked = masked.replace(/\b([A-Za-z_]+)\b/g, (w) => (SQL_KEYWORDS.has(w.toUpperCase()) || SQL_FUNCTIONS.has(w.toUpperCase()) ? w.toUpperCase() : w));

    const newlineClauses = [
      'SELECT', 'FROM', 'LEFT OUTER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'CROSS JOIN', 'JOIN',
      'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET', 'UNION ALL', 'UNION',
      'VALUES', 'SET', 'RETURNING',
    ];
    for (const cl of newlineClauses) {
      const re = new RegExp(`\\s+(${cl.replace(/ /g, '\\s+')})\\b`, 'g');
      masked = masked.replace(re, `\n${cl}`);
    }

    // Indent AND/OR in WHERE cleanly and separate multi-statements
    masked = masked
      .replace(/\s+(AND|OR)\b/g, '\n  $1')
      .replace(/;\s*/g, ';\n\n')
      .trim();

    return masked.replace(/__SQL_PH_(\d+)__/g, (_, n) => placeholders[Number(n)]);
  }

  global.SqlEditorCore = {
    highlightSql,
    getSqlCompletions,
    formatSql,
    escapeHtml,
  };
})(window);

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_HISTORY = 500;

class QueryHistoryStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.entries = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        if (Array.isArray(parsed)) this.entries = parsed.slice(-MAX_HISTORY);
      }
    } catch {
      this.entries = [];
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.entries.slice(-MAX_HISTORY), null, 2), 'utf8');
    } catch {
      // ignore
    }
  }

  add(entry) {
    const sql = String(entry.sql || '').trim();
    if (!sql) return;
    this.entries.push({
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      sql,
      db: entry.db || 'ecommerce.db',
      ok: Boolean(entry.ok),
      rowCount: Number(entry.rowCount) || 0,
      durationMs: Number(entry.durationMs) || 0,
      error: entry.error || null,
      ts: Date.now(),
    });
    if (this.entries.length > MAX_HISTORY) {
      this.entries = this.entries.slice(-MAX_HISTORY);
    }
    this._save();
  }

  list(query = '', limit = 60) {
    const q = String(query || '').trim().toLowerCase();
    const out = [];
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (!q || e.sql.toLowerCase().includes(q) || (e.db || '').toLowerCase().includes(q)) {
        out.push(e);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  clear() {
    this.entries = [];
    this._save();
  }
}

module.exports = { QueryHistoryStore };

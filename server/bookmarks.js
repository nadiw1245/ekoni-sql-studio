'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_BOOKMARKS = [
  {
    id: 'bm-1',
    title: 'Revenue by Category',
    tag: 'Analytics',
    db: 'ecommerce.db',
    sql: 'SELECT * FROM v_revenue_by_category;',
    ts: Date.now(),
  },
  {
    id: 'bm-2',
    title: 'Show All Tables & Status',
    tag: 'Admin',
    db: 'ecommerce.db',
    sql: 'SHOW TABLE STATUS;',
    ts: Date.now(),
  },
  {
    id: 'bm-3',
    title: 'VIP Enterprise Customers',
    tag: 'CRM',
    db: 'ecommerce.db',
    sql: "SELECT id, CONCAT(full_name, ' (', country, ')') AS customer, email, joined_at FROM customers WHERE tier = 'Enterprise' ORDER BY joined_at;",
    ts: Date.now(),
  },
];

class BookmarkStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.items = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        if (Array.isArray(parsed)) {
          this.items = parsed;
          return;
        }
      }
    } catch {}
    this.items = DEFAULT_BOOKMARKS.slice();
    this._save();
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.items, null, 2), 'utf8');
    } catch {}
  }

  list(q = '') {
    const clean = String(q || '').trim().toLowerCase();
    return this.items
      .filter((b) => !clean || `${b.title} ${b.tag} ${b.sql}`.toLowerCase().includes(clean))
      .slice()
      .reverse();
  }

  add({ title, tag, db, sql }) {
    if (!sql || !String(sql).trim()) return { ok: false, error: 'SQL cannot be empty' };
    const item = {
      id: 'bm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      title: String(title || 'Untitled Query').trim(),
      tag: String(tag || 'General').trim(),
      db: db || 'ecommerce.db',
      sql: String(sql).trim(),
      ts: Date.now(),
    };
    this.items.push(item);
    this._save();
    return { ok: true, item };
  }

  remove(id) {
    const before = this.items.length;
    this.items = this.items.filter((b) => b.id !== id);
    if (this.items.length !== before) this._save();
    return { ok: true };
  }
}

module.exports = { BookmarkStore };

(function () {
  'use strict';

  const { highlightSql, getSqlCompletions, formatSql, escapeHtml } = window.SqlEditorCore;
  const { renderSqlChart, renderErDiagram } = window.SqlVisuals;
  const I = window.SqlIcons;

  const DEFAULT_STARTER_SQL = `-- EKONI SQL Studio · phpMyAdmin Pro Edition
-- Supports MySQL/phpMyAdmin (SHOW TABLES, DESCRIBE, USE, AUTO_INCREMENT, NOW(), CONCAT()) + Full SQLite 3

SELECT
  p.category,
  COUNT(DISTINCT oi.order_id) AS orders,
  SUM(oi.quantity) AS units_sold,
  ROUND(SUM(oi.quantity * oi.unit_price * (1 - o.discount_pct / 100.0)), 2) AS net_revenue,
  ROUND(SUM(oi.quantity * (oi.unit_price * (1 - o.discount_pct / 100.0) - p.unit_cost)), 2) AS gross_profit
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
WHERE o.status != 'cancelled'
GROUP BY p.category
ORDER BY net_revenue DESC;`;

  // Hydrate all declarative SVG icon slots
  function hydrateIcons(root = document) {
    root.querySelectorAll('.ico-slot[data-ico]').forEach((el) => {
      const fn = I[el.dataset.ico];
      if (fn) el.innerHTML = fn(Number(el.dataset.size) || 14);
    });
  }

  class EkoniSqlStudio {
    constructor() {
      this.state = {
        connId: 'builtin',
        connName: 'Built-in (MySQL 9.7)',
        currentDb: 'ecommerce.db',
        databases: [],
        schema: null,
        selectedTable: 'customers',
        expandedTables: new Set(['customers', 'orders', 'products', 'order_items']),
        primaryMode: 'sql', // sql | browse | structure | insert | search | designer | operations
        tabs: this._loadTabs(),
        activeTabId: null,
        lastResponse: null,
        activeResultIdx: 0,
        activeOutputView: 'table', // table | chart | json | explain
        lastExplain: null,
        sortCol: null,
        sortDir: 1,
        filterText: '',
        cookbook: [],
        ac: { open: false, items: [], selectedIdx: 0, replaceStart: 0, replaceEnd: 0 },
        launcher: { open: false, items: [], selectedIdx: 0, backupTheme: null },
        ctCols: [],
      };
      this.state.activeTabId = this.state.tabs[0].id;

      this.dom = {
        dbSelect: document.getElementById('dbSelect'),
        engineBadge: document.getElementById('engineBadge'),
        wbThemeName: document.getElementById('wbThemeName'),
        schemaSearch: document.getElementById('schemaSearch'),
        schemaTree: document.getElementById('schemaTree'),
        pmaModeBar: document.getElementById('pmaModeBar'),
        sqlModeView: document.getElementById('sqlModeView'),
        pmaStage: document.getElementById('pmaStage'),
        editorTabs: document.getElementById('editorTabs'),
        editorGutter: document.getElementById('editorGutter'),
        editorHighlight: document.getElementById('editorHighlight'),
        sqlInput: document.getElementById('sqlInput'),
        editorCursorPos: document.getElementById('editorCursorPos'),
        acPopup: document.getElementById('acPopup'),
        acTitle: document.getElementById('acTitle'),
        acList: document.getElementById('acList'),
        viewTabs: document.getElementById('viewTabs'),
        resultSetTabs: document.getElementById('resultSetTabs'),
        resultFilter: document.getElementById('resultFilter'),
        metaStatus: document.getElementById('metaStatus'),
        metaDetail: document.getElementById('metaDetail'),
        outputBody: document.getElementById('outputBody'),
        statusDbBadge: document.getElementById('statusDbBadge'),
        statusSchemaSummary: document.getElementById('statusSchemaSummary'),
        toastStack: document.getElementById('toastStack'),
        launcherModal: document.getElementById('launcherModal'),
        launcherInput: document.getElementById('launcherInput'),
        launcherList: document.getElementById('launcherList'),
        aetherModal: document.getElementById('aetherModal'),
        importModal: document.getElementById('importModal'),
        cookbookModal: document.getElementById('cookbookModal'),
        historyModal: document.getElementById('historyModal'),
        hotkeysModal: document.getElementById('hotkeysModal'),
        cellModal: document.getElementById('cellModal'),
        createTableModal: document.getElementById('createTableModal'),
        rowEditModal: document.getElementById('rowEditModal'),
        bookmarksModal: document.getElementById('bookmarksModal'),
        connectionsModal: document.getElementById('connectionsModal'),
        connLabel: document.getElementById('connLabel'),
      };

      this.pma = new window.PmaViews(this);
      this.pro = new window.ProViews(this);

      hydrateIcons();
      this._initThemesAndSplitters();
      this._bindEvents();
      this._boot();
    }

    _loadTabs() {
      try {
        const raw = localStorage.getItem('ekoni_sql_tabs_v2');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) return parsed;
        }
      } catch {}
      return [{ id: 'tab-1', title: 'Revenue Analytics.sql', sql: DEFAULT_STARTER_SQL }];
    }

    _saveTabs() {
      try { localStorage.setItem('ekoni_sql_tabs_v2', JSON.stringify(this.state.tabs)); } catch {}
    }

    toast(msg, isErr = false) {
      const el = document.createElement('div');
      el.className = `studio-toast${isErr ? ' err' : ''}`;
      el.textContent = String(msg);
      this.dom.toastStack.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.24s';
        setTimeout(() => el.remove(), 250);
      }, 2500);
    }

    async apiFetch(url, opts = {}) {
      try {
        const res = await fetch(url, {
          headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
          ...opts,
        });
        const data = await res.json();
        if (data && data.ok === false && data.error && !opts.silentError) {
          this.toast(data.error, true);
        }
        return data;
      } catch (err) {
        if (!opts.silentError) this.toast(`Request error: ${err.message}`, true);
        return { ok: false, error: err.message };
      }
    }

    safeCopy(text) {
      const str = String(text ?? '');
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(str).catch(() => this._fallbackCopy(str));
      } else {
        this._fallbackCopy(str);
      }
    }

    _fallbackCopy(str) {
      try {
        const ta = document.createElement('textarea');
        ta.value = str;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      } catch {}
    }

    getActiveTab() {
      return this.state.tabs.find((t) => t.id === this.state.activeTabId) || this.state.tabs[0];
    }

    getCurrentResult() {
      const r = this.state.lastResponse;
      if (!r || !Array.isArray(r.results)) return null;
      return r.results[this.state.activeResultIdx] || r.results[0] || null;
    }

    closeAllModals() {
      if (this.state.launcher.open && this.state.launcher.backupTheme) {
        window.SqlThemes.setTheme(this.state.launcher.backupTheme, true);
        this.state.launcher.backupTheme = null;
      }
      this.state.launcher.open = false;
      [
        this.dom.launcherModal,
        this.dom.aetherModal,
        this.dom.importModal,
        this.dom.cookbookModal,
        this.dom.historyModal,
        this.dom.hotkeysModal,
        this.dom.cellModal,
        this.dom.createTableModal,
        this.dom.rowEditModal,
        this.dom.bookmarksModal,
        this.dom.connectionsModal,
      ].forEach((m) => m && m.classList.add('hidden'));
    }

    // =========================================================================
    // Themes & Resizable Splitters
    // =========================================================================
    _initThemesAndSplitters() {
      window.SqlThemes.applyAll();
      window.SqlThemes.onChange((_, themeObj) => {
        this.dom.wbThemeName.textContent = themeObj.name;
      });
      this.dom.wbThemeName.textContent = (window.SqlThemes.THEMES[window.SqlThemes.getState().theme] || {}).name || 'Tokyo Night';

      ['schemaPane', 'editorPane', 'outputPane', 'pmaStage'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('mousedown', () => {
          document.querySelectorAll('.glass-pane').forEach((p) => p.classList.remove('focused'));
          el.classList.add('focused');
        });
      });

      const schemaPane = document.getElementById('schemaPane');
      const editorPane = document.getElementById('editorPane');
      const outputPane = document.getElementById('outputPane');

      document.getElementById('gutterH').addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.body.classList.add('resizing-col');
        const onMove = (ev) => { schemaPane.style.width = `${Math.max(150, Math.min(440, ev.clientX - 10))}px`; };
        const onUp = () => {
          document.body.classList.remove('resizing-col');
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      document.getElementById('gutterV').addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.body.classList.add('resizing-row');
        const rect = this.dom.sqlModeView.getBoundingClientRect();
        const onMove = (ev) => {
          const frac = Math.max(0.2, Math.min(0.8, (ev.clientY - rect.top) / Math.max(1, rect.height)));
          editorPane.style.flex = `${frac} 1 0%`;
          outputPane.style.flex = `${1 - frac} 1 0%`;
        };
        const onUp = () => {
          document.body.classList.remove('resizing-row');
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    }

    // =========================================================================
    // Primary Workspace Mode Switcher (All 12 phpMyAdmin + Startup Pro Studios)
    // =========================================================================
    setPrimaryMode(mode) {
      this.state.primaryMode = mode;
      this.dom.pmaModeBar.querySelectorAll('[data-mode]').forEach((b) =>
        b.classList.toggle('active', b.dataset.mode === mode)
      );

      if (mode === 'sql') {
        this.dom.pmaStage.classList.add('hidden');
        this.dom.sqlModeView.classList.remove('hidden');
        this.dom.sqlInput.focus();
      } else {
        this.dom.sqlModeView.classList.add('hidden');
        this.dom.pmaStage.classList.remove('hidden');
        this.renderActivePmaStage();
      }
    }

    renderActivePmaStage() {
      const m = this.state.primaryMode;
      const stage = this.dom.pmaStage;
      if (m === 'overview') this.pro.renderOverview(stage);
      else if (m === 'browse') this.pma.renderBrowse(stage);
      else if (m === 'structure') this.pma.renderStructure(stage);
      else if (m === 'builder') this.pro.renderQueryBuilder(stage);
      else if (m === 'profiler') this.pro.renderProfiler(stage);
      else if (m === 'insert') this.pma.renderInsert(stage);
      else if (m === 'search') this.pma.renderSearch(stage);
      else if (m === 'views') this.pro.renderViewsTriggers(stage);
      else if (m === 'api') this.pro.renderApiCodegen(stage);
      else if (m === 'operations') this.pma.renderOperations(stage);
      else if (m === 'designer') {
        stage.innerHTML = `
          <div class="pma-context-bar">
            <div class="pma-ctx-left">
              <span class="pma-ctx-icon">${I.diagram(15)}</span>
              <strong>Interactive ER Schema Designer</strong>
              <span class="pma-ctx-sub">${(this.state.schema?.tables || []).length} tables · ${(this.state.schema?.relations || []).length} foreign-key links · Drag any card to arrange</span>
            </div>
            <div class="pma-ctx-right">
              <button class="wb-run-btn er-new-tbl-btn">${I.plus(13)} New Table</button>
            </div>
          </div>
          <div class="pma-scroll-body" id="erStageCanvas"></div>`;
        stage.querySelector('.er-new-tbl-btn').addEventListener('click', () => this.openCreateTableModal());
        renderErDiagram(stage.querySelector('#erStageCanvas'), this.state.schema, (tblName) => {
          this.selectTable(tblName, true);
        });
      }
    }

    selectTable(tblName, switchToBrowse = false) {
      this.state.selectedTable = tblName;
      this.state.expandedTables.add(tblName);
      this.renderSchemaTree();
      if (switchToBrowse) {
        this.pma.browseState.page = 1;
        this.pma.browseState.sortCol = null;
        this.pma.browseState.selectedRowids.clear();
        this.setPrimaryMode('browse');
      } else if (this.state.primaryMode !== 'sql') {
        this.renderActivePmaStage();
      }
    }

    // =========================================================================
    // Databases & Live Schema Explorer
    // =========================================================================
    async loadDatabases() {
      const data = await this.apiFetch(`/api/databases?connId=${encodeURIComponent(this.state.connId)}`);
      this.applyDatabasesList(data.databases || []);
    }

    applyDatabasesList(list) {
      this.state.databases = list || [];
      if (this.state.databases.length && !this.state.databases.some((d) => d.name === this.state.currentDb)) {
        const preferred = this.state.databases.find((d) => !['information_schema', 'mysql', 'performance_schema', 'sys'].includes(d.name)) || this.state.databases[0];
        this.state.currentDb = preferred.name;
      }
      this.dom.dbSelect.innerHTML = this.state.databases
        .map((d) => `<option value="${escapeHtml(d.name)}"${d.name === this.state.currentDb ? ' selected' : ''}>${escapeHtml(d.name)}</option>`)
        .join('');
    }

    async loadSchema() {
      const data = await this.apiFetch(`/api/schema?connId=${encodeURIComponent(this.state.connId)}&db=${encodeURIComponent(this.state.currentDb)}`);
      if (data && data.tables) this.applySchemaUpdate(data);
    }

    applySchemaUpdate(schema) {
      if (!schema) return;
      this.state.schema = schema;
      const tblCount = (schema.tables || []).length;
      const viewCount = (schema.views || []).length;
      const totalRows = (schema.tables || []).reduce((acc, t) => acc + (t.rowCount || 0), 0);

      if (!this.state.selectedTable && tblCount > 0) {
        this.state.selectedTable = schema.tables[0].name;
      }

      this.dom.engineBadge.textContent = `SQLite ${schema.sqliteVersion || '3'} · ${tblCount} tbls`;
      this.dom.statusDbBadge.textContent = this.state.currentDb;
      this.dom.statusSchemaSummary.textContent = `${tblCount} tables, ${viewCount} views, ${totalRows} total rows · phpMyAdmin Compat ON`;
      this.renderSchemaTree();
      this.renderEditorHighlight();
    }

    renderSchemaTree() {
      const schema = this.state.schema;
      if (!schema) return;
      const q = this.dom.schemaSearch.value.trim().toLowerCase();

      const renderGroup = (label, list, isView) => {
        const filtered = list.filter((t) => {
          if (!q) return true;
          return t.name.toLowerCase().includes(q) || (t.columns || []).some((c) => c.name.toLowerCase().includes(q));
        });
        if (!filtered.length) return '';

        let html = `<div class="schema-group-lbl">${label} (${filtered.length})</div>`;
        for (const t of filtered) {
          const expanded = this.state.expandedTables.has(t.name) || Boolean(q);
          const isSelected = this.state.selectedTable === t.name;
          html += `
            <div class="schema-tbl">
              <div class="schema-tbl-row${isSelected ? ' active' : ''}" data-toggle-tbl="${escapeHtml(t.name)}">
                <span class="schema-caret">${expanded ? '▾' : '▸'}</span>
                <span class="schema-tbl-name${isView ? ' is-view' : ''}" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
                <span class="schema-row-cnt">${t.rowCount}</span>
                <span class="schema-tbl-actions">
                  <button class="schema-act-btn" data-browse-tbl="${escapeHtml(t.name)}" title="Browse Rows">${I.browse(11)}</button>
                  <button class="schema-act-btn" data-struct-tbl="${escapeHtml(t.name)}" title="Table Structure">${I.structure(11)}</button>
                </span>
              </div>
              ${
                expanded
                  ? `<div class="schema-cols">${(t.columns || [])
                      .map(
                        (c) => `
                    <div class="schema-col-row" data-insert-text="${escapeHtml(c.name)}" title="Click to insert column '${escapeHtml(c.name)}'">
                      <span class="col-key ${c.pk ? 'pk' : c.fk ? 'fk' : 'plain'}">${c.pk ? 'PK' : c.fk ? 'FK' : '·'}</span>
                      <span class="col-name">${escapeHtml(c.name)}</span>
                      <span class="col-type">${escapeHtml((c.type || 'ANY').slice(0, 7))}</span>
                    </div>`
                      )
                      .join('')}</div>`
                  : ''
              }
            </div>`;
        }
        return html;
      };

      const html = renderGroup('Tables', schema.tables || [], false) + renderGroup('Views', schema.views || [], true);
      this.dom.schemaTree.innerHTML = html || '<div class="empty-state">No tables yet.</div>';

      this.dom.schemaTree.querySelectorAll('[data-toggle-tbl]').forEach((row) => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.schema-act-btn')) return;
          const name = row.dataset.toggleTbl;
          this.state.selectedTable = name;
          if (this.state.expandedTables.has(name)) this.state.expandedTables.delete(name);
          else this.state.expandedTables.add(name);
          this.renderSchemaTree();
          if (this.state.primaryMode !== 'sql' && this.state.primaryMode !== 'designer') {
            this.renderActivePmaStage();
          }
        });
        row.addEventListener('dblclick', (e) => {
          if (e.target.closest('.schema-act-btn')) return;
          const name = row.dataset.toggleTbl;
          if (this.state.primaryMode === 'sql') this.insertAtCursor(name);
          else this.selectTable(name, true);
        });
      });

      this.dom.schemaTree.querySelectorAll('[data-browse-tbl]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectTable(btn.dataset.browseTbl, true);
        });
      });

      this.dom.schemaTree.querySelectorAll('[data-struct-tbl]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.state.selectedTable = btn.dataset.structTbl;
          this.renderSchemaTree();
          this.setPrimaryMode('structure');
        });
      });

      this.dom.schemaTree.querySelectorAll('[data-insert-text]').forEach((row) => {
        row.addEventListener('click', () => {
          if (this.state.primaryMode !== 'sql') this.setPrimaryMode('sql');
          this.insertAtCursor(row.dataset.insertText);
        });
      });
    }

    // =========================================================================
    // Multi-Tab SQL Editor + Highlighting + Smart Autocomplete
    // =========================================================================
    renderTabs() {
      this.dom.editorTabs.innerHTML = this.state.tabs
        .map(
          (t) => `
        <div class="ed-tab${t.id === this.state.activeTabId ? ' active' : ''}" data-tab="${t.id}">
          <span>${escapeHtml(t.title)}</span>
          ${this.state.tabs.length > 1 ? `<span class="ed-tab-close" data-close-tab="${t.id}">✕</span>` : ''}
        </div>`
        )
        .join('');

      this.dom.editorTabs.querySelectorAll('.ed-tab').forEach((el) => {
        el.addEventListener('click', (e) => {
          const cid = e.target.dataset && e.target.dataset.closeTab;
          if (cid) this.closeTab(cid);
          else this.switchTab(el.dataset.tab);
        });
      });
    }

    switchTab(id) {
      const cur = this.getActiveTab();
      if (cur) cur.sql = this.dom.sqlInput.value;
      this.state.activeTabId = id;
      this.dom.sqlInput.value = this.getActiveTab().sql || '';
      this.closeAutocomplete();
      this.renderTabs();
      this.renderEditorHighlight();
      this.updateGutterAndCursor();
      this.dom.sqlInput.focus();
    }

    createTab(title, sql = '') {
      const cur = this.getActiveTab();
      if (cur) cur.sql = this.dom.sqlInput.value;
      const id = 'tab-' + Date.now();
      this.state.tabs.push({ id, title: title || `Query ${this.state.tabs.length + 1}.sql`, sql });
      this._saveTabs();
      this.switchTab(id);
    }

    closeTab(id) {
      if (this.state.tabs.length <= 1) return;
      const idx = this.state.tabs.findIndex((t) => t.id === id);
      if (idx === -1) return;
      this.state.tabs.splice(idx, 1);
      if (this.state.activeTabId === id) this.state.activeTabId = this.state.tabs[Math.max(0, idx - 1)].id;
      this._saveTabs();
      this.switchTab(this.state.activeTabId);
    }

    setEditorSql(sql, title) {
      const tab = this.getActiveTab();
      tab.sql = sql;
      if (title) tab.title = title;
      this.dom.sqlInput.value = sql;
      this._saveTabs();
      this.renderTabs();
      this.renderEditorHighlight();
      this.updateGutterAndCursor();
    }

    insertAtCursor(text) {
      const inp = this.dom.sqlInput;
      const s = inp.selectionStart;
      const e = inp.selectionEnd;
      inp.value = inp.value.slice(0, s) + text + inp.value.slice(e);
      const pos = s + text.length;
      inp.setSelectionRange(pos, pos);
      this.getActiveTab().sql = inp.value;
      this._saveTabs();
      this.renderEditorHighlight();
      this.updateGutterAndCursor();
      inp.focus();
    }

    renderEditorHighlight() {
      this.dom.editorHighlight.innerHTML = highlightSql(this.dom.sqlInput.value, this.state.schema);
      this.dom.editorHighlight.scrollTop = this.dom.sqlInput.scrollTop;
      this.dom.editorHighlight.scrollLeft = this.dom.sqlInput.scrollLeft;
    }

    updateGutterAndCursor() {
      const lines = this.dom.sqlInput.value.split('\n').length;
      const arr = [];
      for (let i = 1; i <= lines; i++) arr.push(i);
      this.dom.editorGutter.textContent = arr.join('\n');
      this.dom.editorGutter.scrollTop = this.dom.sqlInput.scrollTop;
      const before = this.dom.sqlInput.value.slice(0, this.dom.sqlInput.selectionStart).split('\n');
      this.dom.editorCursorPos.textContent = `Ln ${before.length}, Col ${before[before.length - 1].length + 1}`;
    }

    closeAutocomplete() {
      this.state.ac.open = false;
      this.state.ac.items = [];
      this.dom.acPopup.classList.add('hidden');
    }

    triggerAutocomplete(explicit = false) {
      const inp = this.dom.sqlInput;
      const res = getSqlCompletions(inp.value, inp.selectionStart, this.state.schema);
      if (!res.items.length) { this.closeAutocomplete(); return; }
      if (!explicit && res.replaceEnd - res.replaceStart === 0 && !inp.value.slice(0, inp.selectionStart).endsWith('.')) {
        this.closeAutocomplete();
        return;
      }
      this.state.ac = { open: true, items: res.items, selectedIdx: 0, replaceStart: res.replaceStart, replaceEnd: res.replaceEnd };
      this.renderAutocomplete();
    }

    applyAutocomplete(item) {
      const inp = this.dom.sqlInput;
      const next = inp.value.slice(0, this.state.ac.replaceStart) + item.insert + inp.value.slice(this.state.ac.replaceEnd);
      let pos = this.state.ac.replaceStart + item.insert.length;
      if (item.insert.endsWith('()')) pos--;
      inp.value = next;
      inp.setSelectionRange(pos, pos);
      this.getActiveTab().sql = next;
      this._saveTabs();
      this.closeAutocomplete();
      this.renderEditorHighlight();
      this.updateGutterAndCursor();
      inp.focus();
    }

    renderAutocomplete() {
      if (!this.state.ac.open || !this.state.ac.items.length) { this.closeAutocomplete(); return; }
      this.dom.acTitle.textContent = `SQL IntelliSense (${this.state.ac.items.length})`;
      this.dom.acList.innerHTML = this.state.ac.items
        .map(
          (it, idx) => `
        <div class="ac-item${idx === this.state.ac.selectedIdx ? ' selected' : ''}" data-ac="${idx}">
          <span class="ac-kind ac-kind-${it.kind}">${it.kind}</span>
          <span class="ac-label">${escapeHtml(it.label)}</span>
          <span class="ac-desc">${escapeHtml(it.desc || '')}</span>
        </div>`
        )
        .join('');
      this.dom.acPopup.classList.remove('hidden');
      this.dom.acList.querySelectorAll('.ac-item').forEach((row) => {
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.applyAutocomplete(this.state.ac.items[Number(row.dataset.ac)]);
        });
      });
      const sel = this.dom.acList.querySelector('.ac-item.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    // =========================================================================
    // Run SQL, Explain & Multi-View Output Renderer
    // =========================================================================
    async runQuery(selectionOnly = false) {
      if (this.state.primaryMode !== 'sql') this.setPrimaryMode('sql');
      let sql = this.dom.sqlInput.value;
      if (selectionOnly) {
        const s = this.dom.sqlInput.selectionStart;
        const e = this.dom.sqlInput.selectionEnd;
        if (e > s) sql = sql.slice(s, e);
      }
      if (!sql.trim()) { this.toast('Enter a SQL query first', true); return; }

      this.dom.metaStatus.textContent = 'Running...';
      this.dom.metaStatus.classList.remove('err');
      this.closeAutocomplete();

      const resp = await this.apiFetch('/api/query', {
        method: 'POST',
        silentError: true,
        body: JSON.stringify({ connId: this.state.connId, db: this.state.currentDb, sql }),
      });

      this.state.lastResponse = resp;
      this.state.activeResultIdx = 0;
      this.state.sortCol = null;
      this.state.sortDir = 1;

      if (resp.db && resp.db !== this.state.currentDb) {
        this.state.currentDb = resp.db;
        this.toast(`Switched active database to ${resp.db}`);
      }
      if (resp.databases) this.applyDatabasesList(resp.databases);
      if (resp.schema) this.applySchemaUpdate(resp.schema);

      if (this.state.activeOutputView === 'explain') {
        this.setOutputView('table');
      } else {
        this.renderOutput();
      }
    }

    async runExplain() {
      if (this.state.primaryMode !== 'sql') this.setPrimaryMode('sql');
      const s = this.dom.sqlInput.selectionStart;
      const e = this.dom.sqlInput.selectionEnd;
      const sql = e > s ? this.dom.sqlInput.value.slice(s, e) : this.dom.sqlInput.value;
      const resp = await this.apiFetch('/api/explain', {
        method: 'POST',
        silentError: true,
        body: JSON.stringify({ db: this.state.currentDb, sql }),
      });
      this.state.lastExplain = resp;
      this.setOutputView('explain');
    }

    setOutputView(view) {
      this.state.activeOutputView = view;
      this.dom.viewTabs.querySelectorAll('.view-tab').forEach((b) =>
        b.classList.toggle('active', b.dataset.view === view)
      );
      this.renderOutput();
    }

    renderOutput() {
      const list = this.state.lastResponse && this.state.lastResponse.results ? this.state.lastResponse.results : [];
      if (list.length > 1) {
        this.dom.resultSetTabs.classList.remove('hidden');
        this.dom.resultSetTabs.innerHTML = list
          .map((r, i) => `<button class="rs-tab${i === this.state.activeResultIdx ? ' active' : ''}" data-rs="${i}">#${i + 1}${r.kind === 'select' ? ` (${r.rowCount})` : ' ✓'}</button>`)
          .join('');
        this.dom.resultSetTabs.querySelectorAll('.rs-tab').forEach((b) => {
          b.addEventListener('click', () => {
            this.state.activeResultIdx = Number(b.dataset.rs);
            this.state.sortCol = null;
            this.renderOutput();
          });
        });
      } else {
        this.dom.resultSetTabs.classList.add('hidden');
      }

      if (this.state.activeOutputView === 'explain') {
        const ex = this.state.lastExplain;
        if (!ex) {
          this.dom.outputBody.innerHTML = '<div class="empty-state">Click <strong>Explain</strong> or press <code>Ctrl+E</code> to analyze SQLite\'s execution plan.</div>';
          return;
        }
        if (!ex.ok) {
          this.dom.metaStatus.textContent = 'Explain Error';
          this.dom.metaStatus.classList.add('err');
          this.dom.outputBody.innerHTML = `<div class="error-box"><div class="error-box-title">${escapeHtml(ex.error)}</div></div>`;
          return;
        }
        this.dom.metaStatus.textContent = 'Query Plan';
        this.dom.metaStatus.classList.remove('err');
        this.dom.metaDetail.textContent = `${ex.plan.length} execution step(s)`;
        this.dom.outputBody.innerHTML = `<div class="explain-wrap">${ex.plan
          .map((step) => {
            const badge = step.usesIndex
              ? '<span class="explain-badge idx">INDEX HIT</span>'
              : step.isFullScan
              ? '<span class="explain-badge scan">TABLE SCAN</span>'
              : '<span class="explain-badge info">STEP</span>';
            return `<div class="explain-step">${badge}<span>${escapeHtml(step.detail)}</span></div>`;
          })
          .join('')}</div>`;
        return;
      }

      const resp = this.state.lastResponse;
      if (!resp) {
        this.dom.outputBody.innerHTML = '<div class="empty-state">Execute any SQL query (<code>Ctrl+Enter</code>) to view results, charts, and JSON.</div>';
        return;
      }

      if (!resp.ok) {
        this.dom.metaStatus.textContent = 'SQL Error';
        this.dom.metaStatus.classList.add('err');
        this.dom.metaDetail.textContent = `Statement #${resp.failedStatementIndex || 1} failed in ${resp.totalDurationMs || 0} ms`;
        this.dom.outputBody.innerHTML = `
          <div class="error-box">
            <div class="error-box-title">${I.x(14)} ${escapeHtml(resp.error)}</div>
            ${resp.failedStatement ? `<div class="error-box-stmt">${escapeHtml(resp.failedStatement)}</div>` : ''}
          </div>`;
        return;
      }

      const res = this.getCurrentResult();
      if (!res) {
        this.dom.outputBody.innerHTML = '<div class="empty-state">Query completed with no output.</div>';
        return;
      }

      this.dom.metaStatus.textContent = 'OK';
      this.dom.metaStatus.classList.remove('err');

      if (res.kind === 'mutation') {
        this.dom.metaDetail.textContent = res.message || `${res.changes} row(s) affected · ${res.durationMs} ms`;
        this.dom.outputBody.innerHTML = `
          <div class="mutation-card">
            <div class="mutation-title">${I.check(14)} ${escapeHtml(res.message || `Statement #${res.index} executed successfully`)}</div>
            <div>Rows affected: <strong>${res.changes || 0}</strong>${res.lastInsertRowid ? ` · Last Insert ID: <strong>${res.lastInsertRowid}</strong>` : ''} · Duration: <strong>${res.durationMs} ms</strong></div>
          </div>`;
        return;
      }

      let rows = res.rows || [];
      const fq = this.state.filterText.trim().toLowerCase();
      if (fq) rows = rows.filter((r) => Object.values(r).some((v) => v !== null && String(v).toLowerCase().includes(fq)));
      if (this.state.sortCol) {
        const col = this.state.sortCol;
        const dir = this.state.sortDir;
        rows = rows.slice().sort((a, b) => {
          const va = a[col];
          const vb = b[col];
          if (va === vb) return 0;
          if (va === null || va === undefined) return 1;
          if (vb === null || vb === undefined) return -1;
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
          return String(va).localeCompare(String(vb)) * dir;
        });
      }

      this.dom.metaDetail.textContent = `${rows.length}${fq ? ` / ${res.rowCount}` : ''} rows · ${res.columns.length} cols · ${res.durationMs} ms`;

      if (this.state.activeOutputView === 'chart') {
        renderSqlChart(this.dom.outputBody, { ...res, rows });
        return;
      }

      if (this.state.activeOutputView === 'json') {
        const pretty = JSON.stringify(rows, null, 2);
        const colored = escapeHtml(pretty).replace(
          /(&quot;(?:\\.|[^&])*?&quot;(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d*)?)/g,
          (m) => {
            if (m.startsWith('&quot;')) return m.endsWith(':') ? `<span class="json-key">${m}</span>` : `<span class="json-str">${m}</span>`;
            if (m === 'true' || m === 'false') return `<span class="json-bool">${m}</span>`;
            if (m === 'null') return `<span class="json-null">${m}</span>`;
            return `<span class="json-num">${m}</span>`;
          }
        );
        this.dom.outputBody.innerHTML = `<pre class="json-view-pre">${colored}</pre>`;
        return;
      }

      if (!rows.length) {
        this.dom.outputBody.innerHTML = '<div class="empty-state">Query returned 0 rows.</div>';
        return;
      }

      const headCells = res.columns
        .map((c) => {
          const arrow = this.state.sortCol === c.name ? `<span class="th-sort">${this.state.sortDir === 1 ? '▲' : '▼'}</span>` : '';
          return `<th data-sort-col="${escapeHtml(c.name)}">${escapeHtml(c.name)}${c.type ? `<span class="th-type">${escapeHtml(c.type)}</span>` : ''}${arrow}</th>`;
        })
        .join('');

      const bodyRows = rows
        .map((r, rIdx) => {
          const tds = res.columns
            .map((c) => {
              const val = r[c.name];
              if (val === null || val === undefined) return `<td data-col="${escapeHtml(c.name)}" data-val="NULL"><span class="cell-null">NULL</span></td>`;
              if (typeof val === 'number') return `<td class="cell-num" data-col="${escapeHtml(c.name)}" data-val="${escapeHtml(String(val))}">${escapeHtml(val.toLocaleString())}</td>`;
              const sv = String(val);
              const low = sv.toLowerCase();
              if (c.name.toLowerCase() === 'status' && ['delivered', 'shipped', 'processing', 'cancelled', 'active', 'completed'].includes(low)) {
                return `<td data-col="${escapeHtml(c.name)}" data-val="${escapeHtml(sv)}"><span class="status-chip status-${low}">${escapeHtml(sv)}</span></td>`;
              }
              return `<td data-col="${escapeHtml(c.name)}" data-val="${escapeHtml(sv)}" title="${escapeHtml(sv)}">${escapeHtml(sv)}</td>`;
            })
            .join('');
          return `<tr><td class="row-num-col">${rIdx + 1}</td>${tds}</tr>`;
        })
        .join('');

      this.dom.outputBody.innerHTML = `
        <table class="sql-table">
          <thead><tr><th class="row-num-col">#</th>${headCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>`;

      this.dom.outputBody.querySelectorAll('th[data-sort-col]').forEach((th) => {
        th.addEventListener('click', () => {
          const col = th.dataset.sortCol;
          if (this.state.sortCol === col) this.state.sortDir *= -1;
          else { this.state.sortCol = col; this.state.sortDir = 1; }
          this.renderOutput();
        });
      });
      this.dom.outputBody.querySelectorAll('tbody td[data-col]').forEach((td) => {
        td.addEventListener('click', () => this.openCellModal(td.dataset.col, td.dataset.val));
      });
    }

    // =========================================================================
    // Visual Create Table Modal (phpMyAdmin Table Designer)
    // =========================================================================
    openCreateTableModal() {
      this.closeAllModals();
      document.getElementById('ctTableName').value = '';
      this.state.ctCols = [
        { name: 'id', type: 'INTEGER', pk: true, ai: true, notnull: true, unique: false, defaultVal: '' },
        { name: 'name', type: 'VARCHAR(255)', pk: false, ai: false, notnull: true, unique: false, defaultVal: '' },
        { name: 'created_at', type: 'DATETIME', pk: false, ai: false, notnull: false, unique: false, defaultVal: 'CURRENT_TIMESTAMP' },
      ];
      this._renderCreateTableRows();
      this.dom.createTableModal.classList.remove('hidden');
      document.getElementById('ctTableName').focus();
    }

    _renderCreateTableRows() {
      const types = ['INTEGER', 'VARCHAR(255)', 'TEXT', 'REAL', 'DECIMAL(10,2)', 'DATE', 'DATETIME', 'BOOLEAN', 'BLOB'];
      const tbody = document.getElementById('ctColsBody');
      tbody.innerHTML = this.state.ctCols
        .map(
          (c, i) => `
        <tr>
          <td><input type="text" class="mini-input" data-ct-i="${i}" data-ct-f="name" value="${escapeHtml(c.name)}" /></td>
          <td><select class="wb-select" data-ct-i="${i}" data-ct-f="type">${types.map((t) => `<option${t === c.type ? ' selected' : ''}>${t}</option>`).join('')}</select></td>
          <td><input type="checkbox" data-ct-i="${i}" data-ct-f="pk" ${c.pk ? 'checked' : ''} /></td>
          <td><input type="checkbox" data-ct-i="${i}" data-ct-f="ai" ${c.ai ? 'checked' : ''} /></td>
          <td><input type="checkbox" data-ct-i="${i}" data-ct-f="notnull" ${c.notnull ? 'checked' : ''} /></td>
          <td><input type="checkbox" data-ct-i="${i}" data-ct-f="unique" ${c.unique ? 'checked' : ''} /></td>
          <td><input type="text" class="mini-input" data-ct-i="${i}" data-ct-f="defaultVal" value="${escapeHtml(c.defaultVal)}" placeholder="optional" /></td>
          <td><button class="pma-row-btn danger" data-ct-rm="${i}">${I.trash(13)}</button></td>
        </tr>`
        )
        .join('');

      tbody.querySelectorAll('[data-ct-i]').forEach((el) => {
        const evt = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(evt, () => {
          const idx = Number(el.dataset.ctI);
          const f = el.dataset.ctF;
          this.state.ctCols[idx][f] = el.type === 'checkbox' ? el.checked : el.value;
          this._updateCreateTablePreview();
        });
      });
      tbody.querySelectorAll('[data-ct-rm]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.state.ctCols.splice(Number(btn.dataset.ctRm), 1);
          this._renderCreateTableRows();
        });
      });
      this._updateCreateTablePreview();
    }

    _updateCreateTablePreview() {
      const name = document.getElementById('ctTableName').value.trim() || 'new_table';
      const lines = this.state.ctCols
        .filter((c) => c.name.trim())
        .map((c) => {
          if (c.pk && c.ai) return `  "${c.name.trim()}" INTEGER PRIMARY KEY AUTOINCREMENT`;
          const p = [`"${c.name.trim()}"`, c.type];
          if (c.pk) p.push('PRIMARY KEY');
          if (c.notnull && !c.pk) p.push('NOT NULL');
          if (c.unique && !c.pk) p.push('UNIQUE');
          if (c.defaultVal.trim()) p.push(`DEFAULT ${c.defaultVal.trim()}`);
          return `  ${p.join(' ')}`;
        });
      document.getElementById('ctPreviewSql').textContent = `CREATE TABLE "${name}" (\n${lines.join(',\n')}\n);`;
    }

    // =========================================================================
    // Exports, Reset, Modals (Launcher, Aether, Import, Cookbook, History)
    // =========================================================================
    exportResults(fmt) {
      const res = this.getCurrentResult();
      if (!res || res.kind !== 'select' || !res.rows.length) { this.toast('Run a SELECT query with rows first', true); return; }
      const cols = res.columns.map((c) => c.name);
      const rows = res.rows;
      const download = (name, data, mime) => {
        const blob = new Blob([data], { type: mime });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };

      if (fmt === 'csv') {
        const esc = (v) => (v === null || v === undefined ? '' : /[,"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
        download('query_result.csv', [cols.map(esc).join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'), 'text/csv');
        this.toast(`Downloaded CSV (${rows.length} rows)`);
      } else if (fmt === 'json') {
        download('query_result.json', JSON.stringify(rows, null, 2), 'application/json');
        this.toast(`Downloaded JSON (${rows.length} rows)`);
      } else if (fmt === 'md') {
        const hdr = `| ${cols.join(' | ')} |`;
        const sep = `| ${cols.map(() => '---').join(' | ')} |`;
        const body = rows.map((r) => `| ${cols.map((c) => (r[c] === null ? 'NULL' : String(r[c]).replace(/\|/g, '\\|'))).join(' | ')} |`);
        this.safeCopy([hdr, sep, ...body].join('\n'));
        this.toast('Copied Markdown table to clipboard');
      } else if (fmt === 'sql') {
        const tbl = res.columns[0]?.table || 'exported_rows';
        const stmts = rows.map((r) => {
          const vals = cols.map((c) => (r[c] === null ? 'NULL' : typeof r[c] === 'number' ? r[c] : `'${String(r[c]).replace(/'/g, "''")}'`));
          return `INSERT INTO "${tbl}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${vals.join(', ')});`;
        });
        this.safeCopy(stmts.join('\n'));
        this.toast(`Copied ${rows.length} SQL INSERT statements`);
      }
    }

    async resetCurrentDb() {
      const r = await this.apiFetch('/api/databases/reset', {
        method: 'POST',
        body: JSON.stringify({ db: this.state.currentDb }),
      });
      if (r && r.ok) {
        this.applySchemaUpdate(r.schema);
        this.toast(`Reset ${this.state.currentDb} to clean state`);
        if (this.state.primaryMode !== 'sql') this.renderActivePmaStage();
      }
    }

    openCellModal(title, val) {
      document.getElementById('cellModalCol').textContent = title;
      document.getElementById('cellModalBody').textContent = val;
      this.dom.cellModal.classList.remove('hidden');
    }

    openLauncher() {
      this.closeAllModals();
      this.state.launcher.open = true;
      this.state.launcher.backupTheme = window.SqlThemes.getState().theme;
      this.dom.launcherInput.value = '';
      this.dom.launcherModal.classList.remove('hidden');
      this._filterLauncher('');
      this.dom.launcherInput.focus();
    }

    _buildLauncherCatalog() {
      const items = [
        { cat: 'Startup & phpMyAdmin Studios', ico: 'home', title: 'Database Overview & KPI Dashboard', desc: 'Live KPIs, tables matrix, PRAGMA toggles', run: () => this.setPrimaryMode('overview') },
        { cat: 'Startup & phpMyAdmin Studios', ico: 'terminal', title: 'SQL Console', desc: 'Multi-tab universal SQL editor (MySQL + SQLite)', run: () => this.setPrimaryMode('sql') },
        { cat: 'Startup & phpMyAdmin Studios', ico: 'browse', title: 'Browse Active Table', desc: 'Paginated data grid with inline cell editing & CRUD', run: () => this.setPrimaryMode('browse') },
        { cat: 'Startup & phpMyAdmin Studios', ico: 'structure', title: 'Table Structure & Indexes', desc: 'Inspect columns, add/drop columns & indexes, DDL', run: () => this.setPrimaryMode('structure') },
        { cat: 'Startup & phpMyAdmin Studios', ico: 'builder', title: 'Visual No-Code Query Builder', desc: 'Auto-JOIN from FKs, filters, aggregations & live SQL', run: () => this.setPrimaryMode('builder') },
        { cat: 'Startup & phpMyAdmin Studios', ico: 'profiler', title: 'Instant Data Quality Profiler', desc: 'Null %, cardinality, min/max/avg & top values', run: () => this.setPrimaryMode('profiler') },
        { cat: 'Startup & phpMyAdmin Studios', ico: 'plusSquare', title: 'Insert Row & Mock Data Seeder', desc: 'Visual insert form + 1-click realistic mock rows', run: () => this.setPrimaryMode('insert') },
        { cat: 'Startup & phpMyAdmin Studios', ico: 'search', title: 'Visual Table Search (QBE)', desc: 'Build WHERE filters with column operators visually', run: () => this.setPrimaryMode('search') },
        { cat: 'Startup & phpMyAdmin Studios', ico: 'triggers', title: 'Views & Automated Triggers Manager', desc: 'Create & drop SQL views and BEFORE/AFTER triggers', run: () => this.setPrimaryMode('views') },
        { cat: 'Startup & phpMyAdmin Studios', ico: 'diagram', title: 'Draggable ER Schema Designer', desc: 'Interactive visual table & foreign-key diagram', run: () => this.setPrimaryMode('designer') },
        { cat: 'Startup & phpMyAdmin Studios', ico: 'api', title: 'Instant REST API & ORM Codegen', desc: 'Live GET API tester + TypeScript/Prisma/Drizzle/Python', run: () => this.setPrimaryMode('api') },
        { cat: 'Startup & phpMyAdmin Studios', ico: 'sliders', title: 'Operations & Time-Travel Snapshots', desc: 'Rename, copy, truncate, drop, VACUUM & DB Snapshots', run: () => this.setPrimaryMode('operations') },
        { cat: 'Tools', ico: 'plus', title: 'Create New Table (Visual Designer)', desc: 'Design columns, types, PK, AI, defaults visually', run: () => this.openCreateTableModal() },
        { cat: 'Tools', ico: 'bookmark', title: 'Saved SQL Bookmarks', desc: 'Open your personal saved SQL query library', run: () => this.openBookmarksModal() },
        { cat: 'Tools', ico: 'upload', title: 'Import .sql Dump / CSV / JSON', desc: 'Run MySQL/phpMyAdmin dumps or import CSV/JSON', run: () => this.openImportModal() },
        { cat: 'Tools', ico: 'download', title: 'Export Full Database .sql Dump', desc: 'Download complete SQL backup of active database', run: () => { window.location.href = `/api/export/sql?db=${encodeURIComponent(this.state.currentDb)}`; } },
        { cat: 'Tools', ico: 'book', title: 'SQL Cookbook', desc: 'Ready-to-run analytics, CTE & window queries', run: () => this.openCookbook() },
        { cat: 'Tools', ico: 'clock', title: 'Persistent Query History', desc: 'Browse and re-run past SQL queries', run: () => this.openHistoryModal() },
        { cat: 'Appearance', ico: 'palette', title: 'Aether Theme & Glass Studio', desc: 'Customize 12 themes, blur, opacity, gaps & font', run: () => this.openAetherModal() },
      ];
      const curTheme = window.SqlThemes.getState().theme;
      for (const [id, t] of Object.entries(window.SqlThemes.THEMES)) {
        items.push({
          cat: 'Themes',
          ico: 'sparkles',
          title: `Theme: ${t.name}${id === curTheme ? ' ✓' : ''}`,
          desc: t.tagline,
          swatches: t.swatches,
          themeId: id,
          run: () => {
            this.state.launcher.backupTheme = null;
            window.SqlThemes.setTheme(id, false);
            this.toast(`Theme: ${t.name}`);
          },
        });
      }
      return items;
    }

    _filterLauncher(q) {
      const clean = q.trim().toLowerCase();
      const all = this._buildLauncherCatalog();
      this.state.launcher.items = clean ? all.filter((it) => `${it.cat} ${it.title} ${it.desc}`.toLowerCase().includes(clean)) : all;
      this.state.launcher.selectedIdx = 0;
      this._renderLauncher();
    }

    _renderLauncher() {
      let lastCat = '';
      let html = '';
      this.state.launcher.items.forEach((it, i) => {
        if (it.cat !== lastCat) { lastCat = it.cat; html += `<div class="lc-cat">${escapeHtml(it.cat)}</div>`; }
        const sw = it.swatches ? `<span class="lc-swatches">${it.swatches.map((c) => `<i style="background:${c}"></i>`).join('')}</span>` : '';
        html += `
          <div class="lc-item${i === this.state.launcher.selectedIdx ? ' selected' : ''}" data-lidx="${i}">
            <span class="lc-icon">${I[it.ico] ? I[it.ico](14) : ''}</span>
            <div class="lc-text"><div class="lc-title">${escapeHtml(it.title)}</div><div class="lc-desc">${escapeHtml(it.desc)}</div></div>
            ${sw}
          </div>`;
      });
      this.dom.launcherList.innerHTML = html || '<div class="empty-state">No matches found</div>';
      this.dom.launcherList.querySelectorAll('.lc-item').forEach((el) => {
        el.addEventListener('mouseenter', () => {
          const it = this.state.launcher.items[Number(el.dataset.lidx)];
          if (it && it.themeId) window.SqlThemes.setTheme(it.themeId, true);
        });
        el.addEventListener('click', () => {
          const it = this.state.launcher.items[Number(el.dataset.lidx)];
          if (it) { this.state.launcher.backupTheme = null; this.closeAllModals(); it.run(); }
        });
      });
    }

    openAetherModal() {
      this.closeAllModals();
      this._syncAetherUI();
      this.dom.aetherModal.classList.remove('hidden');
    }

    _syncAetherUI() {
      const s = window.SqlThemes.getState();
      const grid = document.getElementById('aetherThemeGrid');
      grid.innerHTML = Object.entries(window.SqlThemes.THEMES)
        .map(([id, t]) => `
          <button class="aether-card${id === s.theme ? ' active' : ''}" data-ae-theme="${id}">
            <div class="aether-swatches">${t.swatches.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
            <div class="aether-name">${escapeHtml(t.name)}</div>
          </button>`).join('');
      grid.querySelectorAll('[data-ae-theme]').forEach((b) => {
        b.addEventListener('click', () => { window.SqlThemes.setTheme(b.dataset.aeTheme); this._syncAetherUI(); });
      });

      const wpRow = document.getElementById('aetherWpRow');
      wpRow.innerHTML = window.SqlThemes.WALLPAPERS
        .map((w) => `<button class="pane-mini-btn${w.id === s.wallpaper ? ' active-pill' : ''}" data-ae-wp="${w.id}">${escapeHtml(w.name)}</button>`)
        .join('');
      wpRow.querySelectorAll('[data-ae-wp]').forEach((b) => {
        b.addEventListener('click', () => { window.SqlThemes.setWallpaper(b.dataset.aeWp); this._syncAetherUI(); });
      });

      document.getElementById('aeOpacity').value = Math.round(s.glassOpacity * 100);
      document.getElementById('aeOpacityVal').textContent = `${Math.round(s.glassOpacity * 100)}%`;
      document.getElementById('aeBlur').value = s.blur;
      document.getElementById('aeBlurVal').textContent = `${s.blur}px`;
      document.getElementById('aeGap').value = s.gap;
      document.getElementById('aeGapVal').textContent = `${s.gap}px`;
      document.getElementById('aeRadius').value = s.radius;
      document.getElementById('aeRadiusVal').textContent = `${s.radius}px`;
      document.getElementById('aeFontSize').value = s.fontSize;
      document.getElementById('aeFontSizeVal').textContent = `${s.fontSize}px`;
      document.getElementById('aeAccentColor').value = s.accentOverride || window.SqlThemes.THEMES[s.theme].vars['--accent'];
    }

    openImportModal() {
      this.closeAllModals();
      this.dom.importModal.classList.remove('hidden');
      document.getElementById('importTextarea').focus();
    }

    async openCookbook() {
      this.closeAllModals();
      if (!this.state.cookbook.length) {
        const data = await this.apiFetch('/api/cookbook');
        this.state.cookbook = data.items || [];
      }
      const list = document.getElementById('cookbookList');
      list.innerHTML = this.state.cookbook
        .map((c, i) => `
          <div class="cb-card" data-cb="${i}">
            <div class="cb-hdr"><span class="cb-title">${escapeHtml(c.title)}</span><span class="cb-badge">${escapeHtml(c.category)} · ${escapeHtml(c.db)}</span></div>
            <div class="cb-desc">${escapeHtml(c.desc)}</div>
            <pre class="cb-sql">${escapeHtml(c.sql)}</pre>
          </div>`).join('');
      list.querySelectorAll('.cb-card').forEach((card) => {
        card.addEventListener('click', async () => {
          const item = this.state.cookbook[Number(card.dataset.cb)];
          this.closeAllModals();
          if (item.db && item.db !== this.state.currentDb) {
            this.state.currentDb = item.db;
            this.dom.dbSelect.value = item.db;
            await this.loadSchema();
          }
          this.setEditorSql(item.sql, `${item.id}.sql`);
          this.setPrimaryMode('sql');
          this.runQuery();
        });
      });
      this.dom.cookbookModal.classList.remove('hidden');
    }

    async openHistoryModal(q = '') {
      this.closeAllModals();
      this.dom.historyModal.classList.remove('hidden');
      const input = document.getElementById('historySearchInput');
      input.value = q;
      await this._fetchHistory(q);
      input.focus();
    }

    async _fetchHistory(q = '') {
      const data = await this.apiFetch(`/api/history?q=${encodeURIComponent(q)}`);
      const list = document.getElementById('historyList');
      const items = data.items || [];
      if (!items.length) { list.innerHTML = '<div class="empty-state">No query history yet.</div>'; return; }
      list.innerHTML = items
        .map((h, i) => `
          <div class="hist-row" data-hidx="${i}">
            <div class="hist-sql">${escapeHtml(h.sql.replace(/\s+/g, ' '))}</div>
            <div class="hist-meta">
              <span class="${h.ok ? 'hist-ok' : 'hist-err'}">${h.ok ? `✓ ${h.rowCount} rows` : '✗ Error'}</span>
              <span>${escapeHtml(h.db)}</span>
              <span>${h.durationMs} ms</span>
            </div>
          </div>`).join('');
      list.querySelectorAll('.hist-row').forEach((row) => {
        row.addEventListener('click', () => {
          const it = items[Number(row.dataset.hidx)];
          this.closeAllModals();
          this.setEditorSql(it.sql);
          this.setPrimaryMode('sql');
          this.runQuery();
        });
      });
    }

    _readConnForm() {
      return {
        name: document.getElementById('cfName').value.trim(),
        host: document.getElementById('cfHost').value.trim() || '127.0.0.1',
        port: parseInt(document.getElementById('cfPort').value, 10) || 3306,
        user: document.getElementById('cfUser').value.trim() || 'root',
        password: document.getElementById('cfPass').value,
        database: document.getElementById('cfDb').value.trim(),
        ssl: document.getElementById('cfSsl').checked,
      };
    }

    async openConnectionsModal() {
      this.closeAllModals();
      this.dom.connectionsModal.classList.remove('hidden');
      document.getElementById('cfTestResult').textContent = '';
      const st = await this.apiFetch('/api/mysql/status');
      document.getElementById('startXamppBtn').classList.toggle('hidden', !st.hasXampp);
      const list = document.getElementById('connProfilesList');
      const profiles = st.profiles || [];
      list.innerHTML = profiles.length
        ? profiles
            .map(
              (p) => `
          <div class="hist-row" style="flex-direction:row;align-items:center;justify-content:space-between">
            <div>
              <strong>${escapeHtml(p.name)}</strong>
              <div class="muted" style="font-size:11px;font-family:var(--font-mono)">${escapeHtml(p.user)}@${escapeHtml(p.host)}:${p.port}${p.ssl ? ' (SSL)' : ''}</div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="wb-run-btn" data-connect-pid="${escapeHtml(p.id)}">Connect Live</button>
              <button class="pma-row-btn danger" data-del-pid="${escapeHtml(p.id)}">${I.trash(13)}</button>
            </div>
          </div>`
            )
            .join('')
        : '<div class="muted">No saved MySQL profiles yet. Add one below.</div>';

      list.querySelectorAll('[data-connect-pid]').forEach((b) => {
        b.addEventListener('click', () => {
          const p = profiles.find((x) => x.id === b.dataset.connectPid);
          if (p) this.connectMysqlProfile(p);
        });
      });
      list.querySelectorAll('[data-del-pid]').forEach((b) => {
        b.addEventListener('click', async () => {
          await this.apiFetch('/api/mysql/profiles/delete', { method: 'POST', body: JSON.stringify({ id: b.dataset.delPid }) });
          this.openConnectionsModal();
        });
      });
    }

    async connectMysqlProfile(profile) {
      const test = await this.apiFetch('/api/mysql/test', { method: 'POST', body: JSON.stringify({ id: profile.id }) });
      if (!test || !test.ok) return;
      this.state.connId = profile.id;
      this.state.connName = `${profile.name} (${String(test.version).split('-')[0]})`;
      this.state.currentDb = test.currentDb || '';
      this.dom.connLabel.textContent = this.state.connName;
      this.closeAllModals();
      await this.loadDatabases();
      await this.loadSchema();
      this.toast(`Connected to live MySQL ${test.version}`);
    }

    async openBookmarksModal(q = '') {
      this.closeAllModals();
      this.dom.bookmarksModal.classList.remove('hidden');
      const input = document.getElementById('bookmarkSearchInput');
      input.value = q;
      await this._fetchBookmarks(q);
      input.focus();
    }

    async _fetchBookmarks(q = '') {
      const data = await this.apiFetch(`/api/bookmarks?q=${encodeURIComponent(q)}`);
      const list = document.getElementById('bookmarksList');
      const items = data.items || [];
      if (!items.length) { list.innerHTML = '<div class="empty-state">No saved bookmarks yet. Click Save in the SQL Editor to bookmark any query.</div>'; return; }
      list.innerHTML = items
        .map((b) => `
          <div class="cb-card" data-bmid="${escapeHtml(b.id)}">
            <div class="cb-hdr">
              <span class="cb-title">${escapeHtml(b.title)}</span>
              <div style="display:flex;gap:6px;align-items:center">
                <span class="cb-badge">${escapeHtml(b.tag)} · ${escapeHtml(b.db)}</span>
                <button class="pma-row-btn danger bm-del" data-del-bm="${escapeHtml(b.id)}">${I.trash(13)}</button>
              </div>
            </div>
            <pre class="cb-sql">${escapeHtml(b.sql)}</pre>
          </div>`).join('');

      list.querySelectorAll('.cb-card').forEach((card) => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.bm-del')) return;
          const b = items.find((x) => x.id === card.dataset.bmid);
          if (!b) return;
          this.closeAllModals();
          this.setEditorSql(b.sql, `${b.title}.sql`);
          this.setPrimaryMode('sql');
          this.runQuery();
        });
      });
      list.querySelectorAll('.bm-del').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.apiFetch('/api/bookmarks/delete', { method: 'POST', body: JSON.stringify({ id: btn.dataset.delBm }) });
          this.toast('Deleted bookmark');
          this._fetchBookmarks(document.getElementById('bookmarkSearchInput').value);
        });
      });
    }

    // =========================================================================
    // Event Binding
    // =========================================================================
    _bindEvents() {
      // Primary navigation rail tabs
      this.dom.pmaModeBar.querySelectorAll('[data-mode]').forEach((btn) => {
        btn.addEventListener('click', () => this.setPrimaryMode(btn.dataset.mode));
      });

      // Collapsible Schema Sidebar Toggle
      document.getElementById('toggleSchemaBtn').addEventListener('click', () => {
        const sp = document.getElementById('schemaPane');
        const gh = document.getElementById('gutterH');
        const hidden = sp.classList.toggle('hidden');
        gh.classList.toggle('hidden', hidden);
      });

      // Connections Manager Modal
      document.getElementById('connectionsBtn').addEventListener('click', () => this.openConnectionsModal());
      document.getElementById('useBuiltinConnBtn').addEventListener('click', async () => {
        this.state.connId = 'builtin';
        this.state.connName = 'Built-in (MySQL 9.7)';
        this.state.currentDb = 'ecommerce.db';
        this.dom.connLabel.textContent = this.state.connName;
        this.closeAllModals();
        await this.loadDatabases();
        await this.loadSchema();
        this.toast('Switched to Built-in Engine (SQLite 3 + MySQL 9.7 Compat)');
      });
      document.getElementById('startXamppBtn').addEventListener('click', async () => {
        const r = await this.apiFetch('/api/mysql/start-xampp', { method: 'POST', body: '{}' });
        if (r && r.ok) this.toast(r.message);
      });
      document.getElementById('cfTestBtn').addEventListener('click', async () => {
        const resEl = document.getElementById('cfTestResult');
        resEl.textContent = 'Testing MySQL connection...';
        const r = await this.apiFetch('/api/mysql/test', {
          method: 'POST',
          silentError: true,
          body: JSON.stringify(this._readConnForm()),
        });
        if (r && r.ok) {
          resEl.innerHTML = `<span class="hist-ok">✓ Connected! Server: ${escapeHtml(r.version)} (${r.latencyMs} ms) · ${r.databases.length} database(s)</span>`;
        } else {
          resEl.innerHTML = `<span class="hist-err">✗ ${escapeHtml(r?.error || 'Connection failed')}</span>`;
        }
      });
      document.getElementById('cfSaveConnectBtn').addEventListener('click', async () => {
        const cfg = this._readConnForm();
        const saved = await this.apiFetch('/api/mysql/profiles', { method: 'POST', body: JSON.stringify(cfg) });
        if (saved && saved.ok) {
          await this.connectMysqlProfile(saved.profile);
        }
      });

      // Bookmarks triggers
      document.getElementById('bookmarksBtn').addEventListener('click', () => this.openBookmarksModal());
      document.getElementById('bookmarkSearchInput').addEventListener('input', (e) => this._fetchBookmarks(e.target.value));
      document.getElementById('saveBookmarkBtn').addEventListener('click', async () => {
        const sql = this.dom.sqlInput.value.trim();
        if (!sql) { this.toast('Write a SQL query first to bookmark it', true); return; }
        const title = prompt('Bookmark name:', this.getActiveTab().title.replace(/\.sql$/i, ''));
        if (!title || !title.trim()) return;
        const r = await this.apiFetch('/api/bookmarks', {
          method: 'POST',
          body: JSON.stringify({ title: title.trim(), tag: 'Saved', db: this.state.currentDb, sql }),
        });
        if (r && r.ok) this.toast(`Bookmarked "${title.trim()}"`);
      });

      // Quick SQL template chips
      document.querySelectorAll('.q-chip[data-snip]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tbl = this.state.selectedTable || 'customers';
          const tblObj = (this.state.schema?.tables || []).find((t) => t.name === tbl);
          const cols = (tblObj?.columns || []).filter((c) => !(c.pk && /INT/i.test(c.type || ''))).map((c) => c.name);
          const snip = btn.dataset.snip;
          let sql = '';
          if (snip === 'show') sql = 'SHOW TABLES;';
          else if (snip === 'select') sql = `SELECT * FROM "${tbl}" LIMIT 50;`;
          else if (snip === 'desc') sql = `DESCRIBE "${tbl}";`;
          else if (snip === 'insert') sql = `INSERT INTO "${tbl}" (${cols.join(', ')}) VALUES (${cols.map(() => "''").join(', ')});`;
          else if (snip === 'update') sql = `UPDATE "${tbl}" SET ${cols[0] || 'col'} = '' WHERE id = 1;`;
          else if (snip === 'delete') sql = `DELETE FROM "${tbl}" WHERE id = 1;`;
          this.setEditorSql(sql);
          if (snip === 'show' || snip === 'select' || snip === 'desc') this.runQuery();
          else this.dom.sqlInput.focus();
        });
      });

      // Editor input & keybindings
      const inp = this.dom.sqlInput;
      inp.addEventListener('input', () => {
        this.getActiveTab().sql = inp.value;
        this._saveTabs();
        this.renderEditorHighlight();
        this.updateGutterAndCursor();
        const before = inp.value.slice(0, inp.selectionStart);
        if (/[A-Za-z0-9_]\.$/.test(before)) this.triggerAutocomplete(true);
        else if (this.state.ac.open) this.triggerAutocomplete(false);
      });
      inp.addEventListener('scroll', () => {
        this.dom.editorHighlight.scrollTop = inp.scrollTop;
        this.dom.editorHighlight.scrollLeft = inp.scrollLeft;
        this.dom.editorGutter.scrollTop = inp.scrollTop;
      });
      inp.addEventListener('keyup', (e) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) this.updateGutterAndCursor();
      });
      inp.addEventListener('click', () => { this.closeAutocomplete(); this.updateGutterAndCursor(); });
      inp.addEventListener('keydown', (e) => {
        if (this.state.ac.open) {
          if (e.key === 'ArrowDown') { e.preventDefault(); this.state.ac.selectedIdx = (this.state.ac.selectedIdx + 1) % this.state.ac.items.length; this.renderAutocomplete(); return; }
          if (e.key === 'ArrowUp') { e.preventDefault(); this.state.ac.selectedIdx = (this.state.ac.selectedIdx - 1 + this.state.ac.items.length) % this.state.ac.items.length; this.renderAutocomplete(); return; }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.applyAutocomplete(this.state.ac.items[this.state.ac.selectedIdx]); return; }
          if (e.key === 'Escape') { e.preventDefault(); this.closeAutocomplete(); return; }
        }
        if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); this.runQuery(e.shiftKey); return; }
        if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); this.triggerAutocomplete(true); return; }
        if (e.key === 'Tab') { e.preventDefault(); this.insertAtCursor('  '); }
      });

      // Global shortcuts
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { this.closeAllModals(); this.closeAutocomplete(); return; }
        if ((e.altKey && e.code === 'Space') || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
          e.preventDefault();
          if (this.state.launcher.open) this.closeAllModals(); else this.openLauncher();
        } else if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'r') {
          e.preventDefault();
          this.openHistoryModal();
        } else if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'e') {
          e.preventDefault();
          this.runExplain();
        } else if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'f') {
          e.preventDefault();
          this.setEditorSql(formatSql(this.dom.sqlInput.value));
          this.toast('Formatted SQL');
        } else if (e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          this.openAetherModal();
        } else if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'w') {
          e.preventDefault();
          const w = window.SqlThemes.setWallpaper('next');
          this.toast(`Wallpaper: ${w.name}`);
        } else if (e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          this.closeAllModals();
          this.dom.hotkeysModal.classList.remove('hidden');
        }
      });

      // Top Bar buttons
      document.getElementById('launcherTrigger').addEventListener('click', () => this.openLauncher());
      document.getElementById('runBtn').addEventListener('click', () => this.runQuery(false));
      document.getElementById('runSelBtn').addEventListener('click', () => this.runQuery(true));
      document.getElementById('formatBtn').addEventListener('click', () => { this.setEditorSql(formatSql(this.dom.sqlInput.value)); this.toast('Formatted SQL'); });
      document.getElementById('explainBtn').addEventListener('click', () => this.runExplain());
      document.getElementById('cookbookBtn').addEventListener('click', () => this.openCookbook());
      document.getElementById('historyBtn').addEventListener('click', () => this.openHistoryModal());
      document.getElementById('themeQuickBtn').addEventListener('click', () => this.openAetherModal());
      document.getElementById('wallpaperBtn').addEventListener('click', () => { const w = window.SqlThemes.setWallpaper('next'); this.toast(`Wallpaper: ${w.name}`); });
      document.getElementById('hotkeysBtn').addEventListener('click', () => { this.closeAllModals(); this.dom.hotkeysModal.classList.remove('hidden'); });
      document.getElementById('newTableTopBtn').addEventListener('click', () => this.openCreateTableModal());
      document.getElementById('newTableSideBtn').addEventListener('click', () => this.openCreateTableModal());
      document.getElementById('importBtn').addEventListener('click', () => this.openImportModal());
      document.getElementById('exportDbBtn').addEventListener('click', () => {
        window.location.href = `/api/export/sql?db=${encodeURIComponent(this.state.currentDb)}`;
        this.toast(`Exporting ${this.state.currentDb} SQL dump`);
      });
      document.getElementById('refreshSchemaBtn').addEventListener('click', () => { this.loadSchema(); this.toast('Schema refreshed'); });
      document.getElementById('newTabBtn').addEventListener('click', () => this.createTab());
      document.getElementById('clearEditorBtn').addEventListener('click', () => this.setEditorSql(''));
      this.dom.schemaSearch.addEventListener('input', () => this.renderSchemaTree());

      this.dom.dbSelect.addEventListener('change', async () => {
        this.state.currentDb = this.dom.dbSelect.value;
        this.state.selectedTable = null;
        this.state.lastResponse = null;
        await this.loadSchema();
        if (this.state.primaryMode !== 'sql') this.renderActivePmaStage();
        this.toast(`Switched to ${this.state.currentDb}`);
      });

      document.getElementById('newDbBtn').addEventListener('click', async () => {
        const name = prompt('New database name (e.g. school.db):');
        if (!name || !name.trim()) return;
        const r = await this.apiFetch('/api/databases', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
        if (r && r.ok) {
          this.state.currentDb = r.name;
          this.state.selectedTable = null;
          this.applyDatabasesList(r.databases);
          await this.loadSchema();
          this.toast(`Created database ${r.name}`);
        }
      });

      // Output tabs & exports
      this.dom.viewTabs.querySelectorAll('.view-tab').forEach((btn) => {
        btn.addEventListener('click', () => this.setOutputView(btn.dataset.view));
      });
      this.dom.resultFilter.addEventListener('input', () => { this.state.filterText = this.dom.resultFilter.value; this.renderOutput(); });
      document.getElementById('expCsvBtn').addEventListener('click', () => this.exportResults('csv'));
      document.getElementById('expJsonBtn').addEventListener('click', () => this.exportResults('json'));
      document.getElementById('expMdBtn').addEventListener('click', () => this.exportResults('md'));
      document.getElementById('expSqlBtn').addEventListener('click', () => this.exportResults('sql'));

      // Create Table Modal events
      document.getElementById('ctTableName').addEventListener('input', () => this._updateCreateTablePreview());
      document.getElementById('ctAddColBtn').addEventListener('click', () => {
        this.state.ctCols.push({ name: `col_${this.state.ctCols.length + 1}`, type: 'TEXT', pk: false, ai: false, notnull: false, unique: false, defaultVal: '' });
        this._renderCreateTableRows();
      });
      document.getElementById('ctSubmitBtn').addEventListener('click', async () => {
        const name = document.getElementById('ctTableName').value.trim();
        if (!name) { this.toast('Enter a table name', true); return; }
        const r = await this.apiFetch('/api/table/create', {
          method: 'POST',
          body: JSON.stringify({ db: this.state.currentDb, name, columns: this.state.ctCols }),
        });
        if (r && r.ok) {
          this.closeAllModals();
          this.state.selectedTable = r.table;
          this.applySchemaUpdate(r.schema);
          this.toast(`Created table "${r.table}"`);
          this.setPrimaryMode('structure');
        }
      });

      // Import Modal events
      const importFmt = document.getElementById('importFormat');
      const importTblWrap = document.getElementById('importTblWrap');
      importFmt.addEventListener('change', () => {
        importTblWrap.classList.toggle('hidden', importFmt.value === 'sql');
      });
      document.getElementById('importFileInput').addEventListener('change', async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const lower = f.name.toLowerCase();
        importFmt.value = lower.endsWith('.sql') ? 'sql' : lower.endsWith('.json') ? 'json' : 'csv';
        importTblWrap.classList.toggle('hidden', importFmt.value === 'sql');
        document.getElementById('importTableName').value = f.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '_');
        document.getElementById('importTextarea').value = await f.text();
      });
      document.getElementById('importSampleBtn').addEventListener('click', () => {
        importFmt.value = 'csv';
        importTblWrap.classList.remove('hidden');
        document.getElementById('importTableName').value = 'world_cities';
        document.getElementById('importTextarea').value =
          'city,country,population,tech_index\nTokyo,Japan,13960000,96.4\nBengaluru,India,13193000,94.8\nSan Francisco,USA,873965,98.1\nStockholm,Sweden,975551,93.2\nBerlin,Germany,3645000,91.5\nSeoul,South Korea,9776000,95.7';
      });
      document.getElementById('importSubmitBtn').addEventListener('click', async () => {
        const format = importFmt.value;
        const table = document.getElementById('importTableName').value.trim() || 'imported_data';
        const data = document.getElementById('importTextarea').value;
        const r = await this.apiFetch('/api/import', {
          method: 'POST',
          body: JSON.stringify({ db: this.state.currentDb, table, format, data }),
        });
        if (r && r.ok) {
          this.closeAllModals();
          if (r.db) this.state.currentDb = r.db;
          if (r.databases) this.applyDatabasesList(r.databases);
          if (r.schema) this.applySchemaUpdate(r.schema);
          if (format === 'sql') {
            this.toast(`Executed ${r.statementsRun} SQL statement(s)`);
          } else {
            this.state.selectedTable = r.table;
            this.toast(`Imported ${r.rowCount} rows into "${r.table}"`);
            this.setPrimaryMode('browse');
          }
        }
      });

      // Launcher keyboard
      this.dom.launcherInput.addEventListener('input', () => this._filterLauncher(this.dom.launcherInput.value));
      this.dom.launcherInput.addEventListener('keydown', (e) => {
        const list = this.state.launcher.items;
        if (e.key === 'ArrowDown' && list.length) {
          e.preventDefault();
          this.state.launcher.selectedIdx = (this.state.launcher.selectedIdx + 1) % list.length;
          const it = list[this.state.launcher.selectedIdx];
          if (it && it.themeId) window.SqlThemes.setTheme(it.themeId, true);
          this._renderLauncher();
        } else if (e.key === 'ArrowUp' && list.length) {
          e.preventDefault();
          this.state.launcher.selectedIdx = (this.state.launcher.selectedIdx - 1 + list.length) % list.length;
          const it = list[this.state.launcher.selectedIdx];
          if (it && it.themeId) window.SqlThemes.setTheme(it.themeId, true);
          this._renderLauncher();
        } else if (e.key === 'Enter' && list[this.state.launcher.selectedIdx]) {
          e.preventDefault();
          const it = list[this.state.launcher.selectedIdx];
          this.state.launcher.backupTheme = null;
          this.closeAllModals();
          it.run();
        }
      });

      // Aether Sliders
      document.getElementById('aeOpacity').addEventListener('input', (e) => { document.getElementById('aeOpacityVal').textContent = `${e.target.value}%`; window.SqlThemes.updateAether({ glassOpacity: Number(e.target.value) / 100 }); });
      document.getElementById('aeBlur').addEventListener('input', (e) => { document.getElementById('aeBlurVal').textContent = `${e.target.value}px`; window.SqlThemes.updateAether({ blur: Number(e.target.value) }); });
      document.getElementById('aeGap').addEventListener('input', (e) => { document.getElementById('aeGapVal').textContent = `${e.target.value}px`; window.SqlThemes.updateAether({ gap: Number(e.target.value) }); });
      document.getElementById('aeRadius').addEventListener('input', (e) => { document.getElementById('aeRadiusVal').textContent = `${e.target.value}px`; window.SqlThemes.updateAether({ radius: Number(e.target.value) }); });
      document.getElementById('aeFontSize').addEventListener('input', (e) => { document.getElementById('aeFontSizeVal').textContent = `${e.target.value}px`; window.SqlThemes.updateAether({ fontSize: Number(e.target.value) }); });
      document.getElementById('aeAccentColor').addEventListener('input', (e) => window.SqlThemes.updateAether({ accentOverride: e.target.value }));
      document.getElementById('aeResetBtn').addEventListener('click', () => { window.SqlThemes.resetAether(); this._syncAetherUI(); this.toast('Reset Aether defaults'); });

      // Modal Closes & Backdrops
      ['aetherCloseBtn', 'importCloseBtn', 'cookbookCloseBtn', 'historyCloseBtn', 'hotkeysCloseBtn', 'cellCloseBtn', 'ctCloseBtn', 'rowEditCloseBtn', 'bookmarksCloseBtn', 'connCloseBtn'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', () => this.closeAllModals());
      });
      [
        this.dom.launcherModal,
        this.dom.aetherModal,
        this.dom.importModal,
        this.dom.cookbookModal,
        this.dom.historyModal,
        this.dom.hotkeysModal,
        this.dom.cellModal,
        this.dom.createTableModal,
        this.dom.rowEditModal,
        this.dom.bookmarksModal,
        this.dom.connectionsModal,
      ].forEach((m) => {
        if (m) m.addEventListener('click', (e) => { if (e.target === m) this.closeAllModals(); });
      });

      document.getElementById('historySearchInput').addEventListener('input', (e) => this._fetchHistory(e.target.value));
      document.getElementById('historyClearBtn').addEventListener('click', async () => {
        await this.apiFetch('/api/history/clear', { method: 'POST' });
        this._fetchHistory('');
        this.toast('Cleared query history');
      });
      document.getElementById('cellCopyBtn').addEventListener('click', () => {
        this.safeCopy(document.getElementById('cellModalBody').textContent || '');
        this.toast('Copied value to clipboard');
      });
    }

    async _boot() {
      this.renderTabs();
      this.dom.sqlInput.value = this.getActiveTab().sql || '';
      this.updateGutterAndCursor();
      await this.loadDatabases();
      await this.loadSchema();
      if (this.dom.sqlInput.value.trim()) {
        await this.runQuery(false);
      }
    }
  }

  window.sqlStudio = new EkoniSqlStudio();
})();

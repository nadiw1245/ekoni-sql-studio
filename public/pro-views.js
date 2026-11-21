(function (global) {
  'use strict';

  const { escapeHtml, highlightSql } = global.SqlEditorCore;
  const I = global.SqlIcons;

  function fmtBytes(b) {
    if (!b || b <= 0) return '0 KB';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  }

  class ProViews {
    constructor(studio) {
      this.studio = studio;
      this.qbState = {
        table: null,
        selectedCols: new Set(),
        joins: [], // [{ table, localCol, foreignCol }]
        where: [], // [{ col, op, val }]
        aggFunc: '',
        aggCol: '',
        groupBy: '',
        orderBy: '',
        orderDir: 'DESC',
        limit: '50',
      };
      this.codegenTab = 'typescript';
    }

    // =========================================================================
    // 1. OVERVIEW DASHBOARD (Startup KPIs + phpMyAdmin Tables Matrix + PRAGMAs)
    // =========================================================================
    async renderOverview(container) {
      const db = this.studio.state.currentDb;
      const data = await this.studio.apiFetch(`/api/overview?db=${encodeURIComponent(db)}`);
      if (!data || !data.ok) {
        container.innerHTML = '<div class="empty-state">Unable to load database overview.</div>';
        return;
      }

      const tblRows = (data.tables || [])
        .map(
          (t) => `
        <tr>
          <td><strong class="ov-tbl-link" data-ov-browse="${escapeHtml(t.name)}">${I.table(13)} ${escapeHtml(t.name)}</strong></td>
          <td class="cell-num">${t.rows.toLocaleString()}</td>
          <td class="cell-num">${t.columns}</td>
          <td class="cell-num">${t.indexes}</td>
          <td class="cell-num">${t.foreignKeys}</td>
          <td class="cell-num">${t.triggers}</td>
          <td class="ov-actions-cell">
            <button class="pane-mini-btn" data-ov-browse="${escapeHtml(t.name)}">${I.browse(12)} Browse</button>
            <button class="pane-mini-btn" data-ov-struct="${escapeHtml(t.name)}">${I.structure(12)} Structure</button>
            <button class="pane-mini-btn" data-ov-prof="${escapeHtml(t.name)}">${I.profiler(12)} Profile</button>
            <button class="pane-mini-btn" data-ov-api="${escapeHtml(t.name)}">${I.api(12)} API</button>
          </td>
        </tr>`
        )
        .join('');

      const fkOn = Boolean(data.pragmas.foreign_keys);
      const jm = String(data.pragmas.journal_mode || 'delete').toUpperCase();

      container.innerHTML = `
        <div class="pma-context-bar">
          <div class="pma-ctx-left">
            <span class="pma-ctx-icon">${I.home(15)}</span>
            <strong>${escapeHtml(data.db)}</strong>
            <span class="pma-ctx-sub">SQLite ${escapeHtml(data.sqliteVersion)} · phpMyAdmin Universal Engine</span>
          </div>
          <div class="pma-ctx-right">
            <button class="wb-run-btn ov-new-tbl">${I.plus(13)} Create Table</button>
            <button class="pane-mini-btn ov-import">${I.upload(13)} Import Data</button>
            <button class="pane-mini-btn ov-export">${I.download(13)} Export .sql</button>
          </div>
        </div>
        <div class="pma-scroll-body pma-padded">
          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-icon">${I.table(18)}</div>
              <div class="kpi-meta"><div class="kpi-val">${data.tableCount}</div><div class="kpi-lbl">Tables · ${data.viewCount} Views</div></div>
            </div>
            <div class="kpi-card">
              <div class="kpi-icon">${I.browse(18)}</div>
              <div class="kpi-meta"><div class="kpi-val">${data.totalRows.toLocaleString()}</div><div class="kpi-lbl">Total Records</div></div>
            </div>
            <div class="kpi-card">
              <div class="kpi-icon">${I.key(18)}</div>
              <div class="kpi-meta"><div class="kpi-val">${data.indexCount}</div><div class="kpi-lbl">Indexes · ${data.relationCount} Relations</div></div>
            </div>
            <div class="kpi-card">
              <div class="kpi-icon">${I.database(18)}</div>
              <div class="kpi-meta"><div class="kpi-val">${data.isMemory ? 'RAM' : fmtBytes(data.sizeBytes)}</div><div class="kpi-lbl">${data.databaseCount} Databases · ${data.triggerCount} Triggers</div></div>
            </div>
          </div>

          <div class="pma-card">
            <div class="pma-card-hdr">
              <span>${I.table(14)} Database Tables Overview</span>
              <span class="muted">Click any table to browse, inspect structure, profile, or generate APIs</span>
            </div>
            <div style="overflow:auto">
              <table class="sql-table">
                <thead>
                  <tr><th>Table</th><th class="cell-num">Rows</th><th class="cell-num">Cols</th><th class="cell-num">Indexes</th><th class="cell-num">FKs</th><th class="cell-num">Triggers</th><th>Quick Actions</th></tr>
                </thead>
                <tbody>${tblRows || '<tr><td colspan="7" class="empty-state">No tables yet. Click Create Table above.</td></tr>'}</tbody>
              </table>
            </div>
          </div>

          <div class="pma-card">
            <div class="pma-card-hdr">${I.sliders(14)} Engine Status & Live PRAGMA Controls</div>
            <div class="pragma-grid">
              <div class="pragma-pill">
                <span>Foreign Keys</span>
                <button class="pane-mini-btn${fkOn ? ' active-pill' : ''}" id="ovToggleFk">${fkOn ? 'ON ✓' : 'OFF'}</button>
              </div>
              <div class="pragma-pill">
                <span>Journal Mode</span>
                <button class="pane-mini-btn${jm === 'WAL' ? ' active-pill' : ''}" id="ovToggleWal">${escapeHtml(jm)} → ${jm === 'WAL' ? 'DELETE' : 'WAL'}</button>
              </div>
              <div class="pragma-pill"><span>Page Size</span><strong>${data.pragmas.page_size || 4096} B</strong></div>
              <div class="pragma-pill"><span>Page Count</span><strong>${data.pragmas.page_count || 0}</strong></div>
              <div class="pragma-pill"><span>Compatibility</span><strong class="hist-ok">MySQL · phpMyAdmin · SQLite</strong></div>
            </div>
          </div>
        </div>`;

      container.querySelector('.ov-new-tbl').addEventListener('click', () => this.studio.openCreateTableModal());
      container.querySelector('.ov-import').addEventListener('click', () => this.studio.openImportModal());
      container.querySelector('.ov-export').addEventListener('click', () => {
        window.location.href = `/api/export/sql?db=${encodeURIComponent(db)}`;
      });
      container.querySelectorAll('[data-ov-browse]').forEach((el) =>
        el.addEventListener('click', () => this.studio.selectTable(el.dataset.ovBrowse, true))
      );
      container.querySelectorAll('[data-ov-struct]').forEach((el) =>
        el.addEventListener('click', () => { this.studio.state.selectedTable = el.dataset.ovStruct; this.studio.renderSchemaTree(); this.studio.setPrimaryMode('structure'); })
      );
      container.querySelectorAll('[data-ov-prof]').forEach((el) =>
        el.addEventListener('click', () => { this.studio.state.selectedTable = el.dataset.ovProf; this.studio.renderSchemaTree(); this.studio.setPrimaryMode('profiler'); })
      );
      container.querySelectorAll('[data-ov-api]').forEach((el) =>
        el.addEventListener('click', () => { this.studio.state.selectedTable = el.dataset.ovApi; this.studio.renderSchemaTree(); this.studio.setPrimaryMode('api'); })
      );

      container.querySelector('#ovToggleFk').addEventListener('click', async () => {
        await this.studio.apiFetch('/api/pragma', { method: 'POST', body: JSON.stringify({ db, key: 'foreign_keys', value: fkOn ? 'OFF' : 'ON' }) });
        this.studio.toast(`PRAGMA foreign_keys = ${fkOn ? 'OFF' : 'ON'}`);
        this.renderOverview(container);
      });
      container.querySelector('#ovToggleWal').addEventListener('click', async () => {
        const next = jm === 'WAL' ? 'DELETE' : 'WAL';
        await this.studio.apiFetch('/api/pragma', { method: 'POST', body: JSON.stringify({ db, key: 'journal_mode', value: next }) });
        this.studio.toast(`PRAGMA journal_mode = ${next}`);
        this.renderOverview(container);
      });
    }

    // =========================================================================
    // 2. VISUAL NO-CODE QUERY BUILDER (Better than phpMyAdmin!)
    // =========================================================================
    _buildVisualSql() {
      const s = this.qbState;
      const schema = this.studio.state.schema;
      if (!schema || !s.table) return '-- Select a table to build a query visually';

      const baseAlias = s.table[0].toLowerCase();
      const selectParts = [];
      if (s.groupBy) selectParts.push(`${s.groupBy}`);
      if (s.aggFunc && s.aggCol) {
        selectParts.push(`${s.aggFunc}(${s.aggCol}) AS ${s.aggFunc.toLowerCase()}_${s.aggCol.replace(/[^A-Za-z0-9_]/g, '_')}`);
      }
      if (!selectParts.length) {
        const cols = Array.from(s.selectedCols);
        selectParts.push(...(cols.length ? cols.map((c) => `${baseAlias}.${c}`) : [`${baseAlias}.*`]));
      }

      let sql = `SELECT\n  ${selectParts.join(',\n  ')}\nFROM "${s.table}" ${baseAlias}`;

      s.joins.forEach((j, idx) => {
        const ja = `j${idx + 1}`;
        sql += `\nJOIN "${j.table}" ${ja} ON ${baseAlias}."${j.localCol}" = ${ja}."${j.foreignCol}"`;
      });

      const validWheres = s.where.filter((w) => w.col && (w.op === 'IS NULL' || w.op === 'IS NOT NULL' || w.val !== ''));
      if (validWheres.length) {
        const exprs = validWheres.map((w) => {
          if (w.op === 'IS NULL' || w.op === 'IS NOT NULL') return `${baseAlias}."${w.col}" ${w.op}`;
          if (w.op === 'LIKE %...%') return `${baseAlias}."${w.col}" LIKE '%${w.val.replace(/'/g, "''")}%'`;
          const valLit = /^-?\d+(\.\d+)?$/.test(w.val) ? w.val : `'${w.val.replace(/'/g, "''")}'`;
          return `${baseAlias}."${w.col}" ${w.op} ${valLit}`;
        });
        sql += `\nWHERE ${exprs.join('\n  AND ')}`;
      }

      if (s.groupBy) sql += `\nGROUP BY ${s.groupBy}`;
      if (s.orderBy) sql += `\nORDER BY ${s.orderBy} ${s.orderDir}`;
      if (s.limit) sql += `\nLIMIT ${parseInt(s.limit, 10) || 50}`;
      return sql + ';';
    }

    renderQueryBuilder(container) {
      const schema = this.studio.state.schema;
      const tables = schema?.tables || [];
      if (!tables.length) {
        container.innerHTML = '<div class="empty-state">Create a table first to use the Visual Query Builder.</div>';
        return;
      }

      if (!this.qbState.table || !tables.some((t) => t.name === this.qbState.table)) {
        this.qbState.table = this.studio.state.selectedTable && tables.some((t) => t.name === this.studio.state.selectedTable)
          ? this.studio.state.selectedTable
          : tables[0].name;
        this.qbState.selectedCols = new Set();
        this.qbState.joins = [];
        this.qbState.where = [];
        this.qbState.groupBy = '';
        this.qbState.aggFunc = '';
        this.qbState.aggCol = '';
        this.qbState.orderBy = '';
      }

      const tblObj = tables.find((t) => t.name === this.qbState.table);
      const baseAlias = tblObj.name[0].toLowerCase();
      const fkSuggestions = (tblObj.foreignKeys || []).filter((fk) => !this.qbState.joins.some((j) => j.table === fk.table && j.localCol === fk.from));
      const allAvailableCols = tblObj.columns.map((c) => `${baseAlias}.${c.name}`);
      this.qbState.joins.forEach((j, idx) => {
        const jt = tables.find((t) => t.name === j.table);
        (jt?.columns || []).forEach((c) => allAvailableCols.push(`j${idx + 1}.${c.name}`));
      });

      const generated = this._buildVisualSql();

      container.innerHTML = `
        <div class="pma-context-bar">
          <div class="pma-ctx-left">
            <span class="pma-ctx-icon">${I.builder(15)}</span>
            <strong>Visual No-Code Query Builder</strong>
            <span class="pma-ctx-sub">Click tables, auto-JOINs, filters & aggregations — generates live SQL</span>
          </div>
          <div class="pma-ctx-right">
            <button class="wb-run-btn qb-run-btn">${I.play(12)} Run Live Query</button>
            <button class="pane-mini-btn qb-open-console">${I.terminal(13)} Open in SQL Console</button>
          </div>
        </div>
        <div class="pma-scroll-body pma-padded">
          <div class="qb-grid">
            <div class="pma-card">
              <div class="pma-card-hdr">${I.table(14)} 1. Base Table & Columns</div>
              <select class="wb-select" id="qbTableSel">
                ${tables.map((t) => `<option value="${escapeHtml(t.name)}"${t.name === tblObj.name ? ' selected' : ''}>${escapeHtml(t.name)} (${t.rowCount} rows)</option>`).join('')}
              </select>
              <div class="qb-col-chips">
                ${tblObj.columns.map((c) => `
                  <label class="qb-chip${this.qbState.selectedCols.has(c.name) ? ' active' : ''}">
                    <input type="checkbox" data-qb-col="${escapeHtml(c.name)}" ${this.qbState.selectedCols.has(c.name) ? 'checked' : ''} />
                    <span>${escapeHtml(c.name)}</span>
                  </label>`).join('')}
              </div>
              ${
                fkSuggestions.length
                  ? `<div class="qb-fk-box">
                      <span class="muted" style="font-size:11px">Smart Auto-JOIN (from Foreign Keys):</span>
                      <div class="pma-inline-form">
                        ${fkSuggestions.map((fk, i) => `<button class="pane-mini-btn qb-add-fk" data-fk-i="${i}">${I.link(12)} JOIN ${escapeHtml(fk.table)} ON ${escapeHtml(fk.from)}</button>`).join('')}
                      </div>
                    </div>`
                  : ''
              }
              ${
                this.qbState.joins.length
                  ? `<div class="pma-inline-form">${this.qbState.joins.map((j, i) => `<span class="type-pill">JOIN ${escapeHtml(j.table)} <button class="pma-row-btn danger qb-rm-join" data-ji="${i}">✕</button></span>`).join('')}</div>`
                  : ''
              }
            </div>

            <div class="pma-card">
              <div class="pma-card-hdr">${I.sliders(14)} 2. Filter, Group, Aggregate & Sort</div>
              <div class="pma-inline-form">
                <label class="qb-lbl">Group By
                  <select class="wb-select" id="qbGroupSel"><option value="">(None)</option>${allAvailableCols.map((c) => `<option value="${escapeHtml(c)}"${c === this.qbState.groupBy ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
                </label>
                <label class="qb-lbl">Aggregate
                  <select class="wb-select" id="qbAggFn">
                    <option value="">(None)</option>
                    ${['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].map((f) => `<option${f === this.qbState.aggFunc ? ' selected' : ''}>${f}</option>`).join('')}
                  </select>
                </label>
                <label class="qb-lbl">Metric Col
                  <select class="wb-select" id="qbAggCol"><option value="*">*</option>${allAvailableCols.map((c) => `<option value="${escapeHtml(c)}"${c === this.qbState.aggCol ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
                </label>
              </div>
              <div class="pma-inline-form">
                <label class="qb-lbl">Order By
                  <select class="wb-select" id="qbOrderCol"><option value="">(Default)</option>${allAvailableCols.map((c) => `<option value="${escapeHtml(c)}"${c === this.qbState.orderBy ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
                </label>
                <select class="wb-select" id="qbOrderDir"><option value="DESC"${this.qbState.orderDir === 'DESC' ? ' selected' : ''}>DESC</option><option value="ASC"${this.qbState.orderDir === 'ASC' ? ' selected' : ''}>ASC</option></select>
                <label class="qb-lbl">Limit <input type="number" class="mini-input" id="qbLimit" value="${escapeHtml(this.qbState.limit)}" style="width:74px" /></label>
                <button class="pane-mini-btn" id="qbAddWhereBtn">${I.plus(12)} Add Filter</button>
              </div>
              <div id="qbWhereList">
                ${this.qbState.where.map((w, i) => `
                  <div class="pma-inline-form" style="margin-top:5px">
                    <select class="wb-select" data-wi="${i}" data-wf="col">${tblObj.columns.map((c) => `<option value="${escapeHtml(c.name)}"${c.name === w.col ? ' selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select>
                    <select class="wb-select" data-wi="${i}" data-wf="op">${['=', '!=', 'LIKE %...%', '>', '>=', '<', '<=', 'IS NULL', 'IS NOT NULL'].map((op) => `<option${op === w.op ? ' selected' : ''}>${op}</option>`).join('')}</select>
                    <input type="text" class="mini-input" data-wi="${i}" data-wf="val" value="${escapeHtml(w.val)}" placeholder="value..." />
                    <button class="pma-row-btn danger" data-wrm="${i}">${I.trash(13)}</button>
                  </div>`).join('')}
              </div>
            </div>
          </div>

          <div class="pma-card">
            <div class="pma-card-hdr">${I.code(14)} Live Generated SQL</div>
            <pre class="pma-ddl-pre" id="qbLiveSql">${highlightSql(generated, schema)}</pre>
          </div>

          <div id="qbResultsArea"></div>
        </div>`;

      const refreshPreview = () => {
        container.querySelector('#qbLiveSql').innerHTML = highlightSql(this._buildVisualSql(), schema);
      };

      container.querySelector('#qbTableSel').addEventListener('change', (e) => {
        this.qbState.table = e.target.value;
        this.qbState.selectedCols = new Set();
        this.qbState.joins = [];
        this.qbState.where = [];
        this.qbState.groupBy = '';
        this.qbState.orderBy = '';
        this.renderQueryBuilder(container);
      });
      container.querySelectorAll('[data-qb-col]').forEach((chk) => {
        chk.addEventListener('change', () => {
          if (chk.checked) this.qbState.selectedCols.add(chk.dataset.qbCol);
          else this.qbState.selectedCols.delete(chk.dataset.qbCol);
          chk.closest('.qb-chip').classList.toggle('active', chk.checked);
          refreshPreview();
        });
      });
      container.querySelectorAll('.qb-add-fk').forEach((btn) => {
        btn.addEventListener('click', () => {
          const fk = fkSuggestions[Number(btn.dataset.fkI)];
          if (fk) {
            this.qbState.joins.push({ table: fk.table, localCol: fk.from, foreignCol: fk.to });
            this.renderQueryBuilder(container);
          }
        });
      });
      container.querySelectorAll('.qb-rm-join').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.qbState.joins.splice(Number(btn.dataset.ji), 1);
          this.renderQueryBuilder(container);
        });
      });
      container.querySelector('#qbGroupSel').addEventListener('change', (e) => { this.qbState.groupBy = e.target.value; refreshPreview(); });
      container.querySelector('#qbAggFn').addEventListener('change', (e) => { this.qbState.aggFunc = e.target.value; if (!this.qbState.aggCol) this.qbState.aggCol = '*'; refreshPreview(); });
      container.querySelector('#qbAggCol').addEventListener('change', (e) => { this.qbState.aggCol = e.target.value; refreshPreview(); });
      container.querySelector('#qbOrderCol').addEventListener('change', (e) => { this.qbState.orderBy = e.target.value; refreshPreview(); });
      container.querySelector('#qbOrderDir').addEventListener('change', (e) => { this.qbState.orderDir = e.target.value; refreshPreview(); });
      container.querySelector('#qbLimit').addEventListener('input', (e) => { this.qbState.limit = e.target.value; refreshPreview(); });
      container.querySelector('#qbAddWhereBtn').addEventListener('click', () => {
        this.qbState.where.push({ col: tblObj.columns[0].name, op: '=', val: '' });
        this.renderQueryBuilder(container);
      });
      container.querySelectorAll('[data-wi]').forEach((el) => {
        const evt = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(evt, () => {
          this.qbState.where[Number(el.dataset.wi)][el.dataset.wf] = el.value;
          refreshPreview();
        });
      });
      container.querySelectorAll('[data-wrm]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.qbState.where.splice(Number(btn.dataset.wrm), 1);
          this.renderQueryBuilder(container);
        });
      });

      container.querySelector('.qb-open-console').addEventListener('click', () => {
        this.studio.setEditorSql(this._buildVisualSql(), `builder_${tblObj.name}.sql`);
        this.studio.setPrimaryMode('sql');
        this.studio.runQuery();
      });

      container.querySelector('.qb-run-btn').addEventListener('click', async () => {
        const sql = this._buildVisualSql();
        const resp = await this.studio.apiFetch('/api/query', {
          method: 'POST',
          body: JSON.stringify({ db: this.studio.state.currentDb, sql }),
        });
        const area = container.querySelector('#qbResultsArea');
        if (!resp || !resp.ok || !resp.results[0]) return;
        const r = resp.results[0];
        const cols = r.columns || [];
        const rows = r.rows || [];
        area.innerHTML = `
          <div class="pma-card">
            <div class="pma-card-hdr"><span>${I.check(14)} ${r.rowCount} rows returned in ${r.durationMs} ms</span></div>
            <div style="overflow:auto;max-height:300px">
              <table class="sql-table">
                <thead><tr><th class="row-num-col">#</th>${cols.map((c) => `<th>${escapeHtml(c.name)}</th>`).join('')}</tr></thead>
                <tbody>${rows.map((row, idx) => `<tr><td class="row-num-col">${idx + 1}</td>${cols.map((c) => `<td>${row[c.name] === null ? '<span class="cell-null">NULL</span>' : escapeHtml(String(row[c.name]))}</td>`).join('')}</tr>`).join('')}</tbody>
              </table>
            </div>
          </div>`;
      });
    }

    // =========================================================================
    // 3. INSTANT DATA PROFILER (Column Quality, Null %, Cardinality, Top Values)
    // =========================================================================
    async renderProfiler(container) {
      const schema = this.studio.state.schema;
      const all = [...(schema?.tables || []), ...(schema?.views || [])];
      if (!all.length) {
        container.innerHTML = '<div class="empty-state">No tables available to profile.</div>';
        return;
      }
      const tblName = all.some((t) => t.name === this.studio.state.selectedTable) ? this.studio.state.selectedTable : all[0].name;
      const data = await this.studio.apiFetch(`/api/table/profile?db=${encodeURIComponent(this.studio.state.currentDb)}&table=${encodeURIComponent(tblName)}`);
      if (!data || !data.ok) return;

      const cardsHtml = data.columns
        .map(
          (c) => `
        <div class="prof-card">
          <div class="prof-hdr">
            <div><strong>${escapeHtml(c.name)}</strong> ${c.pk ? '<span class="col-key pk">PK</span>' : ''}${c.fk ? '<span class="col-key fk">FK</span>' : ''}</div>
            <span class="type-pill">${escapeHtml(c.type)}</span>
          </div>
          <div class="prof-meter-row">
            <span>Completeness</span>
            <div class="prof-bar"><i style="width:${c.completenessPct}%;background:${c.completenessPct === 100 ? 'var(--success)' : 'var(--warning)'}"></i></div>
            <strong>${c.completenessPct}%</strong>
          </div>
          <div class="prof-stats-row">
            <div><span>Distinct</span><strong>${c.distinctCount} (${c.uniquenessPct}%)</strong></div>
            <div><span>Nulls</span><strong>${c.nullCount}</strong></div>
            ${c.isNumeric ? `<div><span>Min / Max</span><strong>${c.min ?? '—'} / ${c.max ?? '—'}</strong></div><div><span>Average</span><strong>${c.avg ?? '—'}</strong></div>` : ''}
          </div>
          <div class="prof-top-list">
            <div class="prof-sub-lbl">Top Values</div>
            ${c.topValues.map((tv) => `
              <div class="prof-tv-row">
                <span class="prof-tv-val" title="${escapeHtml(tv.value)}">${escapeHtml(tv.value)}</span>
                <div class="prof-bar"><i style="width:${Math.max(4, tv.pct)}%;background:var(--accent)"></i></div>
                <span class="prof-tv-cnt">${tv.count} (${tv.pct}%)</span>
              </div>`).join('') || '<div class="muted">No values</div>'}
          </div>
        </div>`
        )
        .join('');

      container.innerHTML = `
        <div class="pma-context-bar">
          <div class="pma-ctx-left">
            <span class="pma-ctx-icon">${I.profiler(15)}</span>
            <strong>Data Quality Profiler</strong>
            <select class="wb-select prof-tbl-sel">${all.map((t) => `<option value="${escapeHtml(t.name)}"${t.name === tblName ? ' selected' : ''}>${escapeHtml(t.name)} (${t.rowCount} rows)</option>`).join('')}</select>
            <span class="pma-ctx-sub">${data.totalRows} rows · ${data.columns.length} columns analyzed</span>
          </div>
        </div>
        <div class="pma-scroll-body pma-padded">
          <div class="prof-grid">${cardsHtml}</div>
        </div>`;

      container.querySelector('.prof-tbl-sel').addEventListener('change', (e) => {
        this.studio.state.selectedTable = e.target.value;
        this.studio.renderSchemaTree();
        this.renderProfiler(container);
      });
    }

    // =========================================================================
    // 4. VIEWS & TRIGGERS MANAGER (Full phpMyAdmin Parity)
    // =========================================================================
    async renderViewsTriggers(container) {
      const db = this.studio.state.currentDb;
      const data = await this.studio.apiFetch(`/api/triggers-views?db=${encodeURIComponent(db)}`);
      if (!data || !data.ok) return;

      const viewRows = (data.views || []).length
        ? data.views
            .map(
              (v) => `
          <tr>
            <td><strong>${escapeHtml(v.name)}</strong></td>
            <td class="cell-num">${v.rowCount}</td>
            <td class="muted" style="max-width:340px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(v.sql || '')}</td>
            <td>
              <button class="pane-mini-btn vt-browse-view" data-v="${escapeHtml(v.name)}">${I.eye(12)} Browse</button>
              <button class="pma-row-btn danger vt-drop-view" data-v="${escapeHtml(v.name)}">${I.trash(13)}</button>
            </td>
          </tr>`
            )
            .join('')
        : '<tr><td colspan="4" class="muted">No views defined yet.</td></tr>';

      const trigRows = (data.triggers || []).length
        ? data.triggers
            .map(
              (tr) => `
          <tr>
            <td><strong>${escapeHtml(tr.name)}</strong></td>
            <td><span class="type-pill">${escapeHtml(tr.tableName)}</span></td>
            <td class="muted" style="max-width:340px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(tr.sql || '')}</td>
            <td><button class="pma-row-btn danger vt-drop-trig" data-t="${escapeHtml(tr.name)}">${I.trash(13)} Drop</button></td>
          </tr>`
            )
            .join('')
        : '<tr><td colspan="4" class="muted">No triggers defined yet. Create an automated trigger below.</td></tr>';

      container.innerHTML = `
        <div class="pma-context-bar">
          <div class="pma-ctx-left">
            <span class="pma-ctx-icon">${I.triggers(15)}</span>
            <strong>Views & Triggers Manager</strong>
            <span class="pma-ctx-sub">${data.views.length} Views · ${data.triggers.length} Triggers in ${escapeHtml(db)}</span>
          </div>
        </div>
        <div class="pma-scroll-body pma-padded">
          <div class="pma-card">
            <div class="pma-card-hdr">${I.eye(14)} SQL Views</div>
            <table class="sql-table">
              <thead><tr><th>View Name</th><th class="cell-num">Rows</th><th>Definition</th><th>Actions</th></tr></thead>
              <tbody>${viewRows}</tbody>
            </table>
            <div class="pma-inline-form" style="margin-top:8px">
              <input type="text" class="mini-input vt-view-name" placeholder="New view name (e.g. v_active_orders)" />
              <input type="text" class="mini-input vt-view-sql" placeholder="SELECT * FROM orders WHERE status != 'cancelled'" style="flex:1;min-width:220px" />
              <button class="wb-run-btn vt-create-view">${I.plus(13)} Create View</button>
            </div>
          </div>

          <div class="pma-card">
            <div class="pma-card-hdr">${I.triggers(14)} Automated Triggers</div>
            <table class="sql-table">
              <thead><tr><th>Trigger Name</th><th>On Table</th><th>SQL Body</th><th>Action</th></tr></thead>
              <tbody>${trigRows}</tbody>
            </table>
            <div class="pma-inline-form" style="margin-top:8px">
              <input type="text" class="mini-input vt-trig-name" placeholder="Trigger name (e.g. trg_audit)" />
              <select class="wb-select vt-trig-tbl">${(data.tables || []).map((t) => `<option>${escapeHtml(t)}</option>`).join('')}</select>
              <select class="wb-select vt-trig-timing"><option>AFTER</option><option>BEFORE</option></select>
              <select class="wb-select vt-trig-event"><option>INSERT</option><option>UPDATE</option><option>DELETE</option></select>
            </div>
            <div class="pma-inline-form">
              <input type="text" class="mini-input vt-trig-body" placeholder="Trigger SQL statement (e.g. UPDATE products SET stock = stock - NEW.quantity WHERE id = NEW.product_id)" style="flex:1" />
              <button class="wb-run-btn vt-create-trig">${I.plus(13)} Create Trigger</button>
            </div>
          </div>
        </div>`;

      container.querySelectorAll('.vt-browse-view').forEach((b) => b.addEventListener('click', () => this.studio.selectTable(b.dataset.v, true)));
      container.querySelectorAll('.vt-drop-view').forEach((b) =>
        b.addEventListener('click', async () => {
          const r = await this.studio.apiFetch('/api/views/drop', { method: 'POST', body: JSON.stringify({ db, name: b.dataset.v }) });
          if (r && r.ok) { this.studio.applySchemaUpdate(r.schema); this.studio.toast(`Dropped view "${b.dataset.v}"`); this.renderViewsTriggers(container); }
        })
      );
      container.querySelector('.vt-create-view').addEventListener('click', async () => {
        const name = container.querySelector('.vt-view-name').value.trim();
        const selectSql = container.querySelector('.vt-view-sql').value.trim();
        const r = await this.studio.apiFetch('/api/views/create', { method: 'POST', body: JSON.stringify({ db, name, selectSql, replace: true }) });
        if (r && r.ok) { this.studio.applySchemaUpdate(r.schema); this.studio.toast(`Created view "${name}"`); this.renderViewsTriggers(container); }
      });
      container.querySelectorAll('.vt-drop-trig').forEach((b) =>
        b.addEventListener('click', async () => {
          const r = await this.studio.apiFetch('/api/triggers/drop', { method: 'POST', body: JSON.stringify({ db, name: b.dataset.t }) });
          if (r && r.ok) { this.studio.toast(`Dropped trigger "${b.dataset.t}"`); this.renderViewsTriggers(container); }
        })
      );
      container.querySelector('.vt-create-trig').addEventListener('click', async () => {
        const name = container.querySelector('.vt-trig-name').value.trim();
        const table = container.querySelector('.vt-trig-tbl').value;
        const timing = container.querySelector('.vt-trig-timing').value;
        const event = container.querySelector('.vt-trig-event').value;
        const body = container.querySelector('.vt-trig-body').value.trim();
        const r = await this.studio.apiFetch('/api/triggers/create', { method: 'POST', body: JSON.stringify({ db, name, table, timing, event, body }) });
        if (r && r.ok) { this.studio.toast(`Created trigger "${name}"`); this.renderViewsTriggers(container); }
      });
    }

    // =========================================================================
    // 5. INSTANT REST API & CODEGEN STUDIO (Supabase-Style Startup Superpower!)
    // =========================================================================
    async renderApiCodegen(container) {
      const schema = this.studio.state.schema;
      const tables = schema?.tables || [];
      if (!tables.length) {
        container.innerHTML = '<div class="empty-state">Create a table to generate live REST APIs & ORM models.</div>';
        return;
      }
      const tblName = tables.some((t) => t.name === this.studio.state.selectedTable) ? this.studio.state.selectedTable : tables[0].name;
      const data = await this.studio.apiFetch(`/api/codegen?db=${encodeURIComponent(this.studio.state.currentDb)}&table=${encodeURIComponent(tblName)}`);
      if (!data || !data.ok) return;

      const tabs = [
        { id: 'typescript', label: 'TypeScript' },
        { id: 'prisma', label: 'Prisma Schema' },
        { id: 'drizzle', label: 'Drizzle ORM' },
        { id: 'python', label: 'Python Pydantic' },
        { id: 'fetchJs', label: 'JS Fetch' },
        { id: 'curl', label: 'cURL' },
      ];
      const activeCode = data[this.codegenTab] || data.typescript;

      container.innerHTML = `
        <div class="pma-context-bar">
          <div class="pma-ctx-left">
            <span class="pma-ctx-icon">${I.api(15)}</span>
            <strong>Instant REST API & ORM Code Generator</strong>
            <select class="wb-select api-tbl-sel">${tables.map((t) => `<option value="${escapeHtml(t.name)}"${t.name === tblName ? ' selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}</select>
          </div>
          <div class="pma-ctx-right">
            <button class="wb-run-btn api-test-btn">${I.play(12)} Test Live GET Endpoint</button>
          </div>
        </div>
        <div class="pma-scroll-body pma-padded">
          <div class="pma-card">
            <div class="pma-card-hdr">
              <span>${I.link(14)} Live Auto-Generated REST Endpoint</span>
              <button class="pane-mini-btn api-copy-url">${I.copy(12)} Copy URL</button>
            </div>
            <div class="api-url-bar">
              <span class="status-chip status-active">GET</span>
              <code>${escapeHtml(data.endpoint)}</code>
            </div>
            <pre class="pma-ddl-pre hidden" id="apiLiveResp"></pre>
          </div>

          <div class="pma-card">
            <div class="pma-card-hdr">
              <div class="api-code-tabs">
                ${tabs.map((t) => `<button class="pane-mini-btn${t.id === this.codegenTab ? ' active-pill' : ''}" data-cg="${t.id}">${t.label}</button>`).join('')}
              </div>
              <button class="pane-mini-btn api-copy-code">${I.copy(12)} Copy Code</button>
            </div>
            <pre class="pma-ddl-pre" style="max-height:360px">${escapeHtml(activeCode)}</pre>
          </div>
        </div>`;

      container.querySelector('.api-tbl-sel').addEventListener('change', (e) => {
        this.studio.state.selectedTable = e.target.value;
        this.studio.renderSchemaTree();
        this.renderApiCodegen(container);
      });
      container.querySelectorAll('[data-cg]').forEach((b) => {
        b.addEventListener('click', () => {
          this.codegenTab = b.dataset.cg;
          this.renderApiCodegen(container);
        });
      });
      container.querySelector('.api-copy-url').addEventListener('click', () => {
        this.studio.safeCopy(data.endpoint);
        this.studio.toast('Copied live REST API URL');
      });
      container.querySelector('.api-copy-code').addEventListener('click', () => {
        this.studio.safeCopy(activeCode);
        this.studio.toast(`Copied ${this.codegenTab} model code`);
      });
      container.querySelector('.api-test-btn').addEventListener('click', async () => {
        const respBox = container.querySelector('#apiLiveResp');
        respBox.classList.remove('hidden');
        respBox.textContent = 'Requesting live endpoint...';
        const t0 = performance.now();
        const r = await this.studio.apiFetch(`/api/rest/${encodeURIComponent(this.studio.state.currentDb)}/${encodeURIComponent(tblName)}?limit=5`);
        const ms = (performance.now() - t0).toFixed(1);
        respBox.textContent = `// HTTP 200 OK · ${ms} ms\n` + JSON.stringify(r, null, 2);
      });
    }
  }

  global.ProViews = ProViews;
})(window);

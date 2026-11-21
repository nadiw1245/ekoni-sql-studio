(function (global) {
  'use strict';

  const { escapeHtml } = global.SqlEditorCore;
  const I = global.SqlIcons;

  /**
   * Full phpMyAdmin-style visual workspace views:
   *  - Browse (paginated CRUD table, inline cell edit, edit modal, copy row, bulk delete, sort, quick filter)
   *  - Structure (columns, add/drop column, create/drop index, foreign keys, DDL)
   *  - Insert (dynamic form for inserting rows into active table)
   *  - Search (Query-By-Example visual filter builder -> generates & runs real SQL)
   *  - Operations (rename/copy/truncate/drop table, optimize DB, export full SQL dump, create/reset/delete DB)
   */
  class PmaViews {
    constructor(studio) {
      this.studio = studio;
      this.browseState = { page: 1, pageSize: 25, sortCol: null, sortDir: 'ASC', search: '', selectedRowids: new Set(), lastData: null };
      this.searchResults = null;
    }

    _getActiveTableObj() {
      const schema = this.studio.state.schema;
      if (!schema) return null;
      const all = [...(schema.tables || []), ...(schema.views || [])];
      if (!all.length) return null;
      const cur = this.studio.state.selectedTable;
      const found = all.find((t) => t.name === cur);
      if (found) return found;
      this.studio.state.selectedTable = all[0].name;
      return all[0];
    }

    _renderTableBar(tblObj, subtitle = '') {
      const schema = this.studio.state.schema;
      const all = [...(schema?.tables || []), ...(schema?.views || [])];
      const opts = all
        .map((t) => `<option value="${escapeHtml(t.name)}"${tblObj && t.name === tblObj.name ? ' selected' : ''}>${escapeHtml(t.name)} (${t.rowCount})</option>`)
        .join('');
      return `
        <div class="pma-context-bar">
          <div class="pma-ctx-left">
            <span class="pma-ctx-icon">${I.table(15)}</span>
            <select class="wb-select pma-table-picker">${opts}</select>
            ${subtitle ? `<span class="pma-ctx-sub">${escapeHtml(subtitle)}</span>` : ''}
          </div>
          <div class="pma-ctx-right">
            <button class="pane-mini-btn pma-new-tbl-btn">${I.plus(13)} New Table</button>
            ${tblObj ? `<button class="pane-mini-btn pma-export-tbl-btn">${I.download(13)} Export .sql</button>` : ''}
          </div>
        </div>`;
    }

    _wireTableBar(container, reloadFn) {
      const picker = container.querySelector('.pma-table-picker');
      if (picker) {
        picker.addEventListener('change', () => {
          this.studio.selectTable(picker.value, false);
          this.browseState.page = 1;
          this.browseState.sortCol = null;
          this.browseState.selectedRowids.clear();
          reloadFn();
        });
      }
      const newBtn = container.querySelector('.pma-new-tbl-btn');
      if (newBtn) newBtn.addEventListener('click', () => this.studio.openCreateTableModal());
      const expBtn = container.querySelector('.pma-export-tbl-btn');
      if (expBtn) {
        expBtn.addEventListener('click', () => {
          const tbl = this._getActiveTableObj();
          if (tbl) {
            window.location.href = `/api/export/sql?db=${encodeURIComponent(this.studio.state.currentDb)}&table=${encodeURIComponent(tbl.name)}`;
            this.studio.toast(`Downloading ${tbl.name}.sql`);
          }
        });
      }
    }

    // =========================================================================
    // 1. BROWSE VIEW (Paginated Interactive phpMyAdmin Data Grid + Inline Edit)
    // =========================================================================
    async renderBrowse(container) {
      const tbl = this._getActiveTableObj();
      if (!tbl) {
        container.innerHTML = `${this._renderTableBar(null)}<div class="empty-state">No tables in this database. Click <strong>New Table</strong> to create one.</div>`;
        this._wireTableBar(container, () => this.renderBrowse(container));
        return;
      }

      const bs = this.browseState;
      const data = await this.studio.apiFetch('/api/table/browse', {
        method: 'POST',
        body: JSON.stringify({
          connId: this.studio.state.connId,
          db: this.studio.state.currentDb,
          table: tbl.name,
          page: bs.page,
          pageSize: bs.pageSize,
          sortCol: bs.sortCol,
          sortDir: bs.sortDir,
          search: bs.search,
        }),
      });
      if (!data || !data.ok) {
        container.innerHTML = `${this._renderTableBar(tbl)}<div class="error-box"><div class="error-box-title">${escapeHtml(data?.error || 'Browse failed')}</div></div>`;
        this._wireTableBar(container, () => this.renderBrowse(container));
        return;
      }
      bs.lastData = data;

      const editable = data.editable;
      const cols = data.columns || [];
      const rows = data.rows || [];

      const headHtml = cols
        .map((c) => {
          const arrow = bs.sortCol === c.name ? `<span class="th-sort">${bs.sortDir === 'ASC' ? '▲' : '▼'}</span>` : '';
          return `<th data-bsort="${escapeHtml(c.name)}">${escapeHtml(c.name)}<span class="th-type">${escapeHtml(c.type || '')}</span>${arrow}</th>`;
        })
        .join('');

      const rowsHtml = rows.length
        ? rows
            .map((r) => {
              const rid = r._rowid_;
              const checked = bs.selectedRowids.has(rid) ? 'checked' : '';
              const actionTds = editable
                ? `<td class="pma-act-col">
                    <input type="checkbox" class="pma-row-chk" data-rid="${rid}" ${checked} />
                    <button class="pma-row-btn pma-edit-row" data-rid="${rid}" title="Edit Row">${I.edit(13)}</button>
                    <button class="pma-row-btn pma-copy-row" data-rid="${rid}" title="Duplicate Row">${I.copy(13)}</button>
                    <button class="pma-row-btn danger pma-del-row" data-rid="${rid}" title="Delete Row">${I.trash(13)}</button>
                  </td>`
                : '<td class="pma-act-col muted">VIEW</td>';

              const cells = cols
                .map((c) => {
                  const v = r[c.name];
                  if (v === null || v === undefined) {
                    return `<td class="pma-cell" data-rid="${rid}" data-col="${escapeHtml(c.name)}" data-isnull="1"><span class="cell-null">NULL</span></td>`;
                  }
                  if (typeof v === 'number') {
                    return `<td class="pma-cell cell-num" data-rid="${rid}" data-col="${escapeHtml(c.name)}" data-raw="${escapeHtml(String(v))}">${escapeHtml(v.toLocaleString())}</td>`;
                  }
                  const sv = String(v);
                  return `<td class="pma-cell" data-rid="${rid}" data-col="${escapeHtml(c.name)}" data-raw="${escapeHtml(sv)}" title="Double-click to inline edit">${escapeHtml(sv)}</td>`;
                })
                .join('');
              return `<tr>${actionTds}${cells}</tr>`;
            })
            .join('')
        : `<tr><td colspan="${cols.length + 1}" class="empty-state">0 rows match.</td></tr>`;

      container.innerHTML = `
        ${this._renderTableBar(tbl, `${data.total} rows · ${data.durationMs} ms${editable ? ' · Double-click any cell to inline edit' : ''}`)}
        <div class="pma-toolbar">
          <div class="pma-tb-left">
            <input type="text" class="mini-input pma-quick-search" placeholder="Quick search all columns..." value="${escapeHtml(bs.search)}" spellcheck="false" />
            ${editable ? `<button class="pane-mini-btn pma-open-insert">${I.plus(13)} Insert Row</button>` : ''}
            ${editable && bs.selectedRowids.size > 0 ? `<button class="pane-mini-btn danger-pill pma-bulk-del">${I.trash(13)} Delete Selected (${bs.selectedRowids.size})</button>` : ''}
            <button class="pane-mini-btn pma-open-in-sql">${I.code(13)} Open SQL</button>
          </div>
          <div class="pma-tb-right">
            <select class="wb-select pma-pagesize">
              ${[15, 25, 50, 100].map((n) => `<option value="${n}"${n === bs.pageSize ? ' selected' : ''}>${n} / page</option>`).join('')}
            </select>
            <button class="pane-mini-btn pma-prev" ${data.page <= 1 ? 'disabled' : ''}>${I.chevLeft(13)}</button>
            <span class="pma-page-lbl">Page ${data.page} / ${data.totalPages}</span>
            <button class="pane-mini-btn pma-next" ${data.page >= data.totalPages ? 'disabled' : ''}>${I.chevRight(13)}</button>
          </div>
        </div>
        <div class="pma-scroll-body">
          <table class="sql-table pma-browse-table">
            <thead>
              <tr>
                <th class="pma-act-col">${editable ? `<input type="checkbox" class="pma-chk-all" title="Select All" /> Actions` : 'Type'}</th>
                ${headHtml}
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>`;

      this._wireTableBar(container, () => this.renderBrowse(container));

      const searchEl = container.querySelector('.pma-quick-search');
      let searchDebounce = null;
      searchEl.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          bs.search = searchEl.value;
          bs.page = 1;
          this.renderBrowse(container);
        }, 220);
      });

      container.querySelector('.pma-pagesize').addEventListener('change', (e) => {
        bs.pageSize = Number(e.target.value);
        bs.page = 1;
        this.renderBrowse(container);
      });
      container.querySelector('.pma-prev').addEventListener('click', () => { if (bs.page > 1) { bs.page--; this.renderBrowse(container); } });
      container.querySelector('.pma-next').addEventListener('click', () => { if (bs.page < data.totalPages) { bs.page++; this.renderBrowse(container); } });
      container.querySelector('.pma-open-in-sql').addEventListener('click', () => {
        this.studio.setEditorSql(data.generatedSql, `${tbl.name}.sql`);
        this.studio.setPrimaryMode('sql');
        this.studio.runQuery();
      });

      const insBtn = container.querySelector('.pma-open-insert');
      if (insBtn) insBtn.addEventListener('click', () => this.studio.setPrimaryMode('insert'));

      const bulkBtn = container.querySelector('.pma-bulk-del');
      if (bulkBtn) {
        bulkBtn.addEventListener('click', async () => {
          const ids = Array.from(bs.selectedRowids);
          const r = await this.studio.apiFetch('/api/table/delete', {
            method: 'POST',
            body: JSON.stringify({ db: this.studio.state.currentDb, table: tbl.name, rowids: ids }),
          });
          if (r && r.ok) {
            bs.selectedRowids.clear();
            this.studio.applySchemaUpdate(r.schema);
            this.studio.toast(`Deleted ${r.changes} row(s)`);
            this.renderBrowse(container);
          }
        });
      }

      container.querySelectorAll('th[data-bsort]').forEach((th) => {
        th.addEventListener('click', () => {
          const col = th.dataset.bsort;
          if (bs.sortCol === col) bs.sortDir = bs.sortDir === 'ASC' ? 'DESC' : 'ASC';
          else { bs.sortCol = col; bs.sortDir = 'ASC'; }
          this.renderBrowse(container);
        });
      });

      const chkAll = container.querySelector('.pma-chk-all');
      if (chkAll) {
        chkAll.addEventListener('change', () => {
          rows.forEach((r) => {
            if (chkAll.checked) bs.selectedRowids.add(r._rowid_);
            else bs.selectedRowids.delete(r._rowid_);
          });
          this.renderBrowse(container);
        });
      }

      container.querySelectorAll('.pma-row-chk').forEach((chk) => {
        chk.addEventListener('change', () => {
          const rid = Number(chk.dataset.rid);
          if (chk.checked) bs.selectedRowids.add(rid);
          else bs.selectedRowids.delete(rid);
          this.renderBrowse(container);
        });
      });

      container.querySelectorAll('.pma-del-row').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const rid = Number(btn.dataset.rid);
          const r = await this.studio.apiFetch('/api/table/delete', {
            method: 'POST',
            body: JSON.stringify({ db: this.studio.state.currentDb, table: tbl.name, rowids: [rid] }),
          });
          if (r && r.ok) {
            bs.selectedRowids.delete(rid);
            this.studio.applySchemaUpdate(r.schema);
            this.studio.toast('Row deleted');
            this.renderBrowse(container);
          }
        });
      });

      container.querySelectorAll('.pma-copy-row').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const rid = Number(btn.dataset.rid);
          const r = await this.studio.apiFetch('/api/table/duplicate', {
            method: 'POST',
            body: JSON.stringify({ db: this.studio.state.currentDb, table: tbl.name, rowid: rid }),
          });
          if (r && r.ok) {
            this.studio.applySchemaUpdate(r.schema);
            this.studio.toast('Row duplicated');
            this.renderBrowse(container);
          }
        });
      });

      container.querySelectorAll('.pma-edit-row').forEach((btn) => {
        btn.addEventListener('click', () => {
          const rid = Number(btn.dataset.rid);
          const row = rows.find((r) => r._rowid_ === rid);
          if (row) this.openRowEditModal(tbl, row, () => this.renderBrowse(container));
        });
      });

      // Double-click inline cell edit!
      if (editable) {
        container.querySelectorAll('.pma-cell').forEach((td) => {
          td.addEventListener('dblclick', () => {
            if (td.querySelector('input')) return;
            const rid = Number(td.dataset.rid);
            const col = td.dataset.col;
            const isNull = td.dataset.isnull === '1';
            const origVal = isNull ? '' : td.dataset.raw ?? '';
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'inline-cell-input';
            inp.value = origVal;
            td.innerHTML = '';
            td.appendChild(inp);
            inp.focus();
            inp.select();

            const commit = async (cancel = false) => {
              if (cancel) { this.renderBrowse(container); return; }
              const nextRaw = inp.value;
              const colObj = cols.find((c) => c.name === col);
              let parsedVal = nextRaw;
              if (nextRaw.toUpperCase() === 'NULL' && isNull) parsedVal = null;
              else if (colObj && /INT/i.test(colObj.type) && /^-?\d+$/.test(nextRaw)) parsedVal = parseInt(nextRaw, 10);
              else if (colObj && /REAL|DEC|FLOAT|DOUBLE|NUM/i.test(colObj.type) && /^-?\d+(\.\d+)?$/.test(nextRaw)) parsedVal = parseFloat(nextRaw);

              const r = await this.studio.apiFetch('/api/table/update', {
                method: 'POST',
                body: JSON.stringify({ db: this.studio.state.currentDb, table: tbl.name, rowid: rid, updates: { [col]: parsedVal } }),
              });
              if (r && r.ok) {
                this.studio.toast(`Updated ${tbl.name}.${col}`);
              }
              this.renderBrowse(container);
            };

            inp.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(false); }
              else if (e.key === 'Escape') { e.preventDefault(); commit(true); }
            });
            inp.addEventListener('blur', () => commit(false), { once: true });
          });
        });
      }
    }

    openRowEditModal(tbl, row, onSaved) {
      const modal = document.getElementById('rowEditModal');
      document.getElementById('rowEditTitle').textContent = `Edit Row · ${tbl.name} (#${row._rowid_})`;
      const form = document.getElementById('rowEditForm');
      form.innerHTML = tbl.columns
        .map((c) => {
          const val = row[c.name];
          const isNull = val === null || val === undefined;
          return `
            <div class="pma-field-row">
              <div class="pma-field-label">
                <strong>${escapeHtml(c.name)}</strong>
                <span class="pma-field-type">${escapeHtml(c.type || 'ANY')}${c.pk ? ' · PK' : ''}</span>
              </div>
              <label class="pma-null-chk"><input type="checkbox" data-null-col="${escapeHtml(c.name)}" ${isNull ? 'checked' : ''} /> NULL</label>
              <input type="text" class="mini-input pma-field-input" data-edit-col="${escapeHtml(c.name)}" value="${isNull ? '' : escapeHtml(String(val))}" ${isNull ? 'disabled' : ''} />
            </div>`;
        })
        .join('');

      form.querySelectorAll('[data-null-col]').forEach((chk) => {
        chk.addEventListener('change', () => {
          const inp = form.querySelector(`[data-edit-col="${CSS.escape(chk.dataset.nullCol)}"]`);
          if (inp) inp.disabled = chk.checked;
        });
      });

      const saveBtn = document.getElementById('rowEditSaveBtn');
      const freshBtn = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(freshBtn, saveBtn);
      freshBtn.addEventListener('click', async () => {
        const updates = {};
        for (const c of tbl.columns) {
          const isNull = form.querySelector(`[data-null-col="${CSS.escape(c.name)}"]`).checked;
          const raw = form.querySelector(`[data-edit-col="${CSS.escape(c.name)}"]`).value;
          if (isNull) updates[c.name] = null;
          else if (/INT/i.test(c.type) && /^-?\d+$/.test(raw)) updates[c.name] = parseInt(raw, 10);
          else if (/REAL|DEC|FLOAT|DOUBLE|NUM/i.test(c.type) && /^-?\d+(\.\d+)?$/.test(raw)) updates[c.name] = parseFloat(raw);
          else updates[c.name] = raw;
        }
        const r = await this.studio.apiFetch('/api/table/update', {
          method: 'POST',
          body: JSON.stringify({ db: this.studio.state.currentDb, table: tbl.name, rowid: row._rowid_, updates }),
        });
        if (r && r.ok) {
          modal.classList.add('hidden');
          this.studio.applySchemaUpdate(r.schema);
          this.studio.toast('Row updated');
          onSaved();
        }
      });

      modal.classList.remove('hidden');
    }

    // =========================================================================
    // 2. STRUCTURE VIEW (Columns, Add/Drop Column, Indexes, Foreign Keys, DDL)
    // =========================================================================
    renderStructure(container) {
      const tbl = this._getActiveTableObj();
      if (!tbl) {
        container.innerHTML = `${this._renderTableBar(null)}<div class="empty-state">Select or create a table to view its structure.</div>`;
        this._wireTableBar(container, () => this.renderStructure(container));
        return;
      }

      const isTable = tbl.type === 'table';
      const colRows = (tbl.columns || [])
        .map(
          (c, i) => `
        <tr>
          <td class="row-num-col">${i + 1}</td>
          <td><strong>${escapeHtml(c.name)}</strong> ${c.pk ? `<span class="col-key pk">PK</span>` : ''}${c.fk ? `<span class="col-key fk">FK</span>` : ''}</td>
          <td><span class="type-pill">${escapeHtml(c.type || 'ANY')}</span></td>
          <td>${c.notnull ? '<span class="muted">No</span>' : 'Yes'}</td>
          <td>${c.dflt !== null && c.dflt !== undefined ? escapeHtml(String(c.dflt)) : '<span class="cell-null">None</span>'}</td>
          <td>${isTable && !c.pk ? `<button class="pma-row-btn danger st-drop-col" data-col="${escapeHtml(c.name)}" title="Drop Column">${I.trash(13)} Drop</button>` : '<span class="muted">—</span>'}</td>
        </tr>`
        )
        .join('');

      const idxRows = (tbl.indexes || []).length
        ? tbl.indexes
            .map(
              (idx) => `
          <tr>
            <td><strong>${escapeHtml(idx.name)}</strong></td>
            <td>${idx.unique ? '<span class="status-chip status-active">UNIQUE</span>' : 'INDEX'}</td>
            <td>${escapeHtml((idx.columns || []).join(', '))}</td>
            <td>${idx.origin === 'c' ? `<button class="pma-row-btn danger st-drop-idx" data-idx="${escapeHtml(idx.name)}">${I.trash(13)} Drop</button>` : '<span class="muted">Auto</span>'}</td>
          </tr>`
            )
            .join('')
        : '<tr><td colspan="4" class="muted">No indexes on this table.</td></tr>';

      container.innerHTML = `
        ${this._renderTableBar(tbl, `${tbl.type.toUpperCase()} · ${tbl.columns.length} columns · ${tbl.rowCount} rows`)}
        <div class="pma-scroll-body pma-padded">
          <div class="pma-card">
            <div class="pma-card-hdr">${I.structure(14)} Columns</div>
            <table class="sql-table">
              <thead><tr><th class="row-num-col">#</th><th>Name</th><th>Type</th><th>Null</th><th>Default</th><th>Action</th></tr></thead>
              <tbody>${colRows}</tbody>
            </table>
          </div>

          ${
            isTable
              ? `<div class="pma-card">
                  <div class="pma-card-hdr">${I.plusSquare(14)} Add New Column</div>
                  <div class="pma-inline-form">
                    <input type="text" class="mini-input st-col-name" placeholder="Column name (e.g. phone)" spellcheck="false" />
                    <select class="wb-select st-col-type">
                      <option>TEXT</option><option>VARCHAR(255)</option><option>INTEGER</option><option>REAL</option><option>DECIMAL(10,2)</option><option>DATE</option><option>DATETIME</option><option>BOOLEAN</option>
                    </select>
                    <input type="text" class="mini-input st-col-dflt" placeholder="Default (optional)" spellcheck="false" />
                    <label class="pma-null-chk"><input type="checkbox" class="st-col-nn" /> NOT NULL</label>
                    <button class="wb-run-btn st-add-col-btn">${I.plus(13)} Add Column</button>
                  </div>
                </div>

                <div class="pma-card">
                  <div class="pma-card-hdr">${I.key(14)} Indexes</div>
                  <table class="sql-table">
                    <thead><tr><th>Index Name</th><th>Type</th><th>Columns</th><th>Action</th></tr></thead>
                    <tbody>${idxRows}</tbody>
                  </table>
                  <div class="pma-inline-form" style="margin-top:8px">
                    <input type="text" class="mini-input st-idx-name" placeholder="Index name (optional)" spellcheck="false" />
                    <select class="wb-select st-idx-col">${tbl.columns.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('')}</select>
                    <label class="pma-null-chk"><input type="checkbox" class="st-idx-uniq" /> UNIQUE</label>
                    <button class="pane-mini-btn st-add-idx-btn">${I.plus(13)} Create Index</button>
                  </div>
                </div>`
              : ''
          }

          <div class="pma-card">
            <div class="pma-card-hdr">
              <span>${I.code(14)} CREATE ${tbl.type.toUpperCase()} DDL</span>
              <button class="pane-mini-btn st-copy-ddl">${I.copy(13)} Copy DDL</button>
            </div>
            <pre class="pma-ddl-pre">${escapeHtml((tbl.sql || '') + ';')}</pre>
          </div>
        </div>`;

      this._wireTableBar(container, () => this.renderStructure(container));

      container.querySelector('.st-copy-ddl').addEventListener('click', () => {
        this.studio.safeCopy((tbl.sql || '') + ';');
        this.studio.toast('Copied CREATE DDL');
      });

      container.querySelectorAll('.st-drop-col').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const r = await this.studio.apiFetch('/api/table/structure', {
            method: 'POST',
            body: JSON.stringify({ db: this.studio.state.currentDb, table: tbl.name, action: 'dropColumn', column: btn.dataset.col }),
          });
          if (r && r.ok) {
            this.studio.applySchemaUpdate(r.schema);
            this.studio.toast(`Dropped column "${btn.dataset.col}"`);
            this.renderStructure(container);
          }
        });
      });

      const addColBtn = container.querySelector('.st-add-col-btn');
      if (addColBtn) {
        addColBtn.addEventListener('click', async () => {
          const name = container.querySelector('.st-col-name').value.trim();
          if (!name) { this.studio.toast('Enter a column name', true); return; }
          const r = await this.studio.apiFetch('/api/table/structure', {
            method: 'POST',
            body: JSON.stringify({
              db: this.studio.state.currentDb,
              table: tbl.name,
              action: 'addColumn',
              name,
              type: container.querySelector('.st-col-type').value,
              defaultVal: container.querySelector('.st-col-dflt').value,
              notnull: container.querySelector('.st-col-nn').checked,
            }),
          });
          if (r && r.ok) {
            this.studio.applySchemaUpdate(r.schema);
            this.studio.toast(`Added column "${name}"`);
            this.renderStructure(container);
          }
        });
      }

      const addIdxBtn = container.querySelector('.st-add-idx-btn');
      if (addIdxBtn) {
        addIdxBtn.addEventListener('click', async () => {
          const col = container.querySelector('.st-idx-col').value;
          const idxName = container.querySelector('.st-idx-name').value.trim();
          const unique = container.querySelector('.st-idx-uniq').checked;
          const r = await this.studio.apiFetch('/api/table/structure', {
            method: 'POST',
            body: JSON.stringify({ db: this.studio.state.currentDb, table: tbl.name, action: 'createIndex', name: idxName, columns: [col], unique }),
          });
          if (r && r.ok) {
            this.studio.applySchemaUpdate(r.schema);
            this.studio.toast(`Created index on "${col}"`);
            this.renderStructure(container);
          }
        });
      }

      container.querySelectorAll('.st-drop-idx').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const r = await this.studio.apiFetch('/api/table/structure', {
            method: 'POST',
            body: JSON.stringify({ db: this.studio.state.currentDb, table: tbl.name, action: 'dropIndex', indexName: btn.dataset.idx }),
          });
          if (r && r.ok) {
            this.studio.applySchemaUpdate(r.schema);
            this.studio.toast(`Dropped index "${btn.dataset.idx}"`);
            this.renderStructure(container);
          }
        });
      });
    }

    // =========================================================================
    // 3. INSERT VIEW (Visual phpMyAdmin Insert Row Form)
    // =========================================================================
    renderInsert(container) {
      const tbl = this._getActiveTableObj();
      if (!tbl || tbl.type !== 'table') {
        container.innerHTML = `${this._renderTableBar(tbl)}<div class="empty-state">Select a writable table to insert a new row.</div>`;
        this._wireTableBar(container, () => this.renderInsert(container));
        return;
      }

      const fieldsHtml = tbl.columns
        .map((c) => {
          const isAutoPk = c.pk && /INT/i.test(c.type || '');
          return `
            <div class="pma-field-row">
              <div class="pma-field-label">
                <strong>${escapeHtml(c.name)}</strong>
                <span class="pma-field-type">${escapeHtml(c.type || 'ANY')}${c.pk ? ' · PK' : ''}${c.notnull ? ' · NOT NULL' : ''}</span>
              </div>
              <label class="pma-null-chk"><input type="checkbox" data-ins-null="${escapeHtml(c.name)}" ${!c.notnull && !isAutoPk ? '' : ''} /> NULL</label>
              <input type="text" class="mini-input pma-field-input" data-ins-col="${escapeHtml(c.name)}"
                placeholder="${isAutoPk ? 'Auto Increment (leave blank)' : c.dflt !== null && c.dflt !== undefined ? `Default: ${escapeHtml(String(c.dflt))}` : `Enter ${escapeHtml(c.type || 'value')}...`}" />
            </div>`;
        })
        .join('');

      container.innerHTML = `
        ${this._renderTableBar(tbl, `Insert into "${tbl.name}"`)}
        <div class="pma-scroll-body pma-padded">
          <div class="pma-card">
            <div class="pma-card-hdr">${I.plusSquare(14)} Insert New Row into <strong>${escapeHtml(tbl.name)}</strong></div>
            <div class="pma-form-grid">${fieldsHtml}</div>
            <div class="pma-form-actions">
              <button class="wb-run-btn ins-submit-browse">${I.check(14)} Insert & Browse</button>
              <button class="pane-mini-btn ins-submit-more">${I.plus(13)} Insert & Add Another</button>
              <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
                <button class="pane-mini-btn ins-mock-10">${I.dice(13)} Seed 10 Mock Rows</button>
                <button class="pane-mini-btn ins-mock-25">${I.dice(13)} Seed 25 Mock Rows</button>
              </div>
            </div>
          </div>
        </div>`;

      this._wireTableBar(container, () => this.renderInsert(container));

      container.querySelectorAll('[data-ins-null]').forEach((chk) => {
        chk.addEventListener('change', () => {
          const inp = container.querySelector(`[data-ins-col="${CSS.escape(chk.dataset.insNull)}"]`);
          if (inp) inp.disabled = chk.checked;
        });
      });

      const doInsert = async (goBrowse) => {
        const values = {};
        for (const c of tbl.columns) {
          const isAutoPk = c.pk && /INT/i.test(c.type || '');
          const isNull = container.querySelector(`[data-ins-null="${CSS.escape(c.name)}"]`).checked;
          const raw = container.querySelector(`[data-ins-col="${CSS.escape(c.name)}"]`).value;
          if (isNull) {
            values[c.name] = null;
          } else if (raw === '' && (isAutoPk || c.dflt !== null)) {
            continue; // Let SQLite auto-increment / apply default
          } else if (/INT/i.test(c.type) && /^-?\d+$/.test(raw)) {
            values[c.name] = parseInt(raw, 10);
          } else if (/REAL|DEC|FLOAT|DOUBLE|NUM/i.test(c.type) && /^-?\d+(\.\d+)?$/.test(raw)) {
            values[c.name] = parseFloat(raw);
          } else {
            values[c.name] = raw;
          }
        }
        const r = await this.studio.apiFetch('/api/table/insert', {
          method: 'POST',
          body: JSON.stringify({ db: this.studio.state.currentDb, table: tbl.name, values }),
        });
        if (r && r.ok) {
          this.studio.applySchemaUpdate(r.schema);
          this.studio.toast(`Inserted row #${r.lastInsertRowid} into "${tbl.name}"`);
          if (goBrowse) this.studio.setPrimaryMode('browse');
          else this.renderInsert(container);
        }
      };

      container.querySelector('.ins-submit-browse').addEventListener('click', () => doInsert(true));
      container.querySelector('.ins-submit-more').addEventListener('click', () => doInsert(false));
      const seedMock = async (cnt) => {
        const r = await this.studio.apiFetch('/api/table/mock', {
          method: 'POST',
          body: JSON.stringify({ db: this.studio.state.currentDb, table: tbl.name, count: cnt }),
        });
        if (r && r.ok) {
          this.studio.applySchemaUpdate(r.schema);
          this.studio.toast(`Generated ${r.inserted} realistic rows in "${tbl.name}"`);
          this.studio.setPrimaryMode('browse');
        }
      };
      container.querySelector('.ins-mock-10').addEventListener('click', () => seedMock(10));
      container.querySelector('.ins-mock-25').addEventListener('click', () => seedMock(25));
    }

    // =========================================================================
    // 4. SEARCH VIEW (phpMyAdmin Visual Query-By-Example Filter Builder)
    // =========================================================================
    renderSearch(container) {
      const tbl = this._getActiveTableObj();
      if (!tbl) {
        container.innerHTML = `${this._renderTableBar(null)}<div class="empty-state">Select a table to build visual filters.</div>`;
        this._wireTableBar(container, () => this.renderSearch(container));
        return;
      }

      const ops = ['LIKE %...%', '=', '!=', '>', '>=', '<', '<=', 'LIKE', 'IN', 'IS NULL', 'IS NOT NULL'];
      const rowsHtml = tbl.columns
        .map(
          (c) => `
        <tr>
          <td><strong>${escapeHtml(c.name)}</strong></td>
          <td><span class="type-pill">${escapeHtml(c.type || 'ANY')}</span></td>
          <td>
            <select class="wb-select qbe-op" data-qbe-col="${escapeHtml(c.name)}">
              ${ops.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}
            </select>
          </td>
          <td><input type="text" class="mini-input qbe-val" data-qbe-val="${escapeHtml(c.name)}" placeholder="Leave empty to ignore..." style="width:100%" /></td>
        </tr>`
        )
        .join('');

      container.innerHTML = `
        ${this._renderTableBar(tbl, `Query-by-Example Visual Search on "${tbl.name}"`)}
        <div class="pma-scroll-body pma-padded">
          <div class="pma-card">
            <div class="pma-card-hdr">${I.search(14)} Build Filter Conditions</div>
            <table class="sql-table">
              <thead><tr><th>Column</th><th>Type</th><th>Operator</th><th>Value</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <div class="pma-form-actions">
              <button class="wb-run-btn qbe-run-btn">${I.play(13)} Run Visual Search</button>
              <button class="pane-mini-btn qbe-reset-btn">Clear Filters</button>
            </div>
          </div>
          <div id="qbeResultsBox"></div>
        </div>`;

      this._wireTableBar(container, () => this.renderSearch(container));

      container.querySelector('.qbe-reset-btn').addEventListener('click', () => {
        container.querySelectorAll('.qbe-val').forEach((i) => (i.value = ''));
        container.querySelector('#qbeResultsBox').innerHTML = '';
      });

      container.querySelector('.qbe-run-btn').addEventListener('click', async () => {
        const filters = [];
        for (const c of tbl.columns) {
          const op = container.querySelector(`.qbe-op[data-qbe-col="${CSS.escape(c.name)}"]`).value;
          const val = container.querySelector(`.qbe-val[data-qbe-val="${CSS.escape(c.name)}"]`).value;
          if (op === 'IS NULL' || op === 'IS NOT NULL' || val.trim() !== '') {
            filters.push({ column: c.name, op, value: val });
          }
        }
        const data = await this.studio.apiFetch('/api/table/browse', {
          method: 'POST',
          body: JSON.stringify({ db: this.studio.state.currentDb, table: tbl.name, page: 1, pageSize: 100, filters }),
        });
        if (!data || !data.ok) return;

        const box = container.querySelector('#qbeResultsBox');
        const cols = data.columns || [];
        const bodyRows = data.rows
          .map((r, idx) => `<tr><td class="row-num-col">${idx + 1}</td>${cols.map((c) => `<td>${r[c.name] === null ? '<span class="cell-null">NULL</span>' : escapeHtml(String(r[c.name]))}</td>`).join('')}</tr>`)
          .join('');

        box.innerHTML = `
          <div class="pma-card" style="margin-top:10px">
            <div class="pma-card-hdr">
              <span>${I.check(14)} Matched ${data.total} row(s) in ${data.durationMs} ms</span>
              <button class="pane-mini-btn qbe-open-sql">${I.code(13)} Edit in SQL Console</button>
            </div>
            <div style="overflow:auto;max-height:320px">
              <table class="sql-table">
                <thead><tr><th class="row-num-col">#</th>${cols.map((c) => `<th>${escapeHtml(c.name)}</th>`).join('')}</tr></thead>
                <tbody>${bodyRows || `<tr><td colspan="${cols.length + 1}" class="empty-state">No rows matched your filter criteria.</td></tr>`}</tbody>
              </table>
            </div>
          </div>`;

        box.querySelector('.qbe-open-sql').addEventListener('click', () => {
          this.studio.setEditorSql(data.generatedSql, `search_${tbl.name}.sql`);
          this.studio.setPrimaryMode('sql');
          this.studio.runQuery();
        });
      });
    }

    // =========================================================================
    // 5. OPERATIONS VIEW (phpMyAdmin Admin + Time-Travel Database Snapshots)
    // =========================================================================
    async renderOperations(container) {
      const tbl = this._getActiveTableObj();
      const dbName = this.studio.state.currentDb;
      const snapRes = await this.studio.apiFetch(`/api/snapshots?db=${encodeURIComponent(dbName)}`);
      const snapshots = (snapRes && snapRes.snapshots) || [];

      const snapRows = snapshots.length
        ? snapshots
            .map(
              (s) => `
          <tr>
            <td><strong>${escapeHtml(s.label)}</strong></td>
            <td class="cell-num">${(s.size / 1024).toFixed(1)} KB</td>
            <td class="muted">${new Date(s.createdAt).toLocaleString()}</td>
            <td>
              <button class="pane-mini-btn op-restore-snap" data-sid="${escapeHtml(s.id)}">${I.refresh(12)} Restore</button>
              <button class="pma-row-btn danger op-del-snap" data-sid="${escapeHtml(s.id)}">${I.trash(13)}</button>
            </td>
          </tr>`
            )
            .join('')
        : '<tr><td colspan="4" class="muted">No snapshots saved yet. Save a point-in-time snapshot before major schema changes.</td></tr>';

      container.innerHTML = `
        ${this._renderTableBar(tbl, `Admin Operations & Time-Travel Snapshots on "${dbName}"`)}
        <div class="pma-scroll-body pma-padded">
          <div class="pma-card">
            <div class="pma-card-hdr">
              <span>${I.snapshot(14)} Time-Travel Database Snapshots (1-Click Rollback)</span>
              <div class="pma-inline-form">
                <input type="text" class="mini-input op-snap-label" placeholder="Snapshot label (e.g. before_migration)" />
                <button class="wb-run-btn op-save-snap">${I.snapshot(13)} Save Snapshot</button>
              </div>
            </div>
            <table class="sql-table">
              <thead><tr><th>Snapshot Label</th><th class="cell-num">Size</th><th>Saved At</th><th>Actions</th></tr></thead>
              <tbody>${snapRows}</tbody>
            </table>
          </div>

          <div class="pma-ops-grid">
            ${
              tbl
                ? `<div class="pma-card">
                    <div class="pma-card-hdr">${I.edit(14)} Rename Table "${escapeHtml(tbl.name)}"</div>
                    <div class="pma-inline-form">
                      <input type="text" class="mini-input op-rename-val" value="${escapeHtml(tbl.name)}" />
                      <button class="pane-mini-btn op-rename-btn">Rename</button>
                    </div>
                  </div>

                  <div class="pma-card">
                    <div class="pma-card-hdr">${I.copy(14)} Copy / Duplicate Table</div>
                    <div class="pma-inline-form">
                      <input type="text" class="mini-input op-copy-val" value="${escapeHtml(tbl.name)}_backup" />
                      <label class="pma-null-chk"><input type="checkbox" class="op-copy-data" checked /> With Data</label>
                      <button class="pane-mini-btn op-copy-btn">Copy Table</button>
                    </div>
                  </div>

                  <div class="pma-card danger-card">
                    <div class="pma-card-hdr">${I.trash(14)} Danger Zone — Table "${escapeHtml(tbl.name)}"</div>
                    <div class="pma-inline-form">
                      <button class="pane-mini-btn danger-pill op-trunc-btn">Empty (TRUNCATE)</button>
                      <button class="pane-mini-btn danger-pill op-drop-btn">Drop Table</button>
                    </div>
                  </div>`
                : ''
            }

            <div class="pma-card">
              <div class="pma-card-hdr">${I.database(14)} Database Maintenance — "${escapeHtml(dbName)}"</div>
              <div class="pma-inline-form">
                <button class="pane-mini-btn op-opt-btn">${I.zap(13)} Optimize (VACUUM & ANALYZE)</button>
                <button class="pane-mini-btn op-dump-btn">${I.download(13)} Export Full .sql Dump</button>
                <button class="pane-mini-btn op-reset-db">${I.refresh(13)} Reset Sample DB</button>
                ${dbName !== 'ecommerce.db' && dbName !== ':memory:' ? `<button class="pane-mini-btn danger-pill op-del-db">${I.trash(13)} Drop Database</button>` : ''}
              </div>
            </div>
          </div>
        </div>`;

      this._wireTableBar(container, () => this.renderOperations(container));

      container.querySelector('.op-save-snap').addEventListener('click', async () => {
        const label = container.querySelector('.op-snap-label').value.trim();
        const r = await this.studio.apiFetch('/api/snapshots/create', {
          method: 'POST',
          body: JSON.stringify({ db: dbName, label }),
        });
        if (r && r.ok) {
          this.studio.toast('Database snapshot saved');
          this.renderOperations(container);
        }
      });
      container.querySelectorAll('.op-restore-snap').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const r = await this.studio.apiFetch('/api/snapshots/restore', {
            method: 'POST',
            body: JSON.stringify({ db: dbName, id: btn.dataset.sid }),
          });
          if (r && r.ok) {
            this.studio.applySchemaUpdate(r.schema);
            this.studio.toast('Restored database snapshot!');
            this.renderOperations(container);
          }
        });
      });
      container.querySelectorAll('.op-del-snap').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const r = await this.studio.apiFetch('/api/snapshots/delete', {
            method: 'POST',
            body: JSON.stringify({ db: dbName, id: btn.dataset.sid }),
          });
          if (r && r.ok) {
            this.studio.toast('Deleted snapshot');
            this.renderOperations(container);
          }
        });
      });

      if (tbl) {
        container.querySelector('.op-rename-btn').addEventListener('click', async () => {
          const newName = container.querySelector('.op-rename-val').value.trim();
          if (!newName || newName === tbl.name) return;
          const r = await this.studio.apiFetch('/api/table/operation', {
            method: 'POST',
            body: JSON.stringify({ db: dbName, table: tbl.name, op: 'rename', newName }),
          });
          if (r && r.ok) {
            this.studio.state.selectedTable = r.table;
            this.studio.applySchemaUpdate(r.schema);
            this.studio.toast(`Renamed table to "${r.table}"`);
            this.renderOperations(container);
          }
        });

        container.querySelector('.op-copy-btn').addEventListener('click', async () => {
          const newName = container.querySelector('.op-copy-val').value.trim();
          const withData = container.querySelector('.op-copy-data').checked;
          const r = await this.studio.apiFetch('/api/table/operation', {
            method: 'POST',
            body: JSON.stringify({ db: dbName, table: tbl.name, op: 'copy', newName, withData }),
          });
          if (r && r.ok) {
            this.studio.applySchemaUpdate(r.schema);
            this.studio.toast(`Copied table to "${r.table}"`);
            this.renderOperations(container);
          }
        });

        container.querySelector('.op-trunc-btn').addEventListener('click', async () => {
          const r = await this.studio.apiFetch('/api/table/operation', {
            method: 'POST',
            body: JSON.stringify({ db: dbName, table: tbl.name, op: 'truncate' }),
          });
          if (r && r.ok) {
            this.studio.applySchemaUpdate(r.schema);
            this.studio.toast(`Emptied "${tbl.name}" (${r.changes} rows deleted)`);
            this.renderOperations(container);
          }
        });

        container.querySelector('.op-drop-btn').addEventListener('click', async () => {
          const r = await this.studio.apiFetch('/api/table/operation', {
            method: 'POST',
            body: JSON.stringify({ db: dbName, table: tbl.name, op: 'drop' }),
          });
          if (r && r.ok) {
            this.studio.state.selectedTable = null;
            this.studio.applySchemaUpdate(r.schema);
            this.studio.toast(`Dropped "${tbl.name}"`);
            this.renderOperations(container);
          }
        });
      }

      container.querySelector('.op-opt-btn').addEventListener('click', async () => {
        const r = await this.studio.apiFetch('/api/table/operation', {
          method: 'POST',
          body: JSON.stringify({ db: dbName, table: '', op: 'optimize' }),
        });
        if (r && r.ok) this.studio.toast('Database optimized (VACUUM + ANALYZE complete)');
      });

      container.querySelector('.op-dump-btn').addEventListener('click', () => {
        window.location.href = `/api/export/sql?db=${encodeURIComponent(dbName)}`;
        this.studio.toast(`Downloading full SQL dump for ${dbName}`);
      });

      container.querySelector('.op-reset-db').addEventListener('click', () => this.studio.resetCurrentDb());

      const delDbBtn = container.querySelector('.op-del-db');
      if (delDbBtn) {
        delDbBtn.addEventListener('click', async () => {
          const r = await this.studio.apiFetch('/api/databases/delete', {
            method: 'POST',
            body: JSON.stringify({ db: dbName }),
          });
          if (r && r.ok) {
            this.studio.state.currentDb = 'ecommerce.db';
            await this.studio.loadDatabases();
            await this.studio.loadSchema();
            this.studio.toast(`Dropped database "${dbName}"`);
            this.renderOperations(container);
          }
        });
      }
    }
  }

  global.PmaViews = PmaViews;
})(window);

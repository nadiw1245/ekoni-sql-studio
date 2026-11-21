(function (global) {
  'use strict';

  const { escapeHtml } = global.SqlEditorCore;

  function analyzeChartable(result) {
    if (!result || result.kind !== 'select' || !result.rows || result.rows.length === 0) {
      return { chartable: false, labelCols: [], numCols: [] };
    }
    const cols = result.columns.map((c) => c.name);
    const sample = result.rows.slice(0, 50);
    const numCols = [];
    const labelCols = [];

    for (const col of cols) {
      let numCount = 0;
      let nonNull = 0;
      for (const r of sample) {
        const v = r[col];
        if (v === null || v === undefined) continue;
        nonNull++;
        if (typeof v === 'number' && Number.isFinite(v)) numCount++;
      }
      if (nonNull > 0 && numCount === nonNull) numCols.push(col);
      else labelCols.push(col);
    }

    return {
      chartable: numCols.length > 0 && result.rows.length >= 1,
      labelCols: labelCols.length ? labelCols : cols,
      numCols,
      allCols: cols,
    };
  }

  function formatCompact(n) {
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  const DONUT_COLORS = ['var(--accent)', 'var(--accent-2)', 'var(--success)', 'var(--cyan)', 'var(--warning)', 'var(--danger)', '#ff9e64', '#9d7cd8'];

  function renderSqlChart(containerEl, result, opts = {}) {
    const info = analyzeChartable(result);
    if (!info.chartable) {
      containerEl.innerHTML =
        '<div class="empty-state">Run a query returning at least one numeric column (e.g. <code>SUM</code>, <code>COUNT</code>, <code>AVG</code>) to visualize it here.</div>';
      return;
    }

    const chartType = opts.chartType || 'bar';
    const labelCol = opts.labelCol && info.allCols.includes(opts.labelCol) ? opts.labelCol : info.labelCols[0];
    const valueCol = opts.valueCol && info.numCols.includes(opts.valueCol) ? opts.valueCol : info.numCols[info.numCols.length - 1];
    const rows = result.rows.slice(0, 24);
    const values = rows.map((r) => Number(r[valueCol]) || 0);
    const labels = rows.map((r, i) => (r[labelCol] !== null && r[labelCol] !== undefined ? String(r[labelCol]) : `#${i + 1}`));
    const maxVal = Math.max(1, ...values.map((v) => Math.abs(v)));

    let svgHtml = '';
    if (chartType === 'donut') {
      const total = values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
      const r = 74;
      const circ = 2 * Math.PI * r;
      let offset = 0;
      const slices = values.slice(0, 8).map((v, i) => {
        const pct = Math.max(0, v) / total;
        const dash = pct * circ;
        const color = DONUT_COLORS[i % DONUT_COLORS.length];
        const seg = `<circle cx="115" cy="108" r="${r}" fill="none" stroke="${color}" stroke-width="26" stroke-dasharray="${dash.toFixed(2)} ${(circ - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 115 108)"><title>${escapeHtml(labels[i])}: ${v} (${(pct * 100).toFixed(1)}%)</title></circle>`;
        offset += dash;
        return { seg, color, label: labels[i], val: v, pct: (pct * 100).toFixed(1) };
      });
      const legend = slices
        .map((s) => `<div class="donut-leg-row"><i style="background:${s.color}"></i><span>${escapeHtml(s.label)}</span><strong>${formatCompact(s.val)} (${s.pct}%)</strong></div>`)
        .join('');
      svgHtml = `
        <div class="donut-layout">
          <svg viewBox="0 0 230 216" class="donut-svg">
            ${slices.map((s) => s.seg).join('')}
            <text x="115" y="104" text-anchor="middle" class="donut-total">${formatCompact(total)}</text>
            <text x="115" y="122" text-anchor="middle" class="chart-axis">TOTAL</text>
          </svg>
          <div class="donut-legend">${legend}</div>
        </div>`;
    } else if (chartType === 'horizontal') {
      const rowH = 28;
      const h = Math.max(170, rows.length * rowH + 20);
      const w = 680;
      const leftPad = 148;
      const rightPad = 76;
      const barMaxW = w - leftPad - rightPad;

      const bars = rows.map((r, i) => {
        const v = values[i];
        const bw = Math.max(3, (Math.abs(v) / maxVal) * barMaxW);
        const y = 12 + i * rowH;
        const lbl = labels[i].length > 20 ? labels[i].slice(0, 19) + '…' : labels[i];
        return `
          <g class="chart-row-g">
            <text x="${leftPad - 10}" y="${y + 15}" text-anchor="end" class="chart-lbl">${escapeHtml(lbl)}</text>
            <rect x="${leftPad}" y="${y + 3}" width="${bw.toFixed(1)}" height="17" rx="4" class="chart-bar-fill" />
            <text x="${leftPad + bw + 8}" y="${y + 15}" class="chart-val">${escapeHtml(formatCompact(v))}</text>
          </g>`;
      }).join('');
      svgHtml = `<svg viewBox="0 0 ${w} ${h}" class="sql-chart-svg">${bars}</svg>`;
    } else if (chartType === 'line') {
      const w = 680;
      const h = 230;
      const padL = 56;
      const padR = 24;
      const padT = 20;
      const padB = 42;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;
      const step = rows.length > 1 ? plotW / (rows.length - 1) : plotW;

      const pts = values.map((v, i) => ({
        x: padL + i * step,
        y: padT + plotH - (Math.max(0, v) / maxVal) * plotH,
        v,
        lbl: labels[i],
      }));
      const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = padT + plotH - t * plotH;
        return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" class="chart-grid" />
                <text x="${padL - 8}" y="${y + 4}" text-anchor="end" class="chart-axis">${formatCompact(maxVal * t)}</text>`;
      }).join('');
      const linePts = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const areaPts = `${padL},${padT + plotH} ${linePts} ${pts[pts.length - 1].x.toFixed(1)},${padT + plotH}`;
      const dots = pts.map((p, i) => `
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" class="chart-dot"><title>${escapeHtml(p.lbl)}: ${p.v}</title></circle>
        ${rows.length <= 14 || i % 2 === 0 ? `<text x="${p.x.toFixed(1)}" y="${h - 12}" text-anchor="middle" class="chart-axis">${escapeHtml(p.lbl.slice(0, 10))}</text>` : ''}`).join('');
      svgHtml = `<svg viewBox="0 0 ${w} ${h}" class="sql-chart-svg">${gridLines}<polygon points="${areaPts}" class="chart-area" /><polyline points="${linePts}" fill="none" class="chart-line" />${dots}</svg>`;
    } else {
      const w = 680;
      const h = 230;
      const padL = 56;
      const padR = 20;
      const padT = 22;
      const padB = 44;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;
      const slotW = plotW / Math.max(1, rows.length);
      const barW = Math.min(48, Math.max(10, slotW * 0.62));

      const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = padT + plotH - t * plotH;
        return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" class="chart-grid" />
                <text x="${padL - 8}" y="${y + 4}" text-anchor="end" class="chart-axis">${formatCompact(maxVal * t)}</text>`;
      }).join('');
      const bars = values.map((v, i) => {
        const bh = Math.max(3, (Math.max(0, v) / maxVal) * plotH);
        const x = padL + i * slotW + (slotW - barW) / 2;
        const y = padT + plotH - bh;
        const lbl = labels[i].length > 11 ? labels[i].slice(0, 10) + '…' : labels[i];
        return `
          <g class="chart-bar-g">
            <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" class="chart-bar-fill"><title>${escapeHtml(labels[i])}: ${v}</title></rect>
            <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" class="chart-val">${formatCompact(v)}</text>
            <text x="${(x + barW / 2).toFixed(1)}" y="${h - 14}" text-anchor="middle" class="chart-axis">${escapeHtml(lbl)}</text>
          </g>`;
      }).join('');
      svgHtml = `<svg viewBox="0 0 ${w} ${h}" class="sql-chart-svg">${gridLines}${bars}</svg>`;
    }

    containerEl.innerHTML = `
      <div class="chart-toolbar">
        <div class="chart-type-pills">
          <button class="pane-mini-btn${chartType === 'bar' ? ' active-pill' : ''}" data-ct="bar">Bar</button>
          <button class="pane-mini-btn${chartType === 'line' ? ' active-pill' : ''}" data-ct="line">Line</button>
          <button class="pane-mini-btn${chartType === 'horizontal' ? ' active-pill' : ''}" data-ct="horizontal">Horizontal</button>
          <button class="pane-mini-btn${chartType === 'donut' ? ' active-pill' : ''}" data-ct="donut">Donut</button>
        </div>
        <label class="chart-sel">Label
          <select id="chartLabelSel">${info.allCols.map((c) => `<option value="${escapeHtml(c)}"${c === labelCol ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
        </label>
        <label class="chart-sel">Metric
          <select id="chartValSel">${info.numCols.map((c) => `<option value="${escapeHtml(c)}"${c === valueCol ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
        </label>
      </div>
      <div class="chart-canvas-wrap">${svgHtml}</div>
    `;

    containerEl.querySelectorAll('[data-ct]').forEach((btn) => {
      btn.addEventListener('click', () => renderSqlChart(containerEl, result, { chartType: btn.dataset.ct, labelCol, valueCol }));
    });
    containerEl.querySelector('#chartLabelSel').addEventListener('change', (e) => renderSqlChart(containerEl, result, { chartType, labelCol: e.target.value, valueCol }));
    containerEl.querySelector('#chartValSel').addEventListener('change', (e) => renderSqlChart(containerEl, result, { chartType, labelCol, valueCol: e.target.value }));
  }

  /**
   * Interactive Draggable ER Schema Diagram with live Bezier FK connectors & Zoom!
   */
  function renderErDiagram(containerEl, schema, onSelectTable) {
    const tables = schema?.tables || [];
    if (!tables.length) {
      containerEl.innerHTML = '<div class="empty-state">No tables in this database yet. Click <strong>New Table</strong> to start designing your schema.</div>';
      return;
    }

    const colCount = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(tables.length))));
    const cardW = 240;
    const gapX = 68;
    const gapY = 44;
    const positions = new Map();
    const colHeights = new Array(colCount).fill(28);
    let maxW = 0;

    tables.forEach((t, idx) => {
      const col = idx % colCount;
      const h = 38 + (t.columns?.length || 1) * 24 + 14;
      const x = 28 + col * (cardW + gapX);
      const y = colHeights[col];
      positions.set(t.name, { x, y, w: cardW, h, table: t });
      colHeights[col] += h + gapY;
      maxW = Math.max(maxW, x + cardW + 80);
    });
    const maxH = Math.max(360, ...colHeights) + 60;

    const buildPaths = () =>
      (schema.relations || [])
        .map((rel) => {
          const from = positions.get(rel.fromTable);
          const to = positions.get(rel.toTable);
          if (!from || !to) return '';
          const fromIdx = Math.max(0, from.table.columns.findIndex((c) => c.name === rel.fromColumn));
          const toIdx = Math.max(0, to.table.columns.findIndex((c) => c.name === rel.toColumn));
          const fy = from.y + 48 + fromIdx * 24;
          const ty = to.y + 48 + toIdx * 24;
          const goRight = to.x >= from.x;
          const fx = goRight ? from.x + from.w : from.x;
          const tx = goRight ? to.x : to.x + to.w;
          const dx = Math.max(44, Math.abs(tx - fx) * 0.45);
          const c1x = goRight ? fx + dx : fx - dx;
          const c2x = goRight ? tx - dx : tx + dx;
          return `
            <g class="er-rel-g">
              <path d="M ${fx} ${fy} C ${c1x} ${fy}, ${c2x} ${ty}, ${tx} ${ty}" fill="none" class="er-line" />
              <circle cx="${fx}" cy="${fy}" r="3.5" class="er-dot-fk" />
              <circle cx="${tx}" cy="${ty}" r="3.5" class="er-dot-pk" />
            </g>`;
        })
        .join('');

    const cardsHtml = tables
      .map((t) => {
        const p = positions.get(t.name);
        const colsHtml = (t.columns || [])
          .map(
            (c) => `
          <div class="er-col">
            <span class="er-col-badge ${c.pk ? 'pk' : c.fk ? 'fk' : ''}">${c.pk ? 'PK' : c.fk ? 'FK' : '·'}</span>
            <span class="er-col-name">${escapeHtml(c.name)}</span>
            <span class="er-col-type">${escapeHtml(c.type || 'ANY')}</span>
          </div>`
          )
          .join('');
        return `
          <div class="er-card" style="left:${p.x}px;top:${p.y}px;width:${p.w}px" data-table="${escapeHtml(t.name)}">
            <div class="er-card-hdr" title="Drag to rearrange · Double-click to browse">
              <span>${escapeHtml(t.name)}</span>
              <span class="er-rows">${t.rowCount} rows</span>
            </div>
            <div class="er-card-cols">${colsHtml}</div>
          </div>`;
      })
      .join('');

    containerEl.innerHTML = `
      <div class="er-canvas" style="width:${maxW}px;height:${maxH}px">
        <svg class="er-svg" width="${maxW}" height="${maxH}">${buildPaths()}</svg>
        ${cardsHtml}
      </div>`;

    const svgEl = containerEl.querySelector('.er-svg');

    // Drag-to-move table cards with real-time FK curve updates!
    containerEl.querySelectorAll('.er-card').forEach((card) => {
      const hdr = card.querySelector('.er-card-hdr');
      hdr.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const tbl = card.dataset.table;
        const pos = positions.get(tbl);
        const startX = e.clientX;
        const startY = e.clientY;
        const origX = pos.x;
        const origY = pos.y;
        card.classList.add('dragging');

        const onMove = (ev) => {
          pos.x = Math.max(8, origX + (ev.clientX - startX));
          pos.y = Math.max(8, origY + (ev.clientY - startY));
          card.style.left = `${pos.x}px`;
          card.style.top = `${pos.y}px`;
          svgEl.innerHTML = buildPaths();
        };
        const onUp = () => {
          card.classList.remove('dragging');
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      card.addEventListener('dblclick', () => {
        if (onSelectTable) onSelectTable(card.dataset.table);
      });
    });
  }

  global.SqlVisuals = { renderSqlChart, renderErDiagram, analyzeChartable };
})(window);

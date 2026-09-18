(function () {
  'use strict';

  const state = { year: 'all', region: 'all' };
  let data = null;
  const charts = {};

  const fmtUSD = (v) => (v < 0 ? '-$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-US');
  const fmtUSDk = (v) => {
    const sign = v < 0 ? '-' : '';
    return sign + '$' + (Math.abs(v) / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 }) + 'K';
  };
  const fmtPct = (v) => (v * 100).toFixed(1) + '%';

  // ---------------------------------------------------------------- theme
  function getStoredTheme() {
    try { return localStorage.getItem('superstore-theme'); } catch (e) { return null; }
  }
  function setTheme(mode) {
    if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    try { localStorage.setItem('superstore-theme', mode); } catch (e) { /* ignore */ }
  }
  (function initTheme() {
    const params = new URLSearchParams(location.search);
    const forced = params.get('theme');
    if (forced === 'light' || forced === 'dark' || forced === 'auto') { setTheme(forced); return; }
    const stored = getStoredTheme();
    if (stored) setTheme(stored);
  })();
  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = getStoredTheme() || 'auto';
    const next = current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto';
    setTheme(next);
    if (data) renderAll();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!getStoredTheme() && data) renderAll();
  });

  function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (name) => cs.getPropertyValue(name).trim();
    return {
      text: g('--text-secondary'),
      primary: g('--text-primary'),
      muted: g('--text-muted'),
      grid: g('--gridline'),
      surface: g('--surface-1'),
      series1: g('--series-1'),
      series2: g('--series-2'),
      pos: g('--diverge-pos'),
      neg: g('--diverge-neg'),
      mid: g('--diverge-mid'),
    };
  }

  // ---------------------------------------------------------------- data utils
  function groupSum(rows, keyFn) {
    const m = new Map();
    for (const row of rows) {
      const k = keyFn(row);
      if (!m.has(k)) m.set(k, { sales: 0, profit: 0, discSum: 0, count: 0 });
      const e = m.get(k);
      e.sales += row.sales;
      e.profit += row.profit;
      e.discSum += row.disc;
      e.count += 1;
    }
    return m;
  }

  function filteredRows() {
    return data.rows.filter((r) =>
      (state.year === 'all' || r.y === Number(state.year)) &&
      (state.region === 'all' || r.r === state.region)
    );
  }

  function makeChart(id, config) {
    const canvas = document.getElementById(id);
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(canvas, config);
  }

  function renderTable(containerId, headers, rowsData, rightAlignFromIndex) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'data-table';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    headers.forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rowsData.forEach((rowArr) => {
      const tr = document.createElement('tr');
      rowArr.forEach((cell, i) => {
        const td = document.createElement('td');
        const text = String(cell);
        td.textContent = text;
        if (rightAlignFromIndex !== undefined && i >= rightAlignFromIndex) {
          td.classList.add(text.trim().startsWith('-') ? 'neg' : 'pos');
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  function tooltipStyle(colors) {
    return {
      backgroundColor: colors.surface,
      titleColor: colors.primary,
      bodyColor: colors.primary,
      borderColor: colors.grid,
      borderWidth: 1,
      padding: 10,
      boxPadding: 4,
      cornerRadius: 8,
    };
  }

  // ---------------------------------------------------------------- KPIs
  function renderKPIs(rows) {
    const sales = rows.reduce((a, r) => a + r.sales, 0);
    const profit = rows.reduce((a, r) => a + r.profit, 0);
    const margin = sales ? profit / sales : 0;
    const orders = new Set(rows.map((r) => r.o)).size;
    const avgDisc = rows.length ? rows.reduce((a, r) => a + r.disc, 0) / rows.length : 0;

    document.getElementById('kpiSales').textContent = fmtUSD(sales);
    const profitEl = document.getElementById('kpiProfit');
    profitEl.textContent = fmtUSD(profit);
    profitEl.classList.toggle('neg', profit < 0);
    document.getElementById('kpiMargin').textContent = fmtPct(margin);
    document.getElementById('kpiOrders').textContent = orders.toLocaleString('en-US');
    document.getElementById('kpiDiscount').textContent = fmtPct(avgDisc);
  }

  // ---------------------------------------------------------------- category
  function renderCategoryChart(rows) {
    const m = groupSum(rows, (r) => r.c);
    const categories = Array.from(m.keys()).sort();
    const sales = categories.map((c) => m.get(c).sales);
    const profit = categories.map((c) => m.get(c).profit);
    const colors = themeColors();

    makeChart('categoryChart', {
      type: 'bar',
      data: {
        labels: categories,
        datasets: [
          { label: 'Sales', data: sales, backgroundColor: colors.series1, borderRadius: 4, borderSkipped: false, maxBarThickness: 46 },
          { label: 'Profit', data: profit, backgroundColor: colors.series2, borderRadius: 4, borderSkipped: false, maxBarThickness: 46 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', align: 'start', labels: { color: colors.text, usePointStyle: true, boxWidth: 8, boxHeight: 8 } },
          tooltip: Object.assign({ callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtUSD(ctx.parsed.y)}` } }, tooltipStyle(colors)),
        },
        scales: {
          x: { ticks: { color: colors.muted }, grid: { display: false } },
          y: { ticks: { color: colors.muted, callback: (v) => fmtUSDk(v) }, grid: { color: colors.grid } },
        },
      },
    });

    renderTable(
      'category-table',
      ['Category', 'Sales', 'Profit', 'Margin'],
      categories.map((c) => {
        const e = m.get(c);
        return [c, fmtUSD(e.sales), fmtUSD(e.profit), fmtPct(e.sales ? e.profit / e.sales : 0)];
      }),
      2
    );
  }

  // ---------------------------------------------------------------- segment
  function renderSegmentChart(rows) {
    const m = groupSum(rows, (r) => r.g);
    const segments = Array.from(m.keys()).sort((a, b) => m.get(b).sales - m.get(a).sales);
    const sales = segments.map((s) => m.get(s).sales);
    const profit = segments.map((s) => m.get(s).profit);
    const colors = themeColors();

    makeChart('segmentChart', {
      type: 'bar',
      data: {
        labels: segments,
        datasets: [
          { label: 'Sales', data: sales, backgroundColor: colors.series1, borderRadius: 4, borderSkipped: false, maxBarThickness: 40 },
          { label: 'Profit', data: profit, backgroundColor: colors.series2, borderRadius: 4, borderSkipped: false, maxBarThickness: 40 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', align: 'start', labels: { color: colors.text, usePointStyle: true, boxWidth: 8, boxHeight: 8 } },
          tooltip: Object.assign({ callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtUSD(ctx.parsed.y)}` } }, tooltipStyle(colors)),
        },
        scales: {
          x: { ticks: { color: colors.muted }, grid: { display: false } },
          y: { ticks: { color: colors.muted, callback: (v) => fmtUSDk(v) }, grid: { color: colors.grid } },
        },
      },
    });

    renderTable(
      'segment-table',
      ['Segment', 'Sales', 'Profit', 'Margin'],
      segments.map((s) => {
        const e = m.get(s);
        return [s, fmtUSD(e.sales), fmtUSD(e.profit), fmtPct(e.sales ? e.profit / e.sales : 0)];
      }),
      2
    );
  }

  // ---------------------------------------------------------------- sub-category
  function renderSubcategoryChart(rows) {
    const m = groupSum(rows, (r) => r.s);
    let subs = Array.from(m.keys());
    subs.sort((a, b) => m.get(a).profit - m.get(b).profit);
    subs.reverse(); // best on top, worst at bottom
    const colors = themeColors();
    const values = subs.map((s) => m.get(s).profit);
    const barColors = values.map((v) => (v < 0 ? colors.neg : colors.pos));

    makeChart('subcategoryChart', {
      type: 'bar',
      data: { labels: subs, datasets: [{ label: 'Profit', data: values, backgroundColor: barColors, borderRadius: 4, borderSkipped: false }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({ callbacks: { label: (ctx) => `Profit: ${fmtUSD(ctx.parsed.x)}` } }, tooltipStyle(colors)),
        },
        scales: {
          x: { ticks: { color: colors.muted, callback: (v) => fmtUSDk(v) }, grid: { color: colors.grid } },
          y: { ticks: { color: colors.text }, grid: { display: false } },
        },
      },
    });

    renderTable(
      'subcategory-table',
      ['Sub-Category', 'Sales', 'Profit', 'Avg. Discount'],
      subs.map((s) => {
        const e = m.get(s);
        return [s, fmtUSD(e.sales), fmtUSD(e.profit), fmtPct(e.count ? e.discSum / e.count : 0)];
      }),
      2
    );
  }

  // ---------------------------------------------------------------- discount cliff
  const DISCOUNT_BANDS = [
    { label: '0%', test: (d) => d <= 0 },
    { label: '1-10%', test: (d) => d > 0 && d <= 0.1 },
    { label: '11-20%', test: (d) => d > 0.1 && d <= 0.2 },
    { label: '21-30%', test: (d) => d > 0.2 && d <= 0.3 },
    { label: '31-50%', test: (d) => d > 0.3 && d <= 0.5 },
    { label: '51%+', test: (d) => d > 0.5 },
  ];

  function renderDiscountChart(rows) {
    const agg = DISCOUNT_BANDS.map((b) => ({ label: b.label, sales: 0, profit: 0 }));
    rows.forEach((r) => {
      const idx = DISCOUNT_BANDS.findIndex((b) => b.test(r.disc));
      if (idx >= 0) { agg[idx].sales += r.sales; agg[idx].profit += r.profit; }
    });
    const colors = themeColors();
    const margins = agg.map((a) => (a.sales ? a.profit / a.sales : 0));
    const barColors = margins.map((v) => (v < 0 ? colors.neg : colors.pos));

    makeChart('discountChart', {
      type: 'bar',
      data: { labels: agg.map((a) => a.label), datasets: [{ label: 'Avg. margin', data: margins, backgroundColor: barColors, borderRadius: 4, borderSkipped: false, maxBarThickness: 44 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({ callbacks: { label: (ctx) => `Avg. margin: ${fmtPct(ctx.parsed.y)}` } }, tooltipStyle(colors)),
        },
        scales: {
          x: { ticks: { color: colors.muted }, grid: { display: false } },
          y: { ticks: { color: colors.muted, callback: (v) => fmtPct(v) }, grid: { color: colors.grid } },
        },
      },
    });

    renderTable(
      'discount-table',
      ['Discount band', 'Sales', 'Profit', 'Avg. margin'],
      agg.map((a, i) => [a.label, fmtUSD(a.sales), fmtUSD(a.profit), fmtPct(margins[i])]),
      2
    );
  }

  // ---------------------------------------------------------------- monthly trend
  function renderMonthlyTrendChart(rows) {
    const m = groupSum(rows, (r) => r.m);
    const months = Array.from(m.keys()).sort();
    const sales = months.map((k) => m.get(k).sales);
    const profit = months.map((k) => m.get(k).profit);
    const colors = themeColors();

    makeChart('monthlyTrendChart', {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          { label: 'Sales', data: sales, borderColor: colors.series1, backgroundColor: colors.series1, tension: 0.25, pointRadius: 2, pointHoverRadius: 5, borderWidth: 2 },
          { label: 'Profit', data: profit, borderColor: colors.series2, backgroundColor: colors.series2, tension: 0.25, pointRadius: 2, pointHoverRadius: 5, borderWidth: 2 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'start', labels: { color: colors.text, usePointStyle: true, boxWidth: 8, boxHeight: 8 } },
          tooltip: Object.assign({ mode: 'index', intersect: false, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtUSD(ctx.parsed.y)}` } }, tooltipStyle(colors)),
        },
        scales: {
          x: { ticks: { color: colors.muted, maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 14 }, grid: { display: false } },
          y: { ticks: { color: colors.muted, callback: (v) => fmtUSDk(v) }, grid: { color: colors.grid } },
        },
      },
    });

    renderTable(
      'monthlyTrend-table',
      ['Month', 'Sales', 'Profit'],
      months.map((k) => [k, fmtUSD(m.get(k).sales), fmtUSD(m.get(k).profit)]),
      1
    );
  }

  // ---------------------------------------------------------------- heatmap
  function hexToRgb(hex) {
    const h = hex.replace('#', '').trim();
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mixRgb(c1, c2, t) {
    return c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
  }
  function divergeColor(v, maxAbs, colors) {
    const t = maxAbs ? Math.max(-1, Math.min(1, v / maxAbs)) : 0;
    const neg = hexToRgb(colors.neg), mid = hexToRgb(colors.mid), pos = hexToRgb(colors.pos);
    const rgb = t < 0 ? mixRgb(mid, neg, -t) : mixRgb(mid, pos, t);
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  }

  function renderHeatmap(rows) {
    const categories = data.meta.categories;
    const matrix = {};
    const regionsPresent = new Set();
    rows.forEach((row) => {
      regionsPresent.add(row.r);
      matrix[row.r] = matrix[row.r] || {};
      matrix[row.r][row.c] = (matrix[row.r][row.c] || 0) + row.profit;
    });
    const regionTotals = Array.from(regionsPresent).map((r) => ({
      r,
      total: categories.reduce((a, c) => a + (matrix[r][c] || 0), 0),
    }));
    regionTotals.sort((a, b) => b.total - a.total);
    const orderedRegions = regionTotals.map((x) => x.r);

    const allValues = [];
    orderedRegions.forEach((r) => categories.forEach((c) => allValues.push(matrix[r][c] || 0)));
    const maxAbs = Math.max(...allValues.map((v) => Math.abs(v)), 1);
    const colors = themeColors();

    const container = document.getElementById('heatmap');
    container.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'heatmap-row head';
    head.appendChild(document.createElement('div'));
    categories.forEach((c) => {
      const d = document.createElement('div');
      d.textContent = c;
      head.appendChild(d);
    });
    container.appendChild(head);

    orderedRegions.forEach((r) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'heatmap-row';
      const label = document.createElement('div');
      label.className = 'rowlabel';
      label.textContent = r;
      rowEl.appendChild(label);
      categories.forEach((c) => {
        const v = matrix[r][c] || 0;
        const cell = document.createElement('div');
        cell.className = 'heatcell';
        cell.style.background = divergeColor(v, maxAbs, colors);
        cell.style.color = Math.abs(v) / maxAbs > 0.45 ? '#ffffff' : colors.primary;
        cell.textContent = fmtUSDk(v);
        cell.title = r + ' · ' + c + ': ' + fmtUSD(v);
        cell.tabIndex = 0;
        rowEl.appendChild(cell);
      });
      container.appendChild(rowEl);
    });

    document.getElementById('heatMinLabel').textContent = fmtUSD(-maxAbs);
    document.getElementById('heatMaxLabel').textContent = fmtUSD(maxAbs);
  }

  // ---------------------------------------------------------------- loss-making customers
  function renderLossTable(rows) {
    const m = new Map();
    rows.forEach((r) => {
      if (!m.has(r.cid)) m.set(r.cid, { name: r.cn, sales: 0, profit: 0 });
      const e = m.get(r.cid);
      e.sales += r.sales;
      e.profit += r.profit;
    });
    const losers = Array.from(m.values())
      .filter((e) => e.profit < 0)
      .sort((a, b) => a.profit - b.profit)
      .slice(0, 15);

    const wrap = document.getElementById('lossTableWrap');
    wrap.innerHTML = '';
    if (!losers.length) {
      const p = document.createElement('p');
      p.className = 'caption';
      p.textContent = 'No loss-making customers under the current filter.';
      wrap.appendChild(p);
      return;
    }
    const table = document.createElement('table');
    table.className = 'data-table';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Customer', 'Sales', 'Lifetime profit'].forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    losers.forEach((e) => {
      const tr = document.createElement('tr');
      const tdName = document.createElement('td');
      tdName.textContent = e.name;
      const tdSales = document.createElement('td');
      tdSales.textContent = fmtUSD(e.sales);
      const tdProfit = document.createElement('td');
      tdProfit.textContent = fmtUSD(e.profit);
      tdProfit.classList.add('neg');
      tr.appendChild(tdName);
      tr.appendChild(tdSales);
      tr.appendChild(tdProfit);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  // ---------------------------------------------------------------- filters & wiring
  function populateFilters(meta) {
    const yearSel = document.getElementById('yearFilter');
    meta.years.forEach((y) => {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      yearSel.appendChild(opt);
    });
    const regionSel = document.getElementById('regionFilter');
    meta.regions.forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      regionSel.appendChild(opt);
    });
    yearSel.addEventListener('change', () => { state.year = yearSel.value; renderAll(); });
    regionSel.addEventListener('change', () => { state.region = regionSel.value; renderAll(); });
    document.getElementById('resetFilters').addEventListener('click', () => {
      state.year = 'all';
      state.region = 'all';
      yearSel.value = 'all';
      regionSel.value = 'all';
      renderAll();
    });
  }

  function wireTableToggles() {
    document.querySelectorAll('.table-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.target;
        const tableDiv = document.getElementById(key + '-table');
        const chartWrap = tableDiv.previousElementSibling;
        const showTable = tableDiv.hidden;
        tableDiv.hidden = !showTable;
        chartWrap.hidden = showTable;
        btn.textContent = showTable ? 'Chart view' : 'Table view';
      });
    });
  }

  function renderAll() {
    const rows = filteredRows();
    renderKPIs(rows);
    renderCategoryChart(rows);
    renderSegmentChart(rows);
    renderSubcategoryChart(rows);
    renderDiscountChart(rows);
    renderMonthlyTrendChart(rows);
    renderHeatmap(rows);
    renderLossTable(rows);
  }

  fetch('data.json')
    .then((r) => r.json())
    .then((json) => {
      data = json;
      populateFilters(json.meta);
      wireTableToggles();
      renderAll();
    })
    .catch((err) => {
      document.querySelector('.page').insertAdjacentHTML(
        'afterbegin',
        '<p style="color:#e34948">Could not load dashboard data. Please try reloading the page.</p>'
      );
      console.error(err);
    });
})();

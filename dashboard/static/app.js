/* ── 竞品情报看板 — 前端逻辑 ── */

let allData = null;
let starChart = null;

// ── Init ──

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const resp = await fetch('/api/competitors');
    allData = await resp.json();
    render();
  } catch (e) {
    document.getElementById('summaryBar').innerHTML =
      `<span class="summary-item" style="color:#ef4444;">❌ 加载失败: ${e.message}</span>`;
  }
  document.getElementById('updatedAt').textContent =
    new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
});

// ── Render ──

function render() {
  if (!allData || !allData.competitors) return;
  const comps = allData.competitors;

  // Summary bar
  const totalStars = comps.reduce((s, c) => {
    const g = c.github_metrics || {};
    return s + (g.stars || 0);
  }, 0);
  const bar = document.getElementById('summaryBar');
  bar.innerHTML = `
    <span class="summary-item">竞品 <strong>${comps.length}</strong> 家</span>
    <span class="summary-item">总 Stars <strong>${totalStars.toLocaleString()}</strong></span>
  `;

  // Sidebar list
  const list = document.getElementById('competitorList');
  list.innerHTML = comps.map(c => {
    const g = c.github_metrics || {};
    const stars = g.stars != null ? g.stars.toLocaleString() : '?';
    return `<li data-slug="${c.slug}" onclick="selectCompetitor('${c.slug}')">
      <span>${c.name}</span>
      <span class="stars-badge">⭐ ${stars}</span>
    </li>`;
  }).join('');

  // Alerts
  const alertDiv = document.getElementById('alertList');
  const hasAlerts = comps.some(c => c.pricing_status?.changed);
  if (hasAlerts) {
    alertDiv.innerHTML = comps
      .filter(c => c.pricing_status?.changed)
      .map(c => `<div class="alert-item">🔴 ${c.name}: 定价变化</div>`)
      .join('');
  } else {
    alertDiv.innerHTML = '<div class="alert-empty">暂无告警</div>';
  }

  // Auto-select first
  if (comps.length) selectCompetitor(comps[0].slug);
}

// ── Select Competitor ──

function selectCompetitor(slug) {
  // Highlight
  document.querySelectorAll('#competitorList li').forEach(el => {
    el.classList.toggle('active', el.dataset.slug === slug);
  });

  const comp = allData.competitors.find(c => c.slug === slug);
  if (!comp) return;

  const g = comp.github_metrics || {};
  const p = comp.pricing_status || {};
  const desc = g.description || '';
  const stars = g.stars != null ? g.stars.toLocaleString() : '—';
  const forks = g.forks != null ? g.forks.toLocaleString() : '—';
  const issues = g.open_issues != null ? g.open_issues.toLocaleString() : '—';
  const prs = g.open_prs != null ? g.open_prs.toLocaleString() : '—';
  const latestRel = g.latest_release || '—';
  const relDate = g.latest_release_date || '';
  const pricingChecked = p.last_checked || '—';

  // Star delta
  let deltaHTML = '<span class="tag-flat">—</span>';
  const history = comp.starHistory || [];
  if (history.length >= 2) {
    const prev = history[history.length - 2].stars;
    const curr = history[history.length - 1].stars;
    const delta = curr - prev;
    if (delta > 0) deltaHTML = `<span class="tag-up">↑ +${delta}</span>`;
    else if (delta < 0) deltaHTML = `<span class="tag-down">↓ ${delta}</span>`;
    else deltaHTML = `<span class="tag-flat">→ 0</span>`;
  }

  const detail = document.getElementById('detailView');
  detail.innerHTML = `
    <div class="detail-header">
      <h2>${comp.name}</h2>
      ${desc ? `<p class="desc">${desc}</p>` : ''}
    </div>

    <div class="detail-grid">
      <div class="card"><h3>Stars</h3>
        <div class="value">⭐ ${stars}</div>
        <div class="label">较上次采集 ${deltaHTML}</div>
      </div>
      <div class="card"><h3>Forks</h3>
        <div class="value">🍴 ${forks}</div>
        <div class="label">复刻数</div>
      </div>
      <div class="card"><h3>Open Issues</h3>
        <div class="value">${issues}</div>
        <div class="label">未解决问题</div>
      </div>
      <div class="card"><h3>Open PRs</h3>
        <div class="value">${prs}</div>
        <div class="label">待审 Pull Requests</div>
      </div>
    </div>

    <div class="detail-grid" style="margin-top:0;">
      <div class="card full">
        <h3>最新 Release</h3>
        <div style="font-size:1.1rem;font-weight:600;">${latestRel}</div>
        <div class="label">${relDate ? `发布于 ${relDate}` : ''}</div>
      </div>
    </div>

    <div class="detail-grid" style="margin-top:0;">
      <div class="card full">
        <h3>定价状态</h3>
        <div class="metric-row">
          <span class="label">上次检查</span>
          <span class="value">${pricingChecked}</span>
        </div>
        <div class="metric-row">
          <span class="label">定价变化</span>
          <span class="value">${p.changed ? '<span style="color:#ef4444;">🔴 有变化</span>' : '<span style="color:#22c55e;">✅ 无变化</span>'}</span>
        </div>
      </div>
    </div>

    ${history.length >= 2 ? `
    <div class="chart-container">
      <h3 style="font-size:0.8rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;">Stars 趋势</h3>
      <canvas id="starChart"></canvas>
    </div>
    ` : ''}
  `;

  // Draw chart
  if (history.length >= 2) {
    const canvas = document.getElementById('starChart');
    const ctx = canvas.getContext('2d');
    if (starChart) starChart.destroy();

    const labels = history.map(h => h.date);
    const data = history.map(h => h.stars);

    starChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: `${comp.name} Stars`,
          data,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#3b82f6',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8' } } },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: '#334155' } },
          y: { ticks: { color: '#64748b' }, grid: { color: '#334155' } }
        }
      }
    });
  }
}

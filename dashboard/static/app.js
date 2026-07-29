/* ── 竞品情报看板 v3 — 前端逻辑 ── */

function renderActivityScore(comp) {
  const a = comp.activityScore;
  if (!a) return '';
  const scoreColor = a.score >= 70 ? 'var(--accent-emerald)' : a.score >= 40 ? 'var(--accent-amber)' : 'var(--accent-rose)';
  const label = a.score >= 70 ? '🔥 活跃' : a.score >= 40 ? '📊 平稳' : '💤 低活跃';
  return `
    <div class="info-section">
      <h3>活跃度 <span style="color:${scoreColor};font-size:1.2rem;font-weight:700;float:right;">${a.score}<span style="font-size:0.65rem;opacity:0.5;">/100</span></span></h3>
      <div class="info-row">
        <span class="info-label">Star 动量</span>
        <span class="info-value">${a.starMomentum}/40</span>
      </div>
      <div class="info-row">
        <span class="info-label">Release 活跃</span>
        <span class="info-value">${a.releaseActivity}/30</span>
      </div>
      <div class="info-row">
        <span class="info-label">社区热度</span>
        <span class="info-value">${a.communityPulse}/30</span>
      </div>
      <div style="font-size:0.7rem;color:var(--text-dim);margin-top:0.3rem;">${label}</div>
    </div>`;
}

function renderMilestone(comp) {
  const m = comp.milestone;
  if (!m) return '';
  const pct = m.next ? Math.round((m.current / m.next) * 100) : 100;
  const barColor = pct >= 80 ? 'var(--accent-emerald)' : pct >= 50 ? 'var(--accent-amber)' : 'var(--accent-blue)';
  return `
    <div class="info-section">
      <h3>Star 里程碑</h3>
      <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:0.4rem;">
        <span>⭐ ${(m.current || 0).toLocaleString()}</span>
        <span style="color:var(--text-dim);">${m.next ? '下一个: ' + (m.next || 0).toLocaleString() : '已达最高里程碑 🏆'}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${Math.min(100, pct)}%;background:${barColor};"></div>
      </div>
    </div>`;
}

let allData = null;
const charts = {};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [compResp, alertResp] = await Promise.all([
      fetch('/api/competitors'),
      fetch('/api/alerts'),
    ]);
    allData = await compResp.json();
    const alertData = await alertResp.json();
    render(alertData);
    setupTabs();
    loadTrends();
    loadReleases();
  } catch (e) {
    document.getElementById('summaryBar').innerHTML =
      `<span class="summary-item" style="color:#f43f5e;">❌ 加载失败</span>`;
  }
  document.getElementById('updatedAt').textContent =
    new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
});

// ── Tab System ──
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      const content = document.getElementById('tab-' + tab.dataset.tab);
      if (content) content.classList.add('active');
    });
  });
}

// ── Render ──
function render(alertData) {
  if (!allData || !allData.competitors) return;
  const comps = allData.competitors;

  // Summary bar
  const totalStars = comps.reduce((s, c) => s + ((c.github_metrics || {}).stars || 0), 0);
  const latestDate = comps.reduce((latest, c) => {
    const d = c.last_snapshot || '';
    return d > latest ? d : latest;
  }, '');
  document.getElementById('summaryBar').innerHTML = `
    <span class="summary-item">竞品 <strong>${comps.length}</strong> 家</span>
    <span class="summary-item">总 Stars <strong>${totalStars.toLocaleString()}</strong></span>
    <span class="summary-item">数据 <strong>${latestDate || '—'}</strong></span>
    <span class="summary-item">告警 <strong style="color:${(alertData?.alerts?.length || 0) > 0 ? '#f43f5e' : '#10b981'}">${alertData?.alerts?.length || 0}</strong></span>
  `;

  // Count badge
  document.getElementById('compCount').textContent = comps.length;

  // Sidebar list
  const list = document.getElementById('competitorList');
  list.innerHTML = comps.map(c => {
    const g = c.github_metrics || {};
    const stars = g.stars != null ? g.stars.toLocaleString() : '?';
    const delta = c.starDelta;
    const deltaStr = delta != null
      ? `<span class="tag-up">+${delta}</span>`
      : (delta != null && delta < 0 ? `<span class="tag-down">${delta}</span>` : '');
    const score = c.activityScore?.score;
    const scoreBadge = score != null
      ? `<span class="score-badge" style="color:${score >= 70 ? 'var(--accent-emerald)' : score >= 40 ? 'var(--accent-amber)' : 'var(--accent-rose)'}">${score}</span>`
      : '';
    return `<li data-slug="${c.slug}" onclick="selectCompetitor('${c.slug}')">
      <span style="font-weight:500;">${c.name}</span>
      <span class="stars-badge">${scoreBadge} ⭐ ${stars} ${deltaStr}</span>
    </li>`;
  }).join('');

  // Compare dropdowns
  const selA = document.getElementById('compareA');
  const selB = document.getElementById('compareB');
  if (selA) {
    selA.innerHTML = comps.map(c => `<option value="${c.slug}">${c.name}</option>`).join('');
    selB.innerHTML = comps.map(c => `<option value="${c.slug}">${c.name}</option>`).join('');
    if (comps.length >= 2) {
      selA.value = comps[0].slug;
      selB.value = comps[1].slug;
      loadCompare();
    }
  }

  // Alerts count on tab
  if (alertData?.alerts?.length) {
    const alertTab = document.querySelector('[data-tab="alerts"]');
    if (alertTab) alertTab.textContent = `🚨 告警 (${alertData.alerts.length})`;
  }

  // Render alerts
  renderAlerts(alertData);

  // Auto-select first competitor
  if (comps.length) selectCompetitor(comps[0].slug);
}

// ── Select Competitor ──
function selectCompetitor(slug) {
  document.querySelectorAll('#competitorList li').forEach(el => {
    el.classList.toggle('active', el.dataset.slug === slug);
  });

  const comp = allData.competitors.find(c => c.slug === slug);
  if (!comp) return;

  const g = comp.github_metrics || {};
  const p = comp.pricing_status || {};
  const history = comp.starHistory || [];
  const delta = comp.starDelta;

  const deltaHTML = delta != null
    ? (delta > 0
      ? `<span class="tag-up">↑ +${delta}</span>`
      : `<span class="tag-down">↓ ${delta}</span>`)
    : '<span class="tag-flat">—</span>';

  const detail = document.getElementById('detailView');
  detail.innerHTML = `
    <div class="detail-header">
      <h2>${comp.name}</h2>
      ${g.description ? `<p class="desc">${g.description}</p>` : ''}
    </div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Stars</div>
        <div class="metric-value" style="color:var(--accent-amber);">${(g.stars || 0).toLocaleString()}</div>
        <div class="metric-sub">区间变化 ${deltaHTML}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Forks</div>
        <div class="metric-value">${(g.forks || 0).toLocaleString()}</div>
        <div class="metric-sub">复刻数</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Issues</div>
        <div class="metric-value" style="color:${(g.open_issues || 0) > 500 ? 'var(--accent-rose)' : 'var(--text-primary)'};">${(g.open_issues || 0).toLocaleString()}</div>
        <div class="metric-sub">未解决</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">PRs</div>
        <div class="metric-value">${(g.open_prs || 0).toLocaleString()}</div>
        <div class="metric-sub">待审</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;">
      <div class="info-section">
        <h3>最新版本</h3>
        <div style="font-size:1.05rem;font-weight:600;font-family:var(--font-mono);">
          ${g.latest_release || '—'}
        </div>
        <div style="font-size:0.75rem;color:var(--text-dim);margin-top:0.2rem;">
          ${g.latest_release_date ? `发布于 ${g.latest_release_date}` : ''}
        </div>
      </div>
      <div class="info-section">
        <h3>定价状态</h3>
        <div class="info-row">
          <span class="info-label">检查时间</span>
          <span class="info-value">${p.last_checked || '—'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">变动</span>
          <span class="info-value">${p.changed ? '🔴 有变化' : '✅ 无变化'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">快照</span>
          <span class="info-value">${history.length} 次</span>
        </div>
      </div>
      ${renderActivityScore(comp)}
    </div>

    ${renderMilestone(comp)}

    ${history.length >= 2 ? `
    <div class="chart-block-small">
      <h3 style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-dim);margin-bottom:0.5rem;">Star 趋势</h3>
      <canvas id="starChart"></canvas>
    </div>
    ` : (history.length === 1 ? `
    <div class="chart-block-small" style="text-align:center;color:var(--text-dim);font-size:0.82rem;">
      📊 数据点不足（${history.length}/2），明天自动采集后显示趋势
    </div>
    ` : '')}
  `;

  // Draw chart
  if (history.length >= 2) {
    const canvas = document.getElementById('starChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (charts.star) charts.star.destroy();

    charts.star = new Chart(ctx, {
      type: 'line',
      data: {
        labels: history.map(h => h.date),
        datasets: [{
          label: comp.name,
          data: history.map(h => h.stars),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#10b981',
          pointHoverRadius: 7,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#56587a', font: { size: 10 } }, grid: { color: '#222442' } },
          y: { ticks: { color: '#56587a', font: { size: 10 } }, grid: { color: '#222442' } }
        },
        interaction: { mode: 'index', intersect: false }
      }
    });
  }
}

// ── Trends Tab ──
async function loadTrends() {
  try {
    const resp = await fetch('/api/trends');
    const data = await resp.json();
    if (!data?.dates?.length) {
      document.getElementById('trendChart').parentElement.innerHTML =
        '<div style="text-align:center;padding:3rem;color:var(--text-dim);">📊 暂无趋势数据，明天自动采集后显示</div>';
      return;
    }

    const canvas = document.getElementById('trendChart');
    const ctx = canvas.getContext('2d');

    const colors = ['#10b981','#3b82f6','#f43f5e','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#f97316'];
    const datasets = [];
    let i = 0;
    for (const [, sdata] of Object.entries(data.datasets)) {
      datasets.push({
        label: sdata.name,
        data: sdata.data,
        borderColor: colors[i % colors.length],
        backgroundColor: colors[i % colors.length] + '18',
        fill: false,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        spanGaps: true,
      });
      i++;
    }

    if (charts.trend) charts.trend.destroy();
    charts.trend = new Chart(ctx, {
      type: 'line',
      data: { labels: data.dates, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#8b8da3', font: { size: 11, family: 'Outfit' } } },
        },
        scales: {
          x: { ticks: { color: '#56587a', font: { size: 10 } }, grid: { color: '#222442' } },
          y: { ticks: { color: '#56587a', font: { size: 10 } }, grid: { color: '#222442' } }
        }
      }
    });
  } catch (e) {
    console.error('Trends error:', e);
  }
}

// ── Compare Tab ──
async function loadCompare() {
  const a = document.getElementById('compareA')?.value;
  const b = document.getElementById('compareB')?.value;
  if (!a || !b) return;

  try {
    const resp = await fetch(`/api/compare?slugs=${a},${b}`);
    const data = await resp.json();
    const comps = data.comparison || [];
    if (comps.length < 2) return;

    document.getElementById('compareChartContainer').style.display = 'block';

    const rows = [
      ['Stars', ...comps.map(c => '⭐ ' + (c.stars || 0).toLocaleString())],
      ['Forks', ...comps.map(c => '🍴 ' + (c.forks || 0).toLocaleString())],
      ['Issues', ...comps.map(c => (c.open_issues || 0).toLocaleString())],
      ['PRs', ...comps.map(c => (c.open_prs || 0).toLocaleString())],
      ['版本', ...comps.map(c => c.latest_release || '—')],
      ['发布日期', ...comps.map(c => c.latest_release_date || '—')],
      ['定价变动', ...comps.map(c => c.pricing_changed ? '🔴 是' : '✅ 否')],
    ];

    document.getElementById('compareResult').innerHTML = `
      <table class="compare-table">
        ${rows.map(r => `<tr><td>${r[0]}</td>${r.slice(1).map(v => `<td style="font-weight:500;">${v}</td>`).join('')}</tr>`).join('')}
      </table>
    `;

    const canvas = document.getElementById('compareChart');
    const ctx = canvas.getContext('2d');
    if (charts.compare) charts.compare.destroy();

    const palette = ['#10b981', '#3b82f6'];
    const datasets = comps.map((c, i) => ({
      label: c.name,
      data: (c.starHistory || []).map(h => h.stars),
      borderColor: palette[i],
      backgroundColor: palette[i] + '18',
      fill: true,
      tension: 0.3,
      pointRadius: 5,
      pointHoverRadius: 7,
    }));

    charts.compare = new Chart(ctx, {
      type: 'line',
      data: { labels: comps[0]?.starHistory?.map(h => h.date) || [], datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8b8da3', font: { size: 11, family: 'Outfit' } } } },
        scales: {
          x: { ticks: { color: '#56587a' }, grid: { color: '#222442' } },
          y: { ticks: { color: '#56587a' }, grid: { color: '#222442' } }
        }
      }
    });
  } catch (e) {
    document.getElementById('compareResult').innerHTML =
      `<p style="color:var(--accent-rose);">加载失败: ${e.message}</p>`;
  }
}

// ── Alerts ──
function renderAlerts(alertData) {
  const alerts = alertData?.alerts || [];
  const div = document.getElementById('alertDetail');
  if (!div) return;

  if (alerts.length === 0) {
    div.innerHTML = '<div class="alert-empty-state">✅ 当前没有定价告警</div>';
    return;
  }

  div.innerHTML = alerts.map(a => `
    <div class="alert-card ${a.priority === 'high' ? 'alert-high' : 'alert-info'}">
      <div class="alert-header">
        <span class="alert-comp">${a.competitor || '—'}</span>
        <span class="alert-date">${a.date || '—'}</span>
        <span class="alert-priority">${a.priority === 'high' ? '🔴 高优' : '🔵 信息'}</span>
      </div>
      <div class="alert-body">${a.detail || '—'}</div>
      <div class="alert-footer">${a.confirmed ? '✅ 已确认' : '⏳ 待确认'}</div>
    </div>
  `).join('');
}

// ── Releases ──
async function loadReleases() {
  try {
    const resp = await fetch('/api/releases');
    const data = await resp.json();
    const releases = data.releases || [];
    const div = document.getElementById('releaseDetail');
    if (!div) return;

    if (releases.length === 0) {
      div.innerHTML = '<div class="release-empty-state">暂无版本数据</div>';
      return;
    }

    div.innerHTML = `<div class="release-grid">
      ${releases.map(r => `
        <div class="release-card">
          <h4>${r.name}</h4>
          ${r.releases.map(rel => `
            <div class="release-item">
              <span class="tag">${rel.tag}</span>
              <span class="date">${rel.date}</span>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>`;
  } catch (e) {
    console.error('Releases error:', e);
  }
}

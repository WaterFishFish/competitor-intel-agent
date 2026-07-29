#!/usr/bin/env node
/**
 * 竞品情报看板 Server (v3)
 * Added: 活跃度评分, Star 里程碑, 数据导出
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const ROOT = __dirname;
const DATA_DIR = path.resolve(ROOT, '..', 'data');
const MILESTONES = [10000, 25000, 50000, 100000, 150000, 200000, 500000];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv':  'text/csv; charset=utf-8',
};

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data, null, 2));
}

function sendFile(res, filePath) {
  try {
    const ext = path.extname(filePath);
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

function getCompetitors() {
  return readJSON(path.join(DATA_DIR, 'competitors.json'));
}

function getStarHistory(slug) {
  const snapDir = path.join(DATA_DIR, 'snapshots', slug, 'github');
  const history = [];
  try {
    const files = fs.readdirSync(snapDir).sort();
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const snap = readJSON(path.join(snapDir, f));
      if (snap?.repo) {
        history.push({
          date: f.replace('.json', ''),
          stars: snap.repo.stargazers_count || 0,
          forks: snap.repo.forks_count || 0,
        });
      }
    }
  } catch {}
  return history;
}

// ── 活跃度评分 ──
function calcActivityScore(comp, starHistory) {
  const g = comp.github_metrics || {};
  if (!g.stars) return null;

  // 1. Star momentum (0-40): normalized star delta
  let starMomentum = 20; // default mid score
  if (starHistory.length >= 2) {
    const delta = starHistory[starHistory.length - 1].stars - starHistory[0].stars;
    // Normalize: >5000 stars/mo = full score
    starMomentum = Math.min(40, Math.round((delta / 5000) * 40));
  }

  // 2. Release activity (0-30)
  let releaseActivity = 0;
  if (g.latest_release_date) {
    const releaseDate = new Date(g.latest_release_date);
    const daysAgo = (Date.now() - releaseDate.getTime()) / 86400000;
    if (daysAgo <= 7) releaseActivity = 30;
    else if (daysAgo <= 14) releaseActivity = 24;
    else if (daysAgo <= 30) releaseActivity = 18;
    else if (daysAgo <= 90) releaseActivity = 10;
    else releaseActivity = 5;
  }

  // 3. Community pulse (0-30): PRs + Issues as proxy for engagement
  const pulse = (g.open_prs || 0) + (g.open_issues || 0);
  let communityPulse = 0;
  if (pulse > 1000) communityPulse = 30;
  else if (pulse > 500) communityPulse = 25;
  else if (pulse > 200) communityPulse = 20;
  else if (pulse > 50) communityPulse = 15;
  else if (pulse > 10) communityPulse = 10;
  else communityPulse = 5;

  // Handle case where open_issues is the default repo count (includes PRs)
  // Large repos can have thousands - that's engagement, not bad
  const total = starMomentum + releaseActivity + communityPulse;
  const clamped = Math.min(100, Math.max(10, total));

  return {
    score: clamped,
    starMomentum,
    releaseActivity,
    communityPulse,
  };
}

// ── Star 里程碑检查 ──
function checkMilestones(comp, starHistory) {
  const stars = comp.github_metrics?.stars || 0;
  const seen = comp.seen_milestones || [];

  const reached = [];
  for (const m of MILESTONES) {
    if (stars >= m && !seen.includes(m)) {
      reached.push(m);
    }
  }

  return { reached, current: stars, next: MILESTONES.find(m => m > stars) };
}

// ── /api/competitors ──
function apiCompetitors() {
  const c = getCompetitors();
  if (!c) return null;
  const result = { competitors: [] };

  for (const comp of c.competitors) {
    const history = getStarHistory(comp.slug);
    let starDelta = null;
    if (history.length >= 2) {
      starDelta = history[history.length - 1].stars - history[0].stars;
    }

    const activity = calcActivityScore(comp, history);
    const milestone = checkMilestones(comp, history);

    result.competitors.push({
      ...comp,
      starHistory: history,
      starDelta,
      activityScore: activity,
      milestone,
    });
  }

  return result;
}

// ── /api/trends ──
function apiTrends() {
  const c = getCompetitors();
  if (!c) return null;

  const dateSet = new Set();
  const allHistories = {};
  for (const comp of c.competitors) {
    const history = getStarHistory(comp.slug);
    if (history.length > 0) {
      for (const h of history) dateSet.add(h.date);
      allHistories[comp.slug] = { name: comp.name, history };
    }
  }

  const sortedDates = Array.from(dateSet).sort();
  const datasets = {};
  for (const [slug, data] of Object.entries(allHistories)) {
    const dateMap = {};
    for (const h of data.history) dateMap[h.date] = h.stars;
    datasets[slug] = { name: data.name, data: sortedDates.map(d => dateMap[d] || null) };
  }

  return { dates: sortedDates, datasets };
}

// ── /api/releases ──
function apiReleases() {
  const c = getCompetitors();
  if (!c) return null;
  const releases = [];

  for (const comp of c.competitors) {
    const relDir = path.join(DATA_DIR, 'snapshots', comp.slug, 'releases');
    try {
      const files = fs.readdirSync(relDir).sort().reverse();
      if (files.length === 0) continue;
      const latest = readJSON(path.join(relDir, files[0]));
      if (latest && Array.isArray(latest)) {
        releases.push({
          slug: comp.slug,
          name: comp.name,
          releases: latest.slice(0, 3).map(r => ({
            tag: r.tag_name || '—',
            date: r.published_at ? r.published_at.slice(0, 10) : '—',
          })),
        });
      }
    } catch {}
  }

  return { releases };
}

// ── /api/compare ──
function apiCompare(slugsStr) {
  const slugs = (slugsStr || '').split(',').filter(Boolean);
  if (slugs.length < 2) return { error: '需要至少 2 个竞品' };

  const c = getCompetitors();
  if (!c) return null;
  const result = [];

  for (const slug of slugs) {
    const comp = c.competitors.find(x => x.slug === slug);
    if (!comp) continue;
    const g = comp.github_metrics || {};
    const p = comp.pricing_status || {};
    const history = getStarHistory(slug);
    const activity = calcActivityScore(comp, history);
    const milestone = checkMilestones(comp, history);

    result.push({
      slug: comp.slug,
      name: comp.name,
      stars: g.stars,
      forks: g.forks,
      open_issues: g.open_issues,
      open_prs: g.open_prs,
      latest_release: g.latest_release,
      latest_release_date: g.latest_release_date,
      description: g.description,
      pricing_changed: p.changed,
      pricing_last_checked: p.last_checked,
      activityScore: activity,
      milestone,
      starHistory: history,
    });
  }

  return { comparison: result };
}

// ── /api/export/csv — CSV 导出 ──
function apiExportCSV() {
  const c = getCompetitors();
  if (!c) return null;

  const headers = ['竞品','Stars','Forks','Issues','PRs','最新版本','发布日期','活跃度评分','Star 区间变化'];
  const rows = c.competitors.map(comp => {
    const g = comp.github_metrics || {};
    const history = getStarHistory(comp.slug);
    const activity = calcActivityScore(comp, history);
    const delta = history.length >= 2 ? history[history.length - 1].stars - history[0].stars : 0;
    return [
      comp.name,
      g.stars || 0,
      g.forks || 0,
      g.open_issues || 0,
      g.open_prs || 0,
      g.latest_release || '—',
      g.latest_release_date || '—',
      activity?.score || '—',
      delta !== 0 ? (delta > 0 ? `+${delta}` : String(delta)) : '—',
    ];
  });

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  return csvContent;
}

// ── /api/export/markdown — Markdown 导出 ──
function apiExportMarkdown() {
  const c = getCompetitors();
  if (!c) return null;

  let md = `# 竞品情报报表\n> 生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n`;
  md += `| 竞品 | Stars | Forks | Issues | PRs | 版本 | 活跃度 |\n`;
  md += `|------|------:|-------:|-------:|----:|------|--------:|\n`;

  // Sort by stars desc
  const sorted = [...c.competitors].sort((a, b) => (b.github_metrics?.stars || 0) - (a.github_metrics?.stars || 0));
  for (const comp of sorted) {
    const g = comp.github_metrics || {};
    const history = getStarHistory(comp.slug);
    const activity = calcActivityScore(comp, history);
    md += `| ${comp.name} | ${(g.stars || 0).toLocaleString()} | ${(g.forks || 0).toLocaleString()} | ${(g.open_issues || 0).toLocaleString()} | ${(g.open_prs || 0).toLocaleString()} | ${g.latest_release || '—'} | ${activity?.score || '—'}/100 |\n`;
  }

  // Add activity score breakdown
  md += `\n## 活跃度评分明细\n\n`;
  md += `| 竞品 | 总分 | Star 动量 | Release 活跃 | 社区热度 |\n`;
  md += `|------|-----:|----------:|-------------:|---------:|\n`;
  for (const comp of sorted) {
    const g = comp.github_metrics || {};
    const history = getStarHistory(comp.slug);
    const activity = calcActivityScore(comp, history);
    if (activity) {
      md += `| ${comp.name} | ${activity.score}/100 | ${activity.starMomentum}/40 | ${activity.releaseActivity}/30 | ${activity.communityPulse}/30 |\n`;
    }
  }

  return md;
}

// ── /api/milestones ──
function apiMilestones() {
  const c = getCompetitors();
  if (!c) return null;

  const result = [];
  for (const comp of c.competitors) {
    const stars = comp.github_metrics?.stars || 0;
    const seen = comp.seen_milestones || [];

    // Find next milestone
    const next = MILESTONES.find(m => m > stars);
    // Find last reached
    const reached = MILESTONES.filter(m => m <= stars).reverse();

    result.push({
      slug: comp.slug,
      name: comp.name,
      stars,
      nextMilestone: next || null,
      nextMilestoneProgress: next ? Math.round((stars / next) * 100) : 100,
      milestoneReached: reached.length > 0 ? reached[0] : null,
      seenMilestones: seen,
      newMilestones: MILESTONES.filter(m => m <= stars && !seen.includes(m)),
    });
  }

  return { milestones: result };
}

// ── HTTP Server ──
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  //── API Routes ──
  if (pathname === '/api/competitors') {
    const data = apiCompetitors();
    return sendJSON(res, data || { error: 'No data' }, data ? 200 : 500);
  }
  if (pathname === '/api/alerts') {
    return sendJSON(res, { alerts: readJSON(path.join(DATA_DIR, 'alerts.json')) || [] });
  }
  if (pathname === '/api/trends') {
    return sendJSON(res, apiTrends() || { error: 'No data' });
  }
  if (pathname === '/api/releases') {
    return sendJSON(res, apiReleases() || { error: 'No data' });
  }
  if (pathname === '/api/compare') {
    return sendJSON(res, apiCompare(url.searchParams.get('slugs') || ''));
  }
  if (pathname === '/api/milestones') {
    return sendJSON(res, apiMilestones() || { error: 'No data' });
  }
  if (pathname === '/api/export/csv') {
    const csv = apiExportCSV();
    if (!csv) return sendJSON(res, { error: 'No data' }, 500);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="competitor-report-${new Date().toISOString().slice(0,10)}.csv"`,
    });
    res.end('\uFEFF' + csv); // BOM for Excel
    return;
  }
  if (pathname === '/api/export/markdown') {
    const md = apiExportMarkdown();
    if (!md) return sendJSON(res, { error: 'No data' }, 500);
    res.writeHead(200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="competitor-report-${new Date().toISOString().slice(0,10)}.md"`,
    });
    res.end(md);
    return;
  }

  //── Static Files ──
  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(ROOT, 'static', 'index.html');
  } else {
    filePath = path.join(ROOT, 'static', pathname);
  }
  sendFile(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`📊 竞品情报看板 v3`);
  console.log(`http://localhost:${PORT}`);
  console.log(`\n📡 新 API:`);
  console.log(`  GET /api/milestones          — Star 里程碑进度`);
  console.log(`  GET /api/export/csv          — CSV 导出`);
  console.log(`  GET /api/export/markdown     — Markdown 导出`);
  console.log(`  (已有: /api/competitors, /api/trends, /api/releases, /api/compare, /api/alerts)`);
});

#!/usr/bin/env node
/**
 * 竞品情报简报 — Web UI 看板
 * Fast & lightweight: Node.js built-in http module + Chart.js (CDN)
 *
 * Usage:
 *   node dashboard/server.js
 *   # Opens http://localhost:3456
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const ROOT = __dirname;
const DATA_DIR = path.resolve(ROOT, '..', 'data');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ── Helpers ──

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
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

// ── API Routes ──

function apiCompetitors() {
  const c = readJSON(path.join(DATA_DIR, 'competitors.json'));
  if (!c) return null;

  // Attach GitHub star history for each competitor
  const result = { competitors: [] };
  for (const comp of c.competitors) {
    const slug = comp.slug;
    const snapDir = path.join(DATA_DIR, 'snapshots', slug, 'github');
    const starHistory = [];
    try {
      const files = fs.readdirSync(snapDir).sort();
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const snap = readJSON(path.join(snapDir, f));
        if (snap?.repo) {
          starHistory.push({
            date: f.replace('.json', ''),
            stars: snap.repo.stargazers_count || 0,
            forks: snap.repo.forks_count || 0,
          });
        }
      }
    } catch { /* no snapshots yet */ }

    result.competitors.push({ ...comp, starHistory });
  }
  return result;
}

function apiPricingAlerts() {
  const alerts = readJSON(path.join(DATA_DIR, 'alerts.json'));
  return alerts || [];
}

// ── HTTP Server ──

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // API routes
  if (pathname === '/api/competitors') {
    const data = apiCompetitors();
    return sendJSON(res, data || { error: 'No data' }, data ? 200 : 500);
  }

  if (pathname === '/api/alerts') {
    return sendJSON(res, { alerts: apiPricingAlerts() });
  }

  // Serve static files
  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(ROOT, 'static', 'index.html');
  } else {
    filePath = path.join(ROOT, 'static', pathname);
  }
  sendFile(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`📊 竞品情报看板 → http://localhost:${PORT}`);
  console.log(`📡 API 接口:
  GET /api/competitors  — 竞品列表 + GitHub 趋势
  GET /api/alerts       — 定价告警`);
});

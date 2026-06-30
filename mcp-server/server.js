#!/usr/bin/env node
/**
 * 竞品情报简报 — MCP Server
 * JSON-RPC 2.0 over stdio (MCP Protocol)
 *
 * Usage:
 *   node mcp-server/server.js
 *   # Then connect from any MCP client (Claude Desktop, Cursor, OpenClaw, etc.)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

let initialized = false;

// ── Helpers ──

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function getCompetitors() {
  return readJSON(path.join(DATA_DIR, 'competitors.json'));
}

function getSnapshots(slug, type = 'github') {
  const dir = path.join(DATA_DIR, 'snapshots', slug, type);
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json') || f.endsWith('.txt'))
      .sort()
      .map(f => ({
        date: f.replace(/\.(json|txt)$/, ''),
        path: path.join(dir, f),
      }));
  } catch { return []; }
}

function getLatestDigest() {
  const dir = path.join(DATA_DIR, 'digests');
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse();
    if (files.length === 0) return null;
    return readJSON(path.join(dir, files[0]));
  } catch { return null; }
}

function getAlerts() {
  return readJSON(path.join(DATA_DIR, 'alerts.json')) || [];
}

// ── MCP Protocol ──

function sendMessage(msg) {
  const line = JSON.stringify(msg);
  // MCP uses length-prefixed JSON-RPC over stdio
  process.stdout.write(line + '\n');
}

function sendError(id, code, message, data = null) {
  sendMessage({ jsonrpc: '2.0', id, error: { code, message, data } });
}

function sendResult(id, result) {
  sendMessage({ jsonrpc: '2.0', id, result });
}

// ── Resource Handlers ──

function handleResourcesList(id) {
  const resources = [
    {
      uri: 'competitor://list',
      name: '竞品列表',
      description: '所有竞品的 GitHub 指标和定价状态',
      mimeType: 'application/json',
    },
    {
      uri: 'competitor://alerts',
      name: '定价告警',
      description: '定价变化告警列表',
      mimeType: 'application/json',
    },
    {
      uri: 'competitor://digest/latest',
      name: '最新简报',
      description: '最新一期竞品情报简报',
      mimeType: 'application/json',
    },
  ];

  // Add per-competitor resources
  const comps = getCompetitors();
  if (comps) {
    for (const c of comps.competitors) {
      resources.push({
        uri: `competitor://${c.slug}/metrics`,
        name: `${c.name} 当前指标`,
        description: `${c.name} 的最新 GitHub 指标和定价状态`,
        mimeType: 'application/json',
      });
      resources.push({
        uri: `competitor://${c.slug}/history`,
        name: `${c.name} 历史趋势`,
        description: `${c.name} 的 GitHub stars/forks 历史数据`,
        mimeType: 'application/json',
      });
    }
  }

  sendResult(id, { resources });
}

function handleResourcesRead(id, uri) {
  if (uri === 'competitor://list') {
    return sendResult(id, { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(getCompetitors(), null, 2) }] });
  }
  if (uri === 'competitor://alerts') {
    return sendResult(id, { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(getAlerts(), null, 2) }] });
  }
  if (uri === 'competitor://digest/latest') {
    const digest = getLatestDigest();
    const text = digest ? JSON.stringify(digest, null, 2) : '{ "note": "暂无简报数据" }';
    return sendResult(id, { contents: [{ uri, mimeType: 'application/json', text }] });
  }

  // Per-competitor: competitor://{slug}/metrics  or  competitor://{slug}/history
  const matchMetrics = uri.match(/^competitor:\/\/([^/]+)\/metrics$/);
  const matchHistory = uri.match(/^competitor:\/\/([^/]+)\/history$/);

  if (matchMetrics) {
    const comps = getCompetitors();
    const c = comps?.competitors.find(x => x.slug === matchMetrics[1]);
    if (!c) return sendError(id, -32000, `竞品 "${matchMetrics[1]}" 不存在`);
    const text = JSON.stringify({
      name: c.name,
      slug: c.slug,
      github_metrics: c.github_metrics || {},
      pricing_status: c.pricing_status || {},
    }, null, 2);
    return sendResult(id, { contents: [{ uri, mimeType: 'application/json', text }] });
  }

  if (matchHistory) {
    const slug = matchHistory[1];
    const snapshots = getSnapshots(slug, 'github');
    const data = snapshots.map(s => {
      const content = readJSON(s.path);
      if (!content?.repo) return null;
      return {
        date: s.date,
        stars: content.repo.stargazers_count || 0,
        forks: content.repo.forks_count || 0,
        open_issues: content.repo.open_issues_count || 0,
      };
    }).filter(Boolean);
    return sendResult(id, { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] });
  }

  sendError(id, -32000, `未知资源: ${uri}`);
}

// ── Tool Handlers ──

function handleToolsList(id) {
  sendResult(id, {
    tools: [
      {
        name: 'query_competitor',
        description: '查询指定竞品的 GitHub 指标和定价状态',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '竞品名称或 slug（如 dify, crewai, langchain）' },
          },
          required: ['name'],
        },
      },
      {
        name: 'compare_competitors',
        description: '对比两个竞品的 GitHub 指标',
        inputSchema: {
          type: 'object',
          properties: {
            a: { type: 'string', description: '第一个竞品名称或 slug' },
            b: { type: 'string', description: '第二个竞品名称或 slug' },
          },
          required: ['a', 'b'],
        },
      },
      {
        name: 'list_competitors',
        description: '列出所有竞品及其核心指标',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'check_pricing_alerts',
        description: '检查是否有定价变化告警',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_latest_releases',
        description: '获取所有竞品的最新 Release 信息',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  });
}

function handleToolsCall(id, name, args) {
  if (name === 'list_competitors') {
    return handleListCompetitors(id);
  }
  if (name === 'query_competitor') {
    return handleQueryCompetitor(id, args?.name);
  }
  if (name === 'compare_competitors') {
    return handleCompareCompetitors(id, args?.a, args?.b);
  }
  if (name === 'check_pricing_alerts') {
    return handleCheckAlerts(id);
  }
  if (name === 'get_latest_releases') {
    return handleLatestReleases(id);
  }
  sendError(id, -32601, `未知工具: ${name}`);
}

function resolveCompetitor(query) {
  const comps = getCompetitors();
  if (!comps) return null;
  const q = query.toLowerCase();
  return comps.competitors.find(c =>
    c.slug === q || c.name.toLowerCase().includes(q)
  ) || null;
}

function handleListCompetitors(id) {
  const comps = getCompetitors();
  if (!comps) return sendError(id, -32000, '无竞品数据');
  const lines = comps.competitors.map(c => {
    const g = c.github_metrics || {};
    const stars = g.stars != null ? g.stars.toLocaleString() : '?';
    return `- **${c.name}**: ⭐ ${stars} stars  🍴 ${g.forks || '?'} forks  ${g.latest_release ? `📦 ${g.latest_release}` : ''}`;
  });
  const text = `## 📊 竞品概览 (${comps.competitors.length} 家)\n\n${lines.join('\n')}`;
  sendResult(id, { content: [{ type: 'text', text }] });
}

function handleQueryCompetitor(id, query) {
  if (!query) return sendError(id, -32000, '请提供竞品名称');
  const c = resolveCompetitor(query);
  if (!c) return sendError(id, -32000, `未找到竞品: ${query}`);

  const g = c.github_metrics || {};
  const p = c.pricing_status || {};
  const lines = [
    `## 🏢 ${c.name}`,
    ``,
    `### GitHub 指标`,
    `- ⭐ Stars: **${g.stars?.toLocaleString() || '?'}**`,
    `- 🍴 Forks: **${g.forks?.toLocaleString() || '?'}**`,
    `- 🔓 Open Issues: **${g.open_issues || '?'}**`,
    `- 📬 Open PRs: **${g.open_prs || '?'}**`,
    `- 📦 最新 Release: **${g.latest_release || '—'}** ${g.latest_release_date ? `(${g.latest_release_date})` : ''}`,
    `- ${g.description ? `📝 _${g.description}_` : ''}`,
    ``,
    `### 定价状态`,
    `- 上次检查: ${p.last_checked || '—'}`,
    `- 定价变化: ${p.changed ? '🔴 有变化' : '✅ 无变化'}`,
  ];

  sendResult(id, { content: [{ type: 'text', text: lines.join('\n') }] });
}

function handleCompareCompetitors(id, a, b) {
  if (!a || !b) return sendError(id, -32000, '请提供两个竞品名称');
  const ca = resolveCompetitor(a);
  const cb = resolveCompetitor(b);
  if (!ca) return sendError(id, -32000, `未找到竞品: ${a}`);
  if (!cb) return sendError(id, -32000, `未找到竞品: ${b}`);

  const ga = ca.github_metrics || {};
  const gb = cb.github_metrics || {};

  const lines = [
    `## ⚔️ ${ca.name} vs ${cb.name}`,
    ``,
    `| 指标 | ${ca.name} | ${cb.name} |`,
    `|------|${'─'.repeat(ca.name.length + 2)}|${'─'.repeat(cb.name.length + 2)}|`,
    `| ⭐ Stars | ${ga.stars?.toLocaleString() || '?'} | ${gb.stars?.toLocaleString() || '?'} |`,
    `| 🍴 Forks | ${ga.forks?.toLocaleString() || '?'} | ${gb.forks?.toLocaleString() || '?'} |`,
    `| 🔓 Issues | ${ga.open_issues || '?'} | ${gb.open_issues || '?'} |`,
    `| 📦 最新 Release | ${ga.latest_release || '—'} | ${gb.latest_release || '—'} |`,
    ``,
    `### 趋势判断`,
    ca.starHistory && cb.starHistory ? (() => {
      const ha = ca.starHistory;
      const hb = cb.starHistory;
      if (ha.length >= 2 && hb.length >= 2) {
        const dA = ha[ha.length - 1].stars - ha[0].stars;
        const dB = hb[hb.length - 1].stars - hb[0].stars;
        return `- ${ca.name}: 期间 Stars 变化 **${dA >= 0 ? '+' : ''}${dA}**\n- ${cb.name}: 期间 Stars 变化 **${dB >= 0 ? '+' : ''}${dB}**`;
      }
      return '';
    })() : '',
  ];

  sendResult(id, { content: [{ type: 'text', text: lines.join('\n') }] });
}

function handleCheckAlerts(id) {
  const alerts = getAlerts();
  if (!alerts.length) {
    return sendResult(id, { content: [{ type: 'text', text: '✅ 目前没有定价变化告警' }] });
  }
  const lines = alerts.map(a =>
    `🔴 **定价变化告警**\n- 竞品: ${a.competitor || '未知'}\n- 时间: ${a.date || '?'}\n- 详情: ${a.detail || '定价页内容已变更'}`
  );
  sendResult(id, { content: [{ type: 'text', text: `## 🚨 定价告警 (${alerts.length} 条)\n\n${lines.join('\n\n')}` }] });
}

function handleLatestReleases(id) {
  const comps = getCompetitors();
  if (!comps) return sendError(id, -32000, '无竞品数据');

  // Sort by release date, newest first
  const withReleases = comps.competitors
    .map(c => ({ name: c.name, slug: c.slug, ...(c.github_metrics || {}) }))
    .filter(c => c.latest_release && c.latest_release !== 'N/A')
    .sort((a, b) => {
      if (!a.latest_release_date) return 1;
      if (!b.latest_release_date) return -1;
      return b.latest_release_date.localeCompare(a.latest_release_date);
    });

  const lines = [
    `## 📦 竞品最新 Release`,
    ``,
    ...withReleases.map(r =>
      `- **${r.name}**: \`${r.latest_release}\` ${r.latest_release_date ? `(${r.latest_release_date})` : ''}`
    ),
  ];
  if (withReleases.length === 0) {
    lines.push('暂无 Release 数据');
  }

  sendResult(id, { content: [{ type: 'text', text: lines.join('\n') }] });
}

// ── JSON-RPC Dispatch ──

function handleRequest(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      initialized = true;
      return sendResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          resources: { subscribe: false },
          tools: {},
        },
        serverInfo: { name: 'competitor-intel-mcp', version: '1.0.0' },
      });

    case 'notifications/initialized':
      return; // no response needed

    case 'ping':
      return sendResult(id, {});

    case 'resources/list':
      return handleResourcesList(id);

    case 'resources/read':
      return handleResourcesRead(id, params?.uri);

    case 'tools/list':
      return handleToolsList(id);

    case 'tools/call':
      return handleToolsCall(id, params?.name, params?.arguments);

    default:
      sendError(id, -32601, `Method not found: ${method}`);
  }
}

// ── Main ──

let buffer = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      handleRequest(msg);
    } catch (e) {
      // Invalid JSON — ignore
    }
  }
});

process.stdin.on('end', () => {
  if (buffer.trim()) {
    try {
      handleRequest(JSON.parse(buffer.trim()));
    } catch { /* ignore */ }
  }
  process.exit(0);
});

process.on('uncaughtException', () => { /* silent exit */ });
process.on('unhandledRejection', () => { /* silent exit */ });

// Notify ready
process.stderr.write(`🔌 MCP Server ready (pid=${process.pid})\n`);

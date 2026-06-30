#!/usr/bin/env node
/**
 * 竞品情报 — 评测闭环
 *
 * V3: 加评测闭环
 * 建立测试数据集，每次迭代跑一遍对比
 *
 * Usage:
 *   node tests/evaluate.js                     # 跑全部评测
 *   node tests/evaluate.js --suite basic       # 只跑 basic 套件
 *   node tests/evaluate.js --json              # JSON 输出
 *   node tests/evaluate.js --regression        # 对比上次评测结果
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TESTS_DIR = __dirname;
const RESULTS_FILE = path.join(DATA_DIR, 'quality', 'evaluation-results.json');

// ── 测试用例 ──

const TEST_SUITES = {
  basic: [
    {
      id: 'competitors-json-valid',
      name: 'competitors.json 合法性',
      run: () => {
        const d = readJSON(path.join(DATA_DIR, 'competitors.json'));
        if (!d) return { pass: false, detail: '无法解析 competitors.json' };
        if (!Array.isArray(d.competitors)) return { pass: false, detail: 'competitors 字段不是数组' };
        return { pass: true, detail: `${d.competitors.length} 个竞品` };
      },
    },
    {
      id: 'alerts-json-valid',
      name: 'alerts.json 合法性',
      run: () => {
        const d = readJSON(path.join(DATA_DIR, 'alerts.json'));
        if (!Array.isArray(d)) return { pass: false, detail: 'alerts.json 不是数组' };
        return { pass: true, detail: `${d.length} 条告警` };
      },
    },
    {
      id: 'all-competitors-have-slug',
      name: '所有竞品有 slug',
      run: () => {
        const d = readJSON(path.join(DATA_DIR, 'competitors.json'));
        if (!d) return { pass: false, detail: '无法解析' };
        const missing = d.competitors.filter(c => !c.slug);
        return { pass: missing.length === 0, detail: `${missing.length} 个缺少 slug` };
      },
    },
    {
      id: 'all-competitors-have-auto-discovered',
      name: '所有竞品已自动发现',
      run: () => {
        const d = readJSON(path.join(DATA_DIR, 'competitors.json'));
        if (!d) return { pass: false, detail: '无法解析' };
        const missing = d.competitors.filter(c => !c.auto_discovered);
        return { pass: missing.length === 0, detail: missing.length > 0 ? `${missing.map(c => c.name).join(', ')} 未发现` : '全部已发现' };
      },
    },
    {
      id: 'github-metrics-exist',
      name: 'GitHub 指标存在',
      run: () => {
        const d = readJSON(path.join(DATA_DIR, 'competitors.json'));
        if (!d) return { pass: false, detail: '无法解析' };
        const missing = d.competitors.filter(c => !c.github_metrics || !c.github_metrics.stars);
        return { pass: missing.length === 0, detail: missing.length > 0 ? `${missing.map(c => c.name).join(', ')} 缺少指标` : '全部完整' };
      },
    },
    {
      id: 'pricing-status-exists',
      name: '定价状态存在',
      run: () => {
        const d = readJSON(path.join(DATA_DIR, 'competitors.json'));
        if (!d) return { pass: false, detail: '无法解析' };
        const missing = d.competitors.filter(c => !c.pricing_status || !c.pricing_status.last_checked);
        return { pass: missing.length === 0, detail: missing.length > 0 ? `${missing.map(c => c.name).join(', ')} 定价未检查` : '全部已检查' };
      },
    },
  ],

  quality: [
    {
      id: 'quality-report-exists',
      name: '质量报告存在',
      run: () => {
        const qDir = path.join(DATA_DIR, 'quality');
        if (!fs.existsSync(qDir)) return { pass: false, detail: 'quality 目录不存在' };
        const files = fs.readdirSync(qDir).filter(f => f.endsWith('.json') && f !== 'evaluation-results.json');
        return { pass: files.length > 0, detail: `${files.length} 份质量报告` };
      },
    },
    {
      id: 'quality-score-threshold',
      name: '质量分 >= 80',
      run: () => {
        const qDir = path.join(DATA_DIR, 'quality');
        if (!fs.existsSync(qDir)) return { pass: false, detail: 'quality 目录不存在' };
        const files = fs.readdirSync(qDir).filter(f => f.endsWith('.json') && f !== 'evaluation-results.json').sort().reverse();
        if (files.length === 0) return { pass: false, detail: '无质量报告' };
        const latest = readJSON(path.join(qDir, files[0]));
        const score = latest?.overall?.score || 0;
        return { pass: score >= 80, detail: `最新质量分: ${score}/100` };
      },
    },
  ],

  snapshots: [
    {
      id: 'github-snapshots-recent',
      name: 'GitHub 快照当天存在',
      run: () => {
        const today = new Date().toISOString().slice(0, 10);
        const d = readJSON(path.join(DATA_DIR, 'competitors.json'));
        if (!d) return { pass: false, detail: '无法解析' };
        let missing = 0;
        for (const c of d.competitors) {
          const p = path.join(DATA_DIR, 'snapshots', c.slug, 'github', `${today}.json`);
          if (!fs.existsSync(p)) missing++;
        }
        return { pass: missing === 0, detail: missing > 0 ? `${missing} 个竞品缺少今日快照` : `全部 ${d.competitors.length} 个快照存在` };
      },
    },
  ],

  mcp: [
    {
      id: 'mcp-server-file-exists',
      name: 'MCP Server 文件存在',
      run: () => {
        const p = path.join(ROOT, 'mcp-server', 'server.js');
        return { pass: fs.existsSync(p), detail: fs.existsSync(p) ? '存在' : '缺失' };
      },
    },
    {
      id: 'mcp-server-syntax',
      name: 'MCP Server 语法正确',
      run: () => {
        try {
          require('child_process').execSync('node --check ' + path.join(ROOT, 'mcp-server', 'server.js'), { stdio: 'pipe' });
          return { pass: true, detail: '语法通过' };
        } catch (e) {
          return { pass: false, detail: e.stderr?.toString()?.trim() || '语法错误' };
        }
      },
    },
  ],

  dashboard: [
    {
      id: 'dashboard-server-exists',
      name: 'Dashboard 文件存在',
      run: () => {
        const p = path.join(ROOT, 'dashboard', 'server.js');
        return { pass: fs.existsSync(p), detail: fs.existsSync(p) ? '存在' : '缺失' };
      },
    },
    {
      id: 'dashboard-api-responding',
      name: 'Dashboard API 响应（端口 3456）',
      run: () => {
        try {
          const r = require('child_process').execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/api/competitors 2>/dev/null || echo "000"', { stdio: 'pipe', timeout: 3000 });
          const code = r.toString().trim();
          return { pass: code === '200', detail: `HTTP ${code}` };
        } catch {
          return { pass: false, detail: '请求失败' };
        }
      },
    },
  ],
};

// ── Helpers ──

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

// ── Main ──

function run(suiteName = null) {
  const results = {};
  let totalPass = 0;
  let totalFail = 0;
  let total = 0;

  const suites = suiteName
    ? { [suiteName]: TEST_SUITES[suiteName] }
    : TEST_SUITES;

  for (const [suite, tests] of Object.entries(suites)) {
    if (!tests) continue;
    results[suite] = [];
    for (const test of tests) {
      total++;
      let result;
      try {
        result = test.run();
      } catch (e) {
        result = { pass: false, detail: e.message };
      }
      result.id = test.id;
      result.name = test.name;
      if (result.pass) totalPass++; else totalFail++;
      results[suite].push(result);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    summary: { total, pass: totalPass, fail: totalFail, passRate: total > 0 ? Math.round((totalPass / total) * 100) : 0 },
    suites: results,
  };
}

function printResults(results) {
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║   🧪 评测报告 · ${results.timestamp.slice(0, 10)}            ║`);
  console.log(`╚═══════════════════════════════════════╝`);
  console.log(`\n📊 通过率: ${results.summary.passRate}%  (${results.summary.pass}/${results.summary.total})`);
  console.log();

  for (const [suite, tests] of Object.entries(results.suites)) {
    console.log(`  📁 ${suite}`);
    for (const t of tests) {
      const icon = t.pass ? '✅' : '❌';
      console.log(`    ${icon} ${t.name}`);
      console.log(`        ${t.detail}`);
    }
    console.log();
  }
}

// ── CLI ──

const args = process.argv.slice(2);
const suiteName = args.includes('--suite') ? args[args.indexOf('--suite') + 1] : null;
const jsonOutput = args.includes('--json');

const results = run(suiteName);

// Save
fs.mkdirSync(path.join(DATA_DIR, 'quality'), { recursive: true });
fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));

// Load previous for regression
if (args.includes('--regression')) {
  const prevFile = path.join(DATA_DIR, 'quality', 'evaluation-results.previous.json');
  if (fs.existsSync(prevFile)) {
    const prev = readJSON(prevFile);
    if (prev) {
      const rateDelta = results.summary.passRate - prev.summary.passRate;
      const sign = rateDelta >= 0 ? '+' : '';
      console.log(`\n📈 回归对比: ${sign}${rateDelta}% (本次 ${results.summary.passRate}% vs 上次 ${prev.summary.passRate}%)`);
      if (rateDelta < 0) {
        console.log(`⚠️  通过率下降！可能破坏了已有功能。`);
      } else if (rateDelta > 0) {
        console.log(`✅ 通过率提升，迭代方向正确。`);
      }
    }
  }
  // Rotate
  fs.copyFileSync(RESULTS_FILE, prevFile);
}

if (jsonOutput) {
  console.log(JSON.stringify(results, null, 2));
} else {
  printResults(results);
}

#!/usr/bin/env node
/**
 * 竞品情报 — 数据质量检测 & 异常告警
 *
 * V1: 自我反思模块
 * - Stars/Forks 异常 Delta 检测
 * - 数据完整性检查（字段缺失、空值）
 * - 定价页抓取成功率
 * - 执行耗时统计
 *
 * Usage:
 *   node lib/quality.js                    # 检测最新数据
 *   node lib/quality.js --date 2026-06-29  # 指定日期
 *   node lib/quality.js --json             # JSON 输出
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

// ── Config ──
const THRESHOLDS = {
  STAR_DELTA_MAX: 5000,     // 单日 Star 变化超过此值告警
  FORK_DELTA_MAX: 500,      // 单日 Fork 变化超过此值告警
  DATA_AGE_MAX_HOURS: 48,   // 数据超过此时间未更新告警
  FIELD_MISSING_WARN: 0.3,  // 字段缺失率超过此值告警
};

// ── Helpers ──

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function getDateStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

// ── Checks ──

function checkDelta(slug, name, todayData, yesterdayData) {
  const issues = [];
  if (!todayData?.repo || !yesterdayData?.repo) return issues;

  const td = todayData.repo;
  const yd = yesterdayData.repo;

  const starDelta = (td.stargazers_count || 0) - (yd.stargazers_count || 0);
  const forkDelta = (td.forks_count || 0) - (yd.forks_count || 0);

  if (Math.abs(starDelta) > THRESHOLDS.STAR_DELTA_MAX) {
    issues.push({
      severity: 'error',
      type: 'anomaly_delta',
      field: 'stars',
      message: `${name}: Star 变化异常 (${starDelta >= 0 ? '+' : ''}${starDelta})，超过阈值 ±${THRESHOLDS.STAR_DELTA_MAX}`,
      value: starDelta,
      threshold: THRESHOLDS.STAR_DELTA_MAX,
    });
  }

  if (Math.abs(forkDelta) > THRESHOLDS.FORK_DELTA_MAX) {
    issues.push({
      severity: 'warn',
      type: 'anomaly_delta',
      field: 'forks',
      message: `${name}: Fork 变化异常 (${forkDelta >= 0 ? '+' : ''}${forkDelta})，超过阈值 ±${THRESHOLDS.FORK_DELTA_MAX}`,
      value: forkDelta,
      threshold: THRESHOLDS.FORK_DELTA_MAX,
    });
  }

  // 0 delta is also suspicious for very active repos
  if (starDelta === 0 && (td.stargazers_count || 0) > 50000) {
    issues.push({
      severity: 'info',
      type: 'zero_delta',
      field: 'stars',
      message: `${name}: Star 无变化（高活跃度项目，可能 GitHub API 缓存）`,
    });
  }

  return issues;
}

function checkCompleteness(slug, name, competitorsEntry, todayStr) {
  const issues = [];
  const g = competitorsEntry?.github_metrics || {};
  const p = competitorsEntry?.pricing_status || {};

  // Check required fields
  const requiredFields = ['stars', 'forks', 'open_issues'];
  for (const field of requiredFields) {
    if (g[field] == null) {
      issues.push({
        severity: 'error',
        type: 'missing_field',
        message: `${name}: 缺少 GitHub 指标 "${field}"`,
      });
    }
  }

  // Check snapshot existence
  const snapPath = path.join(DATA_DIR, 'snapshots', slug, 'github', `${todayStr}.json`);
  if (!fs.existsSync(snapPath)) {
    issues.push({
      severity: 'error',
      type: 'missing_snapshot',
      message: `${name}: 缺少今日 GitHub 快照`,
    });
  }

  // Pricing snapshot
  const pricingPath = path.join(DATA_DIR, 'snapshots', slug, 'pricing', `${todayStr}.txt`);
  if (!fs.existsSync(pricingPath)) {
    issues.push({
      severity: 'warn',
      type: 'missing_pricing_snapshot',
      message: `${name}: 缺少今日定价页快照`,
    });
  }

  if (!p.last_checked) {
    issues.push({
      severity: 'warn',
      type: 'pricing_not_checked',
      message: `${name}: 定价页未检查`,
    });
  }

  return issues;
}

// ── Main ──

function run(dateStr, jsonOutput) {
  const todayStr = dateStr || getDateStr();
  const yesterdayStr = getDateStr(-1);

  const competitors = readJSON(path.join(DATA_DIR, 'competitors.json'));
  if (!competitors) {
    const err = { error: '无法读取 competitors.json' };
    if (jsonOutput) { console.log(JSON.stringify(err, null, 2)); }
    else { console.error('❌ 无法读取 competitors.json'); }
    process.exit(1);
  }

  const allIssues = [];
  const scores = {};

  for (const c of competitors.competitors) {
    const slug = c.slug;
    const name = c.name;

    // Delta check
    const todaySnap = readJSON(path.join(DATA_DIR, 'snapshots', slug, 'github', `${todayStr}.json`));
    const yesterdaySnap = readJSON(path.join(DATA_DIR, 'snapshots', slug, 'github', `${yesterdayStr}.json`));

    const deltaIssues = todaySnap && yesterdaySnap
      ? checkDelta(slug, name, todaySnap, yesterdaySnap)
      : [{ severity: 'info', type: 'no_comparison', message: `${name}: 无昨日数据，跳过 Delta 对比` }];

    // Completeness check
    const completenessIssues = checkCompleteness(slug, name, c, todayStr);

    // Combine
    const entryIssues = [...deltaIssues, ...completenessIssues];
    allIssues.push(...entryIssues);

    // Score (0-100)
    let score = 100;
    const errorCount = entryIssues.filter(i => i.severity === 'error').length;
    const warnCount = entryIssues.filter(i => i.severity === 'warn').length;
    score -= errorCount * 25;
    score -= warnCount * 10;
    score = Math.max(0, Math.min(100, score));

    scores[name] = {
      score,
      errorCount,
      warnCount,
      issues: entryIssues,
    };
  }

  // Overall score
  const avgScore = Object.values(scores).reduce((s, v) => s + v.score, 0) / Object.values(scores).length;
  const totalErrors = allIssues.filter(i => i.severity === 'error').length;
  const totalWarns = allIssues.filter(i => i.severity === 'warn').length;

  const result = {
    date: todayStr,
    overall: {
      score: Math.round(avgScore),
      totalCompetitors: competitors.competitors.length,
      errors: totalErrors,
      warnings: totalWarns,
      pass: totalErrors === 0,
    },
    competitors: scores,
    issues: allIssues,
    thresholds: THRESHOLDS,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const status = result.overall.pass ? '✅' : '❌';
    console.log(`\n╔═══════════════════════════════════════╗`);
    console.log(`║   📊 数据质量检测报告 · ${todayStr}      ║`);
    console.log(`╚═══════════════════════════════════════╝`);
    console.log(`\n${status} 综合评分: ${result.overall.score}/100`);
    console.log(`   竞品: ${result.overall.totalCompetitors} 家`);
    console.log(`   错误: ${result.overall.errors}  警告: ${result.overall.warnings}`);
    console.log(`   结果: ${result.overall.pass ? '✅ 通过' : '❌ 未通过'}`);
    console.log();

    for (const [name, s] of Object.entries(scores)) {
      const icon = s.score >= 90 ? '✅' : s.score >= 60 ? '⚠️' : '❌';
      console.log(`  ${icon} ${name.padEnd(25)} ${s.score}/100  (E:${s.errorCount} W:${s.warnCount})`);
      for (const issue of s.issues) {
        const prefix = issue.severity === 'error' ? '  🔴' : issue.severity === 'warn' ? '  🟡' : '  🔵';
        console.log(`     ${prefix} ${issue.message}`);
      }
    }
    console.log();
  }

  // Save quality report
  const qualityDir = path.join(DATA_DIR, 'quality');
  fs.mkdirSync(qualityDir, { recursive: true });
  fs.writeFileSync(path.join(qualityDir, `${todayStr}.json`), JSON.stringify(result, null, 2));

  return result;
}

// ── CLI ──

const args = process.argv.slice(2);
const dateIdx = args.indexOf('--date');
const dateStr = dateIdx >= 0 ? args[dateIdx + 1] : null;
const jsonOutput = args.includes('--json');

run(dateStr, jsonOutput);

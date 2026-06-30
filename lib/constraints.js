#!/usr/bin/env node
/**
 * 竞品情报 — 约束边界模块
 *
 * V2: 加约束边界
 * - 定价变化人工确认流程
 * - 按需问答能力范围声明
 * - 降级/兜底策略
 * - 触发人工干预的条件
 *
 * Usage:
 *   node lib/constraints.js  # 输出当前约束状态
 *   node lib/constraints.js --check  # 检查是否需人工干预
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

// ── 能力范围声明 ──

const CAPABILITIES = {
  name: '竞品情报简报 Agent',
  version: '2.0.0 (Harness V2)',
  scope: [
    '采集竞品 GitHub 指标（stars / forks / issues / releases / PRs）',
    '监控竞品定价页变化并告警',
    '生成每周竞品情报简报（周一 09:00）',
    '每日数据刷新（工作日 10:00）',
    '按需回答竞品相关问题',
  ],
  outOfScope: [
    '非竞品相关的问题（天气、新闻、代码编写等）',
    '实时数据采集（数据最多 24h 滞后）',
    '需要登录的付费墙内容',
    'JS 密集渲染的页面（需浏览器工具）',
    '代替人工决策（只能提供信息，不能代替判断）',
  ],
  limitations: [
    'GitHub API 未认证时 60 req/h 限制',
    '定价页抓取依赖 web_fetch，SPA 页面内容可能不完整',
    '数据准确性受上游 API 缓存影响',
    '简报基于模板生成，不保证覆盖所有竞品动态',
  ],
};

// ── 人工干预条件 ──

const INTERVENTION_CONDITIONS = [
  {
    id: 'pricing_change',
    description: '竞品定价页内容变更',
    priority: 'high',
    action: '标记 pending → 人工确认后才推送',
    autoMessage: false, // 不自动推送，等人确认
  },
  {
    id: 'data_anomaly',
    description: '数据质量检测发现异常（Star 异常波动等）',
    priority: 'medium',
    action: '在日志中标记异常，简报中备注说明',
    autoMessage: true, // 可以推送但带警告标记
  },
  {
    id: 'new_competitor',
    description: '添加新竞品时自动发现失败',
    priority: 'medium',
    action: '输出失败原因，提示人工补充 URL',
    autoMessage: true,
  },
  {
    id: 'consecutive_failures',
    description: '某个竞品连续 3 次采集失败',
    priority: 'high',
    action: '暂停该竞品采集，通知人工检查',
    autoMessage: true,
  },
  {
    id: 'api_rate_limited',
    description: 'GitHub API 达到频率限制',
    priority: 'low',
    action: '跳过本轮采集，下轮重试',
    autoMessage: false,
  },
];

// ── 降级策略 ──

const DEGRADATION_STRATEGIES = {
  github_api_limit: {
    trigger: 'GitHub API 返回 403/429',
    fallback: '跳过本轮 GitHub 采集，使用缓存数据',
    recovery: '等待 1h 后自动重试',
  },
  web_fetch_timeout: {
    trigger: 'web_fetch 超时 >30s',
    fallback: '跳过该竞品的定价检查，标记为超时',
    recovery: '下轮采集自动重试',
  },
  pricing_page_unavailable: {
    trigger: '定价页返回 4xx/5xx',
    fallback: '保留上次定价快照，不标记变化',
    recovery: '连续 3 次失败触发人工干预',
  },
  model_timeout: {
    trigger: 'LLM 调用超时',
    fallback: '使用简化模板，跳过 LLM 分析环节',
    recovery: '下次调度自动恢复',
  },
};

// ── 回复模板（按需问答） ──

const RESPONSE_TEMPLATES = {
  out_of_scope: `抱歉，这个问题不在我的能力范围内。我只能回答竞品情报相关的问题，比如：

- 查询某个竞品的 GitHub 数据："Dify 多少 stars？"
- 对比两个竞品："对比 Dify 和 CrewAI"
- 检查定价告警："最近有竞品涨价吗？"
- 查看最新 Release："谁发布了新版本？"

帮你 @一下人工同事？`,

  stale_data: (days) => `⚠️ 注意：这部分数据是 ${days} 天前的，可能不是最新。建议稍后刷新再查。`,

  no_data: `目前还没有这个竞品的数据。如果你有它的信息，可以添加到 config.yaml 里，Agent 会自动发现。`,

  pricing_pending: `🔴 该竞品的定价页有变更，已标记待人工确认。确认前不会推送告警。`,
};

// ── Main ──

function checkIntervention() {
  const competitors = readJSON(path.join(DATA_DIR, 'competitors.json'));
  if (!competitors) return [];

  const interventions = [];
  const alerts = readJSON(path.join(DATA_DIR, 'alerts.json')) || [];

  // Check for pricing changes needing confirmation
  for (const c of competitors.competitors) {
    const p = c.pricing_status || {};
    if (p.changed && !p.confirmed) {
      interventions.push({
        condition: 'pricing_change',
        competitor: c.name,
        priority: 'high',
        message: `${c.name} 定价页有变更，需人工确认`,
        action: INTERVENTION_CONDITIONS.find(i => i.id === 'pricing_change').action,
      });
    }
  }

  return interventions;
}

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

// ── CLI ──

const args = process.argv.slice(2);

if (args.includes('--check')) {
  const needsIntervention = checkIntervention();
  if (needsIntervention.length > 0) {
    console.log('🚨 需要人工干预:');
    for (const item of needsIntervention) {
      console.log(`  [${item.priority}] ${item.message}`);
      console.log(`         → ${item.action}`);
    }
  } else {
    console.log('✅ 当前无需人工干预');
  }
} else if (args.includes('--capabilities')) {
  console.log(`\n🔧 ${CAPABILITIES.name} v${CAPABILITIES.version}`);
  console.log(`\n✅ 能力范围:`);
  CAPABILITIES.scope.forEach(s => console.log(`  • ${s}`));
  console.log(`\n❌ 不覆盖:`);
  CAPABILITIES.outOfScope.forEach(s => console.log(`  • ${s}`));
  console.log(`\n⚠️ 已知限制:`);
  CAPABILITIES.limitations.forEach(s => console.log(`  • ${s}`));
  console.log(`\n🚨 人工干预条件:`);
  INTERVENTION_CONDITIONS.forEach(c =>
    console.log(`  [${c.priority}] ${c.description} → ${c.action}`)
  );
  console.log();
} else {
  console.log(JSON.stringify({ capabilities: CAPABILITIES, interventions: INTERVENTION_CONDITIONS, degradation: DEGRADATION_STRATEGIES, responseTemplates: RESPONSE_TEMPLATES }, null, 2));
}

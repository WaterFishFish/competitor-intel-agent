# 竞品情报简报 V3 — 实现计划

> **Iteration:** V3 — 增值功能 + 数据源扩展 + 质量闭环
> **Previous:** V2 (8 tasks, completed 2026-07-29)

---

## 回顾: V2 完成情况

| 任务 | 状态 | 实际交付 |
|------|:----:|---------|
| JSON 状态管理骨架 | ✅ | competitors.json + alerts.json + snapshots |
| 自动发现流程 | ✅ | briefing-agent.md 已定义 |
| GitHub API 采集 | ✅ | 7+1 竞品数据完整 |
| 定价页监控 | ✅ | 7/7 竞品建立基线 |
| 按需问答 | ✅ | 机制就绪（飞书链路待跑通） |
| 每日 cron 数据刷新 | ✅ | 工作日 10:00 CST |
| 每周简报 cron | ✅ | 周一 09:00 CST |
| Dashboard v3 | ✅ | 远超原计划（原 Phase 2 标为"不实现"） |
| MCP Server | ✅ | 同上 |
| 活跃度评分 / 里程碑 / 导出 | ✅ | 新功能，计划外交付 |

---

## V3 核心方向

```
V3 = 更多数据源 + 简报质量闭环 + 自动发现工具化
```

### Phase 3.1 — 数据源扩展（高优先级）

#### Task 3.1.1: 新增 Hacker News 数据源

**目标:** 每周搜索 HN 上 AI Agent 相关热门讨论和项目

**文件:**
- Modify: `config.yaml` — 添加 HN 相关搜索关键词
- Modify: `briefing-agent.md` — 添加 HN 采集子流程

**实现方式:**
```bash
# 通过 Algolia HN Search API 搜索
curl -s "https://hn.algolia.com/api/v1/search?query=AI+agent&tags=story&hitsPerPage=10"
```
- 提取：title, url, points, num_comments, created_at
- 去重：同一 URL 只保留一次
- 集成到简报的行业趋势段落

**预计工作量:** 小（~1h）

#### Task 3.1.2: 新增 Product Hunt 数据源

**目标:** 获取每日 Product Hunt 上 AI 相关产品的投票和讨论

**文件:**
- Modify: `briefing-agent.md` — 添加 PH 采集流程

**实现方式:**
```bash
# 通过 web_fetch 爬取 Product Hunt 今日热门
web_fetch "https://www.producthunt.com/"

# 或通过 GraphQL API（无需认证即可获取每日热榜）
```
- 提取：产品名、tagline、vote_count、评论数
- 过滤：AI Agent 相关产品
- 集成到行业趋势

**预计工作量:** 中（~2h）

### Phase 3.2 — 简报质量闭环（中优先级）

#### Task 3.2.1: Force Run 周简报并评估质量

**目标:** 下周一 cron 执行前，手动 force run 一次确认产出质量

**操作:**
```bash
openclaw cron run --job "竞品情报-周报生成" --force
```

**评估标准:**
- 简报 <= 2000 字
- 覆盖 8 个竞品
- 包含 GitHub 趋势数据
- 包含新闻动态（如有）
- 格式正确（可读性强）
- .pending_delivery 文件正确创建

**预计工作量:** 小（~30min）

#### Task 3.2.2: 简报模板迭代

**目标:** 根据 force run 结果调整简报模板和 prompt

**文件:**
- Modify: `config.yaml` — 调整 `briefing_template`
- Modify: `briefing-agent.md` — 调整简报生成指令

**预计工作量:** 小（~1h）

### Phase 3.3 — 自动发现工具化（中优先级）

#### Task 3.3.1: 创建竞品自动发现 CLI

**目标:** `node discover.js "竞品名"` 一键自动发现并加入监控

**文件:**
- Create: `lib/discover.js`

**功能:**
```bash
node lib/discover.js "Cline" --keywords "Cline VSCode AI, Cline update, Cline agent"
# 输出：
# ✅ 已发现 GitHub: github.com/nicepkg/cline
# ✅ 已发现定价页: cline.bot/pricing
# ✅ 已加入 competitors.json
# ⚠️  未找到 changelog URL
```

**实现逻辑:**
1. 搜索 "{name} GitHub" → 找到 repo
2. 搜索 "{name} pricing" → 找到定价页
3. 搜索 "{name} changelog" → 找到更新日志
4. 写入 competitors.json
5. 首次数据采集（GitHub API + 定价页）

**预计工作量:** 中（~3h）

#### Task 3.3.2: 热门前端/AI 项目推荐

**目标:** `node discover.js --trending` 扫描 GitHub trending 推荐新竞品

**实现方式:**
```bash
# 通过 GitHub Trending API
web_fetch "https://github.com/trending?since=weekly"
```
自动识别 AI Agent / LLM 相关项目，输出推荐列表供用户确认。

**预计工作量:** 中（~2h）

### Phase 3.4 — Dashboard 持续改进（低优先级）

#### Task 3.4.1: 数据源 Tab

**文件:**
- Modify: `dashboard/static/index.html`
- Modify: `dashboard/static/app.js`

**功能:** Dashboard 增加"数据源"Tab，展示各数据源状态：
- GitHub: ✅ / ❌
- 定价页: ✅ / ❌
- 新闻: 最新抓取时间
- HN/PH: 接入状态

#### Task 3.4.2: 历史数据回填

**目标:** 从 GitHub API 获取过去 30 天的 star 数据，回填历史快照，让趋势图有曲线可看

**实现方式:**
```bash
# GitHub Star History API
curl -s "https://api.github.com/repos/{owner}/{repo}/stargazers?per_page=100&page=1"
```
通过 `Link` header 获取总 star 数，结合 `starred_at` 可以估算增长曲线。

#### Task 3.4.3: 响应式优化

**目标:** 移动端适配，窄屏布局优化

### Phase 3.5 — 工程化（低优先级）

#### Task 3.5.1: 更新 README

**当前状态:** README 仍然引用 V2 信息，需要更新：
- 竞品数量: 7 → 8（新增 Vercel AI SDK）
- Dashboard 截图/说明
- 新增功能说明
- API 文档更新

#### Task 3.5.2: 错误处理增强

- Dashboard server.js 增加 try-catch 兜底
- MCP Server 增加超时处理
- 数据采集增加重试机制

---

## 优先级总览

| 优先级 | Task | 工作量 | 价值 |
|--------|------|:-----:|:----:|
| 🔴 P0 | 3.1.1 HN 数据源 | 小 | 高 |
| 🔴 P0 | 3.2.1 Force Run 简报 | 小 | 高 |
| 🟡 P1 | 3.3.1 自动发现 CLI | 中 | 高 |
| 🟡 P1 | 3.1.2 Product Hunt 数据源 | 中 | 中 |
| 🟢 P2 | 3.4.1 Dashboard 数据源 Tab | 小 | 中 |
| 🟢 P2 | 3.5.1 更新 README | 小 | 中 |
| 🟢 P2 | 3.3.2 热门项目推荐 | 中 | 中 |
| 🔵 P3 | 3.4.2 历史数据回填 | 中 | 低 |
| 🔵 P3 | 3.5.2 错误处理 | 小 | 中 |
| 🔵 P3 | 3.4.3 响应式优化 | 中 | 低 |

---

## 执行节奏建议

```
第 1 天: 3.1.1 HN 数据源 + 3.2.1 Force Run
第 2 天: 3.1.2 Product Hunt + 3.5.1 README
第 3 天: 3.3.1 自动发现 CLI
第 4 天: 3.4.1 Dashboard 数据源 Tab
第 5 天: 3.4.2/3.4.3 收尾优化
```

---

*Planned: 2026-07-29 · Updates: N/A*

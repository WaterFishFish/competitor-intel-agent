# 竞品情报简报 V2 — 设计文档

> Phase 1: GitHub API + JSON 状态管理 + 按需问答 + 定价监控
> Phase 2 (未来): Web UI 看板 + MCP Server

---

## 1. 架构总览

```
                  ┌─────────────────────────┐
                  │    Competitor Intel      │
                  │      Agent (V2)          │
                  └──────────┬──────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼────┐        ┌─────▼─────┐        ┌─────▼────┐
   │ 采集层   │        │  状态层    │        │ 交付层    │
   │         │        │           │        │          │
   │ GitHub  │───────▶│ JSON 文件 │───────▶│ 飞书推送  │
   │ Web     │        │ 快照存档   │        │ 按需问答  │
   │ 定价页  │        │ Diff 引擎  │        │          │
   └─────────┘        └───────────┘        └──────────┘
```

### 三层职责

| 层 | 职责 | 工具/技术 |
|----|------|----------|
| **采集层** | 定时拉取 GitHub API、定价页、新闻 | `exec curl` / `web_fetch` |
| **状态层** | JSON 持久化、快照、Diff、趋势 | 文件读写 |
| **交付层** | 周报推送 + 按需问答 | `message` 工具 / 飞书 |

---

## 2. 数据模型与文件结构

### 目录

```
competitor-intel/
├── config.yaml              ← 竞品配置（只需 name + keywords）
├── data/                    ← 新增：状态管理
│   ├── competitors.json     ← 竞品状态（含自动发现的 URL）
│   ├── snapshots/{slug}/    ← 历史快照
│   │   ├── github/{date}.json
│   │   └── pricing/{date}.html
│   ├── digests/             ← 简报存档
│   │   └── YYYY-MM-DD.json
│   └── alerts.json          ← 变化告警
├── logs/                    ← 执行日志
├── briefing-agent.md        ← Agent 指令（升级版）
└── README.md
```

### competitors.json 结构

```json
{
  "competitors": [
    {
      "slug": "dify",
      "name": "Dify",
      "active": true,
      "added": "2026-06-29",
      "auto_discovered": {
        "github_org": "langgenius",
        "github_repo": "dify",
        "pricing_url": "https://dify.ai/pricing",
        "changelog_url": "https://github.com/langgenius/dify/releases",
        "discovered_at": "2026-06-29"
      },
      "github_metrics": {
        "stars": 68000,
        "forks": 10000,
        "open_issues": 120,
        "latest_release": "1.15.0",
        "latest_release_date": "2026-06-25"
      },
      "pricing_status": {
        "last_checked": "2026-06-29",
        "changed": false,
        "changes": []
      }
    }
  ]
}
```

---

## 3. 自动发现机制

添加竞品时 Agent 自动:

1. 搜索 `"{name} GitHub"` → 找到 repo
2. 搜索 `"{name} pricing"` → 找到定价页
3. 搜索 `"{name} changelog"` → 找到更新日志
4. 写入 `competitors.json`

用户只需在 config.yaml 写 name + keywords。

---

## 4. 按需问答

用户通过飞书随时提问，Agent 读取 data/ 状态后回答。

### 支持的问题类型

| 问题 | 回答方式 |
|------|---------|
| "Dify 这周有什么变化？" | 读最新 digest → 提取 Dify 部分 |
| "最近有竞品涨价吗？" | 扫所有 pricing_status → 标 change=true 的 |
| "CrewAI 多少 stars 了？" | 读 competitors.json → github_metrics.stars |
| "对比 Dify 和 Coze 的 GitHub 趋势" | 读 snapshots → 计算 star 增长曲线 |
| "谁在招人？" | 扫 GitHub issues 中的招聘标签 |

---

## 5. 调度策略

| 任务 | 频率 | 说明 |
|------|------|------|
| 周报 | 每周一 09:00 | 完整竞品分析（已有） |
| 定价监控 | 每天 10:00 | 检查定价页变化，有变更立即告警 |
| GitHub 数据 | 每天 10:00 | 更新 stars/releases/issues |
| 自动发现 | 添加竞品时触发 | 一次性 |

---

## 6. Phase 2 预留（不实现）

- Web UI 看板 (GitHub Pages)
- MCP Server
- 更多数据源 (ArXiv / HN / Product Hunt / Hugging Face)
- 中英双语

# 📊 竞品情报简报 AI Agent

> **Autonomous AI Agent** · 自动搜集竞品动态 → AI 分析 → 飞书推送  
> 一个从零搭建的生产级 Agent 项目

---

## 🤖 这是什么

一个**真正自主工作的 AI Agent**，不是脚本，不是爬虫。7 × 24 小时不间断监控竞品动态。

- **每周一 09:00** → 完整竞品情报简报（含 GitHub 趋势 + 定价变动告警）
- **每天 10:00** → 自动刷新 GitHub 指标 + 检查定价页变化
- **随时问** → "Dify 这周有什么变化？"直接回答

**加一个新竞品只需要改一行 YAML，Agent 会自动发现其 GitHub repo 和定价页。**

---

## 🏗 架构

```
┌──────────────────────────────────────────────────────┐
│                    配置层                             │
│     config.yaml (竞品 name + keywords 就够了)         │
│     data/competitors.json (自动发现的 URL/指标)       │
└──────────┬───────────────────────────┬───────────────┘
           │                           │
     ┌─────▼──────┐             ┌──────▼──────┐
     │ 每周一 09:00│             │ 每日 10:00  │
     │ 完整简报   │             │ 数据刷新    │
     └─────┬──────┘             └──────┬──────┘
           │                           │
     ┌─────▼───────────────────────────▼───────────────┐
     │                    执行层                       │
     │  ┌──────────┐  ┌────────┐  ┌──────────────┐   │
     │  │ GitHub   │  │ 定价页  │  │ 新闻/动态    │   │
     │  │ API 采集 │  │ Diff   │  │ Web 采集    │   │
     │  └──────────┘  └────────┘  └──────────────┘   │
     │          │           │             │          │
     │     ┌────▼───────────▼─────────────▼────┐     │
     │     │    JSON 状态管理 + 快照存档       │     │
     │     │    data/competitors.json          │     │
     │     │    data/snapshots/{slug}/         │     │
     │     │    data/alerts.json               │     │
     │     └───────────────────────────────────┘     │
     └──────────────────────┬────────────────────────┘
                            │
     ┌──────────────────────▼────────────────────────┐
     │                    交付层                     │
     │  文件信号 (.pending_delivery) → Heartbeat    │
     │  → 飞书私聊推送 + 按需问答                   │
     └──────────────────────────────────────────────┘
```

### 关键设计

| 设计 | 说明 |
|------|------|
| **自动发现** | 添加竞品只需 name + keywords，Agent 自动搜索 GitHub repo、定价页、更新日志 |
| **三层解耦** | 配置层 / 执行层 / 交付层分离，互不影响 |
| **文件信号** | Agent 写完简报放标记文件 → Heartbeat 检测到后代发消息，解决隔离环境推送问题 |
| **双重调度** | 周一完整简报 + 每日数据刷新，节奏分明 |
| **定价告警** | 定价页变化自动检测，高优先级标注 🔴 |

---

## 🛠 技术栈

| 组件 | 选型 |
|------|------|
| Agent 框架 | OpenClaw Agent Runtime |
| LLM | DeepSeek v4 Flash |
| 调度 | Cron (Asia/Shanghai) |
| 数据源 | GitHub API + Web Fetch |
| 状态管理 | JSON 文件 + 快照存档 |
| 消息推送 | Feishu API (私聊) |
| 配置 | YAML |

---

## 📋 监控竞品

| 竞品 | GitHub | ⭐ Stars | 最新 Release |
|------|--------|---------|-------------|
| **Dify** | langgenius/dify | 146,964 | v1.15.0 |
| **Coze / 扣子** | coze-dev/coze-studio | 21,066 | v0.5.1 |
| **LangChain / LangGraph** | langchain-ai/langgraph | 36,016 | v1.2.6 |
| **AutoGPT / AgentGPT** | Significant-Gravitas/AutoGPT | 185,202 | beta-v0.6.65 |
| **CrewAI** | crewAIInc/crewAI | 54,548 | v1.15.1 |
| **OpenAI Agents SDK** | openai/openai-agents-python | 27,502 | v0.17.7 |
| **Bolt.new / Lovable** | stackblitz/bolt.new | 16,432 | — |

---

## 📁 项目结构

```
├── config.yaml               # 竞品配置（只需填 name + keywords）
├── briefing-agent.md         # Agent 执行指令（V2 支持自动发现/GitHub API/定价监控/按需问答）
├── README.md                 # 本文件
├── .gitignore                # 已排除敏感文件和快照
├── data/                     # 🔥 状态管理
│   ├── competitors.json      # 竞品状态（含自动发现的 URL + GitHub 指标）
│   ├── snapshots/{slug}/     # GitHub / 定价快照历史
│   ├── digests/              # 简报 JSON 存档
│   └── alerts.json           # 定价变化告警
├── logs/                     # 执行日志（本地，不上传）
├── docs/plans/               # 设计文档 + 实现计划
└── INTERVIEW-GUIDE.md        # 面试问答指南（本地，不上传）
```

---

## ⚡ 快速上手

```yaml
# config.yaml — 加一个竞品只需这样：
competitors:
  - name: "新竞品名"
    keywords:
      - "keyword1"
      - "keyword2"

# Agent 会自己发现 GitHub repo、定价页、更新日志
```

```bash
# 定时任务已预设，无需额外配置：
# 📅 每周一 09:00 → 完整简报
# 📅 每日 10:00 → 数据刷新（周一到周五）
```

---

## 🎯 亮点

- ✅ **真正的 Autonomous Agent** — 感知、规划、行动、记忆四要素齐全
- ✅ **自动发现** — 加竞品只需 name + keywords，GitHub/定价页自动找到
- ✅ **双频调度** — 周一深度简报 + 每日数据刷新
- ✅ **实时告警** — 定价变化第一时间标记 🔴
- ✅ **按需问答** — "CrewAI 多少 stars？""最近有竞品涨价吗？"
- ✅ **生产级可靠** — cron 定时 + heartbeat 兜底 + JSON 持久化
- ✅ **可扩展** — 加数据源、加推送渠道、加 Web UI，配置就行

---

## 🌐 Web UI 看板

实时展示竞品数据，带 GitHub 趋势图。

```bash
node dashboard/server.js
# → http://localhost:3456
```

| API | 说明 |
|-----|------|
| `GET /api/competitors` | 竞品列表 + GitHub 趋势数据 |
| `GET /api/alerts` | 定价告警 |

前端使用 Chart.js + 原生 JS，零外部后端依赖。

## 🔌 MCP Server

通过 MCP 协议将竞品数据暴露给其他 Agent / IDE。

**启动：**
```bash
node mcp-server/server.js
# stdio 模式，等待客户端连接
```

**资源（Resources）：**
| URI | 说明 |
|-----|------|
| `competitor://list` | 所有竞品数据 |
| `competitor://alerts` | 定价告警 |
| `competitor://digest/latest` | 最新简报 |
| `competitor://{slug}/metrics` | 指定竞品指标 |
| `competitor://{slug}/history` | 指定竞品历史趋势 |

**工具（Tools）：**
| 工具 | 说明 |
|------|------|
| `list_competitors` 📋 | 列出所有竞品概览 |
| `query_competitor(name)` 🔍 | 查询指定竞品详情 |
| `compare_competitors(a, b)` ⚔️ | 对比两个竞品 |
| `check_pricing_alerts` 🚨 | 检查定价告警 |
| `get_latest_releases` 📦 | 获取所有最新 Release |

**MCP 客户端配置示例（Claude Desktop / Cursor）：**
```json
{
  "mcpServers": {
    "competitor-intel": {
      "command": "node",
      "args": ["/path/to/competitor-intel/mcp-server/server.js"]
    }
  }
}
```

---

## 📁 项目结构

```
├── config.yaml               # 竞品配置
├── briefing-agent.md          # Agent 执行指令
├── README.md
├── data/                      # 状态管理
│   ├── competitors.json       # 竞品状态
│   ├── snapshots/{slug}/      # 历史快照
│   ├── digests/               # 简报 JSON
│   └── alerts.json            # 定价告警
├── dashboard/                 # 🌐 Web UI 看板
│   ├── server.js              # FastAPI-like HTTP server
│   ├── package.json
│   └── static/
│       ├── index.html
│       ├── app.js
│       └── style.css
├── mcp-server/                # 🔌 MCP Server
│   ├── server.js              # stdout/stdin JSON-RPC
│   └── package.json
├── logs/                      # 执行日志
└── docs/plans/                # 设计文档
```

## 🔗 相关资源

- [设计文档](docs/plans/2026-06-29-intel-v2-design.md)
- [实现计划](docs/plans/2026-06-29-intel-v2-plan.md)
- [Agent 执行指令](briefing-agent.md)

## 📄 许可

MIT

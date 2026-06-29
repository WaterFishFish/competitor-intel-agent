# 📦 发布指南

把该项目推到 GitHub 分享或面试展示使用。

## 快速发布

```bash
cd competitor-intel

# 1. 初始化 git
git init
git add -A
git commit -m "feat: 竞品情报简报 AI Agent"

# 2. 创建 GitHub 仓库并推送
gh repo create competitor-intel-agent --public --source=. --push
```

## 已脱敏的公开文件

```
public/
├── config.yaml.example      ← 配置示例（替换 ID 为占位符）
├── config.yaml              ← 公开版配置
├── logs/
│   └── 2026-06-29.md        ← 简报样例（已去除内部备注）
├── README.md                ← 项目 README
├── INTERVIEW-GUIDE.md       ← 面试问答指南
└── briefing-agent.md        ← Agent 执行指令
```

## 本地 vs 公开

| 文件 | 本地开发 | 公开仓库 |
|------|---------|---------|
| `config.yaml` | ✅ 保留真实 ID | ❌ 不提交（已加入 `.gitignore`）|
| `logs/*.md` | ✅ 保留每周存档 | ❌ 不提交（已加入 `.gitignore`）|
| `public/` | ✅ 同步更新 | ✅ 提交到仓库 |
| `briefing-agent.md` | ✅ 保留 | ✅ 提交 |
| `README.md` | ✅ 保留 | ✅ 提交 |
| `INTERVIEW-GUIDE.md` | ✅ 保留 | ✅ 提交 |

## 注意

- 提交前确认 `config.yaml` 和 `logs/` 没有被 git 追踪
- 可用 `git status` 检查
- 敏感信息已在 `.gitignore` 中排除

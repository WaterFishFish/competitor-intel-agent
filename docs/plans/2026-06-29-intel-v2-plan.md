# 竞品情报简报 V2 — 实现计划

> **For implementer:** 每个任务独立可验证。完成后运行验证命令确认。

**目标：** 在现有 Agent 架构上增加 GitHub API 数据采集、JSON 状态管理、定价页监控、按需问答

**架构：** 采集层用 `exec curl` + `web_fetch` 拉数据 → 状态层写 JSON 文件 → 交付层由 heartbeat 检测并推送

**Tech Stack：** OpenClaw Agent + curl + JSON 文件

---

### Task 1: 创建 data/ 目录与初始 JSON 状态骨架

**文件：**
- Create: `competitor-intel/data/competitors.json`
- Create: `competitor-intel/data/alerts.json`
- Create: `competitor-intel/data/snapshots/.gitkeep`
- Create: `competitor-intel/data/digests/.gitkeep`

**步骤 1：创建目录**
```bash
mkdir -p data/snapshots data/digests
```

**步骤 2：写入 competitors.json（初始状态）**
从 config.yaml 读取现有 7 个竞品，生成初始 JSON 骨架，每个竞品只含 slug/name/active/added 基本字段，auto_discovered/github_metrics/pricing_status 为空或 null。

**步骤 3：写入 alerts.json**
空数组 `[]`

**步骤 4：验证**
```bash
cat data/competitors.json | python3 -m json.tool > /dev/null && echo "✅ JSON 合法"
test -f data/alerts.json && echo "✅ alerts.json 存在"
test -d data/snapshots && echo "✅ snapshots 目录存在"
```

**步骤 5：提交**
```bash
git add data/ && git commit -m "feat: 创建 JSON 状态管理骨架"
```

---

### Task 2: 升级 config.yaml — 支持自动发现字段

**文件：**
- Modify: `competitor-intel/config.yaml`

**变更：**
在 delivery 配置上方新增配置节，说明竞品配置只需 name + keywords，github/pricing 由 Agent 自动发现填入 JSON。

实际 config.yaml 结构不变，只是加注释说明自动发现机制。

**验证：** 文件结构清晰，无格式错误

**提交：**
```bash
git add config.yaml && git commit -m "chore: config 注释增加自动发现说明"
```

---

### Task 3: 升级 briefing-agent.md — 添加自动发现流程

**文件：**
- Modify: `competitor-intel/briefing-agent.md`

**变更：**
在「执行流程」中新增「0. 自动发现（新竞品初始化）」环节：

```
### 0. 自动发现（新竞品初始化）

当添加了一个没有 auto_discovered 信息的新竞品时：

a) 搜索 `{name} GitHub` — 用 web_search 或 web_fetch 查找 repo
b) 搜索 `{name} pricing` — 查找定价页 URL
c) 搜索 `{name} changelog` — 查找更新日志 URL
d) 验证 URL 有效性（web_fetch 确认 200）
e) 写入 data/competitors.json 的 auto_discovered 字段
f) 输出：`"✅ 已自动发现 [name] 的 GitHub/Pricing 信息"`
```

**验证：** 文件可读，流程清晰

**提交：**
```bash
git add briefing-agent.md && git commit -m "feat: 添加自动发现流程"
```

---

### Task 4: 升级 briefing-agent.md — 添加 GitHub API 数据采集

**文件：**
- Modify: `competitor-intel/briefing-agent.md`

**变更：**
在「数据收集」环节新增 GitHub API 采集子流程：

```
### GitHub API 数据采集

对每个有 github_org/github_repo 的竞品：

a) 获取仓库基本信息：
   ```bash
   curl -s "https://api.github.com/repos/{owner}/{repo}"
   ```
   提取：stargazers_count, forks_count, open_issues_count

b) 获取最新 Release：
   ```bash
   curl -s "https://api.github.com/repos/{owner}/{repo}/releases/latest"
   ```
   提取：tag_name, published_at, body（前 500 字）

c) 获取近期 Releases（过去 7 天）：
   ```bash
   curl -s "https://api.github.com/repos/{owner}/{repo}/releases?per_page=5"
   ```

d) 写入快照：
   ```bash
   data/snapshots/{slug}/github/{YYYY-MM-DD}.json
   ```

e) 更新 competitors.json 中的 github_metrics
```

**验证：** 流程描述完整，子步骤清晰，curl 命令可直接复制执行

**提交：**
```bash
git add briefing-agent.md && git commit -m "feat: 添加 GitHub API 采集流程"
```

---

### Task 5: 升级 briefing-agent.md — 添加定价页监控

**文件：**
- Modify: `competitor-intel/briefing-agent.md`

**变更：**
在「数据收集」环节新增定价页监控子流程：

```
### 定价页监控

对每个有 pricing_url 的竞品：

a) 获取定价页内容：
   ```bash
   curl -sL "{pricing_url}" | python3 -c "
   import sys, re, hashlib
   html = sys.stdin.read()
   # 提取文字内容，去除非结构化噪音
   text = re.sub(r'<[^>]+>', ' ', html)
   text = re.sub(r'\s+', ' ', text).strip()
   print(hashlib.md5(text.encode()).hexdigest())
   print(text[:3000])
   "
   ```
   提取：内容 MD5 hash + 前 3000 字

b) 比较 hash 与 competitors.json 中 pricing_status.last_hash
   - 相同 → 无变化，跳过
   - 不同 → 标记变化，写入 alerts.json

c) 写入快照：
   ```bash
   data/snapshots/{slug}/pricing/{YYYY-MM-DD}.txt
   ```

d) 更新 competitors.json 中的 pricing_status

e) 定价变化 → 高优先级告警（写入 alerts.json 并标注 high_priority: true）
```

**验证：** 流程描述完整，hash 比较逻辑清晰

**提交：**
```bash
git add briefing-agent.md && git commit -m "feat: 添加定价页监控流程"
```

---

### Task 6: 升级 briefing-agent.md — 添加按需问答

**文件：**
- Modify: `competitor-intel/briefing-agent.md`

**变更：**
在文档末尾新增「按需问答」章节：

```
## 按需问答

当收到飞书消息询问竞品情况时（通过 Heartbeat 或直接消息）：

### 支持的问题类型：

**"XXX 这周有什么变化？"**
→ 读 data/digests/ 最新文件，提取对应竞品段落

**"最近有竞品涨价吗？"**
→ 读 data/competitors.json，检查所有 pricing_status.changed=true
→ 读 data/alerts.json 获取定价告警详情

**"XXX 多少 stars 了？"**
→ 读 data/competitors.json → 对应竞品的 github_metrics.stars

**"对比 X 和 Y 的 GitHub 趋势"**
→ 读 data/snapshots/{x}/github/ 和 {y}/github/ 最近 7 天数据
→ 计算 star 增长曲线
→ 输出对比表格

**处理原则：**
- 优先读 JSON 状态，不重新爬取
- 如果 JSON 数据过旧（>3 天），提示"数据可能不是最新的"
- 不支持的查询，回复"这个我还不会，可以试试问别的"
```

**验证：** 问答逻辑描述完整，覆盖 Phase 1 的四种核心查询

**提交：**
```bash
git add briefing-agent.md && git commit -m "feat: 添加按需问答支持"
```

---

### Task 7: 添加每日 cron — GitHub 数据 + 定价监控刷新

**文件：**
- 无代码变更，通过 cron 工具操作

**变更：**
添加一个新的 cron job：每日 10:00 CST（周一到周五），运行数据刷新。

```json
{
  "name": "竞品情报-数据刷新",
  "schedule": {"kind": "cron", "expr": "0 10 * * 1-5", "tz": "Asia/Shanghai"},
  "payload": {
    "kind": "agentTurn",
    "message": "执行竞品情报数据刷新任务。\n\n按 briefing-agent.md 中的流程：\n1. 读取 config.yaml + data/competitors.json\n2. 对每个 active 竞品，采集 GitHub API 数据 → 写入 snapshot + 更新 metrics\n3. 对每个有 pricing_url 的竞品，抓取定价页 → hash 比对 → 有变化写入 alerts\n4. 跳过简报生成（简报只在周一生成）\n5. 写入 data/competitors.json",
    "timeoutSeconds": 180
  },
  "delivery": {"mode": "none"},
  "sessionTarget": "isolated"
}
```

**验证：** 触发一次 force run 确认执行正常

**提交：** 直接通过 cron 工具添加

---

### Task 8: 升级每周简报 cron — 使用 JSON 状态生成更丰富的简报

**文件：**
- 无代码变更，更新现有 cron 的 payload message

**变更：**
更新现有周一 cron job 的消息，让其也使用 JSON 状态：

```
执行竞品情报简报任务。

数据来源：
1. 读取 config.yaml — 竞品配置
2. 读取 data/competitors.json — GitHub metrics + pricing 状态
3. 读取 data/snapshots/ — 历史数据用于趋势分析
4. web_fetch 补充新闻动态

简报内容比之前更丰富：
- 每条竞品加入 GitHub 趋势数据（star 变化 / fork 数 / 最新 Release 说明）
- 如果有定价变化，标注 🔴 高优先级
- 加入「过去一周 GitHub 趋势对比」
```

**验证：** 手动 force run 确认简报质量提升

**提交：** 通过 cron 工具更新

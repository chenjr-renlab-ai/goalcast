# 预言者议会（Goalcast / Oracle Council）
## 完整项目文档

**最后更新**: 2026-05-06  
**当前版本**: v4.9.1  
**仓库**: https://github.com/chenjr-renlab-ai/goalcast  
**本地路径**: `D:\AAAcjr\Projects\oracle-council-test`

---

## 一、产品定位与核心命题

### 1.1 一句话定义

**"把足球分析变成综艺节目"** — 6 个 AI 角色，用完全不同的方法论，基于真实赛事数据，当着用户的面互怼、辩论、预测一场足球比赛的结果。

### 1.2 核心命题

传统 AI 预测工具：输入比赛 → 黑箱运算 → 输出一个数字。用户不知道为什么，也不知道该不该信。

**预言者议会的解法**：让六个拥有不同专业框架的 AI 公开辩论，推理过程本身就是内容。结论从辩论中自然浮现，不是从黑箱输出的。

> 用户消费的不是结论，是一场有戏剧张力的推理过程。

### 1.3 产品属性

- **不是**：严肃足球数据工具 / 赌博产品 / 学术预测系统
- **是**：有数据依据的娱乐预测秀，ESPN赛前节目 × 斗鱼直播 × AI辩论的混合体

### 1.4 战略背景（2026 FIFA 世界杯）

产品本就定位蹭世界杯热度，英超数据是过渡期跑通产品逻辑的临时方案。

- **WC 2026 开赛**：2026年6月11日，赛程至7月19日
- **核心流量窗口**：中国队时隔24年再度晋级世界杯（2002年后首次），这是产品面向中国用户的历史级事件
- **过渡期策略**：继续用英超验证产品，5月下旬切换世界杯数据

---

## 二、目标用户

### 2.1 用户画像

| 用户类型 | 描述 | 核心需求 | 当前满足度 |
|---------|------|---------|-----------|
| **主力：泛球迷** | 20-35岁，关注英超/世界杯，非深度分析派 | 赛前"了解个大概"，看点娱乐内容 | ★★★☆☆ |
| **潜力：AI爱好者** | 对AI技术感兴趣，想看AI"实战表现" | 观察AI之间的意见分歧，判断哪个AI更聪明 | ★★☆☆☆ |
| **边缘：休闲博彩** | 偶尔买竞彩，想要"参考意见" | 赔率分析、盘口解读 | ★★☆☆☆ |
| **排除：专业分析师** | 需要真实量化数据和模型输出 | — | 不是目标 |

### 2.2 核心使用场景

> 比赛前30分钟，用户打开应用，看AI议会预测一下，顺便看看今晚的看点是什么，然后开始看球。整个体验不超过10分钟。

### 2.3 营销切入点（按传播力排序）

1. **"看AI吵架"** — 6个AI用完全不同的方法互怼。赌狗说数据帝是书呆子，数据帝说赌狗是赌徒。可剪辑成短视频发小红书/抖音。

2. **"你赢了AI议会吗？"** — 用户预测 vs AI集体预测，形成博弈感。"我押平局，AI全押主队赢，最后我对了" — 强炫耀动机。

3. **"每场比赛的6种解读"** — 教育属性：让不太懂球的人通过赌狗/历史/心理视角"理解"这场比赛。

4. **"AI准确率PK"** — 长期运营：哪个AI角色预测最准？冰狗还是赌狗？

---

## 三、六个 AI 角色（议员设计）

### 3.1 角色总览

| Agent ID | 角色名 | 3D外观 | AI超能力 | 系统性盲点 | Temperature |
|----------|--------|--------|---------|-----------|-------------|
| `stat` | **Dr.冰狗** | 🕶️ 方框眼镜 | 10,000次蒙特卡洛模拟，P(主胜)/P(平)/P(客胜)，均值回归检测 | 不信心理和氛围 | 0.3 |
| `gambler` | **赌狗本狗** | 🃏 三张扑克牌 | 跨平台赔率套利，公众盘 vs 职业盘方向对比，"错误定价"检测 | 过度解读微小异动 | 0.7 |
| `history` | **老球迷** | 🧣 球队围巾 | 历史情景向量匹配，X场相似局面Y场主赢，主动承认反例 | 确认偏误 | 0.5 |
| `psych` | **碎碎念** | 🎧 头戴耳机 | 采访文本语义情绪分析，换人时机模式识别，必须点名球员 | 过度拟人化 | 0.6 |
| `mystic` | **月影姐** | 🌙 月亮发饰 | 社交叙事强度检测，"叙事过热时押反向"（包括反押冷门） | 为逆向而逆向 | 1.1 |
| `moderator` | **议长** | 🎤 麦克风 | 综合裁判，必须选边宣布胜出论点+漏洞，有偏见的provocateur | — | 0.25 |

### 3.2 信息不对称设计（核心机制）

**每个 agent 只能访问特定数据字段**，这是系统最核心的设计：

```
stat:      avgHomeGoals, avgAwayGoals, homeForm, awayForm, standings, xg_note
gambler:   odds, oddsMove, ev, impliedScore
history:   h2h, stage, historicalNote, h2hScoreFreq   ← stage = 赛季节点（第X轮）
psych:     news, homeForm_mood, awayForm_mood, venue
mystic:    date, venue, numerology                     ← numerology = 日期/地点数字化处理
moderator: all (综合参考)
```

**信息差产生真实碰撞的典型场景**：

> 赌狗看到 `odds.home: 1.85`，推断主队被低估。但冰狗（stat）完全看不到赔率，只能基于Poisson说"主队胜率58%"。对线时赌狗会说："赔率定价说主队胜率只有54%，这就是低估。"冰狗反驳："你的赔率落后市场一步，我的Poisson基于最新近5场。" — 这就是数据字段不对等产生的真实方法论碰撞。

信息不对等让 agent 在辩论中必须主动"披露"自己的依据，创造真实的信息差和惊喜时刻。

### 3.3 方法论碰撞矩阵

`METHOD_CLASH` 表定义了 20 组对战配对的框架碰撞要点。例：
- `stat→gambler`："静态历史统计 vs 实时盘口 —— 历史N=5000场的规律比今天N=1次盘口变动更稳定"
- `gambler→stat`："盘口永远比模型更新更快 —— 冰狗的Poisson模型是昨天的数据，我的盘口是今天的市场定价"
- `psych→gambler`："碎碎念的心理信号是软信息，盘口异动是硬信息 —— 你的证据是采访感觉，我的证据是真钱在移动"

### 3.4 3D 角色外观（Three.js）

每个 agent 是完整的人形 3D 角色，具有：
- **身体结构**：躯干（CylinderGeometry）、头部（SphereGeometry）、手臂、腿脚
- **Pixar风眼睛**：三层（眼白+虹膜+瞳孔+双高光），每个 agent 专属虹膜颜色
- **职业道具**：眼镜（stat）/ 扑克牌（gambler）/ 围巾（history）/ 耳机（psych）/ 月亮发饰（mystic）/ 麦克风（moderator）
- **动画系统**：眨眼（5.5s/次，各agent节奏错开）/ 发言时头部点头 / 嘴唇开合 / 非发言时idle呼吸浮动
- **发言特效**：光束加强（opacity .28）/ 音波扩散 / pivot转向时颜色闪烁

---

## 四、核心机制设计

### 4.1 议会流程（四阶段）

```
用户选比赛 → 填比分预测（快速押注：主胜/平/客胜）→ 猜魔鬼代言人
    ↓
Phase 1: 开场（Opening）
  - 议长开场，弹幕语气煽动气氛，介绍今晚交锋焦点

Phase 2: 初判（Initial）
  - 5个专家依次串行发言（DeepSeek ~7-9s/人，共约35-45s）
  - 每人：引用真实数据 + 三步推导 + 比分预测 + 场景分镜（scenePrediction：45-80字电影分镜，含具体分钟数+球员名+动作）
  - 初判进度指示器：● ● ⏳ ○ ○
  - 分歧最大两方：双向方法论互怼（reaction）

Phase 3: 对线（Debate）
  - 动态辩论循环，最多5轮
  - 攻方接收：对方完整structured判断 + 方法论碰撞要点 + 自身真实数据
  - Round 2后：65%概率触发第三方插嘴
  - 停止条件：共识≥75% / 连续2轮无转向 / 5轮硬上限
  - 对线争议焦点 overlay 显示在3D场景中央（8s）

Phase 4: 终投（Vote）
  - 5个专家：各自专属视角终投（防重复）
    - 冰狗：把所有论点折算成更新概率数字
    - 赌狗：判断哪个论点最接近职业盘逻辑
    - 老球迷：补一个今晚没人提过的历史数据点
    - 碎碎念：分析今晚议会辩论本身的心理模式
    - 月影姐：对线结束后的叙事强度更新
  - 议长宣布胜出方 + 加权概率汇总
  - 魔鬼代言人揭晓（揭示谁拿了反向证据），用户猜测结果toast
    ↓
结果展示：议会预测 + 用户预测对比 + 自动弹分享预览
下一场推荐：结果页显示推荐卡片
```

### 4.2 恶魔代言人机制

每场议会随机指派一名议员为恶魔代言人：
- **不是强制反对**，而是只给他看对主队不利的数据
- 让他基于真实存在的反向证据自然形成对立立场
- 投票时恢复完整信息，议会结束后揭示身份
- **设计依据**：ICLR 2025 MAD研究发现强制反对派会降低预测质量；信息不对等版保留戏剧性而不引入虚假论点

### 4.3 概率校正层（W-5 Rebalancer）

纯 LLM 系统性低估平局和冷门概率，需要独立校正：

```
修正规则：
- 平局修正：draw < 22% 时，提升至 max(draw,22) × 1.15
- 冷门修正：赔率差 > 2.0 时，冷门方 +7.5%
- 最大调整幅度：单项不超过 ±12%
- 自动重新归一化

EV计算（期望价值，参考Footixify）：
evHome = (home/100) × homeOdds - 1
正EV = 市场低估，存在超值
```

### 4.4 加权汇总（weightedSummaryCalc）

终投汇总时，每个 agent 的权重基于历史命中率：

```
credibility = max(0.6, min(1.5, 0.6 + (correct/total) × 1.8))
// 新agent（<5场）= 1.0 基础权重
// 命中率100% → 最高权重1.5
// 命中率0% → 最低权重0.6
```

### 4.5 Blackboard 协同状态

所有 agent 共享一个结构化黑板：

```javascript
blackboard = {
  agentStances:   // 各agent实时立场 {pick, conf}
  consensusLevel: // 共识度 0-1（基于标准差计算）
  disputes:       // 活跃分歧列表（自动检测）
  pivotMoments:   // 立场变化历史
  keyInsights:    // 关键判断（注入后续agent的prompt）
  monitorLog:     // 实时监控日志流
}
```

共识度计算：`1 - min(std_dev(homeProbs) × 2, 1)`

---

## 五、技术架构

### 5.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    前端 (Browser)                    │
│  public/index.html   主页面结构                      │
│  public/app.js       前端逻辑（SSE接收/UI更新）      │
│  public/scene3d.js   Three.js 3D议事厅场景           │
│  public/style.css    全局样式（WC深海蓝+FIFA金）      │
│  public/monitor.html 后台监控面板                    │
└─────────────────────────────────────────────────────┘
                       ↕ HTTP/SSE
┌─────────────────────────────────────────────────────┐
│             Express 服务器 (server.mjs)              │
│  GET  /api/matches         英超/WC赛程               │
│  GET  /api/match/:id       单场完整数据              │
│  POST /api/match/:id/prepare 触发数据补全            │
│  GET  /api/run?matchId=xxx SSE议会主流               │
│  GET  /api/monitor         SSE监控流（2秒推送）      │
│  POST /api/result          录入比赛结果              │
│  GET  /api/memory/profiles 各agent历史准确率         │
└────────────┬──────────────────────┬────────────────┘
             │                      │
┌────────────▼───────────┐ ┌────────▼──────────────┐
│   agents.mjs            │ │     数据层             │
│   议会协同引擎           │ │  dataFetcher.mjs       │
│   · 6角色差异温度        │ │    football-data.org   │
│   · 信息不对等           │ │    the-odds-api.com    │
│   · Blackboard协同       │ │    FPL API             │
│   · 方法论碰撞矩阵       │ │  seedGenerator.mjs     │
│   · 恶魔代言人           │ │  rebalancer.mjs        │
│   · 终投差异化视角       │ │  memory.mjs            │
└────────────┬───────────┘ └───────────────────────┘
             ▼
┌────────────────────────┐
│  火山方舟 Coding Plan   │
│  DeepSeek-v3.2         │
│  双key轮询（防限速）    │
│  JSON mode（快）       │
│  stream: true（TTFT1s）│
└────────────────────────┘
```

### 5.2 文件结构

```
oracle-council-test/
├── server.mjs          Express服务器 + API路由 + SSE流
├── agents.mjs          议会协同引擎（核心，1000+行）
├── dataFetcher.mjs     真实数据拉取 + 6h缓存
├── seedGenerator.mjs   LLM叙事种子预生成
├── rebalancer.mjs      W-5概率校正层
├── memory.mjs          跨场次准确率记忆
├── .env                API keys（不入版本控制）
├── .cache/             API响应缓存（自动创建）
├── .memory/            长期记忆存储（自动创建）
└── public/
    ├── index.html      主界面（409行）
    ├── app.js          前端逻辑（2500+行）
    ├── scene3d.js      Three.js 3D议事厅（1900+行）
    ├── style.css       样式（2100+行）
    └── monitor.html    后台监控面板
```

### 5.3 SSE 事件类型

| 事件类型 | 含义 | 前端处理 |
|---------|------|---------|
| `phase` | 阶段切换 | topbar阶段条高亮、3D场景切换 |
| `thinking` | agent思考中 | agent卡片脉冲动画 |
| `speaking_start` | 流式首字节（TTFT~1s） | 立即切3D发言动画 |
| `message` | agent完整发言 | broadcast面板、history更新、概率条 |
| `blackboard_update` | 黑板更新 | Evidence Board、共识条 |
| `debate_stop` | 辩论结束 | 横幅提示 |
| `pivot` | 立场转向 | 卡片金色闪烁、3D颜色切换 |
| `devil_reveal` | 魔鬼代言人揭晓 | 特殊动效 + 用户猜测结果 |
| `summary` | 汇总结果 | 结果页、分享弹窗 |
| `done` | 议会结束 | 关闭SSE连接 |

### 5.4 LLM 调用配置

```
平台：火山方舟 Coding Plan
模型：deepseek-v3.2
实测延迟：7-9s/call（约20 token/s）
双key轮询：VOLC_API_KEY_1/2（各自独立配额）
调用方式：stream:true（JSON mode，response_format）
TTFT：~1s（首字节触发3D动画）
超时：30s
重试：失败后3s重试一次
```

---

## 六、数据来源

| 数据源 | 接口 | 提供内容 | 备注 |
|--------|------|---------|------|
| [football-data.org](https://www.football-data.org/) v4 | 免费Key | 英超赛程、近5场战绩、H2H历史、积分榜 | WC接口：`/v4/competitions/WC` |
| [Fantasy Premier League API](https://fantasy.premierleague.com/api/) | 无需Key | 球员xG/90、伤病状态、近期形态 | 仅覆盖英超，WC需替代 |
| [the-odds-api](https://the-odds-api.com/) | 付费Key | 实时欧赔（bet365），隐含概率、水钱计算 | `sport=soccer_fifa_world_cup`支持WC |
| [火山方舟 Coding Plan](https://ark.cn-beijing.volces.com/) | 付费Key×2 | LLM对话生成（DeepSeek-v3.2） | 双key轮询 |

---

## 七、前端关键功能

### 7.1 3D 议事厅（scene3d.js）

- 圆形布局，6个人形角色各有站台、光柱、orbit光环
- FIFA 2026风格后方LED大屏（opacity降至0.22，不遮挡agent）
- 广播主播台（每个agent前一张）
- 球场草坪地板 + 三层看台观众席
- 球星英雄卡墙（Wikipedia照片）
- 摄像机系统：默认z=13（已拉近），发言时z=7，非发言时slow orbit旋转
- 空闲状态：中央能量光圈每1.4s扩散消失

### 7.2 用户交互系统

- **快速押注**：3个大按钮（主队胜/平/客队胜），比分弹窗补充具体比分
- **魔鬼猜测**：比分弹窗底部5个agent按钮，结束后显示揭晓toast
- **实时概率条（拔河绳）**：SVG拔河动画，弹跳+发光+数值闪烁
- **本地战绩记录**：LocalStorage保存最近50场预测
- **上场金句轮播**：空闲时每4s切换上一场精彩金句
- **agent卡片三态**：空闲（方法/盲点/命中率）/ 进行中（立场/置信度）/ 结束后（金句）

### 7.3 分享功能

- Canvas生成800×520高清战报PNG
- 自动弹出（议会结束2.2s后）
- 内容：三色场馆灯光背景、主客队色块、裁决横幅、金句列表、"我押X vs 议会押Y"对比条
- 可直接粘贴到微信/微博

### 7.4 移动端适配

- `<600px`：显示6格emoji agent网格替代3D场景
- 发言时对应格子高亮+脉冲动画
- 同步实时更新每人立场数据

---

## 八、世界杯转型计划（2026 FIFA World Cup）

### 8.1 数据适配

| Agent | 现有数据 | WC适配方案 |
|-------|---------|-----------|
| 冰狗 | 英超进失球 | `/v4/competitions/WC` + FIFA排名 + 世预赛数据 |
| 赌狗 | EPL赔率 | `sport=soccer_fifa_world_cup`（已支持） |
| 老球迷 | H2H近期 | 国家队历史交锋（含往届世界杯战绩）|
| 碎碎念 | FPL伤情 | SofaScore/TransferMarkt + 赛前新闻文本 |
| 月影姐 | LLM模拟 | 同上（只需更新叙事背景上下文）|

### 8.2 中国队特殊模式

当比赛涉及中国队时：
- 月影姐主打："24年的等待，叙事情绪过热还是实力支撑？"
- 赌狗主打："中国赔率异常？全球华人资金流向"
- UI：触发金红配色主题，飘落粒子效果

### 8.3 执行节点

| 节点 | 时间 | 内容 |
|------|------|------|
| 数据预热 | 2026-05-下旬 | 接入football-data.org WC接口，测试数据拉取 |
| 内容验证 | 2026-06-01前 | 用WC友谊赛数据跑完整议会，验证agent质量 |
| 正式上线 | 2026-06-11（开赛） | 全面切换WC模式，英超保留备用 |
| 中国队首战 | 视赛程 | 触发中国队特殊模式，冲传播高峰 |

---

## 九、安装与运行

### 9.1 环境要求

- Node.js >= 18（ESM支持）
- Windows/Mac/Linux

### 9.2 快速启动

```bash
git clone https://github.com/chenjr-renlab-ai/goalcast.git
cd goalcast
npm install
```

创建 `.env` 文件：

```env
# 火山方舟 Coding Plan（双key轮询）
VOLC_API_KEY_1=your_key_here
VOLC_API_KEY_2=your_key_here   # 可选，双key并发配额翻倍

# 足球数据
FOOTBALL_DATA_API_KEY=your_key_here   # football-data.org 免费注册
ODDS_API_KEY=your_key_here            # the-odds-api.com（可选）
```

```bash
node server.mjs
# Windows可双击 start.bat
```

浏览器访问：
- 主界面：http://localhost:3000
- 监控面板：http://localhost:3000/monitor.html

### 9.3 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `VOLC_API_KEY_1` | ✅ | 火山方舟主key，从[控制台](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)获取 |
| `VOLC_API_KEY_2` | 可选 | 双key负载均衡，两key并发时各自独立配额 |
| `FOOTBALL_DATA_API_KEY` | ✅ | football-data.org 免费注册获取，免费档每天10请求，有缓存可复用 |
| `ODDS_API_KEY` | 可选 | the-odds-api.com，无则跳过赔率数据，Agent EV指标降级为null |

**缓存目录结构**（`.cache/` 自动创建）：

```
.cache/
  fixtures-pl.json    英超赛程（TTL 12h）
  standings-pl.json   积分榜（TTL 12h）
  form-{teamId}.json  近5场战绩（TTL 6h）
  h2h-{fixtureId}.json H2H历史（TTL 24h）
  odds-{fixtureId}.json 赔率（TTL 6h）
  fpl-bootstrap.json  FPL球员数据（TTL 6h）
  seeds-{matchId}.json 叙事种子（TTL 24h）
```

**清缓存方法**：手动删除 `.cache/` 下的 `.json` 文件，或 `rm -rf .cache/*.json`

**降级策略决策树**：

```
football-data.org 超时/失败
  └→ 使用 .cache/ 中最近一次有效缓存（如超过TTL则标注"旧数据"）
     └→ 缓存也无：API接口正常响应，但 homeForm/awayForm = "数据暂无"

the-odds-api 失败
  └→ odds 字段为 null，议会继续（赌狗无赔率数据，发言降级为感性判断）
     └→ EV 指示器不显示（而非显示错误值）

FPL API 失败
  └→ _fplAvailable = false，前端显示橙色警告 "⚠️ FPL 数据暂时不可用"
     └→ psych agent 用 homeForm_mood / news 降级（从其他已有字段推导）

单个 Agent API 调用失败（超30s）
  └→ 自动重试1次（间隔3s）
     └→ 仍失败：发"（X信号丢失，本轮跳过）"占位消息，不阻塞整个议会
```

---

## 十、已知技术限制

| 类型 | 说明 |
|------|------|
| 月影姐"叙事强度" | LLM模拟（无真实社交媒体API），数据是虚构的 |
| 冰狗"10000次模拟" | LLM推理（非真实Poisson计算），AI在扮演模型 |
| FPL数据 | 仅覆盖英超球员，WC模式需替代数据源 |
| Three.js版本 | r160 CDN引入，已弃用，有GPU stall警告，属正常 |
| DeepSeek延迟 | 实测7-9s/call（约20 token/s），比文档标称2.2s差距大 |
| liveMatches | 内存存储，服务重启清零（可接受） |
| H2H历史 | football-data.org免费档历史数据有限 |
| 服务器 | 单机无持久化，纯开发/演示用途 |

---

## 十一、研究参考

| 来源 | 借鉴内容 |
|------|---------|
| WINNER12/W-5框架 | 概率校正层（Rebalancer）：纯LLM系统性低估平局和冷门，需独立校正步骤 |
| Footixify | EV（期望价值）显示：议会概率 vs 赔率隐含概率的差值（正EV=超值） |
| ICLR 2025 MAD研究 | 放弃强制反对派：强制恶魔代言人降低预测质量；改为信息不对等版本 |
| SportBot AI | 实时新闻情绪注入（当前基于briefing字段） |

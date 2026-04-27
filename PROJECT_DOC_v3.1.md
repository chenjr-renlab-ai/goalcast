# 预言者议会 · 完整项目文档
**版本**: v3.1  
**日期**: 2026-04-24  
**项目路径**: `D:\AAAcjr\Projects\oracle-council-test`

---

## 一、项目定位

一款 AI 多智能体足球比赛预测娱乐产品。核心体验：6个拥有不同分析框架的 AI 角色，在世界杯风格的虚拟演播室里用真实赛事数据辩论预测比分，观众（用户）提前下注比分并看议会是否和自己一致。

**不是什么**：不是严肃的足球数据分析工具，不是赌博产品，不是学术预测系统。  
**是什么**：有数据依据的娱乐预测秀，ESPN赛前节目 × 斗鱼直播 × AI辩论的混合体。

---

## 二、技术架构

```
Browser
  ├── public/index.html      — 主页面结构
  ├── public/app.js          — 前端逻辑（SSE接收、UI更新、3D控制）
  ├── public/scene3d.js      — Three.js 3D议事厅场景
  └── public/style.css       — 全局样式（世界杯绿金配色）

Server (Node.js ESM)
  ├── server.mjs             — Express服务器，SSE流，API路由
  ├── agents.mjs             — 6个AI角色逻辑（Moonshot API）
  ├── dataFetcher.mjs        — football-data.org + the-odds-api 数据接入
  ├── seedGenerator.mjs      — 赛前"独家情报"种子生成（LLM预生成）
  ├── rebalancer.mjs         — W-5概率重平衡器（修正平局偏低/冷门偏低）
  └── memory.mjs             — 跨场次准确率记忆

Data APIs
  ├── football-data.org v4   — 近5场战绩、H2H、积分榜
  ├── the-odds-api           — 实时赔率
  └── Moonshot AI (moonshot-v1-8k) — LLM对话生成

Cache: .cache/*.json        — 6h TTL（odds），12h TTL（fixtures），6h TTL（form）
```

---

## 三、当前6个AI角色

### 方法论设计（v3.1）

每个 agent 有：**AI计算超能力**（做了什么运算）+ **方法论盲点**（会在哪里出错）+ **框架碰撞对手**（和谁最冲突）

| Agent | 角色名 | AI超能力 | 系统性盲点 | 主要冲突对象 |
|-------|--------|---------|-----------|------------|
| `stat` 冰狗 | Poisson模型 | 10,000次蒙特卡洛模拟，输出P(主胜)/P(平)/P(客胜)，均值回归检测 | 不信心理和氛围 | 碎碎念（心理 vs 数据） |
| `gambler` 赌狗 | 跨平台盘口套利 | 公众盘 vs 职业盘方向对比，"错误定价"检测 | 过度解读微小异动 | 冰狗（动态盘口 vs 静态模型） |
| `history` 老球迷 | 历史向量匹配 | 多维历史情景检索，X场相似局面Y场主赢，主动承认反例 | 确认偏误 | 冰狗（样本量之争） |
| `psych` 碎碎念 | 行为语言AI | 采访文本情绪分析，换人时机模式，必须点名球员+信号来源 | 过度拟人化 | 赌狗（软信息 vs 硬资金） |
| `mystic` 月影姐 | 舆情叙事检测 | 社交情绪强度，叙事过热时押反向（包括反押冷门） | 为逆向而逆向 | 赌狗（叙事 vs 资金方向） |
| `moderator` 议长 | 综合裁判 | 必须选边，宣布胜出论点+漏洞，有偏见的provocateur | — | — |

### 信息不对称

每个 agent 只能访问特定数据字段（`AGENT_DATA_ACCESS`）：
- `stat`：avgHomeGoals, avgAwayGoals, homeForm, awayForm, standings, xg_note
- `gambler`：odds, oddsMove, ev, impliedScore
- `history`：h2h, historicalNote, h2hScoreFreq
- `psych`：news, homeForm_mood, awayForm_mood, venue
- `mystic`：date, venue, numerology

### 方法论碰撞矩阵

`METHOD_CLASH` 表定义了20组对战配对的框架碰撞说明，每次对线时注入对应的碰撞要点，确保辩论是方法论之争而非人身攻击。

---

## 四、会话流程

```
[用户选比赛] → /api/prepare（拉数据+生成seeds）
    ↓
[用户填比分预测] → 显示score modal
    ↓
[召开议会] → /api/run（SSE流）
    ↓
Phase 1: Opening       — 议长开场（1次）
Phase 2: Initial       — 5个expert并行生成初判，带真实数据，按字数延迟显示（7-15秒/条）
         + Reaction    — 分歧最大的两个agent双向方法论互怼（2次）
Phase 3: Debate        — 动态辩论循环（最多5轮）
         - 第0轮前：议长宣布交锋
         - 每轮：攻方接收对方完整structured判断 + 方法论碰撞说明 + 自身真实数据
         - Round 2后：65%概率触发第三agent插嘴
         - 停止条件：共识≥75% / 连续2轮无转向 / 5轮硬上限
Phase 4: Vote          — 5个expert终投（强制引用对线内容，说明是否被说服）
         + Summary     — weightedSummaryCalc（历史准确率加权）
    ↓
[结果展示] → 议会综合比分 + 各agent预测比较 + 用户预测对比
    ↓
[赛后录入] → POST /api/result → 更新准确率记忆
```

### 动态停止条件

| 条件 | 触发动作 |
|------|---------|
| 共识度 ≥ 75% | 提前收场，"场内趋于一致" |
| 连续2轮无立场转向 | 宣布意见固化，强制收场 |
| 有agent转向 | emit `pivot` 事件，触发卡片闪烁特效 |
| 5轮硬上限 | 强制进入终投 |

---

## 五、数据流

```
warmup() 启动时：
  → fetchPLFixtures() → 17场赛程
  → fetchStandings() → 积分榜
  → 前2场：fetchOdds() + generateSeeds()（LLM预生成独家视角）

/api/prepare 用户选场时：
  → enrichMatchBriefing()
    → fetchTeamForm(homeTeamId) → 近5场战绩
    → fetchTeamForm(awayTeamId) → 近5场战绩
    → fetchH2H(fixtureId) → 历史交锋
  → generateSeeds(match) → 5个agent的独家种子
  → 写入 match.briefing + match._briefingEnriched = true

/api/run 时：
  → callAgent(id, directive, phase) → Moonshot API
    → buildAgentBriefing(match, agentId)：按AGENT_DATA_ACCESS过滤字段
    → extractAgentDataValues(match, agentId)：提取真实字段值注入directive
    → buildInfoAsymmetryNote(atkId, defId, match)：独占情报注入
    → buildDebateDirective(round, atkId, defId, defMsg, match)：方法论碰撞指令
```

---

## 六、前端关键机制

### SSE 事件类型

| 事件 | 触发 | 前端处理 |
|------|------|---------|
| `phase` | 阶段切换 | 阶段条高亮、议事厅切换、split-screen激活 |
| `thinking` | agent思考中 | agent卡片脉冲动画 |
| `message` | agent发言 | broadcast panel更新、3D摄像机切换、hero card触发 |
| `blackboard_update` | 黑板更新 | Evidence Board刷新、共识条更新 |
| `debate_stop` | 辩论结束 | 横幅提示（共识达成/意见固化/满轮）|
| `pivot` | 立场转向 | agent卡片金色闪烁、history feed记录 |
| `devil_reveal` | 魔鬼辩护人揭晓 | 特殊动效 |
| `summary` | 汇总结果 | 结果页展示、概率条最终定格 |

### 3D 场景（scene3d.js）

- 6个人形角色（各有配色/配件：眼镜/耳机/麦克风等）
- FIFA 2026风格后方LED大屏
- 广播主播台（每个agent前）
- 球场草坪地板 + 三层看台观众席
- 悬浮赛况大屏（实时概率条）
- 球星英雄卡墙（Wikipedia照片）
- 摄像机：发言时切到发言者，orbit轨道缓慢旋转

### 概率系统

- 初始：W-5重平衡器（来自 the-odds-api 赔率）
- 实时：每条发言后按 `structured.confidence` + 历史准确率权重更新
- 最终：`weightedSummaryCalc()` 计算 P(主胜)/P(平)/P(客胜)

---

## 七、评价体系（v3.1当前版本）

### 系统设计的评价维度

1. **信息增量** — 发言是否揭示了用户自己找不到的角度
2. **立场多样性** — 5个agent的判断分布熵值（全押一队=无聊，三方都有=有趣）
3. **因果论证质量** — 是在做"因为X所以Y"推断，还是"当A时通常B"相关性
4. **叙事张力** — 会话内是否有转折点，结局是否感觉earned

### 用户实际反馈（试用）

> "看乐子可以，但是不会信，除非有更多依据，比如摆个数据or告诉我你怎么得到的"

**核心矛盾**：娱乐性（吸引人看完）vs 可信度（让人相信结论）之间的平衡。

---

## 八、技术债务

| 项目 | 文件 | 说明 |
|------|------|------|
| 月影姐的"叙事强度"是虚构的 | agents.mjs | 没有真实社交API，LLM在扮演舆情分析 |
| 冰狗的"10000次模拟"是虚构的 | agents.mjs | LLM在扮演Poisson模型 |
| H2H历史数据很少 | dataFetcher.mjs | 只有近期比赛，历史数据有限 |
| xG数据字段为空 | dataFetcher.mjs | 未接入xG数据源 |
| 缓存空数组问题 | dataFetcher.mjs | readCache应拒绝空数组，已手动清理一次 |
| fetchWikiPhoto无重试 | app.js | 网络偶发失败不重试 |
| heroActive状态泄露 | app.js | 快速多次resetCouncil可能卡死队列 |
| AbortController缺失 | app.js | 页面关闭时SSE连接未主动关闭 |

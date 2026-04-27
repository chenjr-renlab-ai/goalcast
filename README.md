# 🔮 Goalcast — AI Football Prediction Council

> 6个 AI 角色，真实赛事数据，方法论碰撞辩论，预测英超比分。

**预言者议会**是一款 AI 多智能体足球比赛预测娱乐产品。6个拥有不同分析框架的 AI 角色，在世界杯风格的虚拟演播室里用真实赛事数据辩论预测比分，观众提前下注比分并看议会是否和自己一致。

---

## 演示截图

| 主页选场 | 议会辩论中 |
|---------|----------|
| ![home](screenshots/wc-home.png) | ![live](screenshots/wc-live.png) |

---

## 6个 AI 角色

| 角色 | AI 超能力 | 系统性盲点 |
|------|----------|-----------|
| 📊 **Dr.冰狗**（统计） | 10,000次蒙特卡洛模拟，输出 P(主胜)/P(平)/P(客胜) | 不信心理和氛围 |
| 💰 **赌狗本狗**（盘口） | 跨平台赔率套利检测，公众盘 vs 职业盘方向对比 | 过度解读微小异动 |
| 📜 **老球迷**（历史） | 多维历史情景向量匹配，自动给出反例比例 | 确认偏误 |
| 🧠 **碎碎念**（心理） | 采访文本语义情绪分析，换人时机模式识别 | 过度拟人化 |
| 🌙 **月影姐**（舆情） | 社交叙事强度检测，找"叙事定价错误"的逆向机会 | 为逆向而逆向 |
| ⚖️ **议长**（主持） | 整合所有框架，强制选边，点名对方漏洞 | — |

---

## 数据来源

| 数据源 | 提供内容 |
|--------|---------|
| [football-data.org](https://www.football-data.org/) v4 | 英超赛程、近5场战绩、H2H历史、积分榜 |
| [Fantasy Premier League API](https://fantasy.premierleague.com/api/) | 球员 xG/90、伤病状态、近期形态（完全免费，无需 Key） |
| [the-odds-api](https://the-odds-api.com/) | 实时欧赔（bet365），隐含概率、水钱计算 |
| [Moonshot AI](https://moonshot.cn/) | LLM 对话生成（兼容 OpenAI SDK） |

---

## 快速启动

### 1. 克隆并安装依赖

```bash
git clone https://github.com/chenjr-renlab-ai/goalcast.git
cd goalcast
npm install
```

### 2. 配置环境变量

创建 `.env` 文件（参考下方）：

```env
FOOTBALL_DATA_API_KEY=your_key_here   # football-data.org 免费注册
MOONSHOT_API_KEY=your_key_here        # moonshot.cn
ODDS_API_KEY=your_key_here            # the-odds-api.com（可选，无则用默认赔率）
```

### 3. 启动

```bash
node server.mjs
# 或 Windows 双击 start.bat
```

浏览器访问 **http://localhost:3000**

---

## 技术架构

```
Browser
  ├── public/index.html      — 主页面
  ├── public/app.js          — 前端逻辑（SSE 接收、UI 更新）
  ├── public/scene3d.js      — Three.js 3D 议事厅
  └── public/style.css       — 世界杯绿金配色

Server (Node.js ESM)
  ├── server.mjs             — Express + SSE 流
  ├── agents.mjs             — 6个 AI 角色 + 方法论碰撞矩阵
  ├── dataFetcher.mjs        — 数据拉取（football-data + FPL + odds）
  ├── seedGenerator.mjs      — 赛前叙事种子（LLM 预生成）
  ├── rebalancer.mjs         — W-5 概率重平衡器
  └── memory.mjs             — 跨场次准确率记忆
```

---

## API 接口

服务器提供以下 REST + SSE 接口，可供外部程序消费：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/matches` | 英超未来14天赛程列表 |
| GET | `/api/match/:id` | 单场完整数据（战绩/xG/球员/赔率） |
| POST | `/api/match/:id/prepare` | 触发数据补全（FPL+H2H+seeds） |
| GET | `/api/run?matchId=xxx` | SSE 事件流：AI 议会辩论全过程 |
| GET | `/api/monitor` | SSE 监控流：实时共识度/立场更新 |
| POST | `/api/result` | 录入比赛结果，更新各 agent 准确率 |
| GET | `/api/memory/profiles` | 各 agent 历史预测准确率统计 |

完整字段说明见 [`data-fields.csv`](./data-fields.csv)。

---

## 议会流程

```
用户选比赛 → 填比分预测
    ↓
Phase 1: 议长开场
Phase 2: 5个专家并行初判（7-15秒/条，含真实数据）
         + 分歧最大的两个 agent 双向方法论互怼
Phase 3: 动态辩论循环（最多5轮）
         - 共识≥75% 或 连续2轮无转向 → 提前收场
         - Round 2后65%概率触发第三方插嘴
Phase 4: 终极投票（强制引用对线内容）
         + 议长宣布胜出方 + 加权概率汇总
    ↓
结果展示：议会预测比分 vs 用户预测
```

---

## 项目现状

- **版本**：v3.1
- **联赛**：英超 2025-26 赛季
- **已实现**：全量真实数据接入、动态辩论、方法论碰撞矩阵、3D 演播室、准确率记忆
- **技术债**：月影姐"叙事强度"为 LLM 模拟（无真实社交 API）；冰狗"10000次模拟"为 LLM 模拟（非真实 Poisson 运算）

---

## License

MIT

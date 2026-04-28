# 🔮 Goalcast — 预言者议会

> 6个 AI 角色 · 真实赛事数据 · 方法论碰撞辩论 · 预测英超比分

**预言者议会**是一款 AI 多智能体足球预测娱乐产品。6 个拥有不同分析框架的 AI 角色，在世界杯风格的虚拟 3D 演播室里，基于真实赛事数据实时辩论预测比分。观众提前下注并看议会是否与自己一致。

**当前版本：v4.7**

---

## 演示截图

| 主页选场 | 议会辩论中 |
|---------|----------|
| ![home](screenshots/wc-home.png) | ![live](screenshots/wc-live.png) |

---

## 6 个 AI 角色

每个角色有独立的分析框架、专属道具和系统性盲点，辩论时会主动攻击对方的方法论弱点。

| 角色 | 外观道具 | AI 超能力 | 系统性盲点 |
|------|---------|----------|-----------|
| 📊 **Dr.冰狗**（统计） | 🕶️ 方框眼镜 | 10,000次蒙特卡洛模拟，输出 P(主胜)/P(平)/P(客胜) | 不信心理和氛围 |
| 💰 **赌狗本狗**（盘口） | 🃏 三张扑克牌 | 跨平台赔率套利检测，公众盘 vs 职业盘方向对比 | 过度解读微小异动 |
| 📜 **老球迷**（历史） | 🧣 球队围巾 | 多维历史情景向量匹配，自动给出反例比例 | 确认偏误 |
| 🧠 **碎碎念**（心理） | 🎧 头戴耳机 | 采访文本语义情绪分析，换人时机模式识别 | 过度拟人化 |
| 🌙 **月影姐**（舆情） | 🌙 月亮发饰 | 社交叙事强度检测，找"叙事定价错误"的逆向机会 | 为逆向而逆向 |
| ⚖️ **议长**（主持） | 🎤 麦克风 | 整合所有框架，强制选边，点名对方漏洞 | — |

3D 人形角色基于 Three.js 实现，具有：Pixar 风格虹膜+瞳孔眼睛、眨眼动画、发言时头部点头、idle 呼吸浮动、嘴唇开合动画。

---

## 数据来源

| 数据源 | 提供内容 | 备注 |
|--------|---------|------|
| [football-data.org](https://www.football-data.org/) v4 | 英超赛程、近5场战绩、H2H历史、积分榜 | 需要免费 API Key |
| [Fantasy Premier League API](https://fantasy.premierleague.com/api/) | 球员 xG/90、伤病状态、近期形态 | 完全免费，无需 Key |
| [the-odds-api](https://the-odds-api.com/) | 实时欧赔（bet365），隐含概率、水钱计算 | 可选 |
| [Moonshot AI](https://moonshot.cn/) | LLM 对话生成（兼容 OpenAI SDK） | 需要 API Key |

FPL 数据不可用时，系统自动降级并在界面提示，不影响整体运行。

---

## 快速启动

### 1. 克隆并安装依赖

```bash
git clone https://github.com/chenjr-renlab-ai/goalcast.git
cd goalcast
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
FOOTBALL_DATA_API_KEY=your_key_here   # football-data.org 免费注册获取
MOONSHOT_API_KEY=your_key_here        # moonshot.cn 控制台获取
ODDS_API_KEY=your_key_here            # the-odds-api.com（可选）
```

### 3. 启动

```bash
node server.mjs
# Windows 可直接双击 start.bat
```

浏览器访问 **http://localhost:3000**

---

## 技术架构

```
Browser
  ├── public/index.html      — 主页面（含版本变更日志弹窗）
  ├── public/app.js          — 前端逻辑（SSE 接收、Canvas 战报生成）
  ├── public/scene3d.js      — Three.js 3D 议事厅（humanoid agents）
  └── public/style.css       — 世界杯绿金配色

Server (Node.js ESM)
  ├── server.mjs             — Express + SSE 流 + 监控端点
  ├── agents.mjs             — 6个 AI 角色 + 方法论碰撞矩阵 + 重试逻辑
  ├── dataFetcher.mjs        — 数据拉取（football-data + FPL + odds）
  ├── seedGenerator.mjs      — 赛前叙事种子（LLM 预生成）
  ├── rebalancer.mjs         — W-5 概率重平衡器
  └── memory.mjs             — 跨场次准确率记忆
```

---

## API 接口

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
用户选比赛 → 填比分预测（可选）
    ↓
Phase 1: 议长开场（弹幕语气，煽动气氛）
Phase 2: 5个专家并行初判（错开 350ms 发请求，防限速）
         每位专家：引用真实数据 + 给出比分 + 方法论说明
         + 分歧最大的两方双向方法论互怼
Phase 3: 动态辩论循环（最多5轮）
         - 共识≥75% 或 连续2轮无转向 → 提前收场
         - Round 2后 65% 概率触发第三方插嘴
Phase 4: 终极投票（强制引用对线内容）
         + 议长宣布胜出方 + 加权概率汇总
    ↓
结果展示：议会预测比分 vs 用户预测 + 生成战报图片
```

---

## 主要功能

- **拔河绳概率条**：SVG 动态展示主胜/平/客胜实时变化，有弹跳+发光+数值闪烁效果
- **焦点赛事 Banner**：议会开始前浮于界面左下角（不遮 LIVE 滚动条）
- **3D 议事厅**：Three.js 圆形议会大厅，每个 Agent 有独立站台、光柱、发言时摄像机切换
- **战报分享**：Canvas 生成 800×520 高清战报图片，可直接粘贴发送（iOS/Android 均支持）
- **准确率徽章**：每个 Agent 显示近5场命中率，增强可信度感知
- **版本日志**：页面右上角 `v4.7` 徽章，点击查看 v4.0–v4.7 完整更新记录
- **监控面板**：`/monitor.html` 实时查看议会内部共识度、立场变化、数据接入状态

---

## 稳定性设计

- **请求容错**：每个 Agent API 调用超时 42s，失败后自动重试一次（延迟 4s）
- **降级占位**：重试仍失败时，发出"信号丢失"占位消息，议会继续推进，不卡死
- **FPL 降级**：FPL 接口不可用时标记 `_fplAvailable: false`，前端显示降级提示
- **缓存**：外部 API 数据缓存 6h，避免频繁请求

---

## 已知技术说明

- 月影姐「叙事强度」为 LLM 模拟（无真实社交媒体 API）
- 冰狗「10000次蒙特卡洛」为 LLM 基于统计数据的推理（非真实 Poisson 计算）
- Three.js 使用 r160 CDN 引入（最后支持 UMD 版本），有 GPU stall 警告属正常
- `liveMatches` 内存存储，服务重启后清零

---

## 版本历史

| 版本 | 日期 | 主要内容 |
|------|------|---------|
| v4.7 | 2026-04-28 | Pixar 风 Agent 重绘（虹膜+瞳孔+眉毛+眨眼）、版本日志弹窗、分享图重设计、热点 Banner 浮层、error 42 修复 |
| v4.6 | 2026-04-28 | Agent 体型比例修正、月影姐月亮发饰、老球迷围巾、嘴部动画、FPL 降级提示 |
| v4.5 | 2026-04-25 | 引导窗口 v3、历史记录清理、终投队名显示、Canvas 战报图片 |
| v4.4 | 2026-04-22 | 准确率徽章、拔河绳概率条、焦点赛事 Banner、分镜卡片 |
| v4.0 | 2026-04-18 | FPL API 接入、Hero 卡、3D 议事厅、Agent 职业道具 |

---

## License

MIT

# 🔮 Goalcast — 预言者议会

> 6 个 AI 角色 · 真实赛事数据 · 方法论碰撞辩论 · 预测英超比分

**预言者议会**是一款 AI 多智能体足球预测娱乐产品。6 个拥有不同分析框架的 AI 角色，在世界杯风格的虚拟 3D 演播室里，基于真实赛事数据实时辩论预测比分，观众提前下注并看议会是否与自己一致。

**当前版本：v4.8**

---

## 议会流程

```
用户选比赛 → 填比分预测（可选）
    ↓
Phase 1  议长开场 — 弹幕语气，煽动气氛
Phase 2  初判（串行，~11s 全部完成）
         每位专家：引用真实数据 + 给出比分 + 方法论说明
         + 分歧最大两方双向方法论互怼
Phase 3  动态辩论（最多 5 轮）
         共识 ≥ 75% 或 连续 2 轮无转向 → 提前收场
         Round 2 后 65% 概率触发第三方插嘴
Phase 4  终极投票 — 每位 agent 专属视角（防止重复发言）
         + 议长宣布胜出方 + 加权概率汇总
    ↓
结果：议会预测比分 vs 用户预测 + 可粘贴战报图片
```

---

## 6 个 AI 角色

| 角色 | 外观道具 | AI 方法论 | 系统性盲点 |
|------|---------|----------|-----------|
| 📊 **Dr.冰狗** | 🕶️ 方框眼镜 | 10,000 次蒙特卡洛模拟，输出 P(主胜)/P(平)/P(客胜) | 不信心理和氛围 |
| 💰 **赌狗本狗** | 🃏 三张扑克牌 | 跨平台赔率套利，公众盘 vs 职业盘方向对比 | 过度解读微小异动 |
| 📜 **老球迷** | 🧣 球队围巾 | 多维历史情景向量匹配，自动给出反例比例 | 确认偏误 |
| 🧠 **碎碎念** | 🎧 头戴耳机 | 采访文本语义情绪分析，换人时机模式识别 | 过度拟人化 |
| 🌙 **月影姐** | 🌙 月亮发饰 | 社交叙事强度检测，找"叙事定价错误"的逆向机会 | 为逆向而逆向 |
| ⚖️ **议长** | 🎤 麦克风 | 整合所有框架，强制选边，点名对方漏洞 | — |

3D 人形角色（Three.js）具有：Pixar 风格虹膜+瞳孔+眉毛、眨眼动画、发言头部点头、idle 呼吸浮动、嘴唇开合动画。

---

## 数据来源

| 数据源 | 提供内容 | 备注 |
|--------|---------|------|
| [football-data.org](https://www.football-data.org/) v4 | 英超赛程、近5场战绩、H2H历史、积分榜 | 需免费 Key |
| [Fantasy Premier League API](https://fantasy.premierleague.com/api/) | 球员 xG/90、伤病状态、近期形态 | 完全免费，无需 Key |
| [the-odds-api](https://the-odds-api.com/) | 实时欧赔（bet365），隐含概率、水钱计算 | 可选 |
| [火山方舟 Coding Plan](https://ark.cn-beijing.volces.com/) | LLM 对话生成（DeepSeek-v3.2，双 key 轮询） | 需 Key |

---

## 快速启动

```bash
git clone https://github.com/chenjr-renlab-ai/goalcast.git
cd goalcast
npm install
```

创建 `.env` 文件：

```env
VOLC_API_KEY_1=your_key_here          # 火山方舟控制台获取
VOLC_API_KEY_2=your_key_here          # 第二把 key（可选，双 key 负载均衡）
FOOTBALL_DATA_API_KEY=your_key_here   # football-data.org 免费注册
ODDS_API_KEY=your_key_here            # the-odds-api.com（可选）
```

```bash
node server.mjs
# Windows 可双击 start.bat
```

浏览器访问 **http://localhost:3000**

---

## 技术架构

```
Browser
  ├── public/index.html      主页面（含版本变更日志弹窗）
  ├── public/app.js          前端逻辑（SSE 接收、Canvas 战报生成）
  ├── public/scene3d.js      Three.js 3D 议事厅（Pixar 风 humanoid）
  └── public/style.css       世界杯绿金配色

Server (Node.js ESM)
  ├── server.mjs             Express + SSE 流 + 监控端点
  ├── agents.mjs             6 个 AI 角色 + 方法论碰撞矩阵 + 终投差异化
  ├── dataFetcher.mjs        数据拉取（football-data + FPL + odds）
  ├── seedGenerator.mjs      赛前叙事种子（LLM 预生成）
  ├── rebalancer.mjs         W-5 概率重平衡器
  └── memory.mjs             跨场次准确率记忆
```

---

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/matches` | 英超未来14天赛程 |
| GET | `/api/match/:id` | 单场完整数据（战绩/xG/球员/赔率） |
| POST | `/api/match/:id/prepare` | 触发数据补全（FPL+H2H+seeds） |
| GET | `/api/run?matchId=xxx` | **SSE 事件流**：AI 议会辩论全过程 |
| GET | `/api/monitor` | SSE 监控流：实时共识度/立场更新 |
| POST | `/api/result` | 录入比赛结果，更新 agent 准确率 |
| GET | `/api/memory/profiles` | 各 agent 历史预测准确率 |

完整字段说明见 [`data-fields.csv`](./data-fields.csv)。

---

## SSE 事件类型

```
phase           阶段切换（opening / initial / debate / vote）
thinking        agent 开始思考（3D 脉冲动画）
speaking_start  agent 流式生成首字节（~1s TTFT，3D 立即切发言动画）
message         agent 完整发言（含 structured 预测数据）
pivot           agent 立场转向
debate_stop     辩论提前结束（共识达标 / 僵局）
devil_reveal    魔鬼代言人身份揭晓
summary         最终加权汇总结果
done            议会结束
```

---

## 主要功能

- **拔河绳概率条**：SVG 动态，弹跳+发光+数值闪烁，实时更新
- **焦点赛事 Banner**：会前浮于左下角（position:fixed，不遮 LIVE 条）
- **版本日志弹窗**：topbar `v4.8` 徽章 → 点击查看 v4.0–v4.8 完整更新记录
- **战报分享图**：Canvas 生成 800×520 高清 PNG，可直接粘贴发送
- **准确率徽章**：每个 agent 显示近5场命中率
- **监控面板**：`/monitor.html` 实时查看共识度、立场变化、数据状态

---

## 稳定性与性能

- **串行初判**：5 个 agent 依次调用，彻底消除并发限速导致的卡死
- **流式生成**：`stream:true` 采集全流后解析，TTFT ~1s（vs 非流式 9s）
- **speaking_start 事件**：首字节时立即触发 3D 摄像机切换，不用等完整响应
- **双 key 轮询**：VOLC_API_KEY_1/2 交替使用，配额翻倍
- **失败重试**：单 agent 失败后等 3s 重试一次，再失败发占位消息继续
- **FPL 降级**：FPL 不可用时标记并提示，不影响整体运行

---

## 已知技术说明

- 月影姐"叙事强度"为 LLM 模拟（无真实社交媒体 API）
- 冰狗"10000次蒙特卡洛"为 LLM 基于统计数据推理（非真实 Poisson 计算）
- Three.js 使用 r160 CDN 引入（最后支持 UMD 版本），GPU stall 警告属正常
- `liveMatches` 内存存储，服务重启清零

---

## 版本历史

| 版本 | 日期 | 主要内容 |
|------|------|---------|
| v4.8 | 2026-04-29 | 火山方舟 DeepSeek-v3.2 替换 Moonshot；初判串行化；流式输出 TTFT ~1s；终投五人差异化视角 |
| v4.7 | 2026-04-28 | Pixar 风 Agent（虹膜+瞳孔+眉毛+眨眼）；版本日志弹窗；分享图重设计；热点 Banner 浮层 |
| v4.6 | 2026-04-28 | Agent 体型重绘；月影姐月亮发饰；老球迷围巾；嘴部动画；FPL 降级提示 |
| v4.5 | 2026-04-25 | 引导窗口 v3；历史记录清理；终投队名显示；Canvas 战报图片 |
| v4.4 | 2026-04-22 | 准确率徽章；拔河绳概率条；焦点赛事 Banner；分镜卡片 |
| v4.0 | 2026-04-18 | FPL API 接入；Hero 卡；3D 议事厅；Agent 职业道具 |

---

## License

MIT

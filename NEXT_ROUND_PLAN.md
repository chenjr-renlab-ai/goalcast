# 预言者议会 · v4.1 改进规划
**日期**: 2026-04-27
**基于**: gstack 三轮审查（CEO战略 + Eng架构 + Design视觉）+ v3.1→v3.2 实际进展
**上轮状态**: v4.0 规划已完成战略分析，v3.2 完成 FPL 数据接入

---

## 一、三轮审查结论汇总

### CEO 审查：战略层

**定位判断：正确但没表达出来。**

"娱乐预测秀"的定位是对的。竞争对手（ESPN/虎扑）是人类评论员，没有 AI 超能力。但当前用户看到的是"6个卡通人在聊天"，不是"6个拥有不同数据优势的 AI 角色在方法论碰撞"。差异化本来存在，只是没被视觉表达出来。

**被忽视的机会：API 层。**

`data-fields.csv` 已经整理了9个 REST/SSE 接口，输出格式完整结构化。这个东西可以作为数据源给：
- 足球直播解说辅助工具
- 第三方前端接入（不同 UI，同一议会引擎）
- 赛事分析类小程序的后台

原 v4.0 规划完全没提。AI 核心已经是 API，应该顺势把它当产品卖。

**最大增长风险：重复感。**

每场议会的节奏固定：初判→对线→终投。用户第3场就能预测接下来的走向。视觉改动解决不了这个问题。需要引入不可预测性：随机触发事件、agent 历史教训影响发言、upset 惊喜场景等。

---

### Eng 审查：架构层

**已发现并修复的 bug：**
- `app.js:907`：`newsList.map is not a function`，`briefing.news` 从旧的 `[]` 数组改为新的字符串格式后未同步 → 已修复（2026-04-27）

**现有技术债务，按风险排序：**

| 风险 | 位置 | 说明 |
|------|------|------|
| 高 | `app.js` | SSE 连接无 AbortController，页面关闭后服务器侧继续运行整个议会 |
| 高 | `dataFetcher.mjs` | `readCache` 不过滤空数组，FPL/football-data 返回 `[]` 会缓存进去导致数据消失 |
| 中 | `dataFetcher.mjs` | FPL API 单点依赖，失败时球员/xG/伤情字段全空，无降级 fallback |
| 中 | `public/index.html` | Three.js 用 `three.min.js` CDN 引入，v0.160.1 已是弃用临界版本，警告影响 WebGL 性能 |
| 低 | `app.js` | `heroActive` 状态泄露，快速多次 resetCouncil 可能卡死队列 |

**规划项的技术选型建议：**

- **拔河绳概率条**：用 SVG + CSS transition，不用 Canvas。Canvas 需帧循环，SVG 一条 `<line>` + `transform: translateX()` 就能做弹性动画，维护成本低10倍。
- **右侧数据引用面板**：需要在 `agents.mjs` 的 `submit_speech` tool 里加 `dataPoints: [{field, value, source}]` 字段，才能做"发言时高亮数据来源"。不加这个字段，前端无法知道哪个数据被引用了。

---

### Design 审查：视觉层

**gstack 实测数据（2026-04-27）：**

```
背景色: rgb(3, 14, 6) = 深绿，未改
Agent列宽: 137px（vs 规划中的240px目标）
Three.js: GPU stall ReadPixels 性能警告（WebGL stall）
移动端: 完全不可用，3D场景和agent卡片重叠
平板端: 同上，无响应式断点
DOM解析: 1305ms（Three.js加载导致）
```

**关键诊断：**
- 移动端目前零可用性。如果有人分享链接，手机打开就是坏的。
- 背景色维持深绿，对"专业数据分析"的定位是反效果。
- Three.js 警告是可以忽略的噪声，但 ReadPixels stall 说明 3D 场景在强迫 GPU 同步读取，影响帧率。
- 没有任何"这是什么/怎么用"的引导，新用户第一印象是茫然。

---

## 二、进展更新（v3.1 → v3.2 已完成）

以下原 v4.0 规划中的项目已在 v3.2 实现，不需要再做：

| 原规划项 | 状态 | 说明 |
|---------|------|------|
| xg_note 字段 | ✅ 已实现 | 来自 FPL expected_goals_per_90 |
| news 字段 | ✅ 已实现 | 来自 FPL 伤病状态 |
| homePlayers/awayPlayers | ✅ 已实现 | 8名球员，含 xG/状态/伤情 |
| ev（水钱计算） | ✅ 已实现 | 纯数学，庄家水钱 + 隐含概率 |
| historicalNote | ✅ 已实现 | H2H 多维派生 |
| tactical | ✅ 已实现（弱） | 从 FPL 阵容推导，粗略 |
| app.js:907 news bug | ✅ 已修复 | 今天 |

---

## 三、新版优先级矩阵

### P0（修复生产问题，1天内）

| # | 改动 | 文件 | 原因 |
|---|------|------|------|
| 1 | 修复 `readCache` 过滤空数组 | `dataFetcher.mjs` | 防止下次空数据污染缓存 |
| 2 | SSE 连接加 AbortController | `app.js` | 页面关闭后不再烧服务器 token |
| 3 | FPL 失败时的 graceful fallback | `server.mjs` | 别让数据全空不告诉用户 |

### P1（核心可信度，1-2天）

| # | 改动 | 文件 | 原因 |
|---|------|------|------|
| 4 | Agent 卡片加历史准确率徽章 | `app.js` + `style.css` | 最高单点可信度提升，数据已有 |
| 5 | 每条发言加"方法来源"灰色小标签 | `app.js` + `style.css` | 回答"你怎么得到的" |
| 6 | 概率条中间段对比度修复（深绿→可见色） | `style.css` | 现在基本看不出来 |
| 7 | Agent 列扩宽：148px → 200px | `style.css` | 为准确率徽章腾空间 |

### P2（视觉语言，3-5天）

| # | 改动 | 文件 | 原因 |
|---|------|------|------|
| 8 | 色调调整：深绿 → 深蓝（`#010714`） | `style.css` | 传达数据/专业，不是电竞 |
| 9 | 概率条改拔河绳（SVG + CSS transition） | `app.js` + `style.css` | 戏剧感核心 |
| 10 | 发言卡三层结构（来源/内容/金句） | `app.js` + `style.css` | 信任层级可见 |
| 11 | `submit_speech` tool 加 `dataPoints` 字段 | `agents.mjs` | 为数据引用高亮打基础 |

### P3（移动端可用性，按需）

| # | 改动 | 文件 | 原因 |
|---|------|------|------|
| 12 | 移动端响应式断点（<768px 隐藏 3D，单列布局） | `style.css` + `index.html` | 现在移动端完全不可用 |
| 13 | 平板端布局（768-1024px，压缩 3D 到 50%） | `style.css` | 平板同样坏的 |

### P4（中期，1-2周）

| # | 改动 | 文件 | 原因 |
|---|------|------|------|
| 14 | 右侧数据引用面板（初始空，发言时高亮） | `index.html` + `app.js` | 需要先完成 P2-11 |
| 15 | 新用户3步引导浮层 | `index.html` + `app.js` | 解决"不知道在干什么" |
| 16 | 不可预测性机制（随机 upset 事件/agent 历史教训） | `agents.mjs` | 解决第3场重复感 |

### P5（战略机会，评估后决定）

| # | 改动 | 说明 |
|---|------|------|
| 17 | API 文档页面（`/docs`） | 把议会引擎定位为可接入数据产品 |
| 18 | Three.js 迁移到 ES modules | 消除弃用警告，升级到 r170+ |
| 19 | 准确率历史图表页（独立路由） | 多场次后的可信度展示 |

---

## 四、实施方案细节

### P1-4：准确率徽章（app.js）

从 `/api/memory/profiles` 拉取历史准确率，渲染到 agent 卡片上。数据格式：
```javascript
// profiles.stat = { total: 12, correct: 7, byType: {...} }
const pct = Math.round(profile.correct / profile.total * 100);
// 显示：✓✓✗✓✓✓✗  70% (近7场)
```

注意：目前总场数可能为0（刚部署），需要 `total > 0` 才显示，否则显示"暂无记录"。

### P2-9：拔河绳概率条

用 SVG 实现，不用 Canvas：

```html
<svg class="tug-bar" viewBox="0 0 400 40">
  <line x1="0" y1="20" x2="400" y2="20" stroke="#333" stroke-width="8"/>
  <circle id="tugKnot" cx="200" cy="20" r="10" fill="#f0c040"/>
  <!-- 左边=主队颜色，右边=客队颜色 -->
</svg>
```

`cx` 由 `(homeProb / (homeProb + awayProb)) * 400` 计算，CSS transition 0.6s ease-out。每次 blackboard_update 时更新，绳结弹性抖动。

### P1-5：方法来源标签

在 `renderBroadcastCard()` 里，每条 message 事件后追加一行：

```html
<div class="method-label">Poisson模型 · football-data.org</div>
```

从 `AGENT_METHOD_LABEL` 映射取（在 app.js 里维护一个字典，不需要改后端）：
```javascript
const AGENT_METHOD_LABEL = {
  stat:     'Poisson模型 · football-data进失球',
  gambler:  '盘口信号 · the-odds-api赔率',
  history:  '历史情景 · football-data H2H',
  psych:    '语义分析 · FPL球员状态',
  mystic:   '舆情叙事 · 市场情绪',
  moderator:'综合裁判',
};
```

### P0-1：readCache 空数组修复

```javascript
async function readCache(key) {
  // ...
  const data = JSON.parse(raw);
  if (data.expires > Date.now()) {
    // 拒绝缓存的空数组
    if (Array.isArray(data.value) && data.value.length === 0) return null;
    return data.value;
  }
  return null;
}
```

---

## 五、不做的事（维持原则）

- 不加学术解释段落
- 不做置信区间展示
- 不减少弹幕梗词（娱乐价值）
- 不在没有真实数据时编造数字（现在 FPL 数据已解决这个问题）

---

## 六、验收标准

做完 P1 后，用 gstack 跑以下验证：
1. `$B console --errors` 零 JS 错误（除 WebGL GPU stall）
2. 每个 agent 卡片可见准确率徽章（即使是"暂无记录"）
3. 每条发言下方有灰色方法标签
4. 概率条三段颜色对比度 ≥ 4:1（WCAG AA）
5. 移动端（375px）无重叠布局（P3 完成后）

---

## 附：gstack审查原始数据

```
审查时间: 2026-04-27
视口: 1280×720（桌面）
背景色实测: rgb(3, 14, 6)
Agent列宽实测: 137px
DOM解析时间: 1305ms
Three.js版本: 0.160.1（three.min.js，弃用警告存在）
控制台错误: TypeError newsList.map（已修复）
移动端状态: 不可用（3D与agent卡重叠）
平板端状态: 不可用
```

# 预言者议会 · v4.2 详细改进规划
**日期**: 2026-04-27
**方法**: gstack 三轮完整迭代审查（系统审计 + CEO战略 + Eng架构 + Design视觉 + UX流程）
**证据来源**: 实测 CSS 值 + 浏览器截图 + 代码逐行审读

---

## 一、实测数据汇总（审查原始证据）

```
视口:          1280×720（桌面）/ 375×812（移动）/ 768×1024（平板）
body背景色:    rgb(3, 14, 6) = #030e06（深绿，未改蓝）
agent-col宽:   CSS定义 122px，被下方 !important 覆盖为 148px（双重定义，代码混乱）
scene canvas:  984px 宽（77% 视口）
speech字号:    12.5px（极小）
broadcast高:   190px（absolute 覆盖在 scene 上，非独立空间）
prob-draw颜色: linear-gradient(#1a4a20, #1e6028, #156020) 深绿 on 深绿背景 → 几乎不可见
移动端 overflow: true（水平溢出，完全不可用）
平板端 overflow: true（同上）
@media 断点:   0个（全文件没有一个响应式断点）
console错误:   0个（news bug 已修）
SSE关闭:       done/error时调用 close()，但 tab关闭/navigate-away 不会触发
```

---

## 二、架构问题清单（按严重度排序）

### 🔴 高危（会导致功能失效或资源泄漏）

**H1: readCache 不过滤空数组**
- 文件: `dataFetcher.mjs:59-68`
- 问题: `data.value` 为 `[]` 时返回非 null，下游认为有数据实际为空。上次人工清理了，下次 football-data 返回空还会重现
- 修复:
  ```javascript
  // dataFetcher.mjs:66，在 return data.value 前加判断
  if (Array.isArray(data.value) && data.value.length === 0) return null;
  ```

**H2: SSE 连接在页面卸载时不关闭**
- 文件: `public/app.js:1005`
- 问题: 用户切换标签/关闭窗口时 `currentEs.close()` 不会被调用，服务端议会进程继续运行完整5轮对话，消耗 Moonshot API token（约¥0.5-2/场）
- 修复: `public/app.js` 在 `init()` 函数加：
  ```javascript
  window.addEventListener('beforeunload', () => currentEs?.close());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentEs) currentEs.close();
  });
  ```

**H3: FPL API 失败时无降级提示**
- 文件: `server.mjs: enrichMatchBriefing()`
- 问题: `fetchTeamFPLData` 失败返回 null，briefing 里 xg_note/news/tactical 全显示"暂无"，但用户看不到任何原因
- 修复: 在 briefing 加 `_fplAvailable: !!(homeFPL || awayFPL)` 标志，前端据此显示小提示

### 🟡 中危（影响体验但不崩溃）

**M1: agent-col CSS 双重定义**
- 文件: `public/style.css:246-251`（`width:122px`）和 `style.css:1564-1568`（`width:148px !important`）
- 问题: 两处定义互相覆盖，`!important` 是代码坏味道，后期难维护
- 修复: 删除第一处定义，只保留 `style.css:1564` 处的 148px（或统一改到 200px）

**M2: prob-draw 颜色对比度严重不足**
- 文件: `public/style.css:211-213`
- 问题: `.prob-draw` 背景 `#1a4a20~#156020`（暗绿）和 body `#030e06`（更暗的绿）对比度约 1.4:1（WCAG 要求 4.5:1）
- 修复:
  ```css
  /* style.css:211 */
  .prob-draw {
    background: linear-gradient(90deg, #4a7c20 0%, #5a9a28 50%, #4a7c20 100%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 0 8px rgba(80,160,40,0.4);
  }
  ```
  或改为金色（平局=金色更直觉：主蓝/平金/客红）

**M3: broadcast panel speech 字号太小**
- 文件: `public/style.css` 中 `.bc-speech`
- 实测值: 12.5px
- 修复: 改为 `font-size: 13.5px; line-height: 1.55`

**M4: agent 卡片信息极度稀缺**
- 文件: `public/app.js:358-369`（`createAgentCard` 函数）
- 当前仅显示: icon + name + title + dot
- 缺失: 历史准确率、当前预测立场、当前置信度
- 这是可信度最大的单点问题

### 🟢 低危（积累技术债）

**L1: scene3d.js 人形比例**（没有找到明确的 head/body 比例参数，需要进一步看）
**L2: Three.js 弃用警告**（r160 有警告，实际不会崩）
**L3: liveMatches 内存存储无持久化**（重启清零，可接受）

---

## 三、功能缺失清单（设计在代码里但 UI 不显示）

| 功能 | 数据已有 | API 接口 | 前端缺失的地方 |
|------|---------|---------|--------------|
| Agent 历史准确率 | ✅ `.memory/long-term.json` | ✅ `GET /api/memory/profiles` | agent 卡片没有显示，`createAgentCard` 未调用接口 |
| 方法来源标签 | ✅ `AGENT_METHOD` in agents.mjs | — | `updateBroadcast` 没有注入来源行 |
| xG 数据 | ✅ `briefing.xg_note` | ✅ `GET /api/match/:id` | 只在 match drawer 里，发言时不显示 |
| 伤病消息 | ✅ `briefing.news` | ✅ `GET /api/match/:id` | match drawer 里有，发言时 psych agent 会引用但用户看不到来源 |
| 数据引用高亮 | ❌ 需后端加 `dataPoints` 字段 | — | 未实现 |
| 议会立场汇总 | ✅ `blackboard.agentStances` | ✅ `GET /api/monitor` | 在 Evidence Board 有，但 agent 卡片上没有 |

---

## 四、详细改动方案

---

### 改动 1：readCache 空数组防御
**文件**: `dataFetcher.mjs`，函数 `readCache`（第 59-68 行）

```javascript
// 修改后：
async function readCache(key) {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    const raw = await fs.promises.readFile(file, 'utf-8');
    const data = JSON.parse(raw);
    if (data.expires <= Date.now()) return null;
    // 拒绝空数组缓存，强制重新拉取
    if (Array.isArray(data.value) && data.value.length === 0) return null;
    return data.value;
  } catch {
    return null;
  }
}
```

**验证**: 往 `.cache/team-form-xxx.json` 写入 `{"expires":99999999999,"value":[]}` 再重启，确认被忽略

---

### 改动 2：SSE 页面卸载时关闭
**文件**: `public/app.js`，在 `init()` 函数末尾（约第 343 行附近）

```javascript
// 加在 init() 末尾
window.addEventListener('beforeunload', () => {
  if (currentEs) { currentEs.close(); currentEs = null; }
});
document.addEventListener('visibilitychange', () => {
  // 用户切换标签页时关闭，防止后台继续耗费 API
  if (document.hidden && currentEs) {
    currentEs.close();
    currentEs = null;
  }
});
```

**注意**: `visibilitychange` 在手机上更可靠（手机 `beforeunload` 不稳定）

---

### 改动 3：概率条颜色修复
**文件**: `public/style.css:211-213`

平局段从暗绿改为金色（语义更清晰：主蓝=主胜，金=平局，红=客胜）：

```css
/* 修改前 */
.prob-draw {
  background: linear-gradient(90deg, #1a4a20, #1e6028, #156020);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
}
/* 修改后 */
.prob-draw {
  background: linear-gradient(90deg, #7a6010 0%, #b89020 50%, #7a6010 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 0 10px rgba(180,140,30,0.35);
}
```

同时更新 `.prob-bar-teams span:nth-child(2)`（中间"平局"标签颜色）：
```css
/* style.css:1237 */
.prob-bar-center-label { color: rgba(200,160,40,0.85) !important; }
```

---

### 改动 4：Agent 卡片——加历史准确率 + 当前立场

**步骤 4-A**: `public/app.js` 启动时拉取准确率

在 `init()` 函数里，和 `loadMatches()` 并行获取：
```javascript
// app.js init() 函数内，大约第 340 行
let agentAccuracyProfiles = {};
async function fetchAccuracyProfiles() {
  try {
    const r = await fetch('/api/memory/profiles');
    agentAccuracyProfiles = await r.json();
  } catch { /* silent fail */ }
}
// 在 init() 里并行调用：
await Promise.all([loadMatches(), fetchAccuracyProfiles()]);
```

**步骤 4-B**: 修改 `createAgentCard` 函数（`app.js:357-370`）

```javascript
function createAgentCard(id) {
  const a = AGENTS[id];
  const div = document.createElement('div');
  div.className = 'agent-card';
  div.id = `card-${id}`;
  div.style.setProperty('--agent-color', a.cssColor);

  // 准确率徽章（来自 /api/memory/profiles）
  const prof = agentAccuracyProfiles[id];
  const accHtml = prof && prof.total > 0
    ? `<div class="ac-accuracy">
         <span class="ac-acc-pct">${Math.round(prof.correct/prof.total*100)}%</span>
         <span class="ac-acc-label">近${prof.total}场</span>
       </div>`
    : `<div class="ac-accuracy ac-acc-empty">暂无记录</div>`;

  div.innerHTML = `
    <div class="ac-scan"></div>
    <div class="ac-portrait">${a.icon}</div>
    <div class="ac-info">
      <div class="ac-name">${a.name}</div>
      <div class="ac-title">${a.title}</div>
    </div>
    ${accHtml}
    <div class="ac-stance" id="stance-${id}"></div>
    <div class="ac-dot"></div>`;
  return div;
}
```

**步骤 4-C**: 在 `updateStance` 调用处更新 `ac-stance` DOM

当前 `updateProbFromMsg(data)` 更新概率条时同步更新卡片立场：
```javascript
// 在 updateProbFromMsg 函数末尾追加：
function updateAgentStanceIndicator(agentId, pick, conf) {
  const el = document.getElementById(`stance-${agentId}`);
  if (!el) return;
  const icons = { home: '🏠', draw: '⚖️', away: '✈️' };
  el.innerHTML = pick
    ? `<span class="stance-icon">${icons[pick]||'?'}</span><span class="stance-conf">${Math.round((conf||0.5)*100)}%</span>`
    : '';
  el.className = `ac-stance stance-${pick||'none'}`;
}
```

**步骤 4-D**: 新增 CSS（`style.css`）

```css
/* agent-col 统一宽度（删除 style.css:246 的 122px，保留并修改 style.css:1564 的 148px） */
.agent-col { width: 200px !important; }

/* 准确率徽章 */
.ac-accuracy {
  font-size: 10px; text-align: center;
  padding: 2px 4px 3px;
  border-top: 1px solid var(--border);
  margin-top: 2px;
}
.ac-acc-pct { font-size: 13px; font-weight: 800; color: var(--gold-bright); }
.ac-acc-label { color: var(--text-dim); margin-left: 3px; }
.ac-acc-empty { color: var(--text-dim); font-style: italic; }

/* 立场指示器 */
.ac-stance {
  font-size: 11px; text-align: center;
  padding: 3px 0; min-height: 20px;
  transition: all 0.3s;
}
.ac-stance .stance-icon { font-size: 14px; }
.ac-stance .stance-conf { color: var(--text-sub); margin-left: 2px; }
.stance-home { color: #60a5fa; }
.stance-draw { color: var(--gold-bright); }
.stance-away { color: #f87171; }
```

---

### 改动 5：broadcast 卡片加方法来源标签

**文件**: `public/app.js`，`updateBroadcast` 函数（约第 1345 行）

在 `app.js` 顶部加常量（约第 50 行附近）：
```javascript
const AGENT_METHOD_LABEL = {
  stat:      'Poisson · football-data进失球',
  gambler:   '盘口信号 · the-odds-api赔率',
  history:   '历史情景 · football-data H2H',
  psych:     '语义分析 · FPL球员状态',
  mystic:    '舆情叙事 · 市场情绪',
  moderator: '综合裁判',
};
```

在 `updateBroadcast` 函数的 `card.innerHTML` 里，在 `bc-top-row` 之前插入来源标签：
```javascript
// 在 card.innerHTML 的 bc-content 里，bc-top-row 之前加：
<div class="bc-method-label">${AGENT_METHOD_LABEL[data.agentId]||''}</div>
```

新增 CSS：
```css
.bc-method-label {
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.3px;
  margin-bottom: 4px;
  padding: 0 0 3px;
  border-bottom: 1px solid var(--border);
}
```

---

### 改动 6：phase 阶段指示器加说明文字

**文件**: `public/app.js`，`appendPhaseBanner` 函数（约第 1430 行）

当前 `.phase-step` 只显示"开场/初判/对线/终投"，没有说明。在 banner 加一行子标题：
```javascript
const phaseDesc = {
  opening: '议长开场',
  initial: '5位专家独立分析，各凭私有数据',
  debate:  `${meta?.agentA ? AGENTS[meta.agentA]?.name : '?'} vs ${meta?.agentB ? AGENTS[meta.agentB]?.name : '?'} 方法论碰撞`,
  vote:    '终极裁决——是否被对线说服？',
  reaction: '最大分歧方互怼',
};
```

---

### 改动 7：移动端响应式（最低可用性保障）

**文件**: `public/style.css` 末尾追加

```css
/* ========== 响应式断点 ========== */
@media (max-width: 767px) {
  /* 隐藏 3D 场景 */
  .game-arena { flex-direction: column; }
  #threeCanvas, .scene-container { display: none !important; }

  /* agent 列横向排列，变小 */
  .agent-col {
    width: 100% !important;
    flex-direction: row !important;
    flex-wrap: wrap;
    height: auto !important;
  }
  .agent-card { width: 46%; flex-shrink: 0; }

  /* broadcast 填满 */
  .broadcast-panel {
    position: relative !important;
    height: auto !important;
    max-height: 60vh;
  }

  /* topbar 压缩 */
  .top-bar { height: 44px; }
  .tb-left { display: none; } /* 隐藏 ORACLE COUNCIL logo */
}

@media (min-width: 768px) and (max-width: 1023px) {
  /* 平板：3D 压缩到 50%，释放空间给 agent 列 */
  .agent-col { width: 160px !important; }
  #threeCanvas { width: 400px !important; }
  .broadcast-panel { bottom: 0; }
}
```

---

### 改动 8：色调调整（深绿 → 深蓝）

**文件**: `public/style.css:1-44`（CSS 变量 + body 背景）

这是最大的视觉变化，改变整体氛围：

```css
/* 修改 :root 里的背景变量（style.css:6-44） */
:root {
  --bg-base:   #010714;   /* 深蓝（原 #030d07 深绿） */
  --bg-panel:  #020a18;   /* 深蓝面板（原 #050f09） */
  --bg-card:   #041020;   /* 深蓝卡片（原 #081409） */
  --bg-input:  #061828;   /* 深蓝输入（原 #0a1a0c） */
  --border:    rgba(30,80,200,0.12);   /* 蓝色边框 */
  --border-md: rgba(30,80,200,0.22);
}

/* body 背景（style.css:49-60） */
body {
  background: #010714;
  background-image:
    radial-gradient(ellipse 130% 45% at 50% 0%, rgba(20,60,180,0.4) 0%, transparent 55%),
    radial-gradient(ellipse 140% 40% at 50% 105%, rgba(0,80,160,0.20) 0%, transparent 55%),
    radial-gradient(ellipse 35% 90% at 0% 50%, rgba(10,40,100,0.15) 0%, transparent 60%),
    radial-gradient(ellipse 35% 90% at 100% 50%, rgba(10,40,100,0.15) 0%, transparent 60%),
    radial-gradient(ellipse 60% 50% at 50% 60%, rgba(5,30,80,0.18) 0%, transparent 70%);
}
```

同时去掉 `body::before` 里的足球六边形绿色水印（改蓝或删除）：
```css
body::before {
  /* 改为细蓝线六边形 */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='52' viewBox='0 0 60 52'%3E%3Cpolygon points='30,2 58,17 58,35 30,50 2,35 2,17' fill='none' stroke='rgba(30,80,200,0.03)' stroke-width='1'/%3E%3C/svg%3E");
}
```

---

### 改动 9：概率条 → 拔河绳（SVG 版）

**文件**: `public/index.html`（替换概率条 DOM）+ `public/app.js`（更新逻辑）+ `public/style.css`（新增样式）

**Step 9-A**: `index.html:47-63`，替换 `.prob-bar-track` 内容

```html
<!-- 保留 .prob-bar-wrap 外层，替换 .prob-bar-track 为 SVG -->
<div class="prob-bar-track" id="probBarTrack">
  <svg class="tug-svg" viewBox="0 0 800 36" preserveAspectRatio="none" id="tugSvg">
    <!-- 绳子底色 -->
    <rect x="0" y="15" width="800" height="6" rx="3" fill="rgba(255,255,255,0.08)"/>
    <!-- 主队段（蓝） -->
    <rect id="tugHome" x="0" y="13" width="370" height="10" rx="3" fill="url(#tugGradHome)"/>
    <!-- 客队段（红） -->
    <rect id="tugAway" x="430" y="13" width="370" height="10" rx="3" fill="url(#tugGradAway)"/>
    <!-- 绳结（金色圆，位置=当前主胜概率×800） -->
    <circle id="tugKnot" cx="400" cy="18" r="9" fill="#c8a832" stroke="#f0d060" stroke-width="1.5"/>
    <!-- 平局区域标记 -->
    <rect x="370" y="10" width="60" height="16" rx="3" fill="rgba(180,140,30,0.15)" stroke="rgba(200,160,40,0.3)" stroke-width="1"/>
    <!-- 渐变定义 -->
    <defs>
      <linearGradient id="tugGradHome" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#0e3a7a"/>
        <stop offset="100%" stop-color="#2266ee"/>
      </linearGradient>
      <linearGradient id="tugGradAway" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#cc2233"/>
        <stop offset="100%" stop-color="#880d18"/>
      </linearGradient>
    </defs>
  </svg>
  <!-- 保留数值显示 -->
  <div class="tug-values">
    <span id="probValHome" class="tug-val tug-home">33%</span>
    <span id="probValDraw" class="tug-val tug-draw">34%</span>
    <span id="probValAway" class="tug-val tug-away">33%</span>
  </div>
</div>
```

**Step 9-B**: `public/app.js`，修改 `updateProbBar()` 函数（约第 544-575 行）

```javascript
function updateProbBar() {
  const { home, draw, away } = probState;
  const knot = document.getElementById('tugKnot');
  const tugHome = document.getElementById('tugHome');
  const tugAway = document.getElementById('tugAway');
  if (!knot) return;

  // 绳结位置：home/(home+away) 决定左右偏移
  // 0% = 完全客队，50% = 平局，100% = 完全主队
  const bias = home / (home + away + 0.001);
  const cx = Math.round(bias * 800);

  // CSS transition 让绳结平滑移动
  knot.style.transition = 'cx 0.8s cubic-bezier(.4,0,.2,1)';
  knot.setAttribute('cx', cx);

  // 主队段宽度
  const homeW = Math.max(0, cx - 9);
  tugHome?.setAttribute('width', homeW);

  // 客队段位置和宽度
  const awayX = Math.min(800, cx + 9);
  tugAway?.setAttribute('x', awayX);
  tugAway?.setAttribute('width', Math.max(0, 800 - awayX));

  // 数值显示
  document.getElementById('probValHome').textContent = `${Math.round(home)}%`;
  document.getElementById('probValDraw').textContent = `${Math.round(draw)}%`;
  document.getElementById('probValAway').textContent = `${Math.round(away)}%`;

  // 每次更新后触发抖动动画
  knot.classList.remove('tug-bounce');
  void knot.offsetWidth; // reflow
  knot.classList.add('tug-bounce');
}
```

**Step 9-C**: 新增 CSS

```css
.tug-svg { width: 100%; height: 36px; display: block; }
.tug-values { display: flex; justify-content: space-between; margin-top: 4px; }
.tug-val { font-size: 11px; font-weight: 800; }
.tug-home { color: #60a5fa; }
.tug-draw { color: var(--gold-bright); }
.tug-away { color: #f87171; }

/* 绳结弹性动画 */
@keyframes tugBounce {
  0%   { r: 9; }
  30%  { r: 13; }
  60%  { r: 7; }
  80%  { r: 11; }
  100% { r: 9; }
}
#tugKnot.tug-bounce { animation: tugBounce 0.5s ease; }
```

---

### 改动 10：broadcast 卡片三层结构

**文件**: `public/app.js:updateBroadcast`（约第 1350-1400 行）

当前结构：compact-line + body-wrap（portrait + content）
目标结构：compact-line + body-wrap（portrait + content[来源层/内容层/金句层]）

修改 `card.innerHTML` 里的 `bc-content` 部分：
```javascript
// bc-content 内部改为：
`<div class="bc-content">
  <div class="bc-top-row">
    <div class="bc-agent-name">${escapeHtml(agent.name)}</div>
    <span class="bc-phase-badge ${badgeCls}">${phaseLabel}</span>
  </div>
  <!-- 层1：方法来源（灰小字） -->
  <div class="bc-source-layer">${AGENT_METHOD_LABEL[data.agentId]||''}</div>
  <!-- 层2：发言内容（主文本） -->
  <div class="bc-speech">${speech}</div>
  <!-- 层3：金句（金色高亮） -->
  ${data.catchphrase ? `<div class="bc-catchphrase">${escapeHtml(data.catchphrase)}</div>` : ''}
  ${data.scenePrediction ? `<div class="bc-scene">${escapeHtml(data.scenePrediction)}</div>` : ''}
  ${data.predictionTag ? `<span class="bc-tag">${escapeHtml(data.predictionTag)}</span>` : ''}
</div>`
```

新增 CSS：
```css
.bc-source-layer {
  font-size: 10px;
  color: var(--text-dim);
  padding-bottom: 4px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--border);
  letter-spacing: 0.3px;
}
/* 金句层更突出 */
.bc-catchphrase {
  margin-top: 5px;
  font-size: 12px;
  font-weight: 700;
  color: var(--gold-bright);
  font-style: italic;
  padding: 3px 6px;
  border-left: 2px solid var(--gold);
  background: var(--gold-dim);
}
```

---

## 五、实施路线（按轮次）

### 第一轮：基础修复（今天，约1-2小时）
按顺序：H1 → H2 → M2 → M3

| # | 改动 | 文件 | 行 | 时间估算 |
|---|------|------|----|---------|
| 1 | readCache 空数组防御 | dataFetcher.mjs | 66 | 5min |
| 2 | SSE beforeunload/visibilitychange | app.js | ~343 | 10min |
| 3 | prob-draw 颜色修复（改金色） | style.css | 211-213 | 5min |
| 4 | bc-speech 字号 12.5→13.5px | style.css | 找.bc-speech | 5min |
| 5 | agent-col CSS 双重定义清理 | style.css | 246+1564 | 10min |

验收：`$B console --errors` 零错误；概率条平局段清晰可见；broadcast 文字更易读

### 第二轮：可信度信号注入（1-2天）
改动 4（agent 准确率徽章）+ 改动 5（方法来源标签）+ 改动 6（阶段说明文字）

这三个改动是**最高单点可信度提升**，且不改布局不影响 3D 场景，风险最低。

验收：每个 agent 卡片显示准确率（或"暂无记录"）；每条 broadcast 发言下方显示灰色来源行

### 第三轮：视觉语言（3-5天）
改动 8（深蓝色调）+ 改动 9（拔河绳）+ 改动 10（三层卡片）

颜色改动影响面最广，建议先在 Chrome DevTools 实时预览，确认所有元素协调后再改 CSS 文件。

验收：背景 `rgb(1,7,20)` 附近；拔河绳随发言实时移动+弹跳；catchphrase 金色突出

### 第四轮：布局与响应式（5-7天）
改动 7（响应式断点）+ agent-col 扩宽到 200px

移动端验收：375px 视口无水平溢出，主要内容可读；议会广播区域占屏幕 ≥60%

### 第五轮：深度功能（1-2周）
- 改动 11：`submit_speech` tool 加 `dataPoints: [{field, value}]` 字段 → 前端数据引用高亮
- 改动 12：右侧数据引用面板（需先完成改动 11）
- 改动 13：新用户3步引导浮层（条件：用户第一次访问，`localStorage` 里没有 `oracle_visited` 标志）

---

## 六、改动 9 的数据流说明（拔河绳）

```
SSE message 事件
  → handleMessage(data)
    → updateProbFromMsg(data)
      → 更新 probState.homeW / drawW / awayW
      → 归一化为 home/draw/away 百分比
        → updateProbBar()
          → 计算 bias = home/(home+away)
          → 更新 SVG #tugKnot cx 值（0~800）
          → CSS transition: cx 0.8s → 平滑滑动
          → 添加 .tug-bounce → 弹跳动画
          → 更新三个数值文本

SSE blackboard_update 事件
  → 同样触发 updateProbBar()（已有此逻辑）

SSE summary 事件（议会结束）
  → handleSummary()
    → 用最终 results.home/draw/away 固定绳结位置
    → 绳结停止动画（移除 .tug-bounce 类）
```

SVG 的 `cx` 属性不支持直接 CSS transition（需要 SMIL 或 JS 动画），最稳定的方法是用 JS 直接 `setAttribute`（上方代码已是此方案）。绳结的 `r` 属性弹跳用 CSS `@keyframes` + class 切换，需要 reflow trick（`void el.offsetWidth`）。

---

## 七、不做的事（防止过度工程）

- ❌ 不引入 React/Vue/任何前端框架（原生 JS 够用，框架引入带来构建复杂度）
- ❌ 不做后端数据库（SQLite/Postgres 等）— localStorage + JSON 文件对当前用量够
- ❌ 不加 WebSocket（SSE 够用，WebSocket 需要额外管理连接状态）
- ❌ 不做 xG 真实 Poisson 模型（冰狗的 AI 扮演保留，这是娱乐产品）
- ❌ 不加置信区间/误差棒/统计图表（走"Bloomberg 数据可见"路线，不走"学术报告"路线）
- ❌ 不添加 agent 数量（6个是经过测试的甜蜜点，更多 agent 会让辩论变稀释）

---

## 八、gstack 验收清单（每轮完成后跑）

```bash
B="/c/Users/zhuji/.claude/skills/gstack/browse/dist/browse"

# 第一轮验收
$B goto "http://localhost:3000"
$B console --errors            # 应为零错误
$B css "#probSegDraw" "background-color"   # 应为金色系
$B css ".bc-speech" "font-size"            # 应为13.5px或14px

# 第二轮验收
$B js "document.querySelector('.ac-accuracy')?.textContent"  # 应有准确率或暂无记录
$B js "document.querySelector('.bc-method-label')?.textContent"  # 应有方法标签
# 启动议会后：
$B js "document.querySelectorAll('.bc-method-label').length"  # 应 > 0

# 第三轮验收
$B css "body" "background-color"           # 应为 rgb(1,7,20) 附近蓝色
$B js "!!document.getElementById('tugKnot')"  # 应为 true
# 测量对比度：
$B js "getComputedStyle(document.getElementById('tugKnot')).fill"  # 应为金色

# 第四轮验收
$B viewport 375x812
$B goto "http://localhost:3000"
$B js "document.body.scrollWidth <= window.innerWidth"  # 应为 true（无水平溢出）
$B screenshot /tmp/mobile-final.png
$B viewport 1280x720
```

---

## 九、已知被跳过的 CEO 战略机会（第五轮后评估）

这些机会价值高但改动大，留到 P1-P3 完成后再评估：

1. **API 产品化**：现有9个接口结构化完整，可加 `/docs` 静态页展示，低成本让议会引擎成为可接入的数据产品
2. **不可预测性注入**：目前议会每场节奏固定（开场→初判→对线→终投），第3场起用户会预判走势。可以引入：随机"场外消息"事件（伤病通报/换帅消息）打断节奏；agent 在 vote 阶段偶发"翻盘"发言
3. **多场次对比**：用户看完一场后自动推荐"对比赛"（今日另一场类似积分差的比赛），增加留存
4. **Three.js 升级路线**：`three.min.js` 换 ES Modules（`import * as THREE from 'three'`），解锁 r161+ 新特性；当前版本 r160 是最后支持 `three.min.js` 的版本

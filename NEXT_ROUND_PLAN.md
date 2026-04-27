# 预言者议会 · v4.3 全量改进规划
**日期**: 2026-04-27
**综合自**: v4.0 失败案例分析 + v4.2 gstack 三轮技术审查
**状态**: 规划文档，待实施

---

## 一、产品诊断：两个失败案例

> 这是整个规划的"为什么"。不理解失败案例，所有技术改动都没有方向。

### 失败案例1：新用户不知道在干什么

用户加载页面后看到：6个卡通人物站在绿色圆圈里什么都不做，左右有一排名字卡，底部有"召开议会"按钮。**没有解释，没有引导，没有预期设置。**

实际认知路径（通过用户观察还原）：

```
"这是一个游戏吗？"
    ↓ 点击"召开议会"
"什么都没发生？哦，要等一下"
    ↓ 等待 7-15 秒
"文字出现了，是AI在说话"
    ↓ 继续看
"他们说的是什么依据？"
    ↓ 找不到答案
"看不到数字来源，不知道这些AI凭什么说"
    ↓ 失去信任，下次不会再开
```

**核心问题**：用户第一印象是"游戏"，而不是"AI 数据分析"。3D卡通人形强化了游戏感，没有任何内容告诉用户这是基于真实足球数据的预测。

### 失败案例2：看完但不信（最关键）

试用用户原话：
> **"看乐子可以，但是不会信，除非有更多依据，比如摆个数据or告诉我你怎么得到的"**

这句话精准指出了 4 个具体的信任缺口：

| # | 缺口 | 当前状态 | 本质问题 |
|---|------|---------|---------|
| 1 | 可见的数据依据 | 代码里有真实API数据，UI上看不到被引用 | 数据存在但不可见 |
| 2 | 历史验证 | 准确率系统已实现，界面上完全不显示 | 功能存在但不暴露 |
| 3 | 方法论说明 | 每个Agent有严格方法论定义，用户不知道 | 设计存在但不标注 |
| 4 | 角色可信度 | Roblox风格人形让预测看起来像游戏 | 视觉语言破坏可信度 |

**关键洞察**：这4个缺口都不需要增加新数据。所有数据已经在后端，问题是**没有在界面上让用户看到它存在**。

---

## 二、设计原则：可信娱乐的甜蜜点

### 两个失败极端

**极端A（过学术）**：加置信区间、p值、样本量 → 没人看完，连球迷都跑了。

**极端B（过娱乐）**：纯卡通 + 弹幕梗词 + 角色喊话 → 看几场就腻了，且完全不可信。

**当前产品位置**：走娱乐路线，但娱乐质量不够高，可信度为零。两边都没到达。

### 参考的三个成功案例

**ESPN 底部数字条** — 体育直播时角落实时滚动的球员数据。观众看比赛时不一定读数字，但*知道数字在那里*，这本身就建立了可信度。**密度本身是可信度信号**，不需要用户真的阅读每个数字。

**虎扑大神分析帖** — "近5场主场战绩3W1D1L，对比客场2W1D2L，优势明显"。数字+口语化，有数据有观点，读起来不像报告。

**Bloomberg Terminal** — 数字极其密集，但每个数字都是实时的、有来源的。这里的核心洞察：**不是把界面做得像 Bloomberg，而是学习"让数据可见"这一设计哲学**。

### 核心设计原则

> **不是"更学术"，而是"让数据可见"**

方法论不需要解释，需要**标注**。数据不需要展开，需要**高亮**。历史记录不需要图表，需要**小徽章**。

具体翻译：

| ❌ 不要做的 | ✅ 要做的 |
|-----------|---------|
| 加"关于冰狗的方法论"解释段落 | 在每条发言旁加一行灰字："Poisson模型 · 进失球统计" |
| 做准确率分析报表 | 在冰狗卡片上加"近10场：✓✓✗✓✓ 70%" |
| 显示置信区间 | 让Agent说"模拟10000次，主胜52%"（已有，需视觉高亮） |
| 加学术数据源说明段落 | 在发言底部加一行来源标签："football-data.org · 实时" |

### Agent 权威感公式

人类评论员的可信度来自：历史记录 + 专业背景 + 数据引用。

AI Agent 的可信度同样来自这三件事，且**三件事的数据全部已有**，只需要显示出来：

```
历史记录 → 准确率徽章（✓✓✗✓✓ 70%）         ← /api/memory/profiles 已有数据
专业背景 → 方法论标签（"Poisson · 进失球"）   ← AGENT_METHOD 常量已有
数据引用 → 发言来源标签（灰色小字）           ← AGENT_METHOD_LABEL 定义即可
```

这三个视觉信号，不需要 Agent 说话更"学术"，只需要把已有信息**显示出来**。

---

## 三、实测技术数据（gstack 三轮审查原始证据）

```
日期: 2026-04-27
视口: 1280×720（桌面）/ 375×812（移动）/ 768×1024（平板）

布局实测:
  body背景色:     rgb(3, 14, 6) = #030e06（深绿，应改蓝）
  agent-col宽:    CSS 122px 被 !important 148px 覆盖（双重定义混乱）
  scene canvas:   984px（77% 视口）
  speech字号:     12.5px（极小）
  broadcast高:    190px（absolute 覆盖在 scene 上）

响应式:
  @media 断点:    0个（零响应式设计）
  移动端 overflow: true（375px 水平溢出，完全不可用）
  平板端 overflow: true（768px 同上）
  移动端 scene宽: 79px（基本消失）

颜色对比度:
  prob-draw:      linear-gradient(#1a4a20→#156020) on #030e06 → 对比度≈1.4:1（WCAG要求4.5:1）
  
可信度功能:
  准确率徽章:     ❌ API已有，前端未显示
  方法来源标签:   ❌ 未实现
  数据引用高亮:   ❌ 后端无 dataPoints 字段

代码异常:
  H1: readCache 不过滤空数组（下次会复发）
  H2: SSE tab关闭时不主动断开（烧token）
  H3: FPL失败无降级提示（用户看到全"暂无"不知原因）
  M1: agent-col CSS 双重定义（122px + 148px!important）
```

---

## 四、改动方案全集（按信任缺口对应）

---

### 【信任缺口1修复】历史验证可见

#### 改动 A：Agent 卡片加历史准确率 + 当前立场

**对应失败案例2 缺口2：没有历史验证**

**文件**: `public/app.js`

**Step A-1**：在 `init()` 函数（约第 340 行）并行拉取准确率

```javascript
// 在文件顶部约第 55 行，全局变量区
let agentAccuracyProfiles = {};

// init() 函数内，与 loadMatches() 并行：
async function fetchAccuracyProfiles() {
  try {
    const r = await fetch('/api/memory/profiles');
    agentAccuracyProfiles = await r.json();
  } catch { /* silent fail，无历史时显示"暂无记录" */ }
}
await Promise.all([loadMatches(), fetchAccuracyProfiles()]);
```

**Step A-2**：修改 `createAgentCard` 函数（`app.js:357-370`）

```javascript
function createAgentCard(id) {
  const a = AGENTS[id];
  const div = document.createElement('div');
  div.className = 'agent-card';
  div.id = `card-${id}`;
  div.style.setProperty('--agent-color', a.cssColor);

  const prof = agentAccuracyProfiles[id];
  const accHtml = (prof && prof.total > 0)
    ? (() => {
        // 生成 ✓✗ 图标串（最近5场）
        const recentByType = Object.entries(prof.byType || {})
          .flatMap(([outcome, s]) => Array(s.correct || 0).fill('✓').concat(Array((s.total - s.correct) || 0).fill('✗')))
          .slice(0, 5).join('');
        return `<div class="ac-accuracy">
          <span class="ac-acc-icons">${recentByType || '─'}</span>
          <span class="ac-acc-pct">${Math.round(prof.correct/prof.total*100)}%</span>
          <span class="ac-acc-label">近${prof.total}场</span>
        </div>`;
      })()
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

**Step A-3**：在 `updateProbFromMsg` 末尾同步更新立场指示器

```javascript
// 新增函数，在 updateProbFromMsg 后调用：
function updateAgentStanceDisplay(agentId, pick, conf) {
  const el = document.getElementById(`stance-${agentId}`);
  if (!el) return;
  const icons = { home: '🏠', draw: '⚖️', away: '✈️' };
  const pct = Math.round((conf || 0.5) * 100);
  el.innerHTML = pick
    ? `<span class="stance-icon">${icons[pick]}</span><span class="stance-conf">${pct}%</span>`
    : '';
  el.className = `ac-stance stance-${pick || 'none'}`;
}
// 在 handleMessage → updateProbFromMsg 调用链末尾插入：
// updateAgentStanceDisplay(data.agentId, data.structured?.winner, data.structured?.confidence);
```

**Step A-4**：新增 CSS（`style.css` 末尾）

```css
/* agent-col 宽度统一——删除 style.css:246 的 width:122px，在此改为 200px */
.agent-col { width: 200px !important; gap: 5px !important; }

.ac-accuracy {
  font-size: 10px; text-align: center;
  padding: 3px 4px; margin-top: 3px;
  border-top: 1px solid var(--border);
  line-height: 1.4;
}
.ac-acc-icons { font-size: 9px; letter-spacing: 1px; opacity: 0.8; display: block; }
.ac-acc-pct   { font-size: 14px; font-weight: 900; color: var(--gold-bright); }
.ac-acc-label { color: var(--text-dim); margin-left: 2px; font-size: 9px; }
.ac-acc-empty { color: var(--text-dim); font-style: italic; font-size: 9px; }

.ac-stance {
  font-size: 11px; text-align: center; min-height: 22px;
  padding: 2px 0; transition: all 0.3s;
}
.ac-stance .stance-icon { font-size: 14px; }
.ac-stance .stance-conf { color: var(--text-sub); font-size: 10px; margin-left: 2px; }
.stance-home { background: rgba(30,80,200,0.1); }
.stance-draw { background: rgba(180,140,30,0.1); }
.stance-away { background: rgba(200,30,50,0.1); }
```

---

### 【信任缺口2修复】方法论可见

#### 改动 B：每条发言加方法来源标签

**对应失败案例2 缺口3：没有方法论说明**

**文件**: `public/app.js`，在文件顶部约第 50 行加常量，在 `updateBroadcast` 函数里插入

```javascript
// app.js 顶部常量（约第 55 行）
const AGENT_METHOD_LABEL = {
  stat:      'Poisson模型 · football-data 进失球',
  gambler:   '跨平台盘口 · the-odds-api 赔率',
  history:   '历史情景匹配 · football-data H2H',
  psych:     '语义情绪分析 · FPL 球员状态',
  mystic:    '舆情叙事检测 · 市场情绪',
  moderator: '综合裁判',
};
```

在 `updateBroadcast` 函数的 `bc-content` 里，`bc-top-row` **之前**插入：

```javascript
// card.innerHTML 里的 bc-content，在 bc-top-row 前加一行：
`<div class="bc-source-layer">
  <span class="bc-source-icon">📡</span>
  ${AGENT_METHOD_LABEL[data.agentId] || ''}
</div>`
```

**新增 CSS**：

```css
.bc-source-layer {
  font-size: 10px; color: var(--text-dim);
  padding: 0 0 4px; margin-bottom: 4px;
  border-bottom: 1px solid var(--border);
  letter-spacing: 0.3px;
}
.bc-source-icon { font-size: 9px; margin-right: 3px; opacity: 0.6; }
```

---

### 【信任缺口3修复】数据依据可见

#### 改动 C：broadcast 卡片三层视觉结构

**对应失败案例2 缺口1：没有可见的数据依据**

三层结构将现有内容重组为可感知的信息层次，不增加任何新内容：

```
层1（灰色小字）：方法来源标签     ← "告诉我你怎么得到的"
层2（主文本）：  发言内容         ← 已有
层3（金色高亮）：catchphrase金句  ← 已有但缺视觉强调
```

修改 `updateBroadcast` 里 `bc-content` 的 `.bc-catchphrase` 样式（CSS 而非代码改动）：

```css
/* 金句层：视觉强度大幅提升，成为可截图的亮点 */
.bc-catchphrase {
  margin-top: 6px;
  font-size: 12.5px; font-weight: 700;
  color: var(--gold-bright); font-style: italic;
  padding: 4px 8px;
  border-left: 3px solid var(--gold);
  background: var(--gold-dim);
  border-radius: 0 3px 3px 0;
  line-height: 1.4;
}
/* 场景预测：用分镜感字体处理 */
.bc-scene {
  margin-top: 5px;
  font-size: 11.5px; color: var(--text-sub);
  font-style: italic; line-height: 1.5;
  border-top: 1px solid var(--border); padding-top: 4px;
}
/* 主发言文字稍加大 */
.bc-speech { font-size: 13.5px !important; line-height: 1.55 !important; }
```

---

### 【失败案例1修复】新用户引导

#### 改动 D：3步引导浮层（Onboarding）

**对应失败案例1：新用户不知道在干什么**

条件：`localStorage.getItem('oracle_visited')` 为 null 时显示（首次访问）。

在 `public/index.html` body 末尾加：

```html
<div id="onboardingOverlay" class="onb-overlay" style="display:none">
  <div class="onb-panel">
    <div class="onb-steps">
      <div class="onb-step active" id="onb-1">
        <div class="onb-num">1</div>
        <div class="onb-icon">⚽</div>
        <div class="onb-title">选一场真实比赛</div>
        <div class="onb-desc">英超赛程实时拉取，赔率来自 bet365，球员数据来自 Fantasy Premier League</div>
      </div>
      <div class="onb-step" id="onb-2">
        <div class="onb-num">2</div>
        <div class="onb-icon">🎯</div>
        <div class="onb-title">先亮出你的比分预测</div>
        <div class="onb-desc">议会开始前你先押注——看最后是你准还是 AI 准</div>
      </div>
      <div class="onb-step" id="onb-3">
        <div class="onb-num">3</div>
        <div class="onb-icon">⚔️</div>
        <div class="onb-title">6个 AI 角色用不同数据辩论</div>
        <div class="onb-desc">冰狗用 Poisson 模型，赌狗看盘口资金，碎碎念分析采访文本——方法不同，结论不同，你来判断谁说得对</div>
      </div>
    </div>
    <button id="onbStart" class="onb-btn">开始观战 →</button>
    <div class="onb-skip" id="onbSkip">跳过引导</div>
  </div>
</div>
```

`public/app.js` 里在 `init()` 加：

```javascript
function checkOnboarding() {
  if (!localStorage.getItem('oracle_visited')) {
    document.getElementById('onboardingOverlay').style.display = 'flex';
  }
}
document.getElementById('onbStart')?.addEventListener('click', () => {
  localStorage.setItem('oracle_visited', '1');
  document.getElementById('onboardingOverlay').style.display = 'none';
});
document.getElementById('onbSkip')?.addEventListener('click', () => {
  localStorage.setItem('oracle_visited', '1');
  document.getElementById('onboardingOverlay').style.display = 'none';
});
// 在 init() 末尾调用：
checkOnboarding();
```

CSS（渐进步骤动画，简洁）：

```css
.onb-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(1,7,20,0.92); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
}
.onb-panel {
  max-width: 520px; width: 90%;
  background: var(--bg-card); border: 1px solid var(--border-gold);
  border-radius: 12px; padding: 32px 28px; text-align: center;
}
.onb-steps { display: flex; gap: 12px; margin-bottom: 28px; }
.onb-step {
  flex: 1; padding: 16px 10px; border-radius: 8px;
  border: 1px solid var(--border); opacity: 0.5; transition: all 0.3s;
}
.onb-step.active { opacity: 1; border-color: var(--gold); background: var(--gold-dim); }
.onb-num { font-size: 10px; color: var(--text-dim); margin-bottom: 6px; }
.onb-icon { font-size: 28px; margin-bottom: 8px; }
.onb-title { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
.onb-desc { font-size: 11px; color: var(--text-sub); line-height: 1.5; }
.onb-btn {
  width: 100%; padding: 12px; font-size: 16px; font-weight: 700;
  background: linear-gradient(90deg, var(--wc-green), var(--gold));
  border: none; border-radius: 8px; color: #000; cursor: pointer;
  margin-bottom: 10px; transition: opacity 0.2s;
}
.onb-btn:hover { opacity: 0.9; }
.onb-skip { font-size: 11px; color: var(--text-dim); cursor: pointer; }
.onb-skip:hover { color: var(--text-sub); }
```

---

### 【技术修复】工程稳定性

#### 改动 E：readCache 空数组防御

**文件**: `dataFetcher.mjs:59-68`

```javascript
async function readCache(key) {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    const raw = await fs.promises.readFile(file, 'utf-8');
    const data = JSON.parse(raw);
    if (data.expires <= Date.now()) return null;
    if (Array.isArray(data.value) && data.value.length === 0) return null; // 拒绝空数组
    return data.value;
  } catch {
    return null;
  }
}
```

#### 改动 F：SSE 页面卸载时关闭

**文件**: `public/app.js`，`init()` 函数末尾

```javascript
window.addEventListener('beforeunload', () => { currentEs?.close(); currentEs = null; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && currentEs) { currentEs.close(); currentEs = null; }
});
```

#### 改动 G：概率条平局段对比度修复

**文件**: `public/style.css:211-213`

将 prob-draw 从几乎不可见的暗绿改为金色（语义也更清晰：主蓝/平金/客红）：

```css
.prob-draw {
  background: linear-gradient(90deg, #7a6010 0%, #b89020 50%, #7a6010 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 0 10px rgba(180,140,30,0.35);
}
```

---

### 【视觉语言改造】脱离"游戏感"

#### 改动 H：色调从深绿改深蓝

**对应失败案例2 缺口4：3D玩具角色破坏可信度（色调是起点）**

深绿色调传达"电竞游戏"，深蓝传达"数据分析/专业媒体"。参考：Sky Sports直播间（深蓝+白字+蓝金）。

**文件**: `public/style.css:6-60`

```css
:root {
  --bg-base:   #010714;
  --bg-panel:  #020a18;
  --bg-card:   #041020;
  --bg-input:  #061828;
  --border:    rgba(30,80,200,0.12);
  --border-md: rgba(30,80,200,0.22);
}

body {
  background: #010714;
  background-image:
    radial-gradient(ellipse 130% 45% at 50% 0%, rgba(20,60,180,0.4) 0%, transparent 55%),
    radial-gradient(ellipse 140% 40% at 50% 105%, rgba(0,80,160,0.20) 0%, transparent 55%),
    radial-gradient(ellipse 35% 90% at 0% 50%, rgba(10,40,100,0.15) 0%, transparent 60%),
    radial-gradient(ellipse 35% 90% at 100% 50%, rgba(10,40,100,0.15) 0%, transparent 60%);
}

/* body::before 六边形水印改蓝 */
body::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='52' viewBox='0 0 60 52'%3E%3Cpolygon points='30,2 58,17 58,35 30,50 2,35 2,17' fill='none' stroke='rgba(30,80,200,0.03)' stroke-width='1'/%3E%3C/svg%3E");
}
```

#### 改动 I：概率条改为拔河绳（SVG）

**对应"预测是动态博弈"而非"静态结果"的设计目标**

**文件**: `public/index.html:47-63`，`public/app.js`（`updateProbBar` 函数约第 544 行），`public/style.css`

**Step I-1**：index.html 替换 `.prob-bar-track` 为 SVG

```html
<div class="prob-bar-track" id="probBarTrack">
  <svg class="tug-svg" viewBox="0 0 800 36" id="tugSvg">
    <rect x="0" y="15" width="800" height="6" rx="3" fill="rgba(255,255,255,0.08)"/>
    <rect id="tugHome" x="0" y="13" width="370" height="10" rx="3" fill="url(#tugGradHome)"/>
    <rect id="tugAway" x="430" y="13" width="370" height="10" rx="3" fill="url(#tugGradAway)"/>
    <rect x="370" y="10" width="60" height="16" rx="3"
          fill="rgba(180,140,30,0.12)" stroke="rgba(200,160,40,0.3)" stroke-width="1"/>
    <circle id="tugKnot" cx="400" cy="18" r="9"
            fill="#c8a832" stroke="#f0d060" stroke-width="1.5"/>
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
  <div class="tug-values">
    <span id="probValHome" class="tug-val tug-home">33%</span>
    <span id="probValDraw" class="tug-val tug-draw">34%</span>
    <span id="probValAway" class="tug-val tug-away">33%</span>
  </div>
</div>
```

**Step I-2**：app.js 替换 `updateProbBar()` 函数

```javascript
function updateProbBar() {
  const { home, draw, away } = probState;
  const knot = document.getElementById('tugKnot');
  const tugHome = document.getElementById('tugHome');
  const tugAway = document.getElementById('tugAway');
  if (!knot) { /* 旧版 prob-seg 降级逻辑保留 */ return; }

  const bias = home / (home + away + 0.001);
  const cx = Math.round(bias * 800);
  knot.setAttribute('cx', cx);
  tugHome?.setAttribute('width', Math.max(0, cx - 9));
  tugAway?.setAttribute('x', Math.min(800, cx + 9));
  tugAway?.setAttribute('width', Math.max(0, 800 - Math.min(800, cx + 9)));

  document.getElementById('probValHome').textContent = `${Math.round(home)}%`;
  document.getElementById('probValDraw').textContent  = `${Math.round(draw)}%`;
  document.getElementById('probValAway').textContent = `${Math.round(away)}%`;

  // 弹跳动画（reflow trick）
  knot.classList.remove('tug-bounce');
  void knot.offsetWidth;
  knot.classList.add('tug-bounce');
}
```

**Step I-3**：新增 CSS

```css
.tug-svg { width: 100%; height: 36px; display: block; }
#tugKnot { transition: none; } /* JS 直接控制，不需要 CSS transition */
.tug-values { display: flex; justify-content: space-between; margin-top: 4px; padding: 0 4px; }
.tug-val { font-size: 11px; font-weight: 800; }
.tug-home { color: #60a5fa; }
.tug-draw { color: var(--gold-bright); }
.tug-away { color: #f87171; }

@keyframes tugBounce { 0%{r:9} 30%{r:13} 60%{r:7} 80%{r:11} 100%{r:9} }
#tugKnot.tug-bounce { animation: tugBounce 0.5s ease; }
```

#### 改动 J：阶段指示器加说明文字

**对应失败案例1：不知道下一步会发生什么**

**文件**: `public/app.js`，`appendPhaseBanner` 函数（约第 1430 行）

```javascript
// 在函数顶部加常量：
const PHASE_DESC = {
  opening:  '议长开场，介绍今日交锋焦点',
  initial:  '5位专家独立初判，各自只看私有数据',
  reaction: `分歧最大的两方互怼方法论`,
  debate:   (meta) => `${AGENTS[meta?.agentA]?.name||'?'} vs ${AGENTS[meta?.agentB]?.name||'?'} · 方法论碰撞`,
  vote:     '终极裁决——是否被对线内容说服？',
};
```

在 banner HTML 里加子标题：

```javascript
// phase-banner 的 innerHTML 里追加：
`<div class="phase-desc">${
  typeof PHASE_DESC[phase] === 'function'
    ? PHASE_DESC[phase](meta)
    : (PHASE_DESC[phase] || '')
}</div>`
```

```css
.phase-desc { font-size: 10px; color: var(--text-dim); margin-top: 2px; letter-spacing: 0.3px; }
```

---

### 【响应式修复】移动端基本可用

#### 改动 K：响应式断点（零到有）

**文件**: `public/style.css` 末尾追加（当前文件内 0 个 @media 查询）

```css
/* ===== 移动端（≤767px）===== */
@media (max-width: 767px) {
  body { overflow-y: auto; }
  .game-arena { flex-direction: column; overflow: visible; }

  /* 隐藏 3D（移动端 canvas 变成 79px 宽，毫无意义） */
  #threeCanvas { display: none !important; }

  /* agent 列变水平滚动条 */
  .agent-col {
    width: 100% !important; height: auto !important;
    flex-direction: row !important; overflow-x: auto;
    padding: 6px 8px; gap: 8px;
    border-right: none !important; border-left: none !important;
    border-bottom: 1px solid var(--border);
  }
  .agent-card { min-width: 130px; flex-shrink: 0; }

  /* broadcast 从 absolute 变 relative，填满屏幕 */
  .broadcast-panel {
    position: relative !important; bottom: auto !important;
    height: 55vh !important; overflow-y: auto;
  }

  /* 顶栏压缩 */
  .top-bar { height: 46px; }
  .tb-left { display: none; }
  .tb-center { gap: 6px; }
  .tb-odds-row { gap: 6px; }
}

/* ===== 平板（768px-1023px）===== */
@media (min-width: 768px) and (max-width: 1023px) {
  .agent-col { width: 160px !important; }
  #threeCanvas { max-width: 400px !important; }
}
```

---

## 五、改动优先级矩阵

| 改动 | 对应失败案例 | 预期收益 | 实施难度 | 优先级 |
|------|-----------|---------|---------|--------|
| E：readCache空数组防御 | 数据质量 | 防复发 | 5min | **P0 今天** |
| F：SSE关闭泄漏 | 成本控制 | 止血 | 10min | **P0 今天** |
| G：prob-draw对比度 | 视觉可读 | 立即可见 | 5min | **P0 今天** |
| B：方法来源标签 | 失败2·缺口3 | 高信任度 | 30min | **P1 本周** |
| A：准确率徽章 | 失败2·缺口2 | 高信任度 | 1-2h | **P1 本周** |
| C：三层发言结构 | 失败2·缺口1 | 高信任度 | 1h | **P1 本周** |
| J：阶段说明文字 | 失败1 | 中引导效果 | 30min | **P1 本周** |
| D：Onboarding | 失败1 | 高新用户留存 | 2-3h | **P2 下周** |
| I：拔河绳概率条 | 戏剧感 | 高娱乐性 | 3-4h | **P2 下周** |
| H：色调深绿→深蓝 | 失败2·缺口4 | 高专业感 | 2h | **P2 下周** |
| K：响应式断点 | 移动端可用 | 高覆盖率 | 3-4h | **P3 本轮内** |

---

## 六、实施路线

### 第一轮：止血 + 快赢（今天，约1小时）

3个高优先级 bug fix，改完立刻有效：

```
E → F → G（顺序执行，每个5-10分钟）
完成后：服务器不再泄漏token；概率条清晰可见
```

### 第二轮：可信度信号（1-2天）

**这是失败案例2的直接解法，最高单点 ROI：**

```
B（方法来源标签，30min）
→ A（准确率徽章，2h，依赖 /api/memory/profiles）
→ C（三层发言结构样式，1h）
→ J（阶段说明文字，30min）
```

完成后：用户能看到"这是 Poisson 模型，进失球数据来自 football-data.org"，能看到"Dr.冰狗近8场70%准确率"——失败案例2的核心信任缺口被封堵。

### 第三轮：用户体验语言（3-5天）

```
H（色调深蓝）→ I（拔河绳）→ D（Onboarding）
```

色调改动影响面最广，建议先在 DevTools 里预览确认所有元素协调，再提交。

### 第四轮：覆盖率（5-7天）

```
K（响应式断点）
```

移动端目前零可用性（溢出+3D消失），这个改动让有人分享链接时接收方手机上也能看。

---

## 七、gstack 验收清单

```bash
B="/c/Users/zhuji/.claude/skills/gstack/browse/dist/browse"

# === 第一轮验收 ===
$B goto "http://localhost:3000"
$B console --errors
# 期望：零 JS 错误（除 Three.js GPU stall 警告）

$B css "#probSegDraw" "background-color"
# 期望：金色系 rgb(180,140,30) 附近，而非深绿

$B css ".bc-speech" "font-size"
# 期望：≥13px

# === 第二轮验收 ===
$B js "document.querySelector('.ac-accuracy')?.textContent"
# 期望：有准确率或"暂无记录"文字

# 召开议会后：
$B js "document.querySelectorAll('.bc-source-layer').length"
# 期望：> 0（每条发言都有来源标签）

$B js "document.querySelector('.bc-source-layer')?.textContent"
# 期望：包含 "Poisson模型" 或 "盘口信号" 等字样

$B js "document.querySelector('.ac-stance')?.textContent"
# 期望：发言后 agent 卡片显示立场图标+置信度

# === 第三轮验收 ===
$B css "body" "background-color"
# 期望：rgb(1,7,20) 附近（深蓝）

$B js "!!document.getElementById('tugKnot')"
# 期望：true（拔河绳 SVG 存在）

# 召开议会，等发言后：
$B js "document.getElementById('tugKnot')?.getAttribute('cx')"
# 期望：非 400（有位移，不再是初始中心值）

# === 第四轮验收 ===
$B viewport 375x812
$B goto "http://localhost:3000"
$B js "document.body.scrollWidth <= window.innerWidth"
# 期望：true（无水平溢出）
$B screenshot /tmp/mobile-v4.png
$B viewport 1280x720
```

---

## 八、不做的事

### 不加学术性内容
- ❌ "关于冰狗Poisson模型的原理说明"段落
- ❌ 置信区间、误差棒、p值显示
- ❌ 数据来源详细文档弹窗
- ✅ 只加一行灰字标注，用户能感知到"有依据"即可

### 不减娱乐性
- ✅ 保留弹幕梗词（"绷不住了"/"离谱"/"寄了"）
- ✅ 保留 catchphrase 金句机制
- ✅ 保留 3D 场景（降为背景装饰，不是主信息区）

### 不过度工程
- ❌ 不引入 React/Vue（原生 JS 够用）
- ❌ 不做后端数据库
- ❌ 不加 WebSocket（SSE 够用）
- ❌ 不真正实现 Poisson 模型（LLM 扮演是娱乐产品的合理选择）

---

## 九、CEO 视角：被跳过的战略机会（P4 评估后决定）

1. **API 产品化**：9个接口完整，加 `/docs` 页让议会引擎变成可接入数据产品，低成本高价值
2. **不可预测性**：第3场起节奏可预判（开场→初判→对线→终投）。引入随机"场外消息"事件可打断节奏
3. **多场次对比**：结束后自动推荐今日积分差相似的另一场，提升留存
4. **Three.js 升级**：r160 是最后支持 `three.min.js` 的版本，迁移 ES Modules 解锁后续版本

---

## 附录：v4.0→v4.3 规划演变

| 版本 | 核心贡献 |
|------|---------|
| v4.0 (2026-04-24) | 失败案例分析；学术vs娱乐甜蜜点；布局重设计方案；可信度信号框架 |
| v4.1 (2026-04-27) | FPL数据接入完成确认；已修复 news bug；CEO/Eng/Design 三轮审查 |
| v4.2 (2026-04-27) | gstack 实测数据补全（CSS值/布局尺寸/错误列表）；详细代码级改动方案 |
| **v4.3 (2026-04-27)** | **综合 v4.0 失败案例框架 + v4.2 技术实证；将"为什么"和"怎么做"统一** |

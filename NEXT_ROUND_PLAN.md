# 预言者议会 · v4.4 全量改进规划
**日期**: 2026-04-27
**综合自**: v4.0 失败分析 + v4.2 技术审查 + v4.4 新一轮多视角审查
**新增**: 8个失败案例（v4.0 的 2个 + 本轮新发现的 6个）
**实证来源**: gstack 截图 + 完整用户旅程走查 + 代码审读

---

## 一、产品诊断：8个失败案例

> 失败案例是改动方向的"为什么"。每条改动必须能追溯到某个具体失败。

---

### 失败案例1：新用户不知道在干什么（v4.0已有）

认知路径断裂：用户看到6个卡通人 + "召开议会"按钮，没有任何解释：这是什么？AI 凭什么说？我该怎么参与？

```
"这是游戏吗？" → 点击 → 等待 → "哦是AI聊天" → "他们说的是什么依据？"
→ 找不到答案 → 失去信任
```

**根本原因**: 产品假设用户"懂"，但每个新用户都是零背景进场。

---

### 失败案例2：看完但不信（v4.0已有）

> 用户原话："看乐子可以，但不会信，除非有更多依据，比如摆个数据or告诉我你怎么得到的"

4个具体信任缺口：

| 缺口 | 数据现状 | 为什么没显示 |
|------|---------|------------|
| 没有可见数据依据 | football-data/FPL 真实数据已接入 | 没有标注"这行数字从哪来" |
| 没有历史验证 | `/api/memory/profiles` 已有准确率 | agent 卡片没有展示 |
| 没有方法论说明 | `AGENT_METHOD` 常量已定义 | 发言旁没有标注 |
| 3D角色破坏可信度 | — | Roblox 风格传达"游戏"不是"分析" |

---

### 失败案例3：看了一场就腻了（新发现）

每场议会节奏固定：**开场 → 5人初判 → 反应 → 对线 → 终投**。第3场开始用户能预判走向，失去新鲜感。

gstack 走查确认：整个流程没有任何"意外时刻"的触发机制，agent 的方法论碰撞虽然存在但模式固定。

```
第1场：新鲜感强，看完全程
第2场：熟悉流程，有点预判
第3场：知道接下来会发生什么，开始快进
第5场：工具感，不再是"节目"
```

**根本原因**: 议会只有固定节奏，缺少随机性和"今晚专属"的钩子。

---

### 失败案例4：议会结束后什么都没留下（新发现）

gstack 实测：结果页是弹窗，包含"五种剧本对比""今晚金句""你vs议会"等丰富内容，但：

- 点击背景关闭就消失，**没有持久化**
- 没有可截图分享的卡片
- 金句、剧本只能在这个临时弹窗里看，**无法传播**
- 结果页唯一的 CTA 是 `↺ 重新召开议会`，**没有引导下一步**

截图证据：结果页底部只有一个"重新召开议会"按钮，连"分享"按钮都没有。

**根本原因**: 产品把结果当"终点"，但结果应该是"传播起点"。

---

### 失败案例5：赛后反馈循环断裂（新发现）

系统实现了完整的 `actualScore → /api/result → updateAgentAccuracy` 链路，但：

- 用户不知道比赛结束后需要回来**录入实际比分**
- `resultInputPanel` DOM 存在，但藏在结果卡片底部，视觉权重极低
- 没有任何提醒机制（没有"XX小时后比赛结束，记得录入"的 hook）
- 历史胜率 `oracle_stats` 存在 localStorage，但逻辑有 bug：
  - **代码 `app.js:1529` 发现**：`userCorrect = userPrediction === winner.key`，这里 `winner.key` 是概率最高的选项，**不是实际比赛结果**。用户"赢了议会"≠"赢了比赛"，两个混在一起了。

**根本原因**: 反馈闭环设计了一半——开了头（用户填预测）没有结尾（实际比分对照），并且存在业务逻辑 bug。

---

### 失败案例6：不知道今天哪场值得看（新发现）

冷启动页面有 21 场比赛的下拉选择器，没有任何排序依据或推荐逻辑：

```
当前: 全部 21 场平铺，select 下拉，比赛名+轮次+日期
缺失: 为什么是这场？这场重要吗？上次这两队打了多少？
```

代码审计发现：`leagueContext.stakes` 字段已经计算了 `title/top4/relegation/mixed/mid` 分级，**但完全没有用于排序或高亮**。

积分榜前4对决（`stakes: 'title'`）和倒数第20位的比赛在下拉里完全一样的地位。

**根本原因**: 数据已有，展示未实现。用户自己要判断"哪场值得看"，而不是产品帮他判断。

---

### 失败案例7：6个 Agent 在视觉上区分度不足（新发现）

虽然 6 个 agent 有不同颜色（蓝/紫/黄/绿/青/金）和 emoji，但 broadcast 卡片**结构完全相同**：

```
[emoji 头像] [名字] [相位徽章]
[发言文本]
[catchphrase]
```

从视觉上几乎看不出"这是冰狗在说数字模型"还是"这是月影姐在说玄学感应"。每张卡片只有左边框颜色不同。

对比 ESPN 演播室：不同专家的发言框有不同的视觉风格（老球迷用更厚重的字体，年轻分析师用更现代的排版）。

**根本原因**: 视觉语言没有支撑人设差异化。6 个人设只活在文字里，不活在视觉里。

---

### 失败案例8：可信度需要等"历史积累"才能验证（新发现）

准确率徽章系统的数据来自 `/api/memory/profiles`，新用户首次使用时所有 agent 都是"暂无记录"。

问题：用户需要**先相信**，才能开始积累验证数据。这是典型的冷启动悖论。

而且"历史胜率 0% · 0/2 场"（结果页 gstack 实测）显示的是**用户自己的预测准确率**，而不是 agent 的——两者混在同一个界面区域，概念不清晰。

**根本原因**: 信任建立需要时间沉淀，但没有用其他方式在冷启动时建立初始信任。

---

## 二、核心设计原则（综合所有失败案例提炼）

### 原则1：让数据可见（来自失败案例2）

> 密度即信任。不是更学术，而是让已有数据出现在用户视野里。

- ❌ 不加解释段落 → ✅ 加一行灰色标注
- ❌ 不做报表 → ✅ 加一个徽章

### 原则2：每场有专属钩子（来自失败案例3、6）

> 今晚这场有什么别的场没有的理由值得看？

- 赛前：stakes 标签 + 上次对阵记录 + "今日焦点战"推荐
- 赛中：随机不可预测的"意外时刻"

### 原则3：结束是传播的开始（来自失败案例4）

> 议会结果应该是可分享的纪念品，不是临时弹窗。

### 原则4：反馈循环必须闭合（来自失败案例5）

> 用户填了预测，议会给了裁决，比赛会有真实结果。这三个必须连成闭环。

### 原则5：视觉语言支撑人设差异（来自失败案例7）

> 如果用户遮住名字，能分辨出这是谁说的话吗？

---

## 三、实测数据（gstack 完整走查）

```
完整走查日期: 2026-04-27
走查流程: 首页冷启动 → 选场 → 填预测 → 完整议会 → 结果页

发现的关键问题:
  冷启动: 21场比赛无推荐排序；ticker 26px高几乎不可读；无"今日焦点战"
  流程中: 节奏固定，无意外事件；broadcast 12.5px字号极小
  结果页: 弹窗关闭即消失；唯一CTA="重新召开"；无分享功能
  
代码级 bug（新发现）:
  app.js:1529: userCorrect 比较的是"议会裁决"而非"实际比赛结果"
              （是和议会一致，不是"猜对了比赛"，概念混淆）
  style.css: 0个 @media 查询
  dataFetcher.mjs: readCache 不过滤空数组
  app.js: SSE 页面卸载不关闭
  style.css:211: prob-draw 对比度约1.4:1
```

---

## 四、改动全集（11项，按失败案例对应）

---

### 改动 A：Agent 准确率徽章 + 当前立场
**对应**: 失败案例2（历史验证缺口）
**文件**: `public/app.js:357-370`（`createAgentCard`）、`public/style.css`

```javascript
// app.js 顶部 ~第55行
let agentAccuracyProfiles = {};
async function fetchAccuracyProfiles() {
  try {
    agentAccuracyProfiles = await fetch('/api/memory/profiles').then(r=>r.json());
  } catch {}
}
// init() 里并行：await Promise.all([loadMatches(), fetchAccuracyProfiles()]);

// createAgentCard 改造
function createAgentCard(id) {
  const a = AGENTS[id];
  const prof = agentAccuracyProfiles[id];
  const total = prof?.total || 0;
  const pct = total > 0 ? Math.round(prof.correct / total * 100) : null;
  
  // ✓✗ 图标串（最近5场，从 byType 推算）
  const icons = total > 0 ? Array(Math.min(total,5)).fill(0).map((_,i) =>
    i < (prof.correct || 0) ? '✓' : '✗'
  ).join('') : '';
  
  const accHtml = total > 0
    ? `<div class="ac-accuracy">
        <span class="ac-icons">${icons}</span>
        <span class="ac-pct">${pct}%</span>
        <span class="ac-n">近${total}场</span>
       </div>`
    : `<div class="ac-accuracy ac-empty">首场预测中…</div>`;
  
  const div = document.createElement('div');
  div.className = 'agent-card';
  div.id = `card-${id}`;
  div.style.setProperty('--agent-color', a.cssColor);
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

CSS（`style.css` 末尾）：
```css
.agent-col { width: 200px !important; }
.ac-accuracy { font-size:10px; text-align:center; padding:3px 4px; border-top:1px solid var(--border); }
.ac-icons { font-size:9px; letter-spacing:1px; display:block; opacity:.8; }
.ac-pct   { font-size:14px; font-weight:900; color:var(--gold-bright); }
.ac-n     { font-size:9px; color:var(--text-dim); margin-left:2px; }
.ac-empty { color:var(--text-dim); font-style:italic; font-size:9px; }
.ac-stance { font-size:11px; text-align:center; min-height:22px; padding:2px 0; transition:all .3s; }
.stance-home { background:rgba(30,80,200,.1); }
.stance-draw { background:rgba(180,140,30,.1); }
.stance-away { background:rgba(200,30,50,.1); }
```

---

### 改动 B：发言卡三层结构（来源 + 内容 + 金句）
**对应**: 失败案例2（数据依据缺口）+ 失败案例7（Agent区分度）
**文件**: `public/app.js:updateBroadcast`

```javascript
// 顶部常量
const AGENT_METHOD_LABEL = {
  stat:      'Poisson · football-data',
  gambler:   '跨平台盘口 · the-odds-api',
  history:   '历史情景 · H2H数据',
  psych:     '语义分析 · FPL球员',
  mystic:    '舆情叙事 · 市场情绪',
  moderator: '综合裁判',
};

// bc-content 里在 bc-top-row 前插入来源层
`<div class="bc-source-layer">
  ${AGENT_METHOD_LABEL[data.agentId]||''}
</div>`
```

CSS：
```css
.bc-source-layer {
  font-size:10px; color:var(--text-dim);
  padding:0 0 4px; margin-bottom:4px;
  border-bottom:1px solid var(--border); letter-spacing:.3px;
}
.bc-speech { font-size:13.5px !important; line-height:1.55 !important; }
.bc-catchphrase {
  margin-top:6px; font-size:12.5px; font-weight:700;
  color:var(--gold-bright); font-style:italic;
  padding:4px 8px; border-left:3px solid var(--gold);
  background:var(--gold-dim); border-radius:0 3px 3px 0;
}
```

---

### 改动 C：Agent 发言卡独特视觉语言
**对应**: 失败案例7（视觉区分度不足）
**文件**: `public/style.css`

每个 agent 的 bc-card 有独特的视觉指纹——左边框样式+微弱背景纹理：

```css
/* 发言卡按 agent 差异化——遮住名字也能感知是谁 */
.bc-card[data-agent-id="stat"]      { border-left: 3px solid #60a5fa; }
.bc-card[data-agent-id="gambler"]   { border-left: 3px solid #34d399; }
.bc-card[data-agent-id="history"]   { border-left: 3px solid #fbbf24; }
.bc-card[data-agent-id="psych"]     { border-left: 3px solid #67e8f9; }
.bc-card[data-agent-id="mystic"]    { border-left: 3px solid #a78bfa; }
.bc-card[data-agent-id="moderator"] { border-left: 4px solid #f0c040; background: rgba(240,192,64,.03); }

/* stat(冰狗): 数字感微弱背景 */
.bc-card[data-agent-id="stat"] .bc-body-wrap { background: linear-gradient(135deg, rgba(96,165,250,.04) 0%, transparent 50%); }
/* mystic(月影姐): 紫色星光感 */
.bc-card[data-agent-id="mystic"] .bc-body-wrap { background: linear-gradient(135deg, rgba(167,139,250,.05) 0%, transparent 50%); }
/* gambler(赌狗): 绿色资金感 */
.bc-card[data-agent-id="gambler"] .bc-body-wrap { background: linear-gradient(135deg, rgba(52,211,153,.04) 0%, transparent 50%); }
```

同时在 `updateBroadcast` 里给 card 加 `data-agent-id` 属性：
```javascript
card.dataset.agentId = data.agentId;  // 新增这一行
```

---

### 改动 D：比赛选择器重设计——今日焦点战
**对应**: 失败案例6（冷启动动力不足）
**文件**: `public/app.js`（`loadMatches` 函数附近）、`public/index.html`

**原理**：`leagueContext.stakes` 已有 `title/top4/relegation/mixed/mid` 分级，但没用于排序展示。

修改 `loadMatches` 后的渲染逻辑：

```javascript
// 比赛按重要性排序，title/relegation 置顶
const STAKES_ORDER = { title: 0, relegation: 1, top4: 2, mixed: 3, mid: 4 };
const STAKES_BADGE = {
  title:      '🔥 争冠',
  relegation: '⚠️ 保级',
  top4:       '🌟 争四',
  mixed:      '上下对决',
  mid:        '',
};

function buildMatchOption(m) {
  const stakes = m.leagueContext?.stakes || 'mid';
  const badge = STAKES_BADGE[stakes];
  const diff = Math.abs((m.leagueContext?.homePoints||0) - (m.leagueContext?.awayPoints||0));
  return `${badge ? badge + ' ' : ''}${m.homeFlag} ${m.home} vs ${m.away} ${m.awayFlag} · ${m.stage} · ${formatDate(m.utcDate)}${diff > 0 ? ` · 积分差${diff}` : ''}`;
}

// 在渲染 select options 前排序
allMatches.sort((a, b) =>
  (STAKES_ORDER[a.leagueContext?.stakes] ?? 4) - (STAKES_ORDER[b.leagueContext?.stakes] ?? 4)
);
```

在主页顶部加"今日焦点战"横幅（只在 stakes=title/relegation 时显示）：
```javascript
// 在 loadMatches 完成后：
const featured = allMatches.find(m => ['title','relegation'].includes(m.leagueContext?.stakes));
if (featured) {
  const banner = document.getElementById('featuredMatchBanner');
  if (banner) {
    const badge = STAKES_BADGE[featured.leagueContext.stakes];
    banner.innerHTML = `${badge} 今日焦点：${featured.home} vs ${featured.away} · ${featured.stage}`;
    banner.style.display = 'block';
    banner.dataset.matchId = featured.id;
    banner.addEventListener('click', () => {
      document.getElementById('matchSelect').value = featured.id;
      document.getElementById('matchSelect').dispatchEvent(new Event('change'));
    });
  }
}
```

HTML（`index.html`，在 select 上方插入）：
```html
<div id="featuredMatchBanner" class="featured-banner" style="display:none"></div>
```

CSS：
```css
.featured-banner {
  background: linear-gradient(90deg, rgba(200,168,50,.15), rgba(0,200,80,.1));
  border: 1px solid var(--border-gold); border-radius:6px;
  padding: 6px 12px; font-size:13px; font-weight:700;
  color: var(--gold-bright); cursor:pointer; margin-bottom:6px;
  letter-spacing:.3px; transition:background .2s;
}
.featured-banner:hover { background: linear-gradient(90deg, rgba(200,168,50,.25), rgba(0,200,80,.15)); }
```

---

### 改动 E：结果页持久化 + 分享卡片
**对应**: 失败案例4（议会结束无纪念品）
**文件**: `public/app.js:handleSummary`

**核心改动**：结果卡片从弹窗 overlay 改为侧边面板（不再消失），并加入"复制金句"按钮和截图文字摘要。

```javascript
// handleSummary 末尾，替换简单 reset-btn，加入更多 CTA
const ctaHtml = `
  <div class="results-cta-row">
    <button class="cta-btn cta-share" onclick="copyResultSummary()">📋 复制战报</button>
    <button class="cta-btn cta-record" onclick="showResultInput()">📝 录入比分</button>
    <button class="cta-btn cta-next" onclick="resetCouncil()">↺ 下一场</button>
  </div>
  <div id="resultInputInline" style="display:none">
    <div class="rii-label">实际比赛结果</div>
    <div class="rii-row">
      <input id="riiHome" type="number" min="0" max="20" value="0" class="rii-input">
      <span class="rii-vs">:</span>
      <input id="riiAway" type="number" min="0" max="20" value="0" class="rii-input">
      <button onclick="submitActualResult()" class="rii-submit">确认</button>
    </div>
    <div class="rii-note">录入后更新各AI准确率，帮助建立历史记录</div>
  </div>`;
```

```javascript
// 新增：生成纯文字战报（可复制分享）
function copyResultSummary() {
  const m = currentMatchData;
  const top = sessionCatchphrases.slice(0,2).map(c=>`「${c.text}」——${c.name}`).join('\n');
  const summary = [
    `🔮 预言者议会 · ${m?.home||'主队'} vs ${m?.away||'客队'}`,
    `📊 议会裁决：${document.querySelector('.verdict')?.textContent || ''}`,
    `👤 你的预测：${userPrediction ? {home:`${m?.home}胜`,draw:'平局',away:`${m?.away}胜`}[userPrediction] : '未填'}`,
    top ? `\n🔥 今晚金句：\n${top}` : '',
    `\n来自 Goalcast AI 预测议会`,
  ].filter(Boolean).join('\n');
  navigator.clipboard?.writeText(summary).then(() => {
    showToast('战报已复制，快去发给朋友！');
  });
}
```

```javascript
// 新增：赛后录入实际比分
function showResultInput() {
  document.getElementById('resultInputInline').style.display = 'block';
}
async function submitActualResult() {
  const h = parseInt(document.getElementById('riiHome').value) || 0;
  const a = parseInt(document.getElementById('riiAway').value) || 0;
  try {
    await fetch('/api/result', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId: currentMatchData?.id, actualScore: [h, a] })
    });
    showToast(`✅ 已录入 ${h}-${a}，AI准确率已更新`);
    document.getElementById('resultInputInline').style.display = 'none';
  } catch { showToast('录入失败，请重试'); }
}
```

CSS：
```css
.results-cta-row { display:flex; gap:8px; margin-top:12px; }
.cta-btn { flex:1; padding:9px 4px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; border:1px solid var(--border); transition:all .2s; }
.cta-share { background:rgba(200,168,50,.15); color:var(--gold-bright); border-color:var(--border-gold); }
.cta-record { background:rgba(30,80,200,.15); color:#60a5fa; border-color:rgba(30,80,200,.3); }
.cta-next { background:rgba(0,200,80,.1); color:var(--wc-green); }
.rii-row { display:flex; align-items:center; gap:8px; margin:8px 0; }
.rii-input { width:50px; text-align:center; background:var(--bg-input); color:var(--text); border:1px solid var(--border); border-radius:4px; padding:6px; font-size:18px; }
.rii-vs { font-size:18px; font-weight:700; color:var(--text-sub); }
.rii-submit { padding:6px 16px; background:var(--wc-green); color:#000; font-weight:700; border:none; border-radius:4px; cursor:pointer; }
.rii-note { font-size:10px; color:var(--text-dim); }
```

---

### 改动 F：修复 userCorrect 业务逻辑 bug
**对应**: 失败案例5（反馈闭环断裂）
**文件**: `public/app.js:1529`

**当前 bug**：`userCorrect = userPrediction === winner.key`，`winner` 是议会概率最高选项，不是实际比赛结果。

修复方案：**分离两个概念**，UI 上也明确区分：

```javascript
// app.js:1528 区域，修改 handleSummary 里的对比逻辑：

// "你vs议会"：比较你和议会的倾向是否一致
const agreesWithCouncil = userPrediction === winner.key;

// "历史记录"：这里不该更新，因为实际结果未知
// 移除原来的 localStorage 更新逻辑，改为在 submitActualResult 里更新

// UI 展示改为：
userCompareHtml = `
  <div class="user-comparison">
    <div class="ucr-title">🎯 你 vs 议会倾向</div>
    <div class="ucr-agree">${agreesWithCouncil ? '✓ 与议会方向一致' : '✗ 与议会方向不同'}</div>
    <div class="ucr-note">比赛结束后录入实际比分，才能更新胜率统计</div>
  </div>`;
```

---

### 改动 G：随机"意外时刻"机制
**对应**: 失败案例3（可预测性/重复感）
**文件**: `public/app.js`（SSE 事件处理区域）

在 `handleBlackboardUpdate` 里，当 `consensusLevel` 在某一轮突变（比如从 0.3 飞升到 0.85）时触发特殊动效：

```javascript
// handleBlackboardUpdate 里：
const prevConsensus = window._prevConsensus || 0;
const newConsensus = d.blackboard?.consensusLevel || 0;
if (newConsensus - prevConsensus > 0.35) {
  triggerSignatureMoment('sudden-consensus', null, '⚡ 共识骤升！各方出乎意料地达成一致', '');
}
window._prevConsensus = newConsensus;
```

更大的"意外感"来自 agent 侧——在 `agents.mjs` 的 `runCouncil` 里：

```javascript
// vote 阶段前，有 15% 概率随机选一个 expert 发出"翻盘"提示
const hasSurprise = Math.random() < 0.15;
if (hasSurprise) {
  const surpriseAgent = EXPERTS[Math.floor(Math.random() * EXPERTS.length)];
  emit({ type: 'phase', phase: 'vote', meta: { surprise: surpriseAgent } });
  // vote directive 里加 surpriseAgent 的特殊提示：你在这轮被允许完全颠覆自己的初判
}
```

**注意**：这个改动只是触发"翻盘机会"，不强制 LLM 翻盘，LLM 自己决定。

---

### 改动 H：阶段指示器加说明 + Onboarding 引导
**对应**: 失败案例1（新用户认知断裂）
**文件**: `public/app.js`、`public/index.html`、`public/style.css`

阶段说明：
```javascript
const PHASE_DESC = {
  opening:  '议长开场，介绍今日交锋焦点',
  initial:  '5位专家独立分析，各凭私有数据',
  reaction: '分歧最大的两方互怼方法论',
  debate:   (meta) => `${AGENTS[meta?.agentA]?.name||'?'} vs ${AGENTS[meta?.agentB]?.name||'?'} 方法论碰撞`,
  vote:     '终极裁决——是否被对线内容说服？',
};
// 在 appendPhaseBanner 里追加 `.phase-desc` 行
```

Onboarding（首次访问弹窗，3步引导）：
```javascript
// init() 末尾
if (!localStorage.getItem('oracle_visited')) {
  document.getElementById('onboardingOverlay').style.display = 'flex';
}
// onbStart/onbSkip 按钮设置 oracle_visited = '1'
```

HTML（`index.html` body 末尾）：
```html
<div id="onboardingOverlay" class="onb-overlay" style="display:none">
  <div class="onb-panel">
    <div class="onb-head">🔮 欢迎来到预言者议会</div>
    <div class="onb-steps">
      <div class="onb-step">
        <div class="onb-icon">⚽</div>
        <div class="onb-title">选一场真实英超比赛</div>
        <div class="onb-desc">赔率来自 bet365，球员数据来自 FPL，历史交锋来自 football-data.org</div>
      </div>
      <div class="onb-step">
        <div class="onb-icon">🎯</div>
        <div class="onb-title">先押你的比分预测</div>
        <div class="onb-desc">议会开始前你先亮底牌——最后看是你准还是AI准</div>
      </div>
      <div class="onb-step">
        <div class="onb-icon">⚔️</div>
        <div class="onb-title">看6个AI用不同数据辩论</div>
        <div class="onb-desc">冰狗用Poisson概率，赌狗看盘口资金，碎碎念分析采访文本——方法不同，你来判断谁更可信</div>
      </div>
    </div>
    <button id="onbStart" class="onb-btn">开始观战 →</button>
    <div id="onbSkip" class="onb-skip">我已了解，跳过</div>
  </div>
</div>
```

---

### 改动 I：技术止血3件套
**文件**: `dataFetcher.mjs`、`public/app.js`、`public/style.css`

```javascript
// I-1: dataFetcher.mjs:66 - readCache 空数组防御
if (Array.isArray(data.value) && data.value.length === 0) return null;

// I-2: app.js init() 末尾 - SSE 泄漏修复
window.addEventListener('beforeunload', () => { currentEs?.close(); currentEs = null; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && currentEs) { currentEs.close(); currentEs = null; }
});
```

```css
/* I-3: style.css:211 - prob-draw 对比度修复 */
.prob-draw {
  background: linear-gradient(90deg, #7a6010 0%, #b89020 50%, #7a6010 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.15), 0 0 10px rgba(180,140,30,.35);
}
```

---

### 改动 J：色调深绿 → 深蓝 + 拔河绳概率条
**对应**: 失败案例2（视觉可信度）+ 戏剧感提升
**文件**: `public/style.css`（根变量区）、`public/index.html`（prob-bar-track）、`public/app.js`（updateProbBar）

**J-1: 色调变更**（`style.css:6-60`）：
```css
:root {
  --bg-base: #010714; --bg-panel: #020a18; --bg-card: #041020; --bg-input: #061828;
  --border: rgba(30,80,200,.12); --border-md: rgba(30,80,200,.22);
}
body { background: #010714; background-image:
  radial-gradient(ellipse 130% 45% at 50% 0%, rgba(20,60,180,.4) 0%, transparent 55%),
  radial-gradient(ellipse 140% 40% at 50% 105%, rgba(0,80,160,.2) 0%, transparent 55%); }
```

**J-2: 拔河绳**（详细实现见 v4.3，此处简写）：
- `index.html`: 用 SVG `<circle id="tugKnot">` 替换 `.prob-bar-track` 内三段条
- `app.js:updateProbBar`: `bias = home/(home+away)`，`cx = bias * 800`，`setAttribute('cx', cx)` + `tug-bounce` 动画
- SVG 渐变：主队蓝（`#0e3a7a→#2266ee`），客队红（`#cc2233→#880d18`），绳结金色（`#c8a832`）

---

### 改动 K：移动端响应式（0个断点 → 基本可用）
**文件**: `public/style.css` 末尾

```css
@media (max-width: 767px) {
  body { overflow-y: auto; }
  .game-arena { flex-direction: column; }
  #threeCanvas { display: none !important; }
  .agent-col {
    width: 100% !important; height: auto !important;
    flex-direction: row !important; overflow-x: auto;
    padding: 6px 8px; border: none !important;
    border-bottom: 1px solid var(--border) !important;
  }
  .agent-card { min-width: 130px; flex-shrink: 0; }
  .broadcast-panel { position: relative !important; height: 55vh !important; }
  .top-bar { height: 46px; }
  .tb-left { display: none; }
}
@media (min-width: 768px) and (max-width: 1023px) {
  .agent-col { width: 160px !important; }
  #threeCanvas { max-width: 400px !important; }
}
```

---

## 五、改动 × 失败案例 对应矩阵

| 改动 | 对应失败案例 | 核心收益 | 难度 | 优先级 |
|------|-----------|---------|------|--------|
| **I（止血3件套）** | 数据/成本 | 防复发/止损 | 低 | **P0 今天** |
| **B（发言卡三层）** | 案例2·缺口3 | 方法论可见 | 中 | **P1** |
| **A（准确率徽章）** | 案例2·缺口2 | 历史验证可见 | 中 | **P1** |
| **F（userCorrect修复）** | 案例5·业务bug | 语义正确 | 低 | **P1** |
| **D（今日焦点战）** | 案例6·冷启动 | 提升观看动机 | 中 | **P1** |
| **E（结果持久+CTA）** | 案例4·无纪念品 | 传播 + 闭环 | 中高 | **P2** |
| **C（Agent视觉指纹）** | 案例7·区分度 | 人设强化 | 低 | **P2** |
| **H（阶段说明+Onboarding）** | 案例1·认知断裂 | 新用户留存 | 中 | **P2** |
| **G（意外时刻机制）** | 案例3·重复感 | 重复看动力 | 高 | **P3** |
| **J（蓝色调+拔河绳）** | 案例2·缺口4 | 专业感 | 高 | **P3** |
| **K（响应式）** | 移动端不可用 | 覆盖率 | 高 | **P3** |

---

## 六、实施路线

### 第一轮（今天，2小时以内）
`I-1` → `I-2` → `I-3` → `F（userCorrect bug）`

**验收**：控制台零错误；prob-draw 金色可见；SSE 关闭正常；"你vs议会"不再说"历史胜率已更新"

### 第二轮（1-3天）
`B（方法来源标签）` → `A（准确率徽章）` → `D（今日焦点战）`

**验收**：每条发言有灰色来源行；agent 卡片显示准确率；比赛选择器有 🔥 争冠等标签

### 第三轮（3-7天）
`E（结果CTA+分享+录入）` → `C（Agent视觉指纹）` → `H（Onboarding）`

**验收**：结果页有"复制战报"/"录入比分"按钮；bc-card 左边框颜色差异明显；首次访问有引导弹窗

### 第四轮（1-2周）
`J（蓝色+拔河绳）` → `G（意外时刻）` → `K（响应式）`

---

## 七、gstack 分轮验收清单

```bash
B="/c/Users/zhuji/.claude/skills/gstack/browse/dist/browse"

# === 第一轮 ===
$B goto "http://localhost:3000"
$B console --errors
# 期望：零JS错误

$B css ".prob-draw" "background-color"
# 期望：gold系颜色 rgb(180,140,30) 附近

# 议会结束后验证 userCorrect 文案：
$B js "document.querySelector('.ucr-agree')?.textContent"
# 期望：包含"与议会方向"而非"历史胜率"

# === 第二轮 ===
$B js "document.querySelector('.bc-source-layer')?.textContent"
# 期望：包含 'Poisson' 或 '盘口' 等

$B js "document.querySelector('.ac-accuracy')?.textContent"
# 期望：有百分比或"首场预测中"

$B js "document.querySelector('.featured-banner')?.textContent"
# 期望：存在且包含比赛名（如有 stakes=title/relegation 场次）

# === 第三轮 ===
$B js "document.querySelector('.results-cta-row')?.children.length"
# 期望：3（复制/录入/重来）

$B js "document.querySelector('#onboardingOverlay')?.style.display"
# 清除 localStorage 后刷新：期望 flex

$B js "getComputedStyle(document.querySelector('.bc-card[data-agent-id=stat]')).borderLeft"
# 期望：blue系颜色

# === 第四轮 ===
$B css "body" "background-color"
# 期望：rgb(1,7,20) 附近

$B viewport 375x812
$B js "document.body.scrollWidth <= window.innerWidth"
# 期望：true
$B viewport 1280x720
```

---

## 八、不做的事（防止过度工程）

- ❌ 不加置信区间/学术统计图表（数据可见 ≠ 更学术）
- ❌ 不做 WebSocket（SSE 够用）
- ❌ 不引入前端框架（原生 JS 代码已经足够维护）
- ❌ 不强制 LLM 翻盘（意外时刻是机会，不是硬编码结果）
- ❌ 不做推送通知（"比赛结束了来录分"用 sessionStorage + 下次访问提醒即可）
- ❌ 不删弹幕梗词（娱乐属性是差异化，不是问题）

---

## 九、被推迟的战略机会（P4 后评估）

1. **API 产品化** `/docs` 页：9个结构化接口，低成本把议会引擎变成可接入数据产品
2. **多场次对比**：跑完一场后推荐今日积分差相近的另一场
3. **Three.js 升级**：`three.min.js` 换 ES Modules，r160 是最后支持版本
4. **历史预测页** `/history`：展示过往议会摘要，解决失败案例8冷启动信任问题

---

## 附：v4.0→v4.4 演变

| 版本 | 新增内容 |
|------|---------|
| v4.0 | 失败案例1+2；学术vs娱乐原则；布局重设计方案 |
| v4.1 | FPL数据完成；news bug修复；3轮gstack审查 |
| v4.2 | CSS实测值；完整代码级改动；gstack验收清单 |
| v4.3 | 合并v4.0失败分析+v4.2技术实证；统一"为什么"和"怎么做" |
| **v4.4** | **新增失败案例3-8（重复感/无纪念品/闭环断裂/冷启动/Agent区分/冷启动信任）；修复userCorrect业务bug；新增结果页CTA+分享+录入；今日焦点战；Agent视觉指纹；意外时刻机制** |

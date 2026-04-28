# 预言者议会 · v4.5 改进规划
**日期**: 2026-04-28
**基于**: v4.4已实施版本 + gstack完整走查 + 用户7条反馈
**原则**: 用户所有建议必须覆盖，只能增加和细化，不能删减

---

## 一、gstack 走查实测数据

```
走查时间: 2026-04-28
服务器: localhost:3000

布局实测（议会运行前）:
  canvas 位置: x=200, y=54, w=880, h=552（中央主区域）
  broadcast-panel: bottom=606，绝对定位覆盖在 canvas 底部
  history-feed: x=220, y=607, w=1060, h=87（控制条内部，canvas正下方）
  control-strip: h=88（feed 外层容器）

问题确认:
  问题1: localStorage已有 oracle_visited，用户首次打开后改为存在历史记录时不再弹出
  问题2: featuredMatchBanner display=block，议会全程不隐藏
  问题3: history-feed 在 y=607 处（canvas下方），形成canvas→feed→ticker三层夹层
  问题4: reaction phase 的 handleMessage 跳过 setSpeaking，3D角色不更新
  问题5: vote phase 3D场景展示角色+比分徽章但中央区域视觉表意不清
  问题6: sc-grid/sc-item 纯文字排布，无视觉设计
  问题7: head radius=0.30，body height=0.75，比例偏向 Roblox 风格
```

---

## 二、用户7条反馈的根因分析和改动方案

### 用户问题1：引导窗口没弹出来

**根因**: `localStorage.getItem('oracle_visited')` 在历史测试期间已被写入，后续刷新永远不再弹出。且用户无法主动重看引导。

**改动 U1-A：版本号机制**（防止旧key永远阻止弹出）

`public/app.js` init() 里：
```javascript
const ONBOARDING_VERSION = 'v2'; // 每次功能大改时递增
if (!localStorage.getItem(`oracle_visited_${ONBOARDING_VERSION}`)) {
  const ol = document.getElementById('onboardingOverlay');
  if (ol) ol.style.display = 'flex';
}
```

onboarding 关闭按钮改为：
```javascript
onclick="localStorage.setItem('oracle_visited_v2','1');this.closest('.onb-overlay').style.display='none'"
```

**改动 U1-B：控制条加"重看引导"入口**

在 `index.html` 控制条的 info 按钮旁加：
```html
<button class="info-toggle" onclick="showOnboarding()" title="什么是议会？">❓</button>
```

`app.js` 加：
```javascript
function showOnboarding() {
  const ol = document.getElementById('onboardingOverlay');
  if (ol) ol.style.display = 'flex';
}
```

---

### 用户问题2：今日焦点全程显示影响观看

**根因**: `startCouncil()` / `disableControls()` 里没有隐藏 `featuredMatchBanner`；`resetCouncil()` 里没有恢复它。

**改动 U2：在 startCouncil 隐藏 banner，resetCouncil 恢复**

`public/app.js`，`disableControls` 函数里追加：
```javascript
document.getElementById('featuredMatchBanner')?.style.setProperty('display', 'none');
```

`resetCouncil` 里追加：
```javascript
// 恢复 featured banner（如果仍有焦点赛事）
const banner = document.getElementById('featuredMatchBanner');
if (banner && banner.textContent.trim()) banner.style.display = 'block';
```

---

### 用户问题3：议事厅和对话框之间的历史记录夹层多余

**根因分析**:
- DOM 结构：`canvas(h=552)` → `history-feed(h=87, y=607)` → `live-ticker(26px)`
- `history-feed` 作为横向滚动的文字流夹在 3D 场景和 ticker 之间
- broadcast-panel 已经完整展示了对话内容，feed 的文字流是重复信息
- 视觉上：3D 场景 → 黑色文字区（feed）→ ticker，三层叠加，信息密度过高且杂乱

**改动 U3：将 history-feed 从控制条移出，改为 broadcast 内的滚动历史**

方案：完全删除控制条内的 `#feed` 显示，在广播区内部的 broadcast-panel 追加历史记录模式。

`public/index.html`，删除 `<div class="history-feed" id="feed"></div>`

在 broadcast-panel 区域下方加折叠历史：
```html
<div id="historyFeedCollapse" class="hf-collapse">
  <div class="hf-toggle" onclick="toggleHistoryFeed()">📜 对话历史 <span id="hfCount">0</span>条</div>
  <div id="feed" class="hf-inner" style="display:none"></div>
</div>
```

CSS：
```css
.hf-collapse { position:relative; z-index:25; background:rgba(1,7,20,.9); border-top:1px solid var(--border); }
.hf-toggle { font-size:11px; color:var(--text-dim); padding:4px 12px; cursor:pointer; }
.hf-toggle:hover { color:var(--text-sub); }
.hf-inner { max-height:120px; overflow-y:auto; padding:0 8px 8px; }
```

`app.js` 加：
```javascript
function toggleHistoryFeed() {
  const f = document.getElementById('feed');
  if (!f) return;
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}
// 每次 addHistoryItem 后更新计数
function updateHistoryCount() {
  const c = document.getElementById('hfCount');
  if (c) c.textContent = document.querySelectorAll('#feed .history-item').length;
}
// 在 addHistoryItem 末尾调用: updateHistoryCount();
```

同时修复 `.control-strip` 的 CSS，去掉 `history-feed` 占据的空间：
```css
.control-strip { height: 54px !important; } /* 从88px压缩 */
```

---

### 用户问题4：初判末轮和对线时发言者与议事厅角色不对应

**根因**: `handleMessage` 里 `reaction` 阶段被排除在 `setSpeaking` 调用之外：
```javascript
// 当前代码（有问题）：
if (data.phase !== 'reaction') {
  setSpeaking(data.agentId, false);
}
```

`reaction` phase 消息到达时 3D 场景不更新 → 3D 还停留在上一个发言者。

**改动 U4：所有 phase 都触发 setSpeaking，包括 reaction**

`public/app.js:1391`：
```javascript
// 修改：reaction 也触发 3D 更新，确保角色和对话框始终对应
setSpeaking(data.agentId, false);
// 删除原来的 if (data.phase !== 'reaction') 包裹
```

同时修复 debate 阶段的摄像机更新时机：确保 `thinking` 事件和 `message` 事件都会更新 3D 焦点。验证：debate 轮时广播卡 agent 名 === 3D 场景高亮 agent。

---

### 用户问题5：终投中间的显示看不清是什么意思

**根因分析**:
- vote 阶段 broadcast panel 正常显示发言
- 但 3D 场景中央区域：5个 agent 轮流发言时，中间区域显示的是所有 agent 的比分徽章（1-2, 2-1 等）
- 概率条（拔河绳）在 vote 阶段更新但动作幅度可能不大
- "中间的显示" = 议事厅内部 3D 场景中央的 vs 面板 / 比分面板视觉表意不清

**改动 U5-A：vote 阶段在 broadcast panel 加醒目的"终投计数器"**

在 vote 阶段的 `appendPhaseBanner` 之后，在 broadcast 上方加实时投票计数：
```html
<!-- vote 阶段显示 -->
<div id="voteTally" class="vote-tally" style="display:none">
  <span id="vtHome" class="vt-item vt-home">🏠 0票</span>
  <span id="vtDraw" class="vt-item vt-draw">⚖️ 0票</span>
  <span id="vtAway" class="vt-item vt-away">✈️ 0票</span>
</div>
```

每个 vote phase message 后更新：
```javascript
if (data.phase === 'vote' && data.structured?.winner) {
  document.getElementById('voteTally').style.display = 'flex';
  const votes = { home:0, draw:0, away:0 };
  Object.values(agentsVoted).forEach(v => votes[v] = (votes[v]||0) + 1);
  document.getElementById('vtHome').textContent = `🏠 ${votes.home}票`;
  document.getElementById('vtDraw').textContent = `⚖️ ${votes.draw}票`;
  document.getElementById('vtAway').textContent = `✈️ ${votes.away}票`;
}
```

CSS：
```css
.vote-tally { display:flex; justify-content:center; gap:20px; padding:6px 12px; background:rgba(200,168,50,.08); border-top:1px solid var(--border-gold); font-size:14px; font-weight:900; }
.vt-home { color:#60a5fa; }
.vt-draw { color:var(--gold-bright); }
.vt-away { color:#f87171; }
```

**改动 U5-B：拔河绳在 vote 阶段 高亮显示当前领先方向**

vote 阶段每次更新后，根据 `home > away + 5` 或 `away > home + 5` 给绳结添加脉冲高亮。

---

### 用户问题6：终投结果界面每个角色预测的剧本直接放字不好看

**根因**: 当前 `sc-grid` 是简单的左边框+名字+文字，缺少视觉层次和电影感。

**改动 U6：五种剧本改为"分镜卡片"样式**

重新渲染 `scHtml`（`app.js:handleSummary` 的 `scHtml` 部分）：

```javascript
const scHtml = sessionScenes.length ? `
  <div class="scene-compare">
    <div class="sc-title">🎬 五种结局剧本</div>
    <div class="sc-cards">
      ${sessionScenes.map(sc => `
        <div class="sc-card" style="--sc-color:${sc.cssColor}">
          <div class="sc-card-header">
            <span class="sc-card-icon">${AGENTS[sc.agentId]?.icon||'?'}</span>
            <span class="sc-card-name" style="color:${sc.cssColor}">${escapeHtml(sc.name)}</span>
            <span class="sc-card-label">${AGENT_METHOD_LABEL[sc.agentId]||''}</span>
          </div>
          <div class="sc-card-scene">${escapeHtml(sc.text)}</div>
        </div>`).join('')}
    </div>
  </div>` : '';
```

CSS：
```css
.sc-cards { display:flex; flex-direction:column; gap:8px; }
.sc-card {
  border-left:3px solid var(--sc-color);
  border-radius:0 6px 6px 0;
  background:linear-gradient(90deg, rgba(var(--sc-color-rgb),.08) 0%, transparent 60%);
  padding:8px 10px;
  overflow:hidden;
}
.sc-card-header { display:flex; align-items:center; gap:6px; margin-bottom:5px; }
.sc-card-icon { font-size:16px; }
.sc-card-name { font-size:12px; font-weight:800; }
.sc-card-label { font-size:9px; color:var(--text-dim); margin-left:auto; }
.sc-card-scene {
  font-size:12px; color:var(--text-sub); line-height:1.55;
  font-style:italic;
  border-top:1px solid rgba(255,255,255,.06);
  padding-top:5px; margin-top:2px;
}
```

金句墙（catchphrase-wall）也同步优化——改为横向滚动时间轴样式：
```css
.catchphrase-wall { overflow-x:auto; }
.cw-item { min-width:200px; flex-shrink:0; }
```

---

### 用户问题7：议事厅的 Agent 形象进一步优化

**根因**: 当前参数：head radius=0.30，torso height=0.75，head/total height ≈ 1/4 → 比例偏矮胖。canvas sprite 的外观已有基础但细节不足。

**改动 U7-A：修正人体比例**

`public/scene3d.js`，`makeThrone` 函数里的人体参数：

```javascript
// 当前（Roblox 比例）
const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.75, 8), ...);
torso.position.y = 1.25;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 16, 12), ...);
head.position.y = 1.88;

// 修改后（更接近真实比例：头小身长）
const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.0, 10), ...); // 躯干更高更细
torso.position.y = 1.5;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), ...); // 头更小更精细
head.position.y = 2.22;
// 腿部也相应延长
```

**改动 U7-B：canvas sprite 增加职业特征细节**

每个 agent 的 canvas sprite (`makeAgentSprite`) 加独特职业道具：

```javascript
// 冰狗(stat): 大框眼镜 + 连帽衫 + 手持平板
if (id === 'stat') {
  // 画眼镜
  ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx-18, eyeY, 14, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx+18, eyeY, 14, 0, Math.PI*2); ctx.stroke();
  ctx.moveTo(cx-4, eyeY); ctx.lineTo(cx+4, eyeY); ctx.stroke(); // 鼻梁
}
// 赌狗(gambler): 墨镜 + 西装领带
if (id === 'gambler') {
  ctx.fillStyle = '#111'; ctx.fillRect(cx-22, eyeY-8, 18, 10, 4);
  ctx.fillRect(cx+4, eyeY-8, 18, 10, 4); // 墨镜
  // 领带
  ctx.fillStyle = '#34d399';
  ctx.beginPath(); ctx.moveTo(cx, shoulderY+5); ctx.lineTo(cx-8, shoulderY+50); ctx.lineTo(cx+8, shoulderY+50); ctx.closePath(); ctx.fill();
}
// 月影姐(mystic): 月亮发饰 + 紫色渐变
if (id === 'mystic') {
  ctx.fillStyle = '#a78bfa';
  ctx.beginPath(); ctx.arc(cx+headR*0.8, headY-headR*1.1, 12, 0, Math.PI*2); ctx.fill(); // 月亮装饰
}
// 碎碎念(psych): 耳机
if (id === 'psych') {
  ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, headY, headR+8, Math.PI*1.1, Math.PI*1.9); ctx.stroke();
  ctx.fillStyle = '#67e8f9'; ctx.beginPath(); ctx.arc(cx-headR-8, headY, 7, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+headR+8, headY, 7, 0, Math.PI*2); ctx.fill();
}
// 老球迷(history): 围巾 + 粗眉
if (id === 'history') {
  ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(cx-30, shoulderY+20); ctx.quadraticCurveTo(cx, shoulderY+60, cx+30, shoulderY+20); ctx.stroke();
}
```

**改动 U7-C：发言时有嘴部动画**

用 morphTarget 替代效果：每次发言时，对应 agent 的 canvas sprite 定时切换张嘴/闭嘴状态（重新生成 sprite texture，约每 200ms 一次，持续到发言结束）：

```javascript
let speakAnimTimer = null;
function startSpeakAnim(id) {
  stopSpeakAnim();
  let open = false;
  speakAnimTimer = setInterval(() => {
    open = !open;
    regenerateSpriteWithMouth(id, open);
  }, 180);
}
function stopSpeakAnim() {
  if (speakAnimTimer) { clearInterval(speakAnimTimer); speakAnimTimer = null; }
}
// 在 setSpeaking(id) 调用时同步触发
```

**改动 U7-D：idle 动作**

议事厅内非发言的 agent 加轻微的呼吸/晃动动作：

```javascript
// 在 animate 循环里（已有），针对非发言 agent：
AGENT_ORDER.forEach(id => {
  const n = nodes[id];
  if (!n || id === currentSpeakerId) return;
  // 轻微上下浮动（呼吸感）
  n.g.position.y = Math.sin(clock.getElapsedTime() * 0.8 + n.angle) * 0.03;
});
```

---

## 三、v4.4 剩余项（继承自上轮，未完成的）

| 项目 | 来源 | 状态 | 说明 |
|------|------|------|------|
| agent-col CSS 双重定义清理 | v4.2 M1 | 待完成 | 两处 width 定义（122px + 148px!important） |
| FPL 失败无降级提示 | v4.2 H3 | 待完成 | xg_note/news 全"暂无"用户不知原因 |
| 历史预测页 `/history` | v4.4 P4 | 待完成 | 解决冷启动信任问题（FA8） |
| API 产品化 `/docs` | v4.4 P4 | 待完成 | 9个接口加文档展示 |
| Three.js 升级 ES modules | v4.4 P4 | 待完成 | r160 最后一个支持版本 |

---

## 四、完整改动优先级矩阵（含用户7条+v4.4继承项）

| 编号 | 改动 | 来源 | 难度 | 影响 | 优先级 |
|------|------|------|------|------|--------|
| U1 | 引导窗口版本号+重看按钮 | 用户反馈1 | 低 | 高 | **P0** |
| U2 | 焦点banner议会中隐藏 | 用户反馈2 | 极低 | 高 | **P0** |
| U4 | reaction phase setSpeaking修复 | 用户反馈4 | 低 | 高 | **P0** |
| U3 | 历史记录夹层重构 | 用户反馈3 | 中 | 高 | **P1** |
| U5 | 终投投票计数器+拔河绳高亮 | 用户反馈5 | 中 | 中 | **P1** |
| U6 | 剧本展示分镜卡片重设计 | 用户反馈6 | 中 | 中 | **P1** |
| U7-A | Agent体型比例修正 | 用户反馈7 | 中 | 中 | **P2** |
| U7-B | Agent职业道具绘制 | 用户反馈7 | 高 | 高 | **P2** |
| U7-C | 发言嘴部动画 | 用户反馈7 | 高 | 中 | **P2** |
| U7-D | Idle呼吸动作 | 用户反馈7 | 中 | 中 | **P2** |
| V44-1 | CSS双重定义清理 | v4.2继承 | 低 | 低 | **P1** |
| V44-2 | FPL失败降级提示 | v4.2继承 | 低 | 中 | **P1** |
| V44-3 | 历史预测页 | v4.4继承 | 高 | 中 | **P3** |
| V44-4 | API文档页 | v4.4继承 | 高 | 低 | **P3** |
| V44-5 | Three.js升级 | v4.4继承 | 高 | 低 | **P3** |

---

## 五、实施路线

### 第一轮（今天，约1-2小时）— P0

```
U1 → U2 → U4
```

**U1**: `app.js init()` 改用 `oracle_visited_v2`；加 `showOnboarding()` 函数；`index.html` 加 ❓ 按钮
**U2**: `disableControls()` 里隐藏 banner；`resetCouncil()` 里恢复
**U4**: `handleMessage` 删除 `if (data.phase !== 'reaction')` 条件

验收：
- 清除 localStorage 后刷新 → onboarding 显示
- 点 ❓ 按钮 → onboarding 显示
- 召开议会 → banner 消失；结束 → banner 恢复
- reaction 发言时 3D 场景对应 agent 高亮

### 第二轮（1-2天）— P1

```
U3（历史夹层）→ U5（投票计数）→ U6（分镜卡片）→ V44-1（CSS清理）→ V44-2（FPL降级）
```

U3 实施步骤：
1. 从 `index.html` 删除 `.control-strip` 内的 `<div class="history-feed" id="feed">`
2. 在 broadcast panel 下方新增 `.hf-collapse` 折叠历史
3. 把 `#feed` 移入 `.hf-inner`
4. `control-strip` CSS height 从 88px 改为 54px
5. `addHistoryItem` 末尾加 `updateHistoryCount()`

验收：
- 议事厅到底部滚动条之间不再有文字夹层
- 底部"📜 对话历史 N条"可点击展开
- vote phase 时 broadcast 上方出现投票计数

### 第三轮（3-7天）— P2

```
U7-A（体型比例）→ U7-B（职业道具）→ U7-C（嘴部动画）→ U7-D（idle动作）
```

U7-B 实施顺序：stat → gambler → mystic → psych → history（各约30分钟，逐个调试截图验证）

### 第四轮（1-2周）— P3

```
V44-3（历史页）→ V44-4（API文档）→ V44-5（Three.js升级）
```

---

## 六、gstack 验收清单（每轮后跑）

```bash
B="/c/Users/zhuji/.claude/skills/gstack/browse/dist/browse"

# === 第一轮 P0 验收 ===
# U1-a: 清除 localStorage 后 onboarding 弹出
$B js "localStorage.removeItem('oracle_visited_v2')"
$B reload
$B js "getComputedStyle(document.getElementById('onboardingOverlay')).display"
# 期望: flex

# U1-b: ❓ 按钮存在
$B js "!!document.querySelector('[title=\"什么是议会？\"]')"
# 期望: true

# U2: 议会期间 banner 隐藏
# 召开议会后：
$B js "document.getElementById('featuredMatchBanner')?.style?.display"
# 期望: none

# U4: reaction 发言时 3D agent 更新
# 在 reaction 发言时：
$B js "document.querySelector('.agent-card.speaking')?.id"
# 期望: 等于当前 bc-card 的 data-agent-id

# === 第二轮 P1 验收 ===
# U3: 控制条无夹层
$B js "document.querySelector('.control-strip .history-feed') === null"
# 期望: true（history-feed 不在 control-strip 直接子元素里）

$B js "!!document.querySelector('.hf-collapse')"
# 期望: true（折叠历史存在）

# 控制条高度
$B css ".control-strip" "height"
# 期望: 约54px

# U5: vote phase 投票计数器
# vote 阶段后：
$B js "document.getElementById('voteTally')?.style?.display"
# 期望: flex

# U6: 分镜卡片
$B js "!!document.querySelector('.sc-card')"
# 期望: true（在结果页上）

# === 第三轮 P2 验收 ===
# U7-A: 体型比例 - 截图目视确认
$B screenshot /tmp/agent-proportion.png
# 对比：头部大小相对躯干应明显改善

# U7-B/C: 职业道具 + 嘴动画
$B screenshot /tmp/agents-speaking.png
# 目视确认：发言时角色有嘴部动态
```

---

## 七、不做的事

- ❌ 不删除 broadcast-panel 的三层发言结构（已实现且效果好）
- ❌ 不减少 onboarding 步骤（3步是合理的信息量）
- ❌ 不改变 agent 颜色体系（已有辨识度）
- ❌ 不引入骨骼动画库（Three.js 内置的简单变换足够）
- ❌ 不做 VTuber 级别的 3D 人形（成本太高，与产品定位不符）

---

## 附：v4.0→v4.5 演变

| 版本 | 新增核心 |
|------|---------|
| v4.0 | 失败案例1+2；学术vs娱乐原则 |
| v4.1 | FPL数据完成 |
| v4.2 | gstack实测CSS值；技术债清单 |
| v4.3 | 合并失败案例+技术实证 |
| v4.4 | 8个失败案例；结果CTA；今日焦点；意外时刻；拔河绳；深蓝色 |
| **v4.5** | **用户7条实测反馈（onboarding/banner/夹层/角色对应/终投/剧本/形象）；gstack全程走查取证；所有建议均已覆盖** |

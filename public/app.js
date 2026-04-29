const AGENTS = {
  stat:      { name:'Dr.冰狗',  icon:'📊', color:'var(--stat)',      cssColor:'#60a5fa', title:'数据帝' },
  mystic:    { name:'月影姐',   icon:'🔮', color:'var(--mystic)',    cssColor:'#a78bfa', title:'玄学博主' },
  history:   { name:'老球迷',   icon:'📜', color:'var(--history)',   cssColor:'#fbbf24', title:'历史区元老' },
  gambler:   { name:'赌狗本狗', icon:'🎰', color:'var(--gambler)',   cssColor:'#34d399', title:'盘口派' },
  psych:     { name:'碎碎念',   icon:'🧠', color:'var(--psych)',     cssColor:'#67e8f9', title:'心理观察员' },
  moderator: { name:'议长',     icon:'⚖️', color:'var(--moderator)', cssColor:'#f0c040', title:'主播' },
};

// ── 球队球星映射（英超 2025-26） ───────────────────────────────
const TEAM_STARS = {
  '阿森纳':     ['萨卡','厄德高','赖斯'],
  '切尔西':     ['帕尔默','凯塞多','杰克逊'],
  '曼城':       ['哈兰德','德布劳内','福登'],
  '利物浦':     ['萨拉赫','范戴克','努涅斯'],
  '曼联':       ['拉什福德','布鲁诺','霍伊隆德'],
  '热刺':       ['孙兴慜','麦迪逊'],
  '纽卡斯尔':   ['伊萨克','戈登','特里皮尔'],
  '阿斯顿维拉': ['沃特金斯','迪亚比'],
  '诺丁汉森林': ['伍德','吉布斯怀特','埃兰加'],
  '桑德兰':     ['斯图尔特','罗伯茨'],
  '富勒姆':     ['帕利尼亚'],
  '水晶宫':     ['萨拉'],
  '西汉姆':     ['帕奎塔'],
  '狼队':       ['门多萨'],
  '布莱顿':     ['三笘薫'],
  '布伦特福德': ['托尼'],
};
const GLOBAL_STARS_FALLBACK = ['萨拉赫','哈兰德','萨卡','帕尔默','维尼修斯','姆巴佩'];

async function initPlayerBanners(match) {
  try {
    const homeStars = TEAM_STARS[match.home] || [];
    const awayStars = TEAM_STARS[match.away] || [];
    const players = [];
    for (let i = 0; i < 3; i++) {
      if (homeStars[i]) players.push({ name: homeStars[i], color: '#4a9eff', side: 'home' });
      if (awayStars[i]) players.push({ name: awayStars[i], color: '#ff4455', side: 'away' });
    }
    while (players.length < 6) {
      players.push({ name: GLOBAL_STARS_FALLBACK[players.length % GLOBAL_STARS_FALLBACK.length], color: '#c8a832', side: 'neutral' });
    }
    const withPhotos = await Promise.all(players.slice(0,6).map(async p => ({
      ...p, photoUrl: await fetchWikiPhoto(p.name)
    })));
    window.Scene3D?.loadPlayerBanners?.(withPhotos);
  } catch(e) { console.warn('[playerBanners]', e.message); }
}

const PHASE_LABELS = { opening:'开场', initial:'初判', debate:'对线', vote:'终投' };
const PHASE_FULL   = { opening:'开  场', initial:'初  判', debate:'对  线', vote:'终  投' };
const PHASES_ORDER = ['opening','initial','debate','vote'];

// B: 方法来源标签
const AGENT_METHOD_LABEL = {
  stat:      'Poisson · football-data进失球',
  gambler:   '跨平台盘口 · the-odds-api赔率',
  history:   '历史情景 · football-data H2H',
  psych:     '语义分析 · FPL球员状态',
  mystic:    '舆情叙事 · 市场情绪',
  moderator: '综合裁判',
};

// N3/F3: Agent 卡片空闲态：方法简介
const AGENT_METHOD_SHORT = {
  stat:      'Poisson 概率模型',
  gambler:   '跨平台盘口套利',
  history:   '历史情景匹配',
  psych:     '行为语言分析',
  mystic:    '社交叙事检测',
  moderator: '综合裁判',
};
const AGENT_BLIND_SPOT = {
  stat:      '盲点：不信心理因素',
  gambler:   '盲点：过度解读异动',
  history:   '盲点：确认偏误',
  psych:     '盲点：过度拟人化',
  mystic:    '盲点：为逆向而逆向',
  moderator: '—',
};

// N4/F4: 议会进度追踪
let councilProgressState = { phase: null, done: 0, total: 5 };

// N13: LocalStorage 本地战绩
const LS_KEY = 'oracle_council_history';
function loadLocalHistory() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function saveLocalHistory(entry) {
  try {
    const h = loadLocalHistory();
    h.unshift(entry);
    localStorage.setItem(LS_KEY, JSON.stringify(h.slice(0, 50)));
  } catch {}
}

// D: 比赛重要性分级（焦点战排序）
const STAKES_ORDER = { title: 0, relegation: 1, top4: 2, mixed: 3, mid: 4 };
const STAKES_BADGE = { title:'🔥 争冠', relegation:'⚠️ 保级', top4:'🌟 争四', mixed:'↕️ 上下', mid:'' };

// H: 阶段说明文字
const PHASE_DESC = {
  opening:  '议长开场，介绍今日交锋焦点',
  initial:  '5位专家独立分析，各凭私有数据',
  reaction: '分歧最大的两方互怼方法论',
  vote:     '终极裁决——是否被对线说服？',
};

let allMatches=[], currentMatchData=null, currentEs=null;
let sessionCatchphrases=[], sessionScenes=[];
let userPrediction=null, selectedPick=null;
let agentAccuracyProfiles = {};
let userScore = { home: 0, away: 0 };  // 用户比分预测
let agentPredictedScores = {};          // 各 agent 初判比分
let isDraggingMarker = false;
let predictionHistory = [];
let probState={ homeW:0, drawW:0, awayW:0, home:33, draw:34, away:33, count:0 };
let agentsVoted={};
let currentBlackboard=null;
let seedsPollTimer=null;
let ebInitialized = false;
let prevPivotCount = 0;
let fullConsensusTriggered = false;
let smTimeout = null;
let splitScreenActive = false;
let ssAgentA = null, ssAgentB = null;
let ssCurrentRound = 0;

// ── Wikipedia player photo map ────────────────────────────
const PLAYER_WIKI = {
  // === 英超球星 ===
  // Arsenal
  '萨卡':       'Bukayo Saka',
  '小白':       'Bukayo Saka',
  '厄德高':     'Martin Ødegaard',
  '哈弗茨':     'Kai Havertz',
  '赖斯':       'Declan Rice',
  '杰西卡':     'Declan Rice',
  '马丁内利':   'Gabriel Martinelli',
  '加布里埃尔': 'Gabriel Magalhães',
  '怀特':       'Ben White',
  '拉亚':       'David Raya',
  '特罗萨尔德': 'Leandro Trossard',
  // Chelsea
  '帕尔默':     'Cole Palmer',
  '杰克逊':     'Nicolas Jackson',
  '凯塞多':     'Moisés Caicedo',
  '加拉格尔':   'Conor Gallagher',
  '菲利克斯':   'João Félix',
  // Man City
  '哈兰德':     'Erling Haaland',
  '德布劳内':   'Kevin De Bruyne',
  '福登':       'Phil Foden',
  '贝尔纳多':   'Bernardo Silva',
  '埃德森':     'Ederson',
  '斯通斯':     'John Stones',
  '沃克':       'Kyle Walker',
  // Liverpool
  '萨拉赫':     'Mohamed Salah',
  '努涅斯':     'Darwin Núñez',
  '范戴克':     'Virgil van Dijk',
  '阿利松':     'Alisson Becker',
  '迪亚斯':     'Luis Díaz',
  '绍博斯劳伊': 'Dominik Szoboszlai',
  '特伦特':     'Trent Alexander-Arnold',
  '麦卡利斯特': 'Alexis Mac Allister',
  '格拉文贝赫': 'Ryan Gravenberch',
  // Spurs
  '孙兴慜':     'Son Heung-min',
  '麦迪逊':     'James Maddison',
  '里沙利松':   'Richarlison',
  // Man Utd
  '拉什福德':   'Marcus Rashford',
  '布鲁诺':     'Bruno Fernandes',
  '霍伊隆德':   'Rasmus Højlund',
  '奥纳纳':     'André Onana',
  // Newcastle
  '伊萨克':     'Alexander Isak',
  '戈登':       'Anthony Gordon',
  '特里皮尔':   'Kieran Trippier',
  // Aston Villa
  '沃特金斯':   'Ollie Watkins',
  '迪亚比':     'Moussa Diaby',
  '麦金':       'John McGinn',
  // Nottingham Forest
  '阿沃尼伊':   'Taiwo Awoniyi',
  '埃兰加':     'Anthony Elanga',
  '伍德':       'Chris Wood',
  '吉布斯怀特': 'Morgan Gibbs-White',
  // Sunderland
  '斯图尔特':   'Ross Stewart',
  '罗伯茨':     'Patrick Roberts',
  // Fulham
  '帕利尼亚':   'João Palhinha',
  // 通用/历史球星
  '卡塞米罗':   'Casemiro',
  '凯恩':       'Harry Kane',
  '贝林厄姆':   'Jude Bellingham',
  '萨拉':       'Mohamed Salah',
  // === 其他欧洲顶级联赛 ===
  '梅西':       'Lionel Messi',
  '维尼修斯':   'Vinícius Júnior',
  '姆巴佩':     'Kylian Mbappé',
  '罗德里戈':   'Rodrygo Goes',
  '劳塔罗':     'Lautaro Martínez',
  '迪巴拉':     'Paulo Dybala',
  '格列兹曼':   'Antoine Griezmann',
  '卡马文加':   'Eduardo Camavinga',
  '亚马尔':     'Lamine Yamal',
  '佩德里':     'Pedri',
  '莫拉塔':     'Álvaro Morata',
  'C罗':        'Cristiano Ronaldo',
  '穆西亚拉':   'Jamal Musiala',
  '维尔茨':     'Florian Wirtz',
  '诺伊尔':     'Manuel Neuer',
  '加克波':     'Cody Gakpo',
  '邓弗里斯':   'Denzel Dumfries',
  '范戴克':     'Virgil van Dijk',
};

const photoCache = {};

async function fetchWikiPhoto(name) {
  if (name in photoCache) return photoCache[name];
  const title = PLAYER_WIKI[name];
  if (!title) return (photoCache[name] = null);
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=700&format=json&origin=*`;
    const data = await fetch(url, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
    const page = Object.values(data?.query?.pages || {})[0];
    return (photoCache[name] = page?.thumbnail?.source || null);
  } catch { return (photoCache[name] = null); }
}

// ── Hero reveal queue system ──────────────────────────────
const heroQueue = [];
let heroActive = false;
let heroHideTimer = null;
const HERO_DISPLAY_MS = 5500;

function queueHero(playerName, actionText, agentId) {
  heroQueue.push({ playerName, actionText, agentId });
  if (!heroActive) drainHeroQueue();
}

function queueHeroAgent(agentId, text, fromAgentId) {
  heroQueue.push({ playerName: null, agentId, text, agentIdFrom: fromAgentId, isAgentHero: true });
  if (!heroActive) drainHeroQueue();
}

async function drainHeroQueue() {
  if (!heroQueue.length) { heroActive = false; return; }
  heroActive = true;
  const item = heroQueue.shift();
  if (item.isAgentHero) {
    showAgentHero(item.agentId, item.text);
  } else {
    const { playerName, actionText, agentId } = item;
    showHero(playerName, actionText, agentId);
    fetchWikiPhoto(playerName).then(photoUrl => {
      const img = document.getElementById('hrPhoto');
      const el  = document.getElementById('heroReveal');
      if (photoUrl && img && el?.classList.contains('active')) {
        img.onload = () => img.classList.remove('loading');
        img.src = photoUrl;
      }
    });
    triggerVideoGeneration(playerName, actionText);
  }
  heroHideTimer = setTimeout(() => {
    hideHero();
    setTimeout(drainHeroQueue, 400);
  }, HERO_DISPLAY_MS);
}

function showAgentHero(agentId, text) {
  // agent 作为 hero 时不显示面板（避免空白框），交给 speakerHud 处理
  return;
  const agent = AGENTS[agentId] || { name: agentId, icon: '?', cssColor: '#888', title: '' };
  const el = document.getElementById('heroReveal');
  if (!el) return;
  el.style.setProperty('--hr-color', agent.cssColor);

  const img = document.getElementById('hrPhoto');
  if (img) { img.src = ''; img.classList.add('loading'); }

  // 背景色
  const bgEl = document.getElementById('hrTeamBg');
  if (bgEl) bgEl.style.background = `linear-gradient(160deg, ${agent.cssColor}55 0%, #020610 60%)`;

  // 显示 agent 大图标（作为英雄）
  const crestEl = document.getElementById('hrTeamCrest');
  if (crestEl) {
    crestEl.style.display = 'none';
    crestEl.src = '';
  }

  const hrName = document.getElementById('hrName');
  const hrAction = document.getElementById('hrAction');
  const hrPhase = document.getElementById('hrPhase');
  const hrTag = document.getElementById('hrAgentTag');
  const hrVideoWrap = document.getElementById('hrVideoWrap');

  if (hrName) {
    hrName.innerHTML = `<span style="font-size:36px;display:block;margin-bottom:4px">${agent.icon}</span>${agent.name}`;
  }
  if (hrAction) hrAction.textContent = text?.slice(0, 55) || '';
  if (hrPhase) hrPhase.textContent = '🎙️ 分析师发言';
  if (hrTag) hrTag.textContent = agent.title;
  if (hrVideoWrap) hrVideoWrap.innerHTML = '';

  el.classList.add('active');
  el.onclick = () => {
    clearTimeout(heroHideTimer);
    hideHero();
    heroQueue.length = 0;
    heroActive = false;
  };
}

function showHero(name, action, agentId) {
  const agent = AGENTS[agentId] || { name: agentId, icon: '?', cssColor: '#888' };
  const el = document.getElementById('heroReveal');
  if (!el) return;
  el.style.setProperty('--hr-color', agent.cssColor);

  const img = document.getElementById('hrPhoto');
  if (img) { img.src = ''; img.classList.add('loading'); }

  // 显示球队队徽（根据球员所属球队判断）
  const m = currentMatchData;
  const crestEl = document.getElementById('hrTeamCrest');
  if (crestEl && m) {
    // 简单判断：球员名出现在哪支球队相关内容里
    const inHome = (m.briefing?.homeForm || '').includes(name) || (m.home || '').includes(name);
    const crestUrl = inHome ? m.homeCrest : (m.awayCrest || m.homeCrest || '');
    if (crestUrl) { crestEl.src = crestUrl; crestEl.style.display = 'block'; }
    else { crestEl.style.display = 'none'; }
  }

  // 球队背景色
  const bgEl = document.getElementById('hrTeamBg');
  if (bgEl) bgEl.style.background = `linear-gradient(160deg, ${agent.cssColor}44 0%, #020610 65%)`;

  const get = id => document.getElementById(id);
  const hrName = get('hrName');
  const hrAction = get('hrAction');
  const hrPhase = get('hrPhase');
  const hrTag = get('hrAgentTag');
  const hrVideoWrap = get('hrVideoWrap');
  if (hrName) hrName.textContent = name;
  if (hrAction) hrAction.textContent = action?.slice(0, 60) || '';
  if (hrPhase) hrPhase.textContent = '⚡ 关键球员预言';
  if (hrTag) hrTag.textContent = `${agent.icon} ${agent.name} 的预言`;
  if (hrVideoWrap) hrVideoWrap.innerHTML = '';

  el.classList.add('active');
  el.onclick = () => {
    clearTimeout(heroHideTimer);
    hideHero();
    heroQueue.length = 0;
    heroActive = false;
  };
}

function hideHero() {
  document.getElementById('heroReveal')?.classList.remove('active');
}

async function triggerVideoGeneration(playerName, actionText) {
  try {
    const res = await fetch('/api/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName, actionDesc: actionText }),
    });
    const data = await res.json();
    if (data.video) {
      const el = document.getElementById('heroReveal');
      if (!el?.classList.contains('active')) return;
      const wrap = document.getElementById('hrVideoWrap');
      if (wrap) {
        wrap.innerHTML = `<video autoplay loop muted playsinline src="${escapeHtml(data.video)}"></video>`;
      }
      clearTimeout(heroHideTimer);
      heroHideTimer = setTimeout(() => { hideHero(); setTimeout(drainHeroQueue, 400); }, 5000);
    }
  } catch { /* no HF token — silent */ }
}

// ── 准确率数据加载 ────────────────────────────────────────
async function fetchAccuracyProfiles() {
  try {
    agentAccuracyProfiles = await fetch('/api/memory/profiles').then(r => r.json());
  } catch { /* silent fail */ }
}

// ── Init ─────────────────────────────────────────────────
async function init() {
  injectOverlays();
  buildAgentColumns();
  buildCouncilSeats();
  const canvas = document.getElementById('threeCanvas');
  if (canvas && window.THREE && window.Scene3D) Scene3D.init(canvas);
  await Promise.all([loadMatches(), fetchAccuracyProfiles()]);
  // N9: 初始化命中率显示
  renderHomepageHitRate();
  // F5: 空闲状态概率条提示
  setProbBarIdleHint(true);

  // I-2: SSE 页面关闭时主动断开，防止服务端 token 泄漏
  window.addEventListener('beforeunload', () => { currentEs?.close(); currentEs = null; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentEs) { currentEs.close(); currentEs = null; }
  });

  // U1: Onboarding — 版本号机制，大改动时递增版本使其再次弹出
  const ONBOARDING_VER = 'oracle_visited_v3';
  if (!localStorage.getItem(ONBOARDING_VER)) {
    const ol = document.getElementById('onboardingOverlay');
    if (ol) ol.style.display = 'flex';
  }
}

function showOnboarding() {
  const ol = document.getElementById('onboardingOverlay');
  if (ol) ol.style.display = 'flex';
}

function updateHistoryCount() { /* no-op, retained for compatibility */ }

// ── Agent column cards ────────────────────────────────────
const LEFT_AGENTS  = ['stat', 'mystic', 'history'];
const RIGHT_AGENTS = ['gambler', 'psych', 'moderator'];

function buildAgentColumns() {
  LEFT_AGENTS.forEach(id  => document.getElementById('agentColLeft')?.appendChild(makeAgentCard(id)));
  RIGHT_AGENTS.forEach(id => document.getElementById('agentColRight')?.appendChild(makeAgentCard(id)));
}

function makeAgentCard(id) {
  const a = AGENTS[id];
  const prof = agentAccuracyProfiles[id];
  const total = prof?.total || 0;
  const pct = total > 0 ? Math.round(prof.correct / total * 100) : null;
  const icons = total > 0 ? Array(Math.min(total, 5)).fill(0).map((_, i) =>
    i < (prof.correct || 0) ? '<span class="acc-tick">✓</span>' : '<span class="acc-miss">✗</span>'
  ).join('') : '';
  const accHtml = total > 0
    ? `<div class="ac-accuracy"><span class="ac-icons">${icons}</span><span class="ac-pct">${pct}%</span><span class="ac-n">近${total}场</span></div>`
    : `<div class="ac-accuracy ac-empty">首场预测中…</div>`;

  // 命中率进度条
  const hitWidth = total > 0 ? Math.round(pct) : 0;
  const idleInfoHtml = `
    <div class="ac-idle-info" id="idle-info-${id}">
      <div class="ac-method">方法：<strong>${AGENT_METHOD_SHORT[id] || '—'}</strong></div>
      <div class="ac-blindspot">${AGENT_BLIND_SPOT[id] || ''}</div>
      ${total > 0 ? `<div class="ac-hitrate-bar"><div class="ac-hitrate-fill" style="width:${hitWidth}%"></div></div>` : ''}
    </div>`;

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
    ${idleInfoHtml}
    <div class="ac-stance" id="stance-${id}"></div>
    <div class="ac-dot"></div>`;
  return div;
}

function updateAgentStanceDisplay(agentId, pick, conf) {
  const el = document.getElementById(`stance-${agentId}`);
  if (!el) return;
  const m = currentMatchData;
  // 用球队名+中文标签，不用图标（图标让用户看不懂）
  const labels = {
    home: `${m?.home||'主队'}胜`,
    draw: '平局',
    away: `${m?.away||'客队'}胜`,
  };
  const pct = Math.round((conf || 0.5) * 100);
  el.innerHTML = pick
    ? `<span class="stance-pick">${labels[pick] || pick}</span><span class="stance-conf">${pct}%</span>`
    : '';
  el.className = `ac-stance stance-${pick || 'none'}`;
}

// ── Council chamber seats ─────────────────────────────────
function buildCouncilSeats() {
  const ALL_AGENTS = ['stat','mystic','history','moderator','gambler','psych'];
  const seats = document.getElementById('councilSeats');
  if (!seats) return;
  seats.innerHTML = '';
  ALL_AGENTS.forEach(id => {
    const a = AGENTS[id];
    const isMod = id === 'moderator';
    const div = document.createElement('div');
    div.className = `seat-card${isMod ? ' moderator-seat' : ''}`;
    div.id = `seat-${id}`;
    div.style.setProperty('--seat-color', a.cssColor);
    div.innerHTML = `
      <div class="seat-portrait">
        <span>${a.icon}</span>
        <div class="seat-onair">ON AIR</div>
      </div>
      <div class="seat-nameplate">
        <div class="seat-name">${a.name}</div>
        <div class="seat-title">${a.title}</div>
      </div>
      <div class="seat-stance" id="seatStance-${id}">
        <div class="seat-stance-dot" id="seatDot-${id}"></div>
        <div class="seat-stance-text" id="seatText-${id}">待机中</div>
      </div>
    `;
    seats.appendChild(div);
  });
}

// ── Update stance on seat cards ───────────────────────────
function updateStanceOnSeats(stances) {
  if (!stances) return;
  const labels = { home: '主队', draw: '平局', away: '客队' };
  const colors = { home: '#93c5fd', draw: '#9ca3af', away: '#fca5a5' };
  Object.entries(stances).forEach(([id, s]) => {
    const dot = document.getElementById(`seatDot-${id}`);
    const txt = document.getElementById(`seatText-${id}`);
    if (!s.pick) return;
    const col = colors[s.pick] || '#888';
    if (dot) { dot.style.background = col; dot.style.opacity = '1'; }
    if (txt) {
      const conf = Math.round((s.conf || 0) * 100);
      txt.textContent = `${labels[s.pick]} ${conf}%`;
      txt.style.color = col;
    }
  });
}

// ── Match drawer toggle ───────────────────────────────────
function toggleMatchDrawer() {
  document.getElementById('matchDrawer')?.classList.toggle('open');
}

// ── Overlays ──────────────────────────────────────────────
function injectOverlays() {
  // heroReveal is now in static HTML; inject only phase-flash and vs-overlay
  document.body.insertAdjacentHTML('beforeend', `
    <div class="phase-flash" id="phaseFlash">
      <div class="phase-flash-label" id="phaseFlashLabel"></div>
      <div class="phase-flash-text"  id="phaseFlashText"></div>
      <div class="phase-flash-line"></div>
    </div>
    <div class="vs-overlay" id="vsOverlay">
      <div class="vs-side left"  id="vsLeft"></div>
      <div class="vs-center">
        <div class="vs-text">VS</div>
        <div class="vs-clash">CLASH OF PROPHECIES</div>
      </div>
      <div class="vs-side right" id="vsRight"></div>
    </div>`);
}

function showPhaseFlash(phase) {
  const el = document.getElementById('phaseFlash');
  document.getElementById('phaseFlashLabel').textContent = 'PHASE';
  document.getElementById('phaseFlashText').textContent  = PHASE_FULL[phase] || phase;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1000);
}

function showVsScreen(agentAId, agentBId, cb) {
  const a = AGENTS[agentAId], b = AGENTS[agentBId];
  const build = ag => `
    <div class="vs-avatar" style="--agent-color:${ag.color}">${ag.icon}</div>
    <div class="vs-name"  style="--agent-color:${ag.color}">${ag.name}</div>
    <div class="vs-title">${ag.title}</div>`;
  document.getElementById('vsLeft').innerHTML  = build(a);
  document.getElementById('vsRight').innerHTML = build(b);
  document.getElementById('vsLeft').style.setProperty('--agent-color', a.color);
  document.getElementById('vsRight').style.setProperty('--agent-color', b.color);
  const el = document.getElementById('vsOverlay');
  el.classList.add('show');
  setTimeout(() => { el.classList.remove('show'); cb?.(); }, 2000);
}
function activateSplitScreen(agentAId, agentBId) {
  const overlay = document.getElementById('splitScreenOverlay');
  if (!overlay) return;
  ssAgentA = agentAId; ssAgentB = agentBId; ssCurrentRound = 0;
  splitScreenActive = true;
  renderSplitScreenCards(agentAId, agentBId);
  overlay.classList.add('ss-active');
}

function deactivateSplitScreen() {
  splitScreenActive = false;
  ssAgentA = null; ssAgentB = null;
  document.getElementById('splitScreenOverlay')?.classList.remove('ss-active');
}

function renderSplitScreenCards(leftId, rightId) {
  const renderCard = (id) => {
    const a = AGENTS[id] || { name: id, icon: '?', cssColor: '#888', title: '' };
    return `
      <div class="ss-card-icon" style="color:${a.cssColor};text-shadow:0 0 16px ${a.cssColor}">${a.icon}</div>
      <div class="ss-card-name" style="color:${a.cssColor}">${a.name}</div>
      <div class="ss-card-title">${a.title}</div>
      <div class="ss-card-stance" id="ssStance-${id}">—</div>
    `;
  };
  const left = document.getElementById('ssCardLeft');
  const right = document.getElementById('ssCardRight');
  if (left) left.innerHTML = renderCard(leftId);
  if (right) right.innerHTML = renderCard(rightId);
}

function updateSplitScreenStance(agentId) {
  if (!splitScreenActive || !currentBlackboard) return;
  const stance = currentBlackboard.agentStances?.[agentId];
  if (!stance?.pick) return;
  const labels = { home:'主队', draw:'平局', away:'客队' };
  const colors = { home:'#60a5fa', draw:'#9ca3af', away:'#f87171' };
  const el = document.getElementById(`ssStance-${agentId}`);
  if (el) {
    const pct = Math.round((stance.conf || 0) * 100);
    el.textContent = `${labels[stance.pick]} ${pct}%`;
    el.style.color = colors[stance.pick] || '#fff';
  }
}

function updateSplitRound(roundNum, attackerId) {
  if (!splitScreenActive) return;
  const badge = document.getElementById('ssDividerBadge');
  if (badge) badge.textContent = `R${roundNum}`;
  // highlight attacker side
  const overlay = document.getElementById('splitScreenOverlay');
  if (overlay) {
    overlay.classList.remove('ss-highlight-left', 'ss-highlight-right');
    if (attackerId === ssAgentA) overlay.classList.add('ss-highlight-left');
    else if (attackerId === ssAgentB) overlay.classList.add('ss-highlight-right');
  }
}


// ── Probability bar ───────────────────────────────────────
function initProbBar() {
  probState = { homeW:0, drawW:0, awayW:0, home:33, draw:34, away:33, count:0 };
  agentsVoted = {};
  const m = currentMatchData;
  const hl = document.getElementById('probHomeLabel');
  const al = document.getElementById('probAwayLabel');
  if (hl && m) hl.textContent = m.home;
  if (al && m) al.textContent = m.away;
  renderProbBar();
  updateUserMarker();
  const st = document.getElementById('probAgentsStatus') || document.getElementById('prob-agents-status');
  if (st) st.innerHTML = '';
}

function renderProbBar() {
  const { home, draw, away, count } = probState;
  const fmt = pct => count > 0 ? `${Math.round(pct)}%` : '—';

  // J: 拔河绳 SVG 版本
  const knot = document.getElementById('tugKnot');
  const tugHome = document.getElementById('tugHome');
  const tugAway = document.getElementById('tugAway');
  if (knot) {
    const bias = home / (home + away + 0.001);
    const cx = Math.round(bias * 800);
    knot.setAttribute('cx', cx);
    tugHome?.setAttribute('width', Math.max(0, cx - 9));
    const awayX = Math.min(800, cx + 9);
    tugAway?.setAttribute('x', awayX);
    tugAway?.setAttribute('width', Math.max(0, 800 - awayX));
    // 弹跳动画
    knot.classList.remove('tug-bounce');
    void knot.offsetWidth;
    knot.classList.add('tug-bounce');
  }

  // 数值标签
  const vh = document.getElementById('probValHome'); if (vh) { vh.textContent = fmt(home); flashVal(vh); }
  const vd = document.getElementById('probValDraw'); if (vd) { vd.textContent = fmt(draw); flashVal(vd); }
  const va = document.getElementById('probValAway'); if (va) { va.textContent = fmt(away); flashVal(va); }
}
function flashVal(el) {
  if (!el) return;
  el.classList.remove('tug-flash');
  void el.offsetWidth;
  el.classList.add('tug-flash');
}

function updateProbFromMsg(data) {
  if (!data.structured?.winner || data.agentId === 'moderator') return;
  const { winner } = data.structured;
  const raw = data.structured.confidence;
  const conf = Math.max(0.15, Math.min(0.92, raw > 1 ? raw / 100 : raw));
  const spread = (1 - conf) / 2;
  probState.homeW += winner === 'home' ? conf : spread;
  probState.drawW += winner === 'draw' ? conf : spread;
  probState.awayW += winner === 'away' ? conf : spread;
  probState.count++;
  const total = probState.homeW + probState.drawW + probState.awayW;
  probState.home = Math.min(100, Math.max(0, probState.homeW / (total||1) * 100));
  probState.draw = Math.min(100, Math.max(0, probState.drawW / (total||1) * 100));
  probState.away = Math.min(100, Math.max(0, probState.awayW / (total||1) * 100));
  // 归一化确保总和100
  const _s = probState.home + probState.draw + probState.away || 100;
  probState.home = probState.home / _s * 100;
  probState.draw = probState.draw / _s * 100;
  probState.away = probState.away / _s * 100;
  agentsVoted[data.agentId] = winner;
  renderProbBar();
  updateUserMarker();
  updateProbStatus();
  // flash the winning segment and mark bar as active
  const segMap = { home:'probSegHome', draw:'probSegDraw', away:'probSegAway' };
  const seg = document.getElementById(segMap[winner]);
  if (seg) { seg.classList.remove('voted'); void seg.offsetWidth; seg.classList.add('voted'); }
  document.getElementById('probBarWrap')?.classList.add('has-votes');
  // 同步更新 3D 场景赛况大屏
  if (currentMatchData) {
    window.Scene3D?.updateStatsDisplay?.(
      currentMatchData.home, currentMatchData.away,
      probState.home, probState.draw, probState.away
    );
  }
}

function updateUserMarker() {
  const marker = document.getElementById('probUserMarker');
  if (!marker) return;
  if (!userPrediction) { marker.style.display = 'none'; return; }
  marker.style.display = 'block';
  const { home, draw, away } = probState;
  const pct = userPrediction === 'home' ? home / 2
            : userPrediction === 'draw' ? home + draw / 2
            : home + draw + away / 2;
  marker.style.left = `${pct.toFixed(1)}%`;
}

function initProbBarDrag() {
  const marker = document.getElementById('probUserMarker');
  const track = document.getElementById('probBarTrack');
  if (!marker || !track) return;
  marker.title = '拖拽改变预测';

  marker.addEventListener('pointerdown', e => {
    if (!currentEs) return; // only during live session
    isDraggingMarker = true;
    marker.setPointerCapture(e.pointerId);
    marker.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('pointermove', e => {
    if (!isDraggingMarker) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
    const home = probState.home || 33;
    const draw = probState.draw || 34;
    const newPick = pct <= home ? 'home' : pct <= home + draw ? 'draw' : 'away';
    if (newPick !== userPrediction) {
      const prev = userPrediction;
      userPrediction = newPick;
      predictionHistory.push({ from: prev, to: newPick, ts: Date.now() });
      updateUserMarker();
      showPredictionUpdateToast(newPick);
    }
  });

  document.addEventListener('pointerup', () => {
    if (isDraggingMarker) {
      isDraggingMarker = false;
      document.getElementById('probUserMarker')?.classList.remove('dragging');
    }
  });
}

function showPredictionUpdateToast(pick) {
  const m = currentMatchData;
  const labels = {
    home: `${m?.home || '主队'} 胜`,
    draw: '平  局',
    away: `${m?.away || '客队'} 胜`,
  };
  document.querySelectorAll('.prediction-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'prediction-toast';
  toast.textContent = `预测更新 → ${labels[pick] || pick}`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 350);
  }, 2200);
}

function buildPredictionTimeline() {
  if (!predictionHistory.length && !userPrediction) return '';
  const m = currentMatchData;
  const labels = { home: `${m?.home||'主队'}胜`, draw: '平局', away: `${m?.away||'客队'}胜` };
  let html = `<div class="pred-timeline"><div class="pt-title">🎯 你的预测轨迹</div><div class="pt-items">`;
  const startLabel = predictionHistory.length ? labels[predictionHistory[0].from] || '未知' : (userPrediction ? labels[userPrediction] : '');
  html += `<span class="pt-item pt-start">${startLabel}</span>`;
  predictionHistory.forEach(h => {
    html += `<span class="pt-arrow">→</span><span class="pt-item">${labels[h.to] || h.to}</span>`;
  });
  html += `</div>`;
  if (predictionHistory.length > 0) {
    html += `<div class="pt-change-count">共改变 ${predictionHistory.length} 次</div>`;
  }
  html += `</div>`;
  return html;
}

function updateProbStatus() {
  const el = document.getElementById('probAgentsStatus');
  if (!el) return;
  const colorMap = { home:'#2ed573', draw:'rgba(255,255,255,0.4)', away:'#ff4757' };
  el.innerHTML = ['stat','mystic','history','gambler','psych'].map(id => {
    const a = AGENTS[id], v = agentsVoted[id];
    const col = v ? colorMap[v] : 'rgba(255,255,255,0.1)';
    return `<span class="pas-agent" style="border-color:${col};${v?`color:${col};box-shadow:0 0 6px ${col}44`:''}" title="${a.name}">${a.icon}</span>`;
  }).join('');
}

// ── Score modal (比分预测弹窗) ────────────────────────────
function showScoreModal() {
  const m = currentMatchData;
  const hn = document.getElementById('smHomeName');
  const an = document.getElementById('smAwayName');
  if (hn && m) hn.textContent = m.home;
  if (an && m) an.textContent = m.away;
  userScore = { home: 0, away: 0 };
  document.getElementById('smHomeScore').textContent = '0';
  document.getElementById('smAwayScore').textContent = '0';
  document.getElementById('smAgentHint').textContent = '';

  // 热门比分快选（基于赔率判断）
  const quickRow = document.getElementById('smQuickRow');
  if (quickRow && m) {
    const picks = getQuickPicks(m);
    quickRow.innerHTML = picks.map(p =>
      `<button class="sm-quick-btn" onclick="setQuickScore(${p[0]},${p[1]})">${p[0]}–${p[1]}</button>`
    ).join('');
  }

  document.getElementById('scoreModalBackdrop')?.classList.add('show');
}

function getQuickPicks(m) {
  const ho = m.odds?.home ?? 2.5, do_ = m.odds?.draw ?? 3.2, ao = m.odds?.away ?? 2.8;
  const rh=1/ho, rd=1/do_, ra=1/ao, t=rh+rd+ra;
  const ph=rh/t, pa=ra/t;
  if (ph > 0.52) return [[1,0],[2,1],[2,0]];
  if (pa > 0.52) return [[0,1],[1,2],[0,2]];
  return [[1,1],[2,1],[1,0]];
}

function adjustScore(side, delta) {
  userScore[side] = Math.max(0, Math.min(9, (userScore[side] || 0) + delta));
  document.getElementById(side === 'home' ? 'smHomeScore' : 'smAwayScore').textContent = userScore[side];
  updateScoreHint();
}

function setQuickScore(h, a) {
  userScore = { home: h, away: a };
  document.getElementById('smHomeScore').textContent = h;
  document.getElementById('smAwayScore').textContent = a;
  document.querySelectorAll('.sm-quick-btn').forEach(b => b.classList.remove('active'));
  event?.target?.classList.add('active');
  updateScoreHint();
}

function updateScoreHint() {
  const hint = document.getElementById('smAgentHint');
  if (!hint) return;
  const { home: h, away: a } = userScore;
  if (h === 0 && a === 0) { hint.textContent = ''; return; }

  // 议会已产生比分预测时：找最接近的 agent
  const predicted = Object.entries(agentPredictedScores);
  if (predicted.length > 0) {
    let closest = null, minDiff = Infinity;
    for (const [id, score] of predicted) {
      const diff = Math.abs(score[0] - h) + Math.abs(score[1] - a);
      if (diff < minDiff) { minDiff = diff; closest = id; }
    }
    if (closest) {
      const name = AGENTS[closest]?.name || closest;
      const tag = minDiff === 0 ? '完全一致！' : `差${minDiff}球`;
      hint.textContent = `${h}–${a} — 和${name}最接近（${tag}）`;
      return;
    }
  }

  // 议会前：根据比分特征推断风格归属
  const winner = h > a ? 'home' : h < a ? 'away' : 'draw';
  const total = h + a;
  const margin = Math.abs(h - a);
  let name, reason;
  if (winner === 'draw')          { name = '碎碎念';   reason = '心理博弈→平局多'; }
  else if (total >= 4)            { name = '月影姐';   reason = '玄学偏爱大比分'; }
  else if (margin >= 2)           { name = 'Dr.冰狗'; reason = 'xG数据→强队碾压'; }
  else if (winner === 'away')     { name = '老球迷';   reason = '历史冷门翻盘感'; }
  else                            { name = '赌狗本狗'; reason = '盘口小赢概率高'; }
  hint.textContent = `${h}–${a} — ${name}风格 · ${reason}`;
}

function confirmScore() {
  userPrediction = userScore.home > userScore.away ? 'home' : userScore.home < userScore.away ? 'away' : 'draw';
  document.getElementById('scoreModalBackdrop')?.classList.remove('show');
  updateUserMarker();
  doStartCouncil();
}

function skipScore() {
  userPrediction = null;
  userScore = { home: null, away: null };
  document.getElementById('scoreModalBackdrop')?.classList.remove('show');
  doStartCouncil();
}

// 保留旧函数别名以防其他地方引用
function showPredictionModal() { showScoreModal(); }
function skipPrediction() { skipScore(); }

// ── Matches ───────────────────────────────────────────────
async function loadMatches() {
  try {
    const raw = await fetch('/api/matches').then(r => r.json());
    // D: 按比赛重要性排序
    allMatches = [...raw].sort((a, b) =>
      (STAKES_ORDER[a.leagueContext?.stakes] ?? 4) - (STAKES_ORDER[b.leagueContext?.stakes] ?? 4)
    );

    const sel = document.getElementById('matchSel');
    sel.innerHTML = allMatches.map(m => {
      let dateStr = '';
      if (m.utcDate) {
        try { dateStr = ' · ' + new Date(m.utcDate).toLocaleDateString('zh-CN', { month:'2-digit', day:'2-digit' }); }
        catch(e) { dateStr = ' · ' + m.utcDate; }
      }
      const badge = STAKES_BADGE[m.leagueContext?.stakes] || '';
      const diff = Math.abs((m.leagueContext?.homePoints||0) - (m.leagueContext?.awayPoints||0));
      const diffStr = diff > 0 ? ` · 差${diff}分` : '';
      return `<option value="${m.id}">${badge ? badge+' ' : ''}${m.homeFlag} ${m.home} vs ${m.away} ${m.awayFlag} · ${m.stage}${dateStr}${diffStr}</option>`;
    }).join('');

    // D: 今日焦点战横幅
    const featured = allMatches.find(m => ['title','relegation'].includes(m.leagueContext?.stakes));
    const banner = document.getElementById('featuredMatchBanner');
    if (banner && featured) {
      const badge = STAKES_BADGE[featured.leagueContext.stakes];
      banner.innerHTML = `${badge} 今日焦点：<strong>${featured.home} vs ${featured.away}</strong> · ${featured.stage}`;
      banner.style.display = 'block';
      banner.onclick = () => {
        sel.value = featured.id;
        sel.dispatchEvent(new Event('change'));
      };
    }

    await loadMatchDetail(allMatches[0].id);
  } catch(e) { console.error(e); }
}

async function loadMatchDetail(id) {
  // clean up previous poll and ready badge
  if (seedsPollTimer) { clearInterval(seedsPollTimer); seedsPollTimer = null; }
  const prevBadge = document.getElementById('seedsReadyBadge');
  if (prevBadge) prevBadge.remove();
  const prevBtn = document.getElementById('startBtn');
  if (prevBtn) { prevBtn.style.background = ''; prevBtn.style.boxShadow = ''; }
  try {
    currentMatchData = await fetch(`/api/match/${id}`).then(r => r.json());
    renderMatchPanel(currentMatchData);
    initProbBar();
    const names = [...(currentMatchData.homePlayers||[]),...(currentMatchData.awayPlayers||[])].map(p=>p.name);
    names.forEach(n => fetchWikiPhoto(n));

    // fire-and-forget prepare
    fetch(`/api/match/${id}/prepare`, { method:'POST' }).catch(()=>{});

    // show loading state
    const startBtn = document.getElementById('startBtn');
    let seedsEl = document.getElementById('seedsStatus');
    if (!seedsEl) {
      seedsEl = document.createElement('div');
      seedsEl.id = 'seedsStatus';
      startBtn?.parentElement?.insertAdjacentElement('afterend', seedsEl);
    }
    seedsEl.className = 'seeds-loading';
    seedsEl.textContent = '🔍 分析赛前情报中...';

    let attempts = 0;
    const maxAttempts = 30;
    seedsPollTimer = setInterval(async () => {
      attempts++;
      try {
        const ready = await fetch(`/api/match/${id}/ready`).then(r => r.json());
        if (ready?.ready) {
          clearInterval(seedsPollTimer); seedsPollTimer = null;
          seedsEl.className = 'seeds-ready';
          seedsEl.textContent = '✓ 情报就绪';
        }
      } catch(e) { /* ignore poll errors */ }
      if (attempts >= maxAttempts) {
        clearInterval(seedsPollTimer); seedsPollTimer = null;
        if (seedsEl) { seedsEl.textContent = ''; }
      }
    }, 3000);
    startTicker();
  } catch(e) { console.error(e); }
}

async function onMatchChange(e) {
  if (document.getElementById('startBtn').disabled) return;
  await loadMatchDetail(e.target.value);
}

// N6: 快速押注（3按钮）
function setQuickPick(pick) {
  userPrediction = pick;
  selectedPick = pick;
  const m = currentMatchData;
  ['home','draw','away'].forEach(p => {
    const btn = document.getElementById('qp' + p.charAt(0).toUpperCase() + p.slice(1));
    if (btn) btn.classList.toggle('qp-active', p === pick);
  });
}

// N4/F4: 更新初判进度指示器
function updateCouncilProgress(phase, doneCount, totalCount) {
  const el = document.getElementById('councilProgress');
  if (!el) return;
  const EXPERTS = ['stat', 'mystic', 'history', 'gambler', 'psych'];
  if (phase === 'initial') {
    el.style.display = 'block';
    const dots = EXPERTS.map((id, i) => {
      const cls = i < doneCount ? 'cp-dot cp-done' : i === doneCount ? 'cp-dot cp-active' : 'cp-dot cp-wait';
      return `<span class="${cls}" title="${AGENTS[id]?.name || id}"></span>`;
    }).join('');
    el.innerHTML = `初判 ${doneCount}/${totalCount} ${dots}`;
  } else if (phase === 'debate') {
    el.innerHTML = `⚔️ 对线辩论中`;
  } else if (phase === 'vote') {
    el.innerHTML = `🗳️ 终极投票中`;
  } else {
    el.style.display = 'none';
  }
}

// F5: 概率条空闲提示开关
function setProbBarIdleHint(isIdle) {
  const lbl = document.getElementById('probCenterLabel');
  if (!lbl) return;
  if (isIdle) {
    lbl.textContent = '🔮 召开议会以获取 AI 预测';
    lbl.classList.add('idle-hint');
  } else {
    lbl.textContent = '预 测 走 势';
    lbl.classList.remove('idle-hint');
  }
}

// N9: 首屏命中率聚合
function renderHomepageHitRate() {
  const profiles = agentAccuracyProfiles;
  const ids = Object.keys(profiles).filter(id => (profiles[id]?.total || 0) >= 3);
  if (!ids.length) return;
  const total = ids.reduce((s, id) => s + (profiles[id].total || 0), 0);
  const correct = ids.reduce((s, id) => s + (profiles[id].correct || 0), 0);
  const pct = total > 0 ? Math.round(correct / total * 100) : 0;
  const el = document.getElementById('seedsStatus');
  if (el) el.innerHTML = `<span style="font-size:10px;color:var(--gold)">📊 近${total}场议会命中率 ${pct}%</span>`;
}

function renderMatchPanel(m) {
  // N6: 快速押注按钮文字（显示队名）
  const qpH = document.getElementById('qpHome'); if (qpH) qpH.textContent = m.home + ' 胜';
  const qpA = document.getElementById('qpAway'); if (qpA) qpA.textContent = m.away + ' 胜';
  // 重置押注选中状态
  ['qpHome','qpDraw','qpAway'].forEach(id => document.getElementById(id)?.classList.remove('qp-active'));
  userPrediction = null; selectedPick = null;

  // Top bar elements (new IDs)
  const setTb = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setTb('tbHomeFlag', m.homeFlag);
  setTb('tbHomeName', m.home);
  setTb('tbAwayFlag', m.awayFlag);
  setTb('tbAwayName', m.away);
  // 队徽
  const setCrest = (id, url) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (url) { el.src = url; el.style.display = 'block'; }
    else { el.style.display = 'none'; }
  };
  setCrest('tbHomeCrest', m.homeCrest);
  setCrest('tbAwayCrest', m.awayCrest);
  const tbHO = document.getElementById('tbHomeOdds');
  const tbAO = document.getElementById('tbAwayOdds');
  if (tbHO) tbHO.textContent = m.odds?.home ? `@${m.odds.home}` : '';
  if (tbAO) tbAO.textContent = m.odds?.away ? `@${m.odds.away}` : '';
  const tbDate = document.getElementById('tbDate');
  if (tbDate) {
    if (m.utcDate) {
      try {
        const d = new Date(m.utcDate);
        tbDate.textContent = d.toLocaleDateString('zh-CN', { month:'long', day:'numeric', weekday:'short' });
      } catch(e) { tbDate.textContent = m.stage || 'PREMIER LEAGUE'; }
    } else {
      tbDate.textContent = m.stage || 'PREMIER LEAGUE';
    }
  }
  const setTxt = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  const setHtml= (id,v) => { const el=document.getElementById(id); if(el) el.innerHTML=v; };
  setTxt('teamHomeFlagDrawer', m.homeFlag);
  setTxt('teamHomeNameDrawer', m.home);
  setTxt('teamAwayFlagDrawer',  m.awayFlag);
  setTxt('teamAwayNameDrawer',  m.away);
  setHtml('matchStage', `${m.stage}<br>${m.venue}`);
  setHtml('oddsHome', `<div class="odds-label">${m.home} 胜</div><div class="odds-value">@${m.odds.home}</div>`);
  setHtml('oddsDraw', `<div class="odds-label">平局</div><div class="odds-value">@${m.odds.draw}</div>`);
  setHtml('oddsAway', `<div class="odds-label">${m.away} 胜</div><div class="odds-value">@${m.odds.away}</div>`);
  renderPlayers('playersHome', m.homePlayers, m.homeFlag+' '+m.home);
  renderPlayers('playersAway', m.awayPlayers, m.awayFlag+' '+m.away);
  const rawNews = m.news || m.briefing?.news || '';
  const newsList = Array.isArray(rawNews) ? rawNews : (rawNews ? rawNews.split('；').filter(Boolean) : []);
  // V44-2: FPL 不可用时显示降级提示
  const fplNote = m.briefing?._fplAvailable === false
    ? `<div class="fpl-unavailable">⚠️ FPL 数据暂时不可用，球员/xG/伤情字段将显示"暂无"</div>`
    : '';
  setHtml('newsList', fplNote + newsList.map(n=>`<div class="news-item">${n}</div>`).join(''));
  // league context
  const ctxEl = document.getElementById('leagueCtx');
  if (m.leagueContext) {
    const lc = m.leagueContext;
    const stakesKey = lc.stakes || 'mid';
    const stakesClass = `stakes-badge stakes-${stakesKey}`;
    const ctxHtml = `<div class="league-ctx">
      ${lc.homeStanding ? `📊 ${escapeHtml(m.home)} 积分榜第${lc.homeStanding}位` : ''}
      ${lc.homeStanding && lc.awayStanding ? ' · ' : ''}
      ${lc.awayStanding ? `${escapeHtml(m.away)} 第${lc.awayStanding}位` : ''}
      ${lc.context ? `<br>${escapeHtml(lc.context)}` : ''}
      ${stakesKey ? `<br><span class="${stakesClass}">${escapeHtml(lc.stakesLabel||stakesKey)}</span>` : ''}
    </div>`;
    if (ctxEl) ctxEl.innerHTML = ctxHtml;
    else {
      const newsSection = document.querySelector('#matchDrawer .news-section');
      if (newsSection) newsSection.insertAdjacentHTML('beforebegin', `<div id="leagueCtx">${ctxHtml}</div>`);
    }
  } else if (ctxEl) {
    ctxEl.innerHTML = '';
  }
  // 初始化 3D 赛况大屏（用赔率推算初始概率）
  try {
    const o = m.odds || {}; const h=o.home||2.5, d=o.draw||3.2, a=o.away||2.8;
    const rh=1/h, rd=1/d, ra=1/a, rt=rh+rd+ra;
    window.Scene3D?.updateStatsDisplay?.(m.home, m.away,
      Math.round(rh/rt*100), Math.round(rd/rt*100), Math.round(ra/rt*100));
  } catch(e){}
  // 初始化背景球星英雄卡墙
  initPlayerBanners(m);
}

function renderPlayers(cid, players, label) {
  const wrap = document.getElementById(cid);
  wrap.querySelector('.players-title').textContent = label + ' 关键球员';
  wrap.querySelector('.players-grid').innerHTML = players.map(p=>`
    <div class="player-card ${p.status}">
      <div class="player-num">#${p.num}</div>
      <div class="player-name">${p.name}</div>
      <div class="player-pos">${p.pos}</div>
      <div class="player-stat">${p.stat}</div>
      <div class="player-badge">${p.status==='hot'?'⚡':p.status==='doubt'?'❓':p.status==='out'?'✗':''}</div>
    </div>`).join('');
}

// ── Council start ─────────────────────────────────────────
function startCouncil() {
  const matchId = document.getElementById('matchSel').value;
  if (!matchId || !currentMatchData) return;
  document.getElementById('startBtn').disabled = true;
  document.getElementById('matchSel').disabled = true;
  // U2: 议会开始时隐藏焦点banner
  document.getElementById('featuredMatchBanner')?.style.setProperty('display', 'none');
  showScoreModal();
}

function doStartCouncil() {
  const matchId = document.getElementById('matchSel').value;
  document.getElementById('feed').innerHTML      = '';
  document.getElementById('resultsContainer').innerHTML = '';
  document.getElementById('liveBadge').classList.add('active');
  document.getElementById('matchDrawer')?.classList.remove('open');
  document.querySelectorAll('.phase-step').forEach(s => s.classList.remove('active','done'));
  // clear stance / consensus panels
  const sp = document.getElementById('stancePanel'); if(sp) sp.remove();
  const cb = document.getElementById('consensusBarGlobal'); if(cb) cb.remove();
  setSpeaking(null);
  sessionCatchphrases = []; sessionScenes = [];
  agentPredictedScores = {};
  // 重置进度 + 概率条提示
  councilProgressState = { phase: null, done: 0, total: 5 };
  setProbBarIdleHint(false);
  updateCouncilProgress(null, 0, 5);
  // 清理所有 agent score badges
  document.querySelectorAll('.agent-score-badge').forEach(b => b.remove());
  // 重置结果面板
  const csBox = document.getElementById('councilScoreBox');
  if (csBox) csBox.style.display = 'none';
  const hitEl = document.getElementById('userHitLevel');
  if (hitEl) hitEl.style.display = 'none';
  document.getElementById('resultInputPanel').style.display = 'none';
  // 会话中隐藏概率条，让 3D 场景获得更多高度
  document.body.classList.add('session-active');
  const rc = document.getElementById('resultsContainer');
  if (rc) { rc.innerHTML = ''; rc.classList.remove('active'); }
  initProbBar();
  predictionHistory = [];
  initProbBarDrag();
  const bp = document.getElementById('broadcastPanel');
  bp.innerHTML = '<div class="broadcast-placeholder">⚖️ 预言者议会即将开始</div>';

  // 等待超时提示：8秒无消息显示"正在连接AI..."，15秒显示"API响应较慢"
  let lastMsgTime = Date.now();
  let waitingTimer = setInterval(() => {
    const elapsed = Date.now() - lastMsgTime;
    const bp = document.getElementById('broadcastPanel');
    const ph = bp?.querySelector('.broadcast-placeholder');
    if (!ph) { clearInterval(waitingTimer); return; }
    if (elapsed > 15000) ph.textContent = '⏳ AI 响应较慢，请耐心等待...';
    else if (elapsed > 8000) ph.textContent = '🔗 正在连接议会...';
  }, 3000);

  currentEs = new EventSource(`/api/run?matchId=${encodeURIComponent(matchId)}`);
  currentEs.onmessage = e => {
    lastMsgTime = Date.now();
    let d;
    try { d = JSON.parse(e.data); } catch { return; }
    if      (d.type==='phase')             handlePhase(d);
    else if (d.type==='thinking')          handleThinking(d);
    else if (d.type==='speaking_start')    setSpeaking(d.agentId);
    else if (d.type==='message')           handleMessage(d);
    else if (d.type==='summary')           handleSummary(d);
    else if (d.type==='blackboard_update') handleBlackboardUpdate(d);
    else if (d.type==='devil_reveal')      handleDevilReveal(d);
    else if (d.type==='debate_stop')       handleDebateStop(d);
    else if (d.type==='pivot')             handlePivot(d);
    else if (d.type==='done')              { clearInterval(waitingTimer); currentEs.close(); }
    else if (d.type==='error')             { clearInterval(waitingTimer); handleError(d.message); currentEs.close(); }
  };
  currentEs.onerror = () => { clearInterval(waitingTimer); handleError('连接中断，请检查网络后重试'); currentEs.close(); };
}

// ── Event handlers ────────────────────────────────────────

function handleDebateStop({ reason, msg }) {
  const reasonIcons = { consensus: '🤝', stalemate: '🔒', maxrounds: '⏱️' };
  const icon = reasonIcons[reason] || '⚡';
  const text = `${icon} ${msg || '对线结束'}`;
  // 直接写入 broadcast panel 作为横幅，3.5s 消失
  const bp = document.getElementById('broadcastPanel');
  if (bp) {
    bp.querySelectorAll('.phase-banner').forEach(b => b.remove());
    let container = bp.querySelector('.broadcast-content');
    if (!container) { bp.innerHTML=''; container=document.createElement('div'); container.className='broadcast-content'; bp.appendChild(container); }
    const b = document.createElement('div');
    b.className = 'phase-banner';
    b.style.setProperty('--banner-color', reason === 'consensus' ? '#00d46a' : '#f0c040');
    b.innerHTML = `<div class="banner-line"></div><span>${escapeHtml(text)}</span><div class="banner-line"></div>`;
    container.appendChild(b);
    setTimeout(() => { b.style.transition='opacity 0.5s'; b.style.opacity='0'; setTimeout(()=>b.remove(),500); }, 3500);
  }
  addToFeed('对线', text, '#f0c040');
}

function handlePivot({ agentId, round, to }) {
  const agent = AGENTS[agentId];
  if (!agent) return;
  const label = { home: '押主队', draw: '押平局', away: '押客队' }[to] || to;
  const bannerText = `🔄 ${agent.name} 第${round + 1}轮转向 → ${label}`;
  addToFeed('转向', bannerText, agent.cssColor);
  // 闪烁 agent 卡片以示转向
  const card = document.querySelector(`.agent-card[data-agent="${agentId}"]`);
  if (card) {
    card.classList.add('pivot-flash');
    setTimeout(() => card.classList.remove('pivot-flash'), 1400);
  }
  window.Scene3D?.triggerBurst?.(agentId);
  // F8: 立场转向颜色闪烁动画
  window.Scene3D?.flashPivotColor?.(agentId, to);
}

function handlePhase({ phase, meta }) {
  const idx = PHASES_ORDER.indexOf(phase);
  document.querySelectorAll('.phase-step').forEach((s,i) => {
    s.classList.remove('active','done');
    if (i<idx) s.classList.add('done');
    else if (i===idx) s.classList.add('active');
  });
  setSpeaking(null);
  // N4: 进度指示器联动
  councilProgressState.phase = phase;
  if (phase === 'initial') {
    councilProgressState.done = 0;
    updateCouncilProgress('initial', 0, councilProgressState.total);
  } else {
    updateCouncilProgress(phase, councilProgressState.done, councilProgressState.total);
  }
  if (phase === 'debate' && meta) {
    showVsScreen(meta.agentA, meta.agentB, () => appendPhaseBanner(phase, meta));
    // Activate split screen with slight delay for dramatic effect
    setTimeout(() => activateSplitScreen(meta.agentA, meta.agentB), 1800);
  } else {
    showPhaseFlash(phase);
    setTimeout(() => appendPhaseBanner(phase, meta), 600);
    if (phase !== 'debate') deactivateSplitScreen();
  }
}

function handleThinking({ agentId }) {
  // 只做卡片 CSS 脉冲，不更新 3D——避免 3D 提前切换到下一个 agent
  // 而广播还在显示上一个 agent 的发言（reading delay 期间）
  const card = document.getElementById(`card-${agentId}`);
  if (card) {
    card.classList.remove('speaking', 'idle-bg');
    card.classList.add('thinking');
  }
}

function handleBlackboardUpdate(d) {
  currentBlackboard = d.blackboard;
  renderStancePanel(currentBlackboard);
  if (currentBlackboard?.consensusLevel != null) renderConsensus(currentBlackboard.consensusLevel);
  updateStanceOnSeats(d.blackboard?.agentStances);
  // Signature Moment: stance flip
  const newPivots = d.blackboard?.pivotMoments?.length || 0;
  if (newPivots > prevPivotCount && newPivots > 0) {
    const p = d.blackboard.pivotMoments[newPivots - 1];
    if (p) {
      const pickLabel = { home:'主队', draw:'平局', away:'客队' };
      triggerSignatureMoment('stance_flip', p.agentId,
        `${pickLabel[p.from] || p.from} → ${pickLabel[p.to] || p.to}`, '');
    }
  }
  prevPivotCount = newPivots;
  // Signature Moment: full consensus
  const cl = d.blackboard?.consensusLevel || 0;
  if (cl >= 0.92 && !fullConsensusTriggered) {
    fullConsensusTriggered = true;
    triggerSignatureMoment('consensus', 'moderator', '议会形成高度共识', '');
  }
  updateEvidenceBoard(d.blackboard);
  updateTicker();
  if (splitScreenActive) {
    if (ssAgentA) updateSplitScreenStance(ssAgentA);
    if (ssAgentB) updateSplitScreenStance(ssAgentB);
  }
}

function updateEvidenceBoard(blackboard) {
  if (!blackboard) return;
  const board = document.getElementById('evidenceBoard');
  if (!board) return;

  if (!ebInitialized) {
    board.classList.add('eb-active');
    ebInitialized = true;
  }

  // Facts
  const factsEl = document.getElementById('ebFacts');
  if (factsEl) {
    const facts = blackboard.facts || [];
    const keyInsights = blackboard.keyInsights || [];
    // Use keyInsights as facts since they contain agent verdicts
    const items = keyInsights.slice(-4).map(k =>
      `<div class="eb-item eb-fact">${escapeHtml(k)}</div>`
    ).join('') || '<div class="eb-item eb-empty">等待数据...</div>';
    if (factsEl.innerHTML !== items) {
      factsEl.innerHTML = items;
      if (keyInsights.length > 0) factsEl.lastElementChild?.classList.add('eb-new');
    }
  }

  // Disputes
  const disputesEl = document.getElementById('ebDisputes');
  if (disputesEl) {
    const disputes = blackboard.disputes || [];
    const html = disputes.slice(-3).map(d =>
      `<div class="eb-item eb-dispute">${escapeHtml(d.topic || '')}</div>`
    ).join('') || '<div class="eb-item eb-empty">暂无分歧</div>';
    disputesEl.innerHTML = html;
  }

  // Stances
  const stancesEl = document.getElementById('ebStances');
  if (stancesEl && blackboard.agentStances) {
    const counts = { home: 0, draw: 0, away: 0 };
    const labels = { home: '主队', draw: '平局', away: '客队' };
    Object.values(blackboard.agentStances).forEach(s => { if (s.pick) counts[s.pick]++; });
    stancesEl.innerHTML = Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `<span class="eb-stance-badge eb-stance-${k}">${labels[k]}×${v}</span>`)
      .join('');
  }

  // Consensus bar
  const level = blackboard.consensusLevel || 0;
  const fillEl = document.getElementById('ebConsensusFill');
  const valEl = document.getElementById('ebConsensusVal');
  if (fillEl) fillEl.style.width = `${Math.round(level * 100)}%`;
  if (valEl) valEl.textContent = `${Math.round(level * 100)}%`;
}

function triggerSignatureMoment(type, agentId, detail, quote) {
  const DEFS = {
    stance_flip:  { label: '↺  立  场  逆  转', cls: 'sm-flip' },
    consensus:    { label: '⚡  议  会  达  成  一  致', cls: 'sm-consensus' },
    devil_reveal: { label: '🎭  面  具  揭  晓', cls: 'sm-devil' },
    catchphrase:  { label: '🔥  封  神  金  句', cls: 'sm-hot' },
  };
  const def = DEFS[type] || DEFS.catchphrase;
  const agent = AGENTS[agentId] || { name: agentId, icon: '⚡', cssColor: '#f0d060' };
  const el = document.getElementById('signatureMoment');
  if (!el) return;
  el.style.setProperty('--sm-color', agent.cssColor);
  document.getElementById('smType').textContent = def.label;
  document.getElementById('smIcon').textContent = agent.icon;
  document.getElementById('smName').textContent = agent.name;
  document.getElementById('smDetail').textContent = detail || '';
  document.getElementById('smQuote').textContent = quote ? `"${quote}"` : '';
  el.className = `signature-moment sm-show ${def.cls}`;
  clearTimeout(smTimeout);
  smTimeout = setTimeout(() => {
    el.classList.remove('sm-show');
    setTimeout(() => { el.className = 'signature-moment'; }, 500);
  }, 2600);
}

function handleDevilReveal(d) {
  const m = currentMatchData;
  const pickLabels = {
    home: `${m?.home||'主队'}胜`,
    draw: '平局',
    away: `${m?.away||'客队'}胜`,
  };
  const agentName = (AGENTS[d.agentId]?.name) || d.agentId || '?';
  const playedStance = d.playedStance;
  const trueStance   = d.trueStance;
  const changed = playedStance?.pick !== trueStance?.pick;
  const playedLabel = pickLabels[playedStance?.pick] || playedStance?.pick || '未知';
  const trueLabel   = pickLabels[trueStance?.pick]   || trueStance?.pick   || '未知';
  const bp = document.getElementById('broadcastPanel');
  let container = bp?.querySelector('.broadcast-content');
  if (!container && bp) {
    bp.innerHTML = '';
    container = document.createElement('div');
    container.className = 'broadcast-content';
    bp.appendChild(container);
  }
  const card = document.createElement('div');
  card.className = 'devil-reveal-card';
  card.innerHTML = `
    <div class="dr-title">🎭 ${escapeHtml(agentName)} · 恶魔代言人揭晓</div>
    <div class="dr-body">
      <div class="dr-row"><span class="dr-label">辩论中扮演的立场</span><span class="dr-val">${escapeHtml(playedLabel)}</span></div>
      <div class="dr-row"><span class="dr-label">终投的真实立场</span><span class="dr-val dr-true">${escapeHtml(trueLabel)}</span></div>
      <div class="dr-result">${changed ? '⚡ 终投时立场已变' : '✓ 始终坚持真实判断，没有被对线改变'}</div>
    </div>`;
  if (container) { container.appendChild(card); card.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
  triggerSignatureMoment('devil_reveal', d.agentId,
    changed ? `${agentName}：扮演${playedLabel} → 真实${trueLabel}` : `${agentName}：始终坚持${trueLabel}`,
    AGENTS[d.agentId]?.name + ' 是本场恶魔代言人');
}

function renderStancePanel(blackboard) {
  if (!blackboard) return;
  const bp = document.getElementById('broadcastPanel');
  if (!bp) return;
  let panel = document.getElementById('stancePanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'stancePanel';
    panel.className = 'stance-panel';
    // Insert after broadcast panel (at bottom of feed-section)
    bp.insertAdjacentElement('afterend', panel);
  }
  const stances = blackboard.agentStances || {};
  const pickLabel = { home:'主队', draw:'平局', away:'客队' };
  const rows = Object.entries(stances).map(([id, s]) => {
    const a = AGENTS[id];
    const name = a ? `${a.icon} ${a.name}` : id;
    const pick = s.pick || 'draw';
    const conf = s.conf != null ? Math.round(s.conf * 100) : '';
    const label = pickLabel[pick] || pick;
    const confStr = conf !== '' ? ` ${conf}%` : '';
    return `<div class="stance-row"><span class="stance-agent">${escapeHtml(name)}</span><span class="stance-pick ${pick}">${escapeHtml(label)}${escapeHtml(confStr)}</span></div>`;
  }).join('');
  const pivots = (blackboard.pivotMoments || []);
  const latestPivot = pivots.length ? pivots[pivots.length - 1] : null;
  const pivotHtml = latestPivot
    ? `<div class="pivot-badge">↺ ${escapeHtml((AGENTS[latestPivot.agentId]?.name)||latestPivot.agentId)}从${escapeHtml(latestPivot.from)}→${escapeHtml(latestPivot.to)}</div>`
    : '';
  panel.innerHTML = rows + pivotHtml;
  if (blackboard.consensusLevel != null) renderConsensus(blackboard.consensusLevel, panel);
}

function renderConsensus(level, container) {
  const pct = Math.round(level * 100);
  const html = `<div class="consensus-bar">
    <span class="consensus-label">议会共识度</span>
    <div class="consensus-track"><div class="consensus-fill" style="width:${pct}%"></div></div>
    <span class="consensus-val">${pct}%</span>
  </div>`;
  if (container) {
    let bar = container.querySelector('.consensus-bar');
    if (bar) { bar.outerHTML = html; }
    else { container.insertAdjacentHTML('beforeend', html); }
    return;
  }
  // Insert global consensus bar after stance panel or before broadcast
  const bp = document.getElementById('broadcastPanel');
  if (!bp) return;
  let bar = document.getElementById('consensusBarGlobal');
  if (!bar) {
    const wrap = document.createElement('div');
    wrap.id = 'consensusBarGlobal';
    const sp = document.getElementById('stancePanel');
    if (sp) sp.insertAdjacentElement('afterend', wrap);
    else bp.insertAdjacentElement('afterend', wrap);
    bar = wrap;
  }
  bar.innerHTML = html;
}

function handleMessage(data) {
  // reaction: 只更新卡片高亮，不移动摄像机（两人连续快速互怼会导致摄像机来回跳）
  // 其他所有 phase: 正常更新卡片 + 摄像机
  if (data.phase === 'reaction') {
    setSpeakingReaction(data.agentId);
  } else {
    setSpeaking(data.agentId, false);
  }
  // Update split screen if active
  if (splitScreenActive && (data.agentId === ssAgentA || data.agentId === ssAgentB)) {
    updateSplitScreenStance(data.agentId);
  }
  const agent = AGENTS[data.agentId] || { name:data.agentId, icon:'?', color:'#888', cssColor:'#888', title:'' };

  if (data.catchphrase && (data.phase==='initial'||data.phase==='vote'))
    sessionCatchphrases.push({ agentId:data.agentId, text:data.catchphrase, color:agent.color, cssColor:agent.cssColor, name:agent.name });
  if (data.scenePrediction && (data.phase==='initial'||data.phase==='vote'))
    sessionScenes.push({ agentId:data.agentId, text:data.scenePrediction, color:agent.color, cssColor:agent.cssColor, name:agent.name });

  // N4: 初判阶段进度计数
  if (data.phase === 'initial' && data.agentId !== 'moderator') {
    councilProgressState.done = Math.min(councilProgressState.done + 1, councilProgressState.total);
    updateCouncilProgress('initial', councilProgressState.done, councilProgressState.total);
  }
  // 结束时隐藏进度
  if (data.phase === 'vote') updateCouncilProgress('vote', 0, 0);

  updateBroadcast(data, agent);
  addHistoryItem(data, agent);
  updateProbFromMsg(data);

  // 捕获 agent 初判比分
  if (data.phase === 'initial' && data.structured?.score?.length >= 2) {
    agentPredictedScores[data.agentId] = data.structured.score;
    updateAgentScoreBadge(data.agentId, data.structured.score);
  }

  // 英雄卡：initial+vote 阶段，只有找到球员才触发，不频繁显示同一球员
  if (data.phase === 'initial' || data.phase === 'vote') {
    const textToScan = [data.speech, data.scenePrediction].filter(Boolean).join(' ');
    const wikiNames = Object.keys(PLAYER_WIKI).sort((a, b) => b.length - a.length);
    let found = null;
    for (const n of wikiNames) {
      if (textToScan.includes(n)) { found = n; break; }
    }
    if (found) queueHero(found, data.scenePrediction || data.speech, data.agentId);
  }
  // A: 更新 agent 卡片立场指示器（conf 归一化到 0-1）
  if (data.structured?.winner) {
    const rawConf = data.structured.confidence;
    const normConf = rawConf > 1 ? rawConf / 100 : (rawConf || 0.5);
    updateAgentStanceDisplay(data.agentId, data.structured.winner, normConf);
  }

  // U5: 终投阶段显示实时投票计数（用球队名，不用图标）
  if (data.phase === 'vote' && data.structured?.winner) {
    const tally = document.getElementById('voteTally');
    if (tally) {
      tally.style.display = 'flex';
      const m = currentMatchData;
      const votes = { home:0, draw:0, away:0 };
      Object.values(agentsVoted).forEach(v => { if (v) votes[v] = (votes[v]||0) + 1; });
      document.getElementById('vtHome').textContent = `${m?.home||'主队'}胜 ${votes.home}票`;
      document.getElementById('vtDraw').textContent = `平局 ${votes.draw}票`;
      document.getElementById('vtAway').textContent = `${m?.away||'客队'}胜 ${votes.away}票`;
    }
  }
}

function updateAgentScoreBadge(agentId, score) {
  const card = document.getElementById(`card-${agentId}`);
  if (!card) return;
  let badge = card.querySelector('.agent-score-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'agent-score-badge';
    card.appendChild(badge);
  }
  badge.textContent = `${score[0]}–${score[1]}`;
  badge.style.color = AGENTS[agentId]?.cssColor || '#fff';
}

// ── Broadcast panel ───────────────────────────────────────
function updateBroadcast(data, agent) {
  const speech = highlightPlayers(escapeHtml(data.speech || ''), currentMatchData);
  const bp = document.getElementById('broadcastPanel');
  let container = bp.querySelector('.broadcast-content');
  if (!container) {
    bp.innerHTML = '';
    container = document.createElement('div');
    container.className = 'broadcast-content';
    bp.appendChild(container);
  }

  const phaseLabel = { opening:'开场', initial:'初判', debate:'对线', vote:'终投', reaction:'回应' }[data.phase] || data.phase;
  const isReaction = data.phase === 'reaction';
  const isMod = data.agentId === 'moderator';
  const badgeCls = { opening:'badge-opening', initial:'badge-initial', debate:'badge-debate', vote:'badge-vote', reaction:'' }[data.phase] || '';

  // 每次新发言时清空旧卡片，只保留当前一张
  // 旧卡片已在历史记录里，发言框只做"当前发言人"焦点
  container.querySelectorAll('.bc-card').forEach(c => c.remove());

  const shortSpeech = (data.speech || '').slice(0, 72) + ((data.speech || '').length > 72 ? '…' : '');

  const card = document.createElement('div');
  card.className = `bc-card bc-active${isMod ? ' moderator-card' : ''}${isReaction ? ' reaction-card' : ''}`;
  card.dataset.phase = data.phase;
  card.dataset.agentId = data.agentId; // C: agent 视觉指纹用
  card.style.setProperty('--seat-color', agent.cssColor);
  card.style.setProperty('--agent-color', agent.cssColor);

  const methodLabel = AGENT_METHOD_LABEL[data.agentId] || '';

  card.innerHTML = `
    <div class="bc-compact-line">
      <span class="bc-cl-icon">${agent.icon}</span>
      <span class="bc-cl-name" style="color:${agent.cssColor}">${escapeHtml(agent.name)}</span>
      <span class="bc-cl-text">${escapeHtml(shortSpeech)}</span>
    </div>
    <div class="bc-accent-bar"></div>
    <div class="bc-body-wrap">
      <div class="bc-portrait">
        <div class="bc-av">${agent.icon}</div>
        <div class="bc-av-role">${escapeHtml(agent.title)}</div>
      </div>
      <div class="bc-content">
        <div class="bc-top-row">
          <div class="bc-agent-name">${escapeHtml(agent.name)}</div>
          <span class="bc-phase-badge ${badgeCls}">${phaseLabel}</span>
        </div>
        ${methodLabel ? `<div class="bc-source-layer">${escapeHtml(methodLabel)}</div>` : ''}
        <div class="bc-speech">${speech}</div>
        ${data.catchphrase ? `<div class="bc-catchphrase">${escapeHtml(data.catchphrase)}</div>` : ''}
        ${data.scenePrediction ? `<div class="bc-scene">${escapeHtml(data.scenePrediction)}</div>` : ''}
        ${data.predictionTag ? `<span class="bc-tag">${escapeHtml(data.predictionTag)}</span>` : ''}
      </div>
    </div>
  `;

  container.appendChild(card);
  bp.scrollTop = bp.scrollHeight;
}

// ── History item ──────────────────────────────────────────
function addHistoryItem(data, agent) {
  const feed = document.getElementById('feed');
  const el = document.createElement('div');
  const cls = ['history-item'];
  if (data.phase === 'reaction') cls.push('reaction-item');
  if (data.agentId === 'moderator') cls.push('moderator-line');
  el.className = cls.join(' ');
  const speechText = data.speech || data.catchphrase || '';
  el.innerHTML = `<span class="hi-icon">${agent.icon}</span><span class="hi-name" style="color:${agent.cssColor}">${agent.name}</span><span class="hi-text">${escapeHtml(speechText)}</span>`;
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
  updateHistoryCount();
}

function appendPhaseBanner(phase, meta) {
  // Append to broadcast panel content
  const bp = document.getElementById('broadcastPanel');
  // 清空旧的阶段横幅，只保留最新
  bp.querySelectorAll('.phase-banner, .phase-flash').forEach(b => b.remove());
  let container = bp.querySelector('.broadcast-content');
  if (!container) {
    bp.innerHTML = '';
    container = document.createElement('div');
    container.className = 'broadcast-content';
    bp.appendChild(container);
  }
  const b = document.createElement('div');
  b.className = 'phase-banner';
  let label = PHASE_LABELS[phase] || phase;
  let desc = PHASE_DESC[phase] || '';
  if (phase === 'debate' && meta) {
    const a = AGENTS[meta.agentA], bb = AGENTS[meta.agentB];
    label = `💥 对线 · ${a?.name} vs ${bb?.name}`;
    desc = `${a?.name || '?'} vs ${bb?.name || '?'} 方法论碰撞`;
  }
  b.innerHTML = `<div class="banner-line"></div><span>${label}</span><div class="banner-line"></div>${desc ? `<div class="phase-desc">${desc}</div>` : ''}`;
  container.appendChild(b);
  // 3.5 秒后自动消失，不永久挡住议事厅
  setTimeout(() => { b.style.transition='opacity 0.5s'; b.style.opacity='0'; setTimeout(()=>b.remove(),500); }, 3500);
  // Also add to history feed
  const feed = document.getElementById('feed');
  if (feed) {
    const fi = document.createElement('div');
    fi.className = 'history-item moderator-line';
    fi.innerHTML = `<span class="hi-icon">—</span><span class="hi-text" style="color:var(--gold);letter-spacing:2px">${escapeHtml(label)}</span>`;
    feed.appendChild(fi);
    feed.scrollTop = feed.scrollHeight;
  }
}

// ── Speaker state ─────────────────────────────────────────
function setSpeaking(id, isThinking=false) {
  if (isThinking) {
    // thinking 阶段：仅对目标 agent 加脉冲动画，不改变其他人的高亮
    // 这样 feed 里当前发言者的高亮不会被破坏
    const card = document.getElementById(`card-${id}`);
    if (card) {
      card.classList.remove('speaking');
      card.classList.add('thinking');
    }
    if (id) window.Scene3D?.setAgentThinking(id);
    return;
  }

  // message 到达时才切换高亮：暗掉其他人，点亮当前发言者
  document.querySelectorAll('.agent-card').forEach(c => {
    c.classList.remove('speaking', 'thinking', 'idle-bg');
    if (id) {
      const cardId = c.id.replace('card-', '');
      if (cardId !== id) c.classList.add('idle-bg');
    }
  });
  if (id) {
    const card = document.getElementById(`card-${id}`);
    if (card) card.classList.add('speaking');
  }
  // seat cards
  const seatCard = id ? document.getElementById(`seat-${id}`) : null;
  document.querySelectorAll('.seat-card').forEach(c => {
    c.classList.remove('speaking', 'thinking', 'idle-bg');
    if (id) c.classList.add('idle-bg');
  });
  if (seatCard) {
    seatCard.classList.remove('idle-bg');
    seatCard.classList.add('speaking');
  }
  const hud = document.getElementById('speakerHud');
  if (hud) {
    if (id && !isThinking) {
      const a = AGENTS[id];
      const iconEl = document.getElementById('speakerHudIcon');
      const nameEl = document.getElementById('speakerHudName');
      if (iconEl) iconEl.textContent = a?.icon || '';
      if (nameEl) nameEl.textContent = a?.name || id;
      hud.style.setProperty('--speaker-color', a?.cssColor || '#fff');
      hud.classList.add('active');
    } else if (!id) {
      hud.classList.remove('active');
    }
    // 注意: isThinking=true 时不改变 HUD 状态，避免和 feed 内容错位
  }
  if (!id) { window.Scene3D?.resetAll(); return; }
  if (isThinking) window.Scene3D?.setAgentThinking(id);
  else            window.Scene3D?.setAgentSpeaking(id);
}

// reaction phase: 卡片亮起但摄像机不跳
function setSpeakingReaction(id) {
  if (!id) return;
  document.querySelectorAll('.agent-card').forEach(c => {
    c.classList.remove('speaking', 'thinking', 'idle-bg');
    if (c.id !== `card-${id}`) c.classList.add('idle-bg');
  });
  const card = document.getElementById(`card-${id}`);
  if (card) card.classList.add('speaking');
  const hud = document.getElementById('speakerHud');
  if (hud) {
    const a = AGENTS[id];
    const iconEl = document.getElementById('speakerHudIcon');
    const nameEl = document.getElementById('speakerHudName');
    if (iconEl) iconEl.textContent = a?.icon || '';
    if (nameEl) nameEl.textContent = a?.name || id;
    hud.style.setProperty('--speaker-color', a?.cssColor || '#fff');
    hud.classList.add('active');
  }
  window.Scene3D?.setAgentHighlight(id);
}

// ── Summary ───────────────────────────────────────────────
function handleSummary({ results, match, evHome, evDraw, evAway }) {
  setSpeaking(null);
  document.getElementById('liveBadge').classList.remove('active');
  document.querySelectorAll('.phase-step').forEach(s => { s.classList.remove('active'); s.classList.add('done'); });
  document.body.classList.remove('session-active');
  // 隐藏终投计数条（summary后不再需要）
  const _vt = document.getElementById('voteTally');
  if (_vt) _vt.style.display = 'none';
  showPhaseFlash('vote');

  setTimeout(() => {
    const home=match?.home||'主队', away=match?.away||'客队';
    // 钳位：防止 LLM 置信度异常时产生超出范围的概率
    const safeP = (v) => {
      const n = parseFloat(v);
      return isNaN(n) || !isFinite(n) ? 33 : Math.max(0.1, Math.min(99.9, n));
    };
    const rawH = safeP(results.home), rawD = safeP(results.draw), rawA = safeP(results.away);
    const pSum = rawH + rawD + rawA || 100;
    const outcomes=[
      { key:'home', label:`${home} 胜`, pct: rawH/pSum*100, color:'var(--green)', css:'#2ed573' },
      { key:'draw', label:'平  局',      pct: rawD/pSum*100, color:'var(--text-muted)', css:'#4a4a6a' },
      { key:'away', label:`${away} 胜`, pct: rawA/pSum*100, color:'var(--red)',   css:'#ff4757' },
    ].sort((a,b)=>b.pct-a.pct);
    const winner = outcomes[0];

    let userCompareHtml = '';
    if (userPrediction) {
      const agreesWithCouncil = userPrediction === winner.key;
      const pickLabel = { home:`${home} 胜`, draw:'平局', away:`${away} 胜` }[userPrediction];
      userCompareHtml = `
        <div class="user-comparison">
          <div class="ucr-title">🎯 你 vs 议会倾向</div>
          <div class="ucr-row">
            <div class="ucr-side">
              <div class="ucr-label">你的预测</div>
              <div class="ucr-pick">${pickLabel}</div>
            </div>
            <div class="ucr-vs">${agreesWithCouncil ? '✓' : '✗'}</div>
            <div class="ucr-side">
              <div class="ucr-label">议会裁决</div>
              <div class="ucr-pick">${winner.label.trim()}</div>
            </div>
          </div>
          <div class="ucr-agree ${agreesWithCouncil?'agree-yes':'agree-no'}">${agreesWithCouncil?'✓ 与议会方向一致':'✗ 与议会方向不同'}</div>
          <div class="ucr-note">比赛结束后录入实际比分，更新 AI 准确率记录</div>
        </div>`;
    }
    const predTimelineHtml = buildPredictionTimeline();

    // U6: 分镜卡片重设计 — 电影感卡片而非纯文字
    const scHtml = sessionScenes.length ? `
      <div class="scene-compare">
        <div class="sc-title">🎬 五种结局剧本</div>
        <div class="sc-cards">
          ${sessionScenes.map(sc => `
            <div class="sc-card" style="--sc-color:${sc.cssColor}">
              <div class="sc-card-header">
                <span class="sc-card-icon">${AGENTS[sc.agentId]?.icon || '?'}</span>
                <span class="sc-card-name" style="color:${sc.cssColor}">${escapeHtml(sc.name)}</span>
                <span class="sc-card-method">${escapeHtml(AGENT_METHOD_LABEL[sc.agentId] || '')}</span>
              </div>
              <div class="sc-card-scene">${escapeHtml(sc.text)}</div>
            </div>`).join('')}
        </div>
      </div>` : '';

    // 金句墙
    const cwHtml = sessionCatchphrases.length ? `
      <div class="catchphrase-wall">
        <div class="cw-title">🔥 今晚金句</div>
        <div class="cw-scroll">
          ${sessionCatchphrases.map(cp => `
            <div class="cw-item" style="--agent-color:${cp.color};border-left-color:${cp.cssColor}">
              <span class="cw-agent">${cp.name}</span>
              <span class="cw-text">${escapeHtml(cp.text)}</span>
            </div>`).join('')}
        </div>
      </div>` : '';

    const c = document.getElementById('resultsContainer');
    const card = document.createElement('div');
    card.className = 'results-card';
    card.innerHTML=`
      <div class="results-title">议 会 加 权 汇 总</div>
      ${outcomes.map(o=>`
        <div class="result-row">
          <div class="result-label" style="color:${o.color}">${o.label}</div>
          <div class="result-bar-bg"><div class="result-bar" id="bar-${o.key}" style="background:${o.color}"></div></div>
          <div class="result-pct" style="color:${o.color}">${o.pct.toFixed(1)}%</div>
          <div class="result-votes">${results.votes[o.key]}票</div>
        </div>`).join('')}
      <div class="verdict">🏆 议会裁决：${winner.label}</div>
      ${(evHome!=null||evDraw!=null||evAway!=null)?`
      <div class="ev-row">
        ${evHome!=null?`<span class="ev-item ${evHome>0?'ev-pos':'ev-neg'}">主胜EV: ${evHome>0?'+':''}${(evHome*100).toFixed(1)}%</span>`:''}
        ${evDraw!=null?`<span class="ev-item ${evDraw>0?'ev-pos':'ev-neg'}">平EV: ${evDraw>0?'+':''}${(evDraw*100).toFixed(1)}%</span>`:''}
        ${evAway!=null?`<span class="ev-item ${evAway>0?'ev-pos':'ev-neg'}">客胜EV: ${evAway>0?'+':''}${(evAway*100).toFixed(1)}%</span>`:''}
      </div>
      <div class="rebalance-note">↑ 经 W-5 概率校正层调整</div>`:''}
      ${userCompareHtml}${predTimelineHtml}${scHtml}${cwHtml}
      <div class="results-cta-row">
        <button class="cta-btn cta-share cta-share-img" onclick="copyResultSummary()">🖼️ 生成战报图片</button>
        <button class="cta-btn cta-record" onclick="showResultInputInline()">📝 录入比分</button>
        <button class="cta-btn cta-next" onclick="resetCouncil()">↺ 下一场</button>
      </div>
      <div id="resultInputInline" style="display:none">
        <div class="rii-label">录入比赛实际比分 · 更新 AI 准确率</div>
        <div class="rii-row">
          <input id="riiHome" type="number" min="0" max="20" value="0" class="rii-input">
          <span class="rii-vs">:</span>
          <input id="riiAway" type="number" min="0" max="20" value="0" class="rii-input">
          <button onclick="submitActualResultInline()" class="rii-submit">确认</button>
        </div>
        <div class="rii-note">录入后各 AI 角色历史准确率自动更新</div>
      </div>`;
    c.appendChild(card);
    c.classList.add('active');
    // 点击背景关闭（点到卡片内部不关闭）
    c.onclick = (e) => { if (e.target === c) { c.classList.remove('active'); } };
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      outcomes.forEach(o=>{const b=document.getElementById(`bar-${o.key}`);if(b)b.style.width=`${o.pct}%`;});
    }));

    // 议会综合比分
    if (results?.councilScore) {
      const [ch, ca] = results.councilScore;
      const mm = currentMatchData;
      // 把议会综合比分插入 results card
      const scoreHtml = `
        <div class="results-council-score">
          <div class="rcs-label">议会综合比分预测</div>
          <div class="rcs-score">${ch} – ${ca}</div>
          <div class="rcs-teams">${mm?.home||'主队'} vs ${mm?.away||'客队'}</div>
        </div>`;
      const verdict = card.querySelector('.verdict');
      if (verdict) verdict.insertAdjacentHTML('afterend', scoreHtml);

      if (userScore.home !== null && userScore.away !== null) {
        const hit = calcClientHitLevel([userScore.home, userScore.away], [ch, ca]);
        const labels = { perfect:'🏆 完美命中！你猜中了！', precise:'⭐ 精准命中，差一点点', valid:'✅ 方向正确', close:'💡 进球数接近', miss:'❌ 这次没猜对' };
        const hitClasses = { perfect:'hit-perfect', precise:'hit-precise', valid:'hit-valid', close:'hit-close', miss:'hit-miss' };
        const hitHtml = `<div class="results-hit ${hitClasses[hit]||''}">${labels[hit]||''}</div>`;
        const scoreBox = card.querySelector('.results-council-score');
        if (scoreBox) scoreBox.insertAdjacentHTML('afterend', hitHtml);
      }
      // 赛后录入
      document.getElementById('resultInputPanel').style.display = 'flex';
    }

    // N13: 保存本地战绩
    saveLocalHistory({
      ts: Date.now(),
      home: match?.home, away: match?.away,
      stage: match?.stage,
      verdict: winner.key,
      verdictLabel: winner.label,
      userPick: userPrediction,
      pct: Math.round(winner.pct),
    });

    // N11: 下一场推荐卡片
    const allM = allMatches || [];
    const currentIdx = allM.findIndex(m => m.id === match?.id);
    const nextMatch = allM[(currentIdx + 1) % allM.length];
    if (nextMatch && nextMatch.id !== match?.id) {
      const nmHtml = `<div class="next-match-card" onclick="loadAndSwitch('${nextMatch.id}')">
        <div class="nmc-label">▶ 下一场推荐</div>
        <div class="nmc-match">${nextMatch.homeFlag || ''} ${nextMatch.home} vs ${nextMatch.awayFlag || ''} ${nextMatch.away}</div>
        <div class="nmc-meta">${nextMatch.stage || ''} · ${nextMatch.date || ''}</div>
      </div>`;
      card.insertAdjacentHTML('beforeend', nmHtml);
    }

    // N7: 2秒后自动弹出分享预览
    setTimeout(() => showSharePreview(), 2200);
  }, 800);
}

// N7: 分享预览弹窗
function showSharePreview() {
  const existing = document.getElementById('sharePreviewModal');
  if (existing) return;
  const modal = document.createElement('div');
  modal.id = 'sharePreviewModal';
  modal.className = 'share-preview-modal';
  modal.innerHTML = `
    <div class="share-preview-inner">
      <div class="share-preview-title">🏆 议会预测完成！分享战报</div>
      <div style="font-size:11px;color:var(--text-sub);text-align:center;margin-bottom:8px">
        ${currentMatchData?.home || ''} vs ${currentMatchData?.away || ''} · ${sessionCatchphrases[0]?.text?.slice(0,30) || '精彩对决'}…
      </div>
      <div class="share-preview-actions">
        <button class="sp-copy" onclick="copyResultSummary();document.getElementById('sharePreviewModal')?.remove()">
          🖼️ 生成战报图片
        </button>
        <button class="sp-close" onclick="document.getElementById('sharePreviewModal')?.remove()">
          稍后再说
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// N11: 加载并切换到另一场比赛
async function loadAndSwitch(matchId) {
  document.getElementById('sharePreviewModal')?.remove();
  const sel = document.getElementById('matchSel');
  if (sel) { sel.value = matchId; await loadMatchDetail(matchId); }
  resetCouncil();
}

function calcClientHitLevel(predicted, actual) {
  if (!predicted || !actual) return 'unknown';
  const [ph, pa] = predicted, [ah, aa] = actual;
  if (ph === ah && pa === aa) return 'perfect';
  const pw = ph>pa?'home':ph<pa?'away':'draw', aw = ah>aa?'home':ah<aa?'away':'draw';
  if (pw===aw && Math.abs(ph+pa-ah-aa)<=1) return 'precise';
  if (pw===aw) return 'valid';
  if (Math.abs(ph+pa-ah-aa)<=1) return 'close';
  return 'miss';
}

async function submitActualResult() {
  const h = parseInt(document.getElementById('ripHome')?.value || 0);
  const a = parseInt(document.getElementById('ripAway')?.value || 0);
  const m = currentMatchData;
  try {
    const res = await fetch('/api/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId: m?.id, actualScore: [h, a] }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('resultInputPanel').style.display = 'none';
      // 显示用户命中等级
      if (userScore.home !== null) {
        const hit = calcClientHitLevel([userScore.home, userScore.away], [h, a]);
        const labels = { perfect:'🏆 完美命中！你猜对了！', precise:'⭐ 精准命中，差一点！', valid:'✅ 方向正确', close:'💡 接近预言', miss:'❌ 这次没猜对' };
        alert(labels[hit] || '已记录');
      }
    }
  } catch(e) { console.warn(e); }
}

function handleError(msg) {
  setSpeaking(null);
  document.getElementById('liveBadge').classList.remove('active');
  const d=document.createElement('div'); d.className='error-msg';
  d.textContent=`⚠️ ${msg}`;
  document.getElementById('feed').appendChild(d);
  enableControls();
}

function copyResultSummary() {
  const m = currentMatchData;
  const verdict = document.querySelector('.verdict')?.textContent?.trim() || '';
  const score = document.querySelector('.rcs-score')?.textContent?.trim() || '';

  const W = 800, H = 520;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── 辅助函数 ──
  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  };
  const CX = W / 2;

  // ── 背景 ──
  ctx.fillStyle = '#030c18';
  ctx.fillRect(0, 0, W, H);

  // 场馆顶部灯光
  const grad = ctx.createRadialGradient(CX, 0, 0, CX, 0, 380);
  grad.addColorStop(0, 'rgba(20,60,180,0.45)');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

  // 主场蓝光
  const hg = ctx.createRadialGradient(80, H/2, 0, 80, H/2, 320);
  hg.addColorStop(0, 'rgba(40,90,220,0.30)');
  hg.addColorStop(1, 'transparent');
  ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H);

  // 客场红光
  const ag = ctx.createRadialGradient(W-80, H/2, 0, W-80, H/2, 320);
  ag.addColorStop(0, 'rgba(200,30,50,0.28)');
  ag.addColorStop(1, 'transparent');
  ctx.fillStyle = ag; ctx.fillRect(0, 0, W, H);

  // 中心金光晕
  const cg = ctx.createRadialGradient(CX, 190, 0, CX, 190, 160);
  cg.addColorStop(0, 'rgba(200,168,50,0.10)');
  cg.addColorStop(1, 'transparent');
  ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H);

  // 草坪纹理（细横线）
  ctx.strokeStyle = 'rgba(0,80,20,0.07)'; ctx.lineWidth = 1;
  for (let ly = 460; ly < H; ly += 12) {
    ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke();
  }

  // ── 外框 ──
  ctx.strokeStyle = '#c8a832'; ctx.lineWidth = 2.5;
  rr(10, 10, W-20, H-20, 10); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,168,50,.22)'; ctx.lineWidth = 1;
  rr(16, 16, W-32, H-32, 7); ctx.stroke();

  // 角装饰（L形）
  const cs = 22;
  ctx.strokeStyle = '#f0d060'; ctx.lineWidth = 3;
  [[14,14],[W-14,14],[14,H-14],[W-14,H-14]].forEach(([cx,cy]) => {
    const sx = cx < W/2 ? 1 : -1, sy = cy < H/2 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(cx+sx*cs, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy+sy*cs); ctx.stroke();
  });

  // ── 顶栏 ──
  ctx.fillStyle = 'rgba(200,168,50,.07)';
  rr(10, 10, W-20, 52, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(200,168,50,.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(30, 62); ctx.lineTo(W-30, 62); ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f0d060';
  ctx.font = 'bold 15px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('🔮 预言者议会', 28, 43);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(221,238,255,.45)';
  ctx.font = '10px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(`AI 足球预测议会  ·  ${m?.stage || 'Premier League'}`, W-28, 43);

  // ── 球队区块 ──
  // 主场
  ctx.fillStyle = 'rgba(30,70,200,.18)';
  rr(24, 72, 210, 148, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(60,110,230,.3)'; ctx.lineWidth = 1; rr(24, 72, 210, 148, 8); ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#89baff';
  ctx.font = 'bold 22px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(m?.home || '主队', 129, 126);
  ctx.fillStyle = 'rgba(221,238,255,.35)';
  ctx.font = '10px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('H O M E', 129, 146);

  // 装饰线（蓝）
  const hbg = ctx.createLinearGradient(24, 0, 234, 0);
  hbg.addColorStop(0, 'rgba(60,110,230,.6)'); hbg.addColorStop(1, 'transparent');
  ctx.fillStyle = hbg; ctx.fillRect(24, 72, 210, 4);

  // 客场
  ctx.fillStyle = 'rgba(200,30,50,.18)';
  rr(W-234, 72, 210, 148, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(200,40,60,.3)'; ctx.lineWidth = 1; rr(W-234, 72, 210, 148, 8); ctx.stroke();

  ctx.fillStyle = '#ff9999';
  ctx.font = 'bold 22px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(m?.away || '客队', W-129, 126);
  ctx.fillStyle = 'rgba(221,238,255,.35)';
  ctx.font = '10px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('A W A Y', W-129, 146);

  // 装饰线（红）
  const abg = ctx.createLinearGradient(W-24, 0, W-234, 0);
  abg.addColorStop(0, 'rgba(200,40,60,.6)'); abg.addColorStop(1, 'transparent');
  ctx.fillStyle = abg; ctx.fillRect(W-234, 72, 210, 4);

  // ── 中间：比分 / VS ──
  ctx.fillStyle = 'rgba(200,168,50,.07)';
  rr(CX-120, 70, 240, 150, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(200,168,50,.28)'; ctx.lineWidth = 1; rr(CX-120, 70, 240, 150, 10); ctx.stroke();

  ctx.fillStyle = 'rgba(221,238,255,.32)';
  ctx.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('议 会 综 合 预 测', CX, 94);

  if (score) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(score, CX, 167);
  } else {
    ctx.fillStyle = 'rgba(200,168,50,.85)';
    ctx.font = 'bold 42px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('VS', CX, 162);
  }

  // ── 裁决横幅 ──
  if (verdict) {
    const cleanVerdict = verdict.replace(/^🏆\s*议会裁决[：:]\s*/, '');
    ctx.fillStyle = 'rgba(0,200,100,.12)';
    rr(CX-195, 230, 390, 36, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,200,100,.35)'; ctx.lineWidth = 1; rr(CX-195, 230, 390, 36, 6); ctx.stroke();

    ctx.fillStyle = '#00d46a';
    ctx.font = 'bold 15px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(`⚖️ 议会裁决：${cleanVerdict}`, CX, 253);
  }

  // ── 分割线 ──
  ctx.strokeStyle = 'rgba(200,168,50,.18)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(36, 282); ctx.lineTo(W-36, 282); ctx.stroke();

  // ── 金句 ──
  const quotes = sessionCatchphrases.slice(0, 3);
  let qy = 308;
  ctx.save();
  ctx.rect(36, 282, W-72, 160); ctx.clip();
  quotes.forEach((q, i) => {
    const color = q.cssColor || '#c8a832';
    // 彩色竖条
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(36, qy - 13, 3, 16);
    ctx.globalAlpha = 1;

    // agent 名
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.font = `bold 10px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.fillText(q.name || q.agentId, 46, qy);

    // 引言
    ctx.fillStyle = 'rgba(221,238,255,.78)';
    ctx.font = `11px "PingFang SC","Microsoft YaHei",sans-serif`;
    const qtext = `「${q.text.slice(0,40)}${q.text.length>40?'…':''}」`;
    ctx.fillText(qtext, 130, qy);
    qy += 30;
  });
  ctx.restore();

  // ── 用户预测 ──
  if (userPrediction && qy < H - 60) {
    const labels = { home:`${m?.home}胜`, draw:'平局', away:`${m?.away}胜` };
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(221,238,255,.45)';
    ctx.font = '10px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(`我的预测：${labels[userPrediction]||'?'}`, W-36, H-46);
  }

  // ── 底栏 ──
  ctx.fillStyle = 'rgba(200,168,50,.06)';
  rr(10, H-38, W-20, 28, 0); ctx.fill();
  ctx.strokeStyle = 'rgba(200,168,50,.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(30, H-38); ctx.lineTo(W-30, H-38); ctx.stroke();

  // 底部装饰点
  for (let dx = CX-80; dx <= CX+80; dx += 20) {
    ctx.fillStyle = 'rgba(200,168,50,.4)';
    ctx.beginPath(); ctx.arc(dx, H-38, 1.5, 0, Math.PI*2); ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.font = '10px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('Goalcast AI  ·  Oracle Council Predictor  ·  goalcast.ai', CX, H-18);

  // 右下小图标
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(200,168,50,.6)';
  ctx.font = '16px serif';
  ctx.fillText('🔮', W-28, H-18);

  // ── 复制 ──
  canvas.toBlob(blob => {
    if (!blob) { showToast('生成图片失败'); return; }
    if (navigator.clipboard?.write) {
      navigator.clipboard.write([new ClipboardItem({'image/png': blob})])
        .then(() => showToast('📸 战报图片已复制！可直接粘贴分享'))
        .catch(() => _downloadImg(canvas));
    } else {
      _downloadImg(canvas);
    }
  }, 'image/png');
}

function _downloadImg(canvas) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'oracle-council.png';
  a.click();
  showToast('📥 战报已下载，可发给朋友！');
}

function showResultInputInline() {
  const el = document.getElementById('resultInputInline');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function submitActualResultInline() {
  const h = parseInt(document.getElementById('riiHome')?.value) || 0;
  const a = parseInt(document.getElementById('riiAway')?.value) || 0;
  const m = currentMatchData;
  try {
    const res = await fetch('/api/result', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ matchId: m?.id, actualScore: [h, a] }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('resultInputInline').style.display = 'none';
      if (userScore.home !== null) {
        const hit = calcClientHitLevel([userScore.home, userScore.away], [h, a]);
        const msgs = { perfect:'🏆 完美命中！你猜中了！', precise:'⭐ 精准！方向和进球数都接近', valid:'✅ 方向正确', close:'💡 进球数相差1球', miss:'❌ 这次没猜到' };
        showToast(msgs[hit] || '✅ 已录入');
      } else {
        showToast('✅ 已录入，AI准确率已更新');
      }
      agentAccuracyProfiles = {};
      fetchAccuracyProfiles();
    }
  } catch(e) { showToast('录入失败，请重试'); }
}

function toggleChangelog() {
  const m = document.getElementById('changelogModal');
  if (!m) return;
  m.style.display = m.style.display === 'none' ? 'flex' : 'none';
}

function showToast(msg) {
  let t = document.getElementById('globalToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'globalToast';
    t.className = 'global-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('toast-show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('toast-show'), 3000);
}

function resetCouncil() {
  if(currentEs){currentEs.close();currentEs=null;}
  document.body.classList.remove('session-active');
  document.getElementById('feed').innerHTML='';
  const rc = document.getElementById('resultsContainer');
  rc.innerHTML = ''; rc.classList.remove('active');
  const bp=document.getElementById('broadcastPanel');
  bp.innerHTML='<div class="broadcast-placeholder">⚖️ 预言者议会即将开始</div>';
  bp.style.removeProperty('--bp-color');
  // clear stance panel and consensus bar
  document.getElementById('stancePanel')?.remove();
  document.getElementById('consensusBarGlobal')?.remove();
  currentBlackboard = null;
  document.getElementById('liveBadge').classList.remove('active');
  document.querySelectorAll('.phase-step').forEach(s=>s.classList.remove('active','done'));
  setSpeaking(null);
  sessionCatchphrases=[];sessionScenes=[];
  clearTimeout(heroHideTimer); heroQueue.length = 0; heroActive = false; hideHero();
  document.getElementById('evidenceBoard')?.classList.remove('eb-active');
  ebInitialized = false;
  prevPivotCount = 0; fullConsensusTriggered = false;
  document.getElementById('signatureMoment')?.classList.remove('sm-show');
  userPrediction=null; selectedPick=null;
  userScore = { home: 0, away: 0 };
  agentPredictedScores = {};
  document.querySelectorAll('.agent-score-badge').forEach(b => b.remove());
  const _csBox = document.getElementById('councilScoreBox');
  if (_csBox) _csBox.style.display = 'none';
  const _hitEl = document.getElementById('userHitLevel');
  if (_hitEl) _hitEl.style.display = 'none';
  document.getElementById('resultInputPanel').style.display = 'none';
  predictionHistory = [];
  probState={ homeW:0, drawW:0, awayW:0, home:33, draw:34, away:33, count:0 };
  agentsVoted={};
  document.getElementById('probBarWrap')?.classList.remove('has-votes');
  initProbBar();
  deactivateSplitScreen();
  // U2: 恢复焦点banner
  const _banner = document.getElementById('featuredMatchBanner');
  if (_banner && _banner.textContent.trim()) _banner.style.display = 'block';
  // vote tally 重置
  const _vt = document.getElementById('voteTally');
  if (_vt) _vt.style.display = 'none';
  enableControls();
}

function enableControls(){
  document.getElementById('startBtn').disabled=false;
  document.getElementById('matchSel').disabled=false;
}

// ── Helpers ───────────────────────────────────────────────
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function highlightPlayers(text,md){
  if(!md)return text;
  const names=[...(md.homePlayers||[]),...(md.awayPlayers||[])].map(p=>p.name).filter(Boolean).sort((a,b)=>b.length-a.length);
  let r=text;
  for(const n of names){const rx=new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g');r=r.replace(rx,`<span class="player-mention">${n}</span>`);}
  return r;
}

// ── Live Ticker ───────────────────────────────────────────
let tickerInterval = null;

function buildTickerItems() {
  const items = [];
  const m = currentMatchData;
  if (m) {
    if (m.odds) {
      items.push(`🏠 ${m.home}  @${m.odds.home}`);
      items.push(`⚖️ 平局  @${m.odds.draw}`);
      items.push(`✈️ ${m.away}  @${m.odds.away}`);
    }
    if (m.leagueContext) {
      const lc = m.leagueContext;
      items.push(`${m.home} 积分榜第${lc.homeRank}位（${lc.homePoints}分）`);
      items.push(`${m.away} 积分榜第${lc.awayRank}位（${lc.awayPoints}分）`);
    }
    if (m.briefing?.homeForm) items.push(`${m.home}：${m.briefing.homeForm}`);
    if (m.briefing?.awayForm) items.push(`${m.away}：${m.briefing.awayForm}`);
    if (m.briefing?.h2h) items.push(`历史交锋：${m.briefing.h2h}`);
  }
  if (currentBlackboard) {
    const cl = currentBlackboard.consensusLevel;
    if (cl != null) items.push(`议会共识度 ${Math.round(cl * 100)}%`);
    const stances = currentBlackboard.agentStances || {};
    const pickLabels = { home:'主队', draw:'平局', away:'客队' };
    Object.entries(stances).forEach(([id, s]) => {
      if (s?.pick) {
        const conf = Math.round((s.conf || 0) * 100);
        items.push(`${AGENTS[id]?.name || id} → ${pickLabels[s.pick] || s.pick} ${conf}%`);
      }
    });
  }
  if (!items.length) items.push('加载比赛数据中...');
  return items.join('　　·　　') + '　　·　　';
}

function updateTicker() {
  const el = document.getElementById('tickerContent');
  if (!el) return;
  const text = buildTickerItems();
  // 重复一遍实现无缝滚动
  const doubled = text + text;
  if (el.textContent !== doubled) {
    el.textContent = doubled;
    // Reset animation
    el.style.animation = 'none';
    void el.offsetWidth;
    const duration = Math.max(20, doubled.length * 0.15);
    el.style.animation = `tickerScroll ${duration}s linear infinite`;
  }
}

function startTicker() {
  updateTicker();
  clearInterval(tickerInterval);
  tickerInterval = setInterval(updateTicker, 12000);
}

init();

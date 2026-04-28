import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CACHE_DIR = path.join(process.cwd(), '.cache');
const BASE_URL = 'https://api.football-data.org/v4';
const ODDS_URL = 'https://api.the-odds-api.com/v4/sports/soccer_epl/odds/';
const FPL_BASE = 'https://fantasy.premierleague.com/api';

// football-data.org 英文队名 → FPL team ID（2025-26赛季）
const FD_TO_FPL_ID = {
  'Arsenal FC': 1,           'Aston Villa FC': 2,
  'Burnley FC': 3,           'AFC Bournemouth': 4,
  'Brentford FC': 5,         'Brighton & Hove Albion FC': 6,
  'Chelsea FC': 7,           'Crystal Palace FC': 8,
  'Everton FC': 9,           'Fulham FC': 10,
  'Leeds United FC': 11,     'Liverpool FC': 12,
  'Manchester City FC': 13,  'Manchester United FC': 14,
  'Newcastle United FC': 15, 'Nottingham Forest FC': 16,
  'Sunderland AFC': 17,      'Tottenham Hotspur FC': 18,
  'West Ham United FC': 19,  'Wolverhampton Wanderers FC': 20,
};

const FPL_POS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const FPL_STATUS = { a: 'available', d: 'doubt', i: 'out', u: 'out', s: 'out', n: 'out' };

const TEAM_CN = {
  'Arsenal FC':                  { cn: '阿森纳',      color: '#EF0107', flag: '🔴' },
  'Chelsea FC':                  { cn: '切尔西',      color: '#034694', flag: '🔵' },
  'Liverpool FC':                { cn: '利物浦',      color: '#C8102E', flag: '❤️' },
  'Manchester City FC':          { cn: '曼城',        color: '#6CABDD', flag: '🔵' },
  'Manchester United FC':        { cn: '曼联',        color: '#DA020E', flag: '🔴' },
  'Tottenham Hotspur FC':        { cn: '热刺',        color: '#132257', flag: '⚪' },
  'Aston Villa FC':              { cn: '阿斯顿维拉',  color: '#95BFE5', flag: '🟣' },
  'Newcastle United FC':         { cn: '纽卡斯尔',    color: '#241F20', flag: '⚫' },
  'Brighton & Hove Albion FC':   { cn: '布莱顿',      color: '#0057B8', flag: '🔵' },
  'West Ham United FC':          { cn: '西汉姆',      color: '#7A263A', flag: '🔴' },
  'Crystal Palace FC':           { cn: '水晶宫',      color: '#1B458F', flag: '🔵' },
  'Brentford FC':                { cn: '布伦特福德',  color: '#E30613', flag: '🔴' },
  'Fulham FC':                   { cn: '富勒姆',      color: '#FFFFFF', flag: '⚪' },
  'Wolverhampton Wanderers FC':  { cn: '狼队',        color: '#FDB913', flag: '🟡' },
  'Everton FC':                  { cn: '埃弗顿',      color: '#003399', flag: '🔵' },
  'Nottingham Forest FC':        { cn: '诺丁汉森林',  color: '#DD0000', flag: '🔴' },
  'AFC Bournemouth':             { cn: '伯恩茅斯',    color: '#DA291C', flag: '🔴' },
  'Southampton FC':              { cn: '南安普顿',    color: '#D71920', flag: '🔴' },
  'Leicester City FC':           { cn: '莱斯特城',    color: '#003090', flag: '🔵' },
  'Ipswich Town FC':             { cn: '伊普斯维奇',  color: '#0044A9', flag: '🔵' },
  'Sunderland AFC':              { cn: '桑德兰',      color: '#EB172B', flag: '🔴' },
  'Burnley FC':                  { cn: '伯恩利',      color: '#6C1D45', flag: '🟣' },
  'Leeds United FC':             { cn: '利兹联',      color: '#FFCD00', flag: '🟡' },
  'Luton Town FC':               { cn: '卢顿',        color: '#F78F1E', flag: '🟠' },
  'Sheffield United FC':         { cn: '谢菲尔德联',  color: '#EE2737', flag: '🔴' },
};

async function ensureCacheDir() {
  await fs.promises.mkdir(CACHE_DIR, { recursive: true });
}

async function readCache(key) {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    const raw = await fs.promises.readFile(file, 'utf-8');
    const data = JSON.parse(raw);
    if (data.expires <= Date.now()) return null;
    if (Array.isArray(data.value) && data.value.length === 0) return null;
    return data.value;
  } catch {
    return null;
  }
}

async function writeCache(key, value, ttlMs) {
  await ensureCacheDir();
  const file = path.join(CACHE_DIR, `${key}.json`);
  await fs.promises.writeFile(file, JSON.stringify({ expires: Date.now() + ttlMs, value }), 'utf-8');
}

async function footballFetch(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY },
  });
  if (!res.ok) throw new Error(`football-data API ${res.status}: ${endpoint}`);
  return res.json();
}

export async function fetchPLFixtures() {
  const cacheKey = 'pl-fixtures';
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  try {
    const now = new Date();
    const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const dateFrom = now.toISOString().split('T')[0];
    const dateTo = future.toISOString().split('T')[0];
    const data = await footballFetch(`/competitions/PL/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED`);
    const fixtures = data.matches || [];
    await writeCache(cacheKey, fixtures, 12 * 60 * 60 * 1000);
    return fixtures;
  } catch (err) {
    console.warn('[dataFetcher] fetchPLFixtures failed:', err.message);
    return [];
  }
}

export async function fetchTeamForm(teamId) {
  const cacheKey = `team-form-${teamId}`;
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  try {
    const data = await footballFetch(`/teams/${teamId}/matches?status=FINISHED&limit=5`);
    const matches = (data.matches || []).slice(-5);
    await writeCache(cacheKey, matches, 6 * 60 * 60 * 1000);
    return matches;
  } catch (err) {
    console.warn('[dataFetcher] fetchTeamForm failed:', err.message);
    return [];
  }
}

export async function fetchH2H(matchId) {
  const cacheKey = `h2h-${matchId}`;
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  try {
    const data = await footballFetch(`/matches/${matchId}/head2head?limit=10`);
    const matches = data.matches || [];
    await writeCache(cacheKey, matches, 6 * 60 * 60 * 1000);
    return matches;
  } catch (err) {
    console.warn('[dataFetcher] fetchH2H failed:', err.message);
    return [];
  }
}

export async function fetchStandings() {
  const cacheKey = 'pl-standings';
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  try {
    const data = await footballFetch('/competitions/PL/standings');
    const table = data.standings?.[0]?.table || [];
    await writeCache(cacheKey, table, 12 * 60 * 60 * 1000);
    return table;
  } catch (err) {
    console.warn('[dataFetcher] fetchStandings failed:', err.message);
    return [];
  }
}

export async function fetchOdds(homeTeamName, awayTeamName) {
  const cacheKey = `odds-${homeTeamName}-${awayTeamName}`.replace(/\s+/g, '_');
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  const defaultOdds = { home: 2.5, draw: 3.2, away: 2.8 };

  try {
    const url = `${ODDS_URL}?apiKey=${process.env.ODDS_API_KEY}&regions=uk&markets=h2h&bookmakers=bet365`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`odds-api ${res.status}`);
    const events = await res.json();

    const normalize = (name) => name.toLowerCase().replace(/\s+/g, '');
    const homeNorm = normalize(homeTeamName);
    const awayNorm = normalize(awayTeamName);

    const match = events.find((e) => {
      const hn = normalize(e.home_team);
      const an = normalize(e.away_team);
      return (hn.includes(homeNorm.slice(0, 5)) || homeNorm.includes(hn.slice(0, 5))) &&
             (an.includes(awayNorm.slice(0, 5)) || awayNorm.includes(an.slice(0, 5)));
    });

    if (!match) {
      await writeCache(cacheKey, defaultOdds, 60 * 60 * 1000);
      return defaultOdds;
    }

    const bookmaker = match.bookmakers?.[0];
    const h2hMarket = bookmaker?.markets?.find((m) => m.key === 'h2h');
    if (!h2hMarket) {
      await writeCache(cacheKey, defaultOdds, 60 * 60 * 1000);
      return defaultOdds;
    }

    const outcomes = h2hMarket.outcomes;
    const homeOut = outcomes.find((o) => normalize(o.name).includes(homeNorm.slice(0, 5)));
    const awayOut = outcomes.find((o) => normalize(o.name).includes(awayNorm.slice(0, 5)));
    const drawOut = outcomes.find((o) => o.name === 'Draw');

    const odds = {
      home: homeOut?.price ?? defaultOdds.home,
      draw: drawOut?.price ?? defaultOdds.draw,
      away: awayOut?.price ?? defaultOdds.away,
    };

    await writeCache(cacheKey, odds, 60 * 60 * 1000);
    return odds;
  } catch (err) {
    console.warn('[dataFetcher] fetchOdds failed:', err.message);
    return defaultOdds;
  }
}

// ── FPL (Fantasy Premier League) 公开 API ─────────────────────

async function fetchFPLBootstrap() {
  const cacheKey = 'fpl-bootstrap';
  const cached = await readCache(cacheKey);
  if (cached) return cached;
  try {
    const res = await fetch(`${FPL_BASE}/bootstrap-static/`);
    if (!res.ok) throw new Error(`FPL API ${res.status}`);
    const data = await res.json();
    const result = { teams: data.teams, elements: data.elements };
    await writeCache(cacheKey, result, 6 * 60 * 60 * 1000);
    return result;
  } catch (err) {
    console.warn('[dataFetcher] fetchFPLBootstrap failed:', err.message);
    return null;
  }
}

export async function fetchTeamFPLData(teamFullName) {
  const fplId = FD_TO_FPL_ID[teamFullName];
  if (!fplId) return null;
  const boot = await fetchFPLBootstrap();
  if (!boot) return null;

  const all = boot.elements.filter(p => p.team === fplId && p.minutes > 90);
  all.sort((a, b) => b.minutes - a.minutes);

  // 按位置各取名额：1 GK, 2 DEF, 3 MID, 2 FWD
  const byPos = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of all) { if (byPos[p.element_type]) byPos[p.element_type].push(p); }
  const selected = [
    ...byPos[1].slice(0, 1),
    ...byPos[2].slice(0, 2),
    ...byPos[3].slice(0, 3),
    ...byPos[4].slice(0, 2),
  ];

  const players = selected.map(p => {
    const xg90 = parseFloat(p.expected_goals_per_90 || 0);
    const xa90 = parseFloat(p.expected_assists_per_90 || 0);
    const isAttack = p.element_type >= 3;
    const stat = isAttack
      ? `${p.goals_scored}球${p.assists}助 xG/90:${xg90.toFixed(2)}`
      : `${p.minutes}分钟 积分${p.total_points}`;
    let status = FPL_STATUS[p.status] || 'available';
    // form高且可上场标记为hot
    if (status === 'available' && parseFloat(p.form || 0) >= 8) status = 'hot';
    return { name: p.web_name, pos: FPL_POS[p.element_type] || '?', stat, status, news: p.news || '' };
  });

  // 进攻球员xG汇总（位置3/4，上场>200分钟）
  const attackers = all.filter(p => p.element_type >= 3 && p.minutes > 200);
  attackers.sort((a, b) => parseFloat(b.expected_goals_per_90 || 0) - parseFloat(a.expected_goals_per_90 || 0));
  const totalXG = all.reduce((s, p) => s + parseFloat(p.expected_goals || 0), 0);
  const maxMin = all.reduce((m, p) => Math.max(m, p.minutes), 0);
  const xgPerMatch = maxMin > 0 ? (totalXG / (maxMin / 90)).toFixed(2) : '?';
  const topXG = attackers.slice(0, 3).map(p => `${p.web_name} ${parseFloat(p.expected_goals_per_90 || 0).toFixed(2)}`);
  const xgNote = `xG/场约${xgPerMatch}（${topXG.join('、')}）`;

  // 伤病新闻聚合（status非a的球员）
  const injured = selected.filter(p => p.news);
  const newsStr = injured.length
    ? injured.map(p => {
        const label = p.status === 'd' ? '存疑' : '缺阵';
        return `${p.web_name}（${label}）：${p.news.slice(0, 50)}`;
      }).join('；')
    : '';

  return { players, xgNote, newsStr };
}

// ── EV / 水钱计算 ──────────────────────────────────────────────

export function calcOddsEV(homeOdds, drawOdds, awayOdds) {
  if (!homeOdds || !drawOdds || !awayOdds) return '赔率数据不足';
  const rh = 1 / homeOdds, rd = 1 / drawOdds, ra = 1 / awayOdds;
  const overround = rh + rd + ra;
  const margin = ((overround - 1) * 100).toFixed(1);
  const ph = (rh / overround * 100).toFixed(1);
  const pd = (rd / overround * 100).toFixed(1);
  const pa = (ra / overround * 100).toFixed(1);
  return `庄家水钱${margin}%；真实隐含概率：主胜${ph}%、平局${pd}%、客胜${pa}%`;
}

// ── 历史注解生成（从H2H原始数据提炼） ─────────────────────────

export function buildHistoricalNote(h2hMatches, homeTeamId, homeName, awayName) {
  if (!h2hMatches || !h2hMatches.length) return null;
  const valid = h2hMatches.filter(m =>
    m.score?.fullTime?.home != null && m.score?.fullTime?.away != null
  );
  if (!valid.length) return null;
  // 平均进球
  const totalGoals = valid.reduce((s, m) => s + m.score.fullTime.home + m.score.fullTime.away, 0);
  const avgGoals = (totalGoals / valid.length).toFixed(1);
  // 最近一场比分
  const last = valid[valid.length - 1];
  const lastScore = `${last.score.fullTime.home}-${last.score.fullTime.away}`;
  const lastDate = last.utcDate ? last.utcDate.slice(0, 10) : '未知';
  // 主场胜率（只统计本次主队真正在主场的场次）
  const homeGames = valid.filter(m => m.homeTeam?.id === homeTeamId);
  const homeWins = homeGames.filter(m => m.score.fullTime.home > m.score.fullTime.away);
  const homeWinRate = homeGames.length
    ? `${homeName}主场胜率${Math.round(homeWins.length / homeGames.length * 100)}%（${homeWins.length}/${homeGames.length}场）`
    : '主场场次不足';
  // 进球模式：大球局（≥3球）比例
  const bigGames = valid.filter(m => m.score.fullTime.home + m.score.fullTime.away >= 3);
  const bigRate = Math.round(bigGames.length / valid.length * 100);
  return `近${valid.length}次对阵场均${avgGoals}球（${bigRate}%为大球局）；最近一次${lastDate}：${lastScore}；${homeWinRate}`;
}

function summarizeForm(matches, teamId) {
  if (!matches.length) return '近5场数据暂无';
  let w = 0, d = 0, l = 0, goals = 0;
  for (const m of matches) {
    const isHome = m.homeTeam?.id === teamId;
    const tScore = isHome ? m.score?.fullTime?.home : m.score?.fullTime?.away;
    const oScore = isHome ? m.score?.fullTime?.away : m.score?.fullTime?.home;
    if (tScore == null || oScore == null) continue;
    goals += tScore;
    if (tScore > oScore) w++;
    else if (tScore === oScore) d++;
    else l++;
  }
  const gpg = matches.length ? (goals / matches.length).toFixed(1) : 0;
  return `近5场：${w}胜${d}平${l}负，进球${gpg}/场`;
}

function summarizeH2H(h2hMatches, homeTeamId) {
  if (!h2hMatches.length) return '历史交锋数据暂无';
  let hw = 0, d = 0, aw = 0;
  for (const m of h2hMatches) {
    const hs = m.score?.fullTime?.home;
    const as = m.score?.fullTime?.away;
    if (hs == null || as == null) continue;
    if (hs > as) {
      if (m.homeTeam?.id === homeTeamId) hw++; else aw++;
    } else if (hs === as) d++;
    else {
      if (m.homeTeam?.id === homeTeamId) aw++; else hw++;
    }
  }
  return `近${h2hMatches.length}次交锋：主队${hw}胜${d}平${aw}负`;
}

function calcGoalStats(matches, teamId) {
  if (!matches.length) return { for: null, against: null };
  let goalsFor = 0, goalsAgainst = 0, count = 0;
  for (const m of matches) {
    const isHome = m.homeTeam?.id === teamId;
    const gf = isHome ? m.score?.fullTime?.home : m.score?.fullTime?.away;
    const ga = isHome ? m.score?.fullTime?.away : m.score?.fullTime?.home;
    if (gf == null || ga == null) continue;
    goalsFor += gf; goalsAgainst += ga; count++;
  }
  if (!count) return { for: null, against: null };
  return { for: parseFloat((goalsFor/count).toFixed(1)), against: parseFloat((goalsAgainst/count).toFixed(1)) };
}

function getH2HScoreDistribution(h2hMatches, homeTeamId) {
  if (!h2hMatches.length) return '历史比分数据暂无';
  const freq = {};
  for (const m of h2hMatches) {
    const hs = m.score?.fullTime?.home, as_ = m.score?.fullTime?.away;
    if (hs == null || as_ == null) continue;
    const isActualHome = m.homeTeam?.id === homeTeamId;
    const ts = isActualHome ? hs : as_, os = isActualHome ? as_ : hs;
    const key = `${ts}-${os}`;
    freq[key] = (freq[key] || 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,4).map(([s,n]) => `${s}(${n}次)`);
  return `近${h2hMatches.length}次最常见：${sorted.join('、')}`;
}

function inferScoreFromOdds(homeOdds, drawOdds, awayOdds) {
  if (!homeOdds || !drawOdds || !awayOdds) return '赔率数据不足';
  const rh = 1/homeOdds, rd = 1/drawOdds, ra = 1/awayOdds;
  const t = rh+rd+ra;
  const ph = rh/t, pd = rd/t, pa = ra/t;
  let hint = '';
  if (ph > 0.55) hint = '强烈看主队→2-0或2-1居多';
  else if (ph > 0.42) hint = '小幅看主队→1-0或2-1';
  else if (pd > 0.32) hint = '倾向平局→1-1或0-0';
  else if (pa > 0.42) hint = '看客队→0-1或1-2';
  else hint = '均衡→1-0/1-1/0-1都有可能';
  const goalLine = homeOdds < 1.8 ? '预计进球偏少(<2球)' : homeOdds < 2.4 ? '预计进球中等(2-3球)' : '预计进球偏多(≥3球)';
  return `${hint}，${goalLine}`;
}

function determineStakes(homeEntry, awayEntry) {
  if (!homeEntry || !awayEntry) return 'mid';
  const homePos = homeEntry.position;
  const awayPos = awayEntry.position;
  if (homePos <= 4 && awayPos <= 4) return 'title';
  if (homePos <= 6 || awayPos <= 6) return 'top4';
  if (homePos >= 17 || awayPos >= 17) return 'relegation';
  if ((homePos <= 6 && awayPos >= 17) || (awayPos <= 6 && homePos >= 17)) return 'mixed';
  return 'mid';
}

export function buildMatchData(fixture, standings, homeForm, awayForm, h2h, odds) {
  const homeTeamName = fixture.homeTeam?.name || '';
  const awayTeamName = fixture.awayTeam?.name || '';
  const homeInfo = TEAM_CN[homeTeamName] || { cn: homeTeamName, color: '#888888', flag: '⚽' };
  const awayInfo = TEAM_CN[awayTeamName] || { cn: awayTeamName, color: '#888888', flag: '⚽' };

  const home = homeInfo.cn;
  const away = awayInfo.cn;
  const matchday = fixture.matchday || 1;

  const homeEntry = standings.find((s) => s.team?.id === fixture.homeTeam?.id);
  const awayEntry = standings.find((s) => s.team?.id === fixture.awayTeam?.id);
  const homeRank = homeEntry?.position ?? 0;
  const awayRank = awayEntry?.position ?? 0;
  const homePoints = homeEntry?.points ?? 0;
  const awayPoints = awayEntry?.points ?? 0;

  const stakes = determineStakes(homeEntry, awayEntry);

  let contextParts = [`英超联赛第${matchday}轮，${home}主场迎战${away}`];
  if (homeRank && awayRank) {
    contextParts.push(`${home}目前排名第${homeRank}（${homePoints}分），${away}排名第${awayRank}（${awayPoints}分）`);
  }
  if (stakes === 'title') contextParts.push('双方均在争冠集团，本场是积分榜直接对话');
  else if (stakes === 'top4') contextParts.push('欧冠资格争夺战，积分至关重要');
  else if (stakes === 'relegation') contextParts.push('保级区激烈争夺，生死博弈');
  else if (stakes === 'mixed') contextParts.push('上下半区对决，强弱对比鲜明');

  const homeFormStr = summarizeForm(homeForm, fixture.homeTeam?.id);
  const awayFormStr = summarizeForm(awayForm, fixture.awayTeam?.id);
  const h2hStr = summarizeH2H(h2h, fixture.homeTeam?.id);
  const homeGoalStats = calcGoalStats(homeForm, fixture.homeTeam?.id);
  const awayGoalStats = calcGoalStats(awayForm, fixture.awayTeam?.id);
  const h2hScoreFreq = getH2HScoreDistribution(h2h, fixture.homeTeam?.id);
  const impliedScore = inferScoreFromOdds(odds.home, odds.draw, odds.away);

  let oddsMove = `主队赔率${odds.home}，平局赔率${odds.draw}，客队赔率${odds.away}`;
  let standingsCtx = '';
  if (homeRank && awayRank) {
    const diff = Math.abs(homePoints - awayPoints);
    standingsCtx = `${home}排名第${homeRank}（${homePoints}分），${away}排名第${awayRank}（${awayPoints}分），积分差${diff}分`;
  }

  return {
    id: `pl-${fixture.id}`,
    fixtureId: fixture.id,
    homeTeamId: fixture.homeTeam?.id,
    awayTeamId: fixture.awayTeam?.id,
    _homeTeamFullName: homeTeamName,
    _awayTeamFullName: awayTeamName,
    home,
    away,
    homeFlag: homeInfo.flag,
    awayFlag: awayInfo.flag,
    homeColor: homeInfo.color,
    awayColor: awayInfo.color,
    homeCrest: fixture.homeTeam?.crest || '',
    awayCrest: fixture.awayTeam?.crest || '',
    stage: `第${matchday}轮`,
    venue: fixture.venue || '待定',
    utcDate: fixture.utcDate,
    context: contextParts.join('，'),
    odds: {
      home: odds.home,
      draw: odds.draw,
      away: odds.away,
    },
    briefing: {
      homeForm: homeFormStr,
      awayForm: awayFormStr,
      avgHomeGoals: homeGoalStats.for != null ? `${home}场均进${homeGoalStats.for}球/失${homeGoalStats.against}球` : '数据暂无',
      avgAwayGoals: awayGoalStats.for != null ? `${away}场均进${awayGoalStats.for}球/失${awayGoalStats.against}球` : '数据暂无',
      h2hScoreFreq,
      impliedScore,
      h2h: h2hStr,
      oddsMove,
      tactical: '数据待分析',
      standingsCtx,
    },
    homePlayers: [],
    awayPlayers: [],
    agentSeeds: {},
    leagueContext: {
      homeRank,
      awayRank,
      homePoints,
      awayPoints,
      matchday,
      totalMatchdays: 38,
      stakes,
    },
  };
}

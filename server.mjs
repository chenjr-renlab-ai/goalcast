import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runCouncil } from './agents.mjs';
import { MATCHES, getMatch } from './match-data.mjs';
import {
  fetchPLFixtures,
  fetchTeamForm,
  fetchH2H,
  fetchStandings,
  fetchOdds,
  buildMatchData,
  fetchTeamFPLData,
  calcOddsEV,
  buildHistoricalNote,
} from './dataFetcher.mjs';
import { generateSeeds } from './seedGenerator.mjs';
import { rebalance } from './rebalancer.mjs';
import { loadLongTermMemory, getAgentProfiles, saveEpisode, updateAgentAccuracy, updateAgentBrierScore } from './memory.mjs';

// ── .env 加载 ─────────────────────────────────────────────────
try {
  fs.readFileSync(new URL('.env', import.meta.url), 'utf8')
    .split('\n')
    .forEach((l) => {
      const i = l.indexOf('=');
      if (i > 0) {
        const k = l.slice(0, i).trim();
        const v = l.slice(i + 1).trim();
        if (k && !process.env[k]) process.env[k] = v;
      }
    });
} catch {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// ── 内存状态 ──────────────────────────────────────────────────
let liveMatches = [];                // 从 API 拉取的比赛列表
let currentSessionMonitor = [];      // 当前 /api/run 会话的事件队列（最多 500 条）
let currentBlackboard = null;        // 最新黑板快照
let sessionActive = false;           // 是否有 /api/run 正在运行
const prepareInProgress = new Set(); // 防止重复触发 prepare
const analyticsEvents = [];          // 用户行为埋点（内存，最多10000条）

// ── 比赛数据延迟补全 ─────────────────────────────────────────
async function enrichMatchBriefing(match) {
  if (!match.homeTeamId || !match.awayTeamId) return {};
  try {
    // 并行拉取：战绩/H2H/FPL球员数据
    const [homeForm, awayForm, h2h, homeFPL, awayFPL] = await Promise.all([
      fetchTeamForm(match.homeTeamId).catch(() => []),
      fetchTeamForm(match.awayTeamId).catch(() => []),
      match.fixtureId ? fetchH2H(match.fixtureId).catch(() => []) : Promise.resolve([]),
      fetchTeamFPLData(match._homeTeamFullName || '').catch(() => null),
      fetchTeamFPLData(match._awayTeamFullName || '').catch(() => null),
    ]);

    // 场均进失球
    const goalStats = (matches, teamId) => {
      if (!matches.length) return null;
      let gf = 0, ga = 0, n = 0;
      for (const m of matches) {
        const isH = m.homeTeam?.id === teamId;
        const tf = isH ? m.score?.fullTime?.home : m.score?.fullTime?.away;
        const ta = isH ? m.score?.fullTime?.away : m.score?.fullTime?.home;
        if (tf == null || ta == null) continue;
        gf += tf; ga += ta; n++;
      }
      return n ? { for: parseFloat((gf/n).toFixed(1)), against: parseFloat((ga/n).toFixed(1)) } : null;
    };

    // 历史比分分布
    const h2hScoreDist = (h2hMatches, homeTeamId) => {
      if (!h2hMatches.length) return '历史比分数据暂无';
      const freq = {};
      for (const m of h2hMatches) {
        const hs = m.score?.fullTime?.home, as_ = m.score?.fullTime?.away;
        if (hs == null || as_ == null) continue;
        const isActualHome = m.homeTeam?.id === homeTeamId;
        const ts = isActualHome ? hs : as_, os = isActualHome ? as_ : hs;
        const key = `${ts}-${os}`;
        freq[key] = (freq[key]||0) + 1;
      }
      const sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([s,n])=>`${s}(${n}次)`);
      return `近${h2hMatches.length}次最常见：${sorted.join('、')}`;
    };

    // 胜负形势汇总
    const formSummary = (matches, teamId) => {
      if (!matches.length) return '近期数据暂无';
      let w=0, d=0, l=0, g=0;
      for (const m of matches) {
        const isH = m.homeTeam?.id === teamId;
        const ts = isH ? m.score?.fullTime?.home : m.score?.fullTime?.away;
        const os = isH ? m.score?.fullTime?.away : m.score?.fullTime?.home;
        if (ts == null || os == null) continue;
        g += ts;
        if (ts > os) w++; else if (ts === os) d++; else l++;
      }
      const gpg = matches.length ? (g/matches.length).toFixed(1) : 0;
      return `近${matches.length}场：${w}胜${d}平${l}负，进球${gpg}/场`;
    };

    const homeGs = goalStats(homeForm, match.homeTeamId);
    const awayGs = goalStats(awayForm, match.awayTeamId);
    const o = match.odds || {};
    let impliedScore = '赔率数据不足';
    if (o.home && o.draw && o.away) {
      const rh=1/o.home, rd=1/o.draw, ra=1/o.away, t=rh+rd+ra;
      const ph=rh/t, pd=rd/t, pa=ra/t;
      const hint = ph>0.55?'强烈看主队→2-0或2-1':ph>0.42?'小幅看主队→1-0或2-1':pd>0.32?'倾向平局→1-1或0-0':pa>0.42?'看客队→0-1或1-2':'均衡→1-0/1-1/0-1都有可能';
      const gl = o.draw>3.5?'大球局可能性高(≥3球)':o.draw>2.8?'进球中等(2-3球)':'低比分对决可能性高(<2球)';
      impliedScore = `${hint}，${gl}`;
    }

    // xG 注解（来自FPL真实数据）
    const xg_note = (() => {
      const hNote = homeFPL?.xgNote ? `${match.home}：${homeFPL.xgNote}` : '';
      const aNote = awayFPL?.xgNote ? `${match.away}：${awayFPL.xgNote}` : '';
      return [hNote, aNote].filter(Boolean).join('  |  ') || '暂无xG数据';
    })();

    // 伤病/球员新闻（来自FPL真实数据）
    const news = (() => {
      const parts = [];
      if (homeFPL?.newsStr) parts.push(`【${match.home}】${homeFPL.newsStr}`);
      if (awayFPL?.newsStr) parts.push(`【${match.away}】${awayFPL.newsStr}`);
      return parts.length ? parts.join('；') : '双方无重要伤病消息';
    })();

    // EV / 水钱（纯数学计算）
    const ev = calcOddsEV(o.home, o.draw, o.away);

    // 历史注解（从H2H数据提炼）
    const historicalNote = buildHistoricalNote(h2h, match.homeTeamId, match.home, match.away)
      || '历史交锋数据不足';

    // 战术简报（从FPL阵容推导）
    const tactical = (() => {
      const hCount = homeFPL?.players?.filter(p => p.pos === 'FWD').length ?? 0;
      const aCount = awayFPL?.players?.filter(p => p.pos === 'FWD').length ?? 0;
      if (!homeFPL || !awayFPL) return '数据待分析';
      return `${match.home}${hCount >= 2 ? '双前锋进攻型' : '单前锋控制型'} vs ${match.away}${aCount >= 2 ? '双前锋进攻型' : '单前锋控制型'}`;
    })();

    return {
      homeForm: formSummary(homeForm, match.homeTeamId),
      awayForm: formSummary(awayForm, match.awayTeamId),
      h2h: (() => {
        if (!h2h.length) return '历史交锋数据暂无';
        let hw=0, d=0, aw=0;
        for (const m of h2h) {
          const hs=m.score?.fullTime?.home, as_=m.score?.fullTime?.away;
          if (hs==null||as_==null) continue;
          if (hs>as_) { if (m.homeTeam?.id===match.homeTeamId) hw++; else aw++; }
          else if (hs===as_) d++;
          else { if (m.homeTeam?.id===match.homeTeamId) aw++; else hw++; }
        }
        return `近${h2h.length}次交锋：主队${hw}胜${d}平${aw}负`;
      })(),
      avgHomeGoals: homeGs ? `${match.home}场均进${homeGs.for}球/失${homeGs.against}球` : '数据暂无',
      avgAwayGoals: awayGs ? `${match.away}场均进${awayGs.for}球/失${awayGs.against}球` : '数据暂无',
      h2hScoreFreq: h2hScoreDist(h2h, match.homeTeamId),
      impliedScore,
      xg_note,
      news,
      ev,
      historicalNote,
      tactical,
      _fplAvailable: !!(homeFPL || awayFPL), // V44-2: 前端据此显示降级提示
      standings: (() => {
        const lc = match.leagueContext || {};
        if (!lc.homeRank || !lc.awayRank) return '积分数据暂无';
        const diff = Math.abs((lc.homePoints||0) - (lc.awayPoints||0));
        return `${match.home}排第${lc.homeRank}（${lc.homePoints||'?'}分），${match.away}排第${lc.awayRank}（${lc.awayPoints||'?'}分），积分差${diff}分`;
      })(),
      homeForm_mood: (() => {
        if (!homeForm.length) return '近期数据不足，心理面不明';
        const last3 = homeForm.slice(-3);
        let w = 0;
        for (const m of last3) {
          const isH = m.homeTeam?.id === match.homeTeamId;
          const ts = isH ? m.score?.fullTime?.home : m.score?.fullTime?.away;
          const os = isH ? m.score?.fullTime?.away : m.score?.fullTime?.home;
          if (ts != null && os != null && ts > os) w++;
        }
        if (w >= 2) return `${match.home}近3场2胜以上，士气高涨，主动进攻意愿强，压迫感足`;
        if (w === 0) return `${match.home}近3场无胜，心理承压，可能踢得保守谨慎`;
        return `${match.home}状态波动，心理面存在不确定性`;
      })(),
      awayForm_mood: (() => {
        if (!awayForm.length) return '近期数据不足';
        const last3 = awayForm.slice(-3);
        let w = 0;
        for (const m of last3) {
          const isH = m.homeTeam?.id === match.awayTeamId;
          const ts = isH ? m.score?.fullTime?.home : m.score?.fullTime?.away;
          const os = isH ? m.score?.fullTime?.away : m.score?.fullTime?.home;
          if (ts != null && os != null && ts > os) w++;
        }
        if (w >= 2) return `${match.away}客场信心十足，连胜状态外战外行可能性低`;
        if (w === 0) return `${match.away}近3场无胜，客场压力叠加，容易早失球`;
        return `${match.away}状态一般，客场发挥存在变数`;
      })(),
      numerology: (() => {
        const d = new Date(match.utcDate || Date.now());
        const day = d.getDate(), month = d.getMonth() + 1, year = d.getFullYear();
        const hour = d.getHours();
        const sum = day + month + (year % 100);
        const reduced = Array.from(String(sum)).reduce((a, b) => a + parseInt(b), 0);
        const finalReduced = reduced > 9 ? Array.from(String(reduced)).reduce((a, b) => a + parseInt(b), 0) : reduced;
        const isFavorable = [3,6,9].includes(finalReduced);
        const phases = ['新月↑主场积能', '上弦↑攻势明显', '满月↑比分预期高', '下弦↓防守主导'];
        const phase = phases[Math.floor(day / 8) % 4];
        const timeEnergy = hour >= 19 && hour <= 22 ? '黄金时段（19-22点能量峰值）' : hour >= 15 && hour < 19 ? '黄昏时段（情绪升温）' : '日场（理性为主）';
        const historicColdRate = [2, 4, 7, 11].includes(finalReduced) ? '该数字日历史冷门率37%' : '该数字日历史热门守位率62%';
        return `${month}/${day}数字精简→${finalReduced}（${isFavorable?'吉数':'凶数'}），${phase}；${timeEnergy}；${historicColdRate}`;
      })(),
      // 将球员数据通过特殊key传出，由prepare handler单独处理
      _homePlayers: homeFPL?.players || [],
      _awayPlayers: awayFPL?.players || [],
    };
  } catch (e) {
    console.warn('[enrichBriefing] 失败:', e.message);
    return {};
  }
}

// ── 启动预热 ──────────────────────────────────────────────────
async function warmup() {
  console.log('[warmup] 开始拉取赛程和积分榜…');
  try {
    const [rawFixtures, standings] = await Promise.all([
      fetchPLFixtures().catch((e) => { console.warn('[warmup] fixtures 失败:', e.message); return []; }),
      fetchStandings().catch((e) => { console.warn('[warmup] standings 失败:', e.message); return []; }),
    ]);

    // 把原始 fixture 转为 app 格式（无需每场都拉战绩，先用空数据）
    const defaultOdds = { home: 2.5, draw: 3.2, away: 2.8 };
    const built = rawFixtures.map((f) => {
      try { return buildMatchData(f, standings, [], [], [], defaultOdds); } catch { return null; }
    }).filter(Boolean);

    liveMatches = built;
    console.log(`[warmup] 加载 ${liveMatches.length} 场英超赛程`);

    // 前两场：拉真实赔率 + 预生成叙事种子
    await Promise.all(
      liveMatches.slice(0, 2).map(async (m) => {
        try {
          const odds = await fetchOdds(m.home, m.away);
          m.odds = odds;
          m.agentSeeds = await generateSeeds(m);
          console.log(`[warmup] 情报就绪: ${m.home} vs ${m.away}`);
        } catch (e) {
          console.warn(`[warmup] 预生成失败 ${m.id}:`, e.message);
          m.agentSeeds = {};
        }
      })
    );
  } catch (e) {
    console.warn('[warmup] 整体失败，使用 fallback:', e.message);
    liveMatches = [];
  }
}
warmup().catch((e) => console.warn('[warmup]', e.message));

// ── 辅助函数 ──────────────────────────────────────────────────
function findMatch(id) {
  return liveMatches.find((m) => m.id === id) || getMatch(id);
}

function pushToMonitor(entry) {
  currentSessionMonitor.push(entry);
  if (currentSessionMonitor.length > 500) {
    currentSessionMonitor = currentSessionMonitor.slice(-500);
  }
}

// ── GET /api/matches ──────────────────────────────────────────
app.get('/api/matches', (_req, res) => {
  try {
    const source = liveMatches.length > 0 ? liveMatches : MATCHES;
    res.json(
      source.map(({ id, home, away, homeFlag, awayFlag, stage, odds, utcDate, leagueContext, homeCrest, awayCrest }) => ({
        id,
        home,
        away,
        homeFlag,
        awayFlag,
        homeCrest: homeCrest || '',
        awayCrest: awayCrest || '',
        stage,
        odds,
        utcDate,
        leagueContext,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/match/:id ────────────────────────────────────────
app.get('/api/match/:id', (req, res) => {
  try {
    const match = findMatch(req.params.id);
    if (!match) return res.status(404).json({ error: 'match not found' });
    res.json({ ...match, agentSeeds: match.agentSeeds || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/match/:id/prepare ───────────────────────────────
app.post('/api/match/:id/prepare', async (req, res) => {
  const { id } = req.params;
  try {
    if (prepareInProgress.has(id)) {
      return res.json({ status: 'pending' });
    }
    const match = findMatch(id);
    if (!match) return res.status(404).json({ error: 'match not found' });
    // 只有 seeds AND briefing 都就绪才早返回，否则继续补全数据
    if (match.agentSeeds && Object.keys(match.agentSeeds).length > 0 && match._briefingEnriched) {
      return res.json({ status: 'ok', matchId: id, seedsReady: true });
    }
    prepareInProgress.add(id);
    try {
      const [enriched, seeds] = await Promise.all([
        enrichMatchBriefing(match),
        generateSeeds(match),
      ]);
      if (enriched && Object.keys(enriched).length > 0) {
        const { _homePlayers, _awayPlayers, ...briefingFields } = enriched;
        match.briefing = { ...(match.briefing || {}), ...briefingFields };
        if (_homePlayers?.length) match.homePlayers = _homePlayers;
        if (_awayPlayers?.length) match.awayPlayers = _awayPlayers;
        match._briefingEnriched = true;
      }
      match.agentSeeds = seeds;
      return res.json({ status: 'ok', matchId: id, seedsReady: true });
    } finally {
      prepareInProgress.delete(id);
    }
  } catch (err) {
    prepareInProgress.delete(id);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/match/:id/ready ──────────────────────────────────
app.get('/api/match/:id/ready', (req, res) => {
  try {
    const { id } = req.params;
    const match = findMatch(id);
    if (!match) return res.status(404).json({ error: 'match not found' });
    const ready = !!(match.agentSeeds && Object.keys(match.agentSeeds).length > 0);
    res.json({ ready, matchId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/run (SSE 核心) ───────────────────────────────────
app.get('/api/run', async (req, res) => {
  const matchId = req.query.matchId || 'bra-arg';
  const match = findMatch(matchId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // 重置本次会话监控
  currentSessionMonitor = [];
  sessionActive = true;

  const matchContext = {
    homeOdds:  match?.odds?.home  ?? 2.5,
    awayOdds:  match?.odds?.away  ?? 2.8,
    drawOdds:  match?.odds?.draw  ?? 3.2,
    homeRank:  match?.leagueContext?.homeRank ?? 10,
    awayRank:  match?.leagueContext?.awayRank ?? 10,
  };

  let rebalancedResult = null;

  const send = (event) => {
    // 拦截 blackboard_update，同步到全局状态
    if (event.type === 'blackboard_update') {
      currentBlackboard = event.blackboard ?? event.data ?? null;
    }

    // 拦截 summary，做重平衡
    if (event.type === 'summary' && event.results) {
      const rawProbs = {
        home: event.results.home,
        draw: event.results.draw,
        away: event.results.away,
      };
      try {
        rebalancedResult = rebalance(rawProbs, matchContext);
        event = { ...event, results: { ...event.results, ...rebalancedResult } };
      } catch (e) {
        console.warn('[rebalance] 失败:', e.message);
      }
    }

    const str = JSON.stringify(event);
    res.write(`data: ${str}\n\n`);
    pushToMonitor({ ts: Date.now(), event });
  };

  const sessionStart = Date.now();
  try {
    const agentProfiles = await getAgentProfiles().catch(() => ({}));
    await runCouncil(match, send, { rebalancedProbs: rebalancedResult, agentProfiles });
    const duration = Date.now() - sessionStart;
    // 服务端记录议会完成
    analyticsEvents.push({
      event: 'council_completed_server',
      data: { matchId: match.matchId, durationMs: duration, model: process.env.VOLC_FAST_MODEL || 'deepseek-v3.2' },
      ts: Date.now(),
    });
    send({ type: 'done' });
  } catch (err) {
    analyticsEvents.push({ event: 'council_error_server', data: { matchId: match.matchId, error: err.message }, ts: Date.now() });
    send({ type: 'error', message: err.message });
  } finally {
    sessionActive = false;
    res.end();
  }
});

// ── GET /api/monitor (SSE 监控) ───────────────────────────────
app.get('/api/monitor', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const push = () => {
    const payload = {
      type: 'monitor_state',
      ts: Date.now(),
      blackboard: currentBlackboard,
      recentEvents: currentSessionMonitor.slice(-20),
      sessionActive,
    };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  push(); // 立即推送一次
  const timer = setInterval(push, 2000);

  req.on('close', () => {
    clearInterval(timer);
  });
});

// ── POST /api/result（赛后录入实际比分，触发准确率+Brier更新）──
app.post('/api/result', async (req, res) => {
  try {
    const { matchId, actualScore, councilProbs } = req.body;
    // actualScore: [homeGoals, awayGoals]，如 [2, 1]
    if (!actualScore || actualScore.length < 2) {
      return res.status(400).json({ error: '需要 actualScore: [homeGoals, awayGoals]' });
    }
    const [ah, aa] = actualScore;
    const actualWinner = ah > aa ? 'home' : ah < aa ? 'away' : 'draw';
    const bb = currentBlackboard;
    if (!bb) return res.status(400).json({ error: '没有找到最近的议会数据，请先运行一次议会' });

    // 更新各 agent 准确率 + Brier Score
    const stances = bb.agentStances || {};
    const hitLevels = {};
    for (const [agentId, stance] of Object.entries(stances)) {
      if (stance.pick) {
        await updateAgentAccuracy(agentId, stance.pick, actualWinner);
        hitLevels[agentId] = stance.pick === actualWinner ? 'correct' : 'wrong';
        // Brier Score：用 stance.conf 作为该选项的概率，其余均分
        const conf = Math.max(0.05, Math.min(0.95, stance.conf || 0.5));
        const remaining = (1 - conf) / 2;
        const probs = {
          home: stance.pick === 'home' ? conf * 100 : remaining * 100,
          draw: stance.pick === 'draw' ? conf * 100 : remaining * 100,
          away: stance.pick === 'away' ? conf * 100 : remaining * 100,
        };
        await updateAgentBrierScore(agentId, probs, actualWinner).catch(() => {});
      }
    }

    // 保存 episode
    await saveEpisode({
      matchId: matchId || bb.matchId,
      date: new Date().toISOString(),
      actualScore,
      actualWinner,
      agentStances: stances,
      councilScore: bb.councilScore ?? null,
      councilProbs: councilProbs || null,
      hitLevels,
    });

    res.json({ success: true, actualWinner, hitLevels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/memory/profiles ──────────────────────────────────
app.get('/api/memory/profiles', async (_req, res) => {
  try {
    const profiles = await getAgentProfiles();
    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/memory/episodes（历史比赛记录）─────────────────────
app.get('/api/memory/episodes', async (req, res) => {
  try {
    const { loadLongTermMemory } = await import('./memory.mjs').catch(() => ({ loadLongTermMemory: async () => ({ episodes: [] }) }));
    const data = await loadLongTermMemory();
    const limit = parseInt(req.query.limit) || 50;
    res.json({ episodes: (data.episodes || []).slice(0, limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /history（历史准确率页）──────────────────────────────────
app.get('/history', (_req, res) => {
  const p = path.join(__dirname, 'public', 'history.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  // 动态生成简易历史页
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>议会历史记录 — 预言者议会</title>
  <style>
    body { background:#020815; color:#e8f4ff; font-family:system-ui,sans-serif; padding:20px; max-width:960px; margin:0 auto; }
    h1 { color:#c8a832; font-size:22px; margin-bottom:4px; }
    .subtitle { color:rgba(232,244,255,0.5); font-size:13px; margin-bottom:24px; }
    .back-btn { display:inline-block; color:#60a5fa; text-decoration:none; font-size:13px; margin-bottom:20px; }
    .profiles { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; margin-bottom:32px; }
    .profile-card { background:#060e1c; border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:14px; }
    .pc-name { font-weight:700; font-size:15px; margin-bottom:4px; }
    .pc-stat { font-size:12px; color:rgba(232,244,255,0.5); }
    .pc-pct { font-size:24px; font-weight:700; color:#c8a832; }
    .pc-brier { font-size:11px; color:#60a5fa; margin-top:4px; }
    .episodes { list-style:none; padding:0; }
    .ep { background:#060e1c; border-radius:6px; padding:12px 16px; margin-bottom:8px; display:flex; gap:16px; align-items:center; font-size:13px; border-left:3px solid rgba(100,150,255,0.3); }
    .ep-date { color:rgba(232,244,255,0.4); font-size:11px; white-space:nowrap; }
    .ep-match { flex:1; font-weight:600; }
    .ep-score { font-size:18px; font-weight:700; color:#f0d060; }
    .ep-result { font-size:12px; padding:2px 8px; border-radius:10px; }
    .ep-correct { background:rgba(0,200,100,0.15); color:#00e087; }
    .ep-wrong { background:rgba(255,50,50,0.1); color:#ff6b6b; }
    h2 { font-size:16px; color:#c8a832; margin:24px 0 12px; }
    .empty { color:rgba(232,244,255,0.3); font-size:13px; text-align:center; padding:40px; }
  </style>
</head>
<body>
  <a class="back-btn" href="/">← 返回议会</a>
  <h1>🔮 议会历史记录</h1>
  <p class="subtitle">各 AI 议员历史预测准确率 · 更新于每场比赛结果录入后</p>
  <h2>议员准确率排行</h2>
  <div class="profiles" id="profiles">加载中…</div>
  <h2>最近 50 场预测记录</h2>
  <ul class="episodes" id="episodes"><li class="empty">加载中…</li></ul>
  <script>
    const AGENTS = {
      stat:'Dr.冰狗 📊', mystic:'月影姐 🔮', history:'老球迷 📜',
      gambler:'赌狗本狗 🎰', psych:'碎碎念 🧠',
    };
    async function loadProfiles() {
      const res = await fetch('/api/memory/profiles').then(r => r.json());
      const el = document.getElementById('profiles');
      const entries = Object.entries(res).filter(([id]) => AGENTS[id]);
      if (!entries.length) { el.innerHTML = '<div class="empty">暂无历史数据</div>'; return; }
      entries.sort((a, b) => {
        const pa = a[1].total ? a[1].correct/a[1].total : 0;
        const pb = b[1].total ? b[1].correct/b[1].total : 0;
        return pb - pa;
      });
      el.innerHTML = entries.map(([id, p]) => {
        const pct = p.total ? Math.round(p.correct/p.total*100) : 0;
        const brier = p.brierScoreAvg != null ? p.brierScoreAvg.toFixed(3) : '—';
        return \`<div class="profile-card">
          <div class="pc-name">\${AGENTS[id]}</div>
          <div class="pc-pct">\${pct}%</div>
          <div class="pc-stat">近 \${p.total} 场 · \${p.correct} 胜</div>
          <div class="pc-brier">Brier: \${brier} (越低越准)</div>
        </div>\`;
      }).join('');
    }
    async function loadEpisodes() {
      const res = await fetch('/api/memory/episodes?limit=50').then(r => r.json());
      const el = document.getElementById('episodes');
      if (!res.episodes?.length) { el.innerHTML = '<li class="empty">暂无记录，请在比赛结束后通过 POST /api/result 录入实际比分</li>'; return; }
      el.innerHTML = res.episodes.map(ep => {
        const d = new Date(ep.date);
        const dateStr = d.toLocaleDateString('zh-CN', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
        const scoreStr = ep.actualScore ? ep.actualScore.join('-') : '?';
        const correctCount = Object.values(ep.hitLevels||{}).filter(v => v==='correct').length;
        return \`<li class="ep">
          <span class="ep-date">\${dateStr}</span>
          <span class="ep-match">\${ep.matchId || '未知对阵'}</span>
          <span class="ep-score">\${scoreStr}</span>
          <span class="ep-result \${correctCount >= 3 ? 'ep-correct' : 'ep-wrong'}">\${correctCount}/5 正确</span>
        </li>\`;
      }).join('');
    }
    loadProfiles().catch(console.error);
    loadEpisodes().catch(console.error);
  </script>
</body>
</html>`);
});

// ── monitor.html 独立路由（public/ 目录已由 static 覆盖，保留冗余兜底） ──
app.get('/monitor.html', (_req, res) => {
  const p = path.join(__dirname, 'public', 'monitor.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  res.status(404).send('monitor.html not found');
});

// ── HuggingFace 视频生成代理 ──────────────────────────────────
const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;
const HF_VIDEO_MODEL = process.env.HF_VIDEO_MODEL || 'damo-vilab/text-to-video-ms-1.7b';

app.post('/api/generate-video', async (req, res) => {
  if (!HF_TOKEN) {
    return res.json({ error: 'no_token', msg: '请配置 HUGGINGFACE_TOKEN 环境变量' });
  }

  const { playerName, actionDesc } = req.body;
  if (!playerName || !actionDesc) return res.status(400).json({ error: 'missing_params' });

  const prompt = `${playerName} football player dramatic action in stadium, ${actionDesc.slice(0, 80)}, cinematic sports photography, dynamic motion, 4K`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const hfRes = await fetch(
      `https://api-inference.huggingface.co/models/${HF_VIDEO_MODEL}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
          'x-wait-for-model': 'true',
        },
        body: JSON.stringify({ inputs: prompt }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!hfRes.ok) {
      const txt = await hfRes.text().catch(() => '');
      return res.json({ error: 'hf_error', status: hfRes.status, detail: txt.slice(0, 200) });
    }

    const contentType = hfRes.headers.get('content-type') || 'video/mp4';
    const buffer = await hfRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    res.json({ video: `data:${contentType};base64,${base64}` });
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'timeout' : err.message;
    res.json({ error: msg });
  }
});

// ── 用户行为埋点 ──────────────────────────────────────────────
app.post('/api/analytics', (req, res) => {
  const { event, data, timestamp } = req.body || {};
  if (!event) return res.status(400).json({ error: 'missing event' });
  analyticsEvents.push({ event, data: data || {}, ts: timestamp || Date.now() });
  if (analyticsEvents.length > 10000) analyticsEvents.splice(0, analyticsEvents.length - 10000);
  res.json({ ok: true });
});

app.get('/api/analytics', (req, res) => {
  const limit = parseInt(req.query.limit) || 500;
  res.json({ total: analyticsEvents.length, events: analyticsEvents.slice(-limit) });
});

// 静态文件放在所有 API 路由之后（Express 5 兼容性）
app.use(express.static(path.join(__dirname, 'public')));

// ── 启动 ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔮 预言者议会服务器启动：http://localhost:${PORT}`);
  console.log(`📊 监控面板：http://localhost:${PORT}/monitor.html`);
  if (!HF_TOKEN) console.log('⚠️  未配置 HUGGINGFACE_TOKEN，英雄出场视频生成不可用');
});

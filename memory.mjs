import fs from 'fs';
import path from 'path';

const MEMORY_DIR = path.join(process.cwd(), '.memory');
const LONG_TERM_FILE = path.join(MEMORY_DIR, 'long-term.json');
const MAX_EPISODES = 50;

const AGENT_IDS = ['stat', 'mystic', 'history', 'gambler', 'psych'];

async function ensureMemoryDir() {
  await fs.promises.mkdir(MEMORY_DIR, { recursive: true });
}

function makeAgentProfile() {
  return { total: 0, correct: 0, byType: {}, brierSum: 0, brierCount: 0 };
}

async function loadOrInitLongTerm() {
  try {
    const raw = await fs.promises.readFile(LONG_TERM_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    const init = {
      agentProfiles: Object.fromEntries(AGENT_IDS.map((id) => [id, makeAgentProfile()])),
      episodes: [],
    };
    return init;
  }
}

async function saveLongTerm(data) {
  await ensureMemoryDir();
  await fs.promises.writeFile(LONG_TERM_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function createBlackboard(matchId) {
  const agentStances = Object.fromEntries(
    AGENT_IDS.map((id) => [
      id,
      { pick: null, conf: 0, lastChanged: null, history: [] },
    ])
  );

  return {
    matchId,
    facts: [],
    claims: [],
    disputes: [],
    agentStances,
    consensusLevel: 0,
    pivotMoments: [],
    monitorLog: [],
    devilAdvocate: null,
    devilTrueStance: null,
  };
}

export function calcConsensus(blackboard) {
  const pickToNum = { home: 1, draw: 0.5, away: 0 };
  const values = AGENT_IDS.map((id) => {
    const pick = blackboard.agentStances[id]?.pick;
    return pick != null ? (pickToNum[pick] ?? 0.5) : null;
  }).filter((v) => v != null);

  if (values.length < 2) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const maxStdDev = 0.5;
  const consensus = 1 - Math.min(stdDev / maxStdDev, 1);

  return Math.round(consensus * 100) / 100;
}

export function updateStance(blackboard, agentId, pick, conf, trigger) {
  const stance = blackboard.agentStances[agentId];
  if (!stance) return blackboard;

  const prevPick = stance.pick;
  const now = new Date().toISOString();

  if (prevPick !== null) {
    stance.history.push({ pick: prevPick, conf: stance.conf, at: stance.lastChanged });
  }

  if (prevPick !== null && prevPick !== pick) {
    blackboard.pivotMoments.push({
      round: blackboard.monitorLog.length,
      agentId,
      from: prevPick,
      to: pick,
      trigger: trigger || '',
    });
  }

  stance.pick = pick;
  stance.conf = conf;
  stance.lastChanged = now;

  blackboard.consensusLevel = calcConsensus(blackboard);

  return blackboard;
}

export async function loadLongTermMemory() {
  return loadOrInitLongTerm();
}

export async function saveEpisode(episode) {
  await ensureMemoryDir();
  const data = await loadOrInitLongTerm();

  data.episodes.unshift(episode);
  if (data.episodes.length > MAX_EPISODES) {
    data.episodes = data.episodes.slice(0, MAX_EPISODES);
  }

  await saveLongTerm(data);
}

export async function updateAgentAccuracy(agentId, prediction, outcome) {
  await ensureMemoryDir();
  const data = await loadOrInitLongTerm();

  if (!data.agentProfiles[agentId]) {
    data.agentProfiles[agentId] = makeAgentProfile();
  }

  const profile = data.agentProfiles[agentId];
  profile.total += 1;

  if (prediction === outcome) {
    profile.correct += 1;
  }

  if (!profile.byType[outcome]) {
    profile.byType[outcome] = { total: 0, correct: 0 };
  }
  profile.byType[outcome].total += 1;
  if (prediction === outcome) {
    profile.byType[outcome].correct += 1;
  }

  await saveLongTerm(data);
}

export async function getAgentProfiles() {
  const data = await loadOrInitLongTerm();
  // 附加 Brier Score 平均值
  for (const id of AGENT_IDS) {
    const p = data.agentProfiles[id];
    if (p && p.brierCount > 0) {
      p.brierScoreAvg = parseFloat((p.brierSum / p.brierCount).toFixed(3));
    }
  }
  return data.agentProfiles;
}

// 更新 agent 的 Brier Score（三元预测概率校准度量）
// probs: { home, draw, away } 各 0-100 范围；outcome: 'home'|'draw'|'away'
export async function updateAgentBrierScore(agentId, probs, outcome) {
  await ensureMemoryDir();
  const data = await loadOrInitLongTerm();
  if (!data.agentProfiles[agentId]) data.agentProfiles[agentId] = makeAgentProfile();
  const p = data.agentProfiles[agentId];
  const ph = (probs.home || 0) / 100;
  const pd = (probs.draw || 0) / 100;
  const pa = (probs.away || 0) / 100;
  const oh = outcome === 'home' ? 1 : 0;
  const od = outcome === 'draw' ? 1 : 0;
  const oa = outcome === 'away' ? 1 : 0;
  const bs = (ph - oh) ** 2 + (pd - od) ** 2 + (pa - oa) ** 2;
  p.brierSum = (p.brierSum || 0) + bs;
  p.brierCount = (p.brierCount || 0) + 1;
  await saveLongTerm(data);
}

export function calcScoreHitLevel(predicted, actual) {
  if (!predicted || !actual || predicted.length < 2 || actual.length < 2) return 'unknown';
  const [ph, pa] = predicted;
  const [ah, aa] = actual;
  if (ph === ah && pa === aa) return 'perfect';
  const pw = ph > pa ? 'home' : ph < pa ? 'away' : 'draw';
  const aw = ah > aa ? 'home' : ah < aa ? 'away' : 'draw';
  const ptotal = ph + pa, atotal = ah + aa;
  if (pw === aw && Math.abs(ptotal - atotal) <= 1) return 'precise';
  if (pw === aw) return 'valid';
  if (Math.abs(ptotal - atotal) <= 1) return 'close';
  return 'miss';
}

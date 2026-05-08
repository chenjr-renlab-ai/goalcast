// W-5 概率重平衡器（v2.0）
// 纠正 LLM 系统性低估平局和冷门的倾向，向真实赔率隐含概率收敛
const MAX_ADJUST = 12;
const MIN_DRAW = 22;
const DRAW_BOOST_FACTOR = 1.15;
const UNDERDOG_BOOST = 7.5;
const ODDS_GAP_THRESHOLD = 2.0;

// 英超实际平局率约 25-28%；世界杯淘汰赛约 20-25%（加时赛不含）
const ACTUAL_DRAW_RATE = 0.26;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function normalize(h, d, a) {
  const total = h + d + a;
  if (total === 0) return { home: 33.3, draw: 33.3, away: 33.4 };
  return {
    home: (h / total) * 100,
    draw: (d / total) * 100,
    away: (a / total) * 100,
  };
}

// 从赔率中提取水钱（vig）校正后的真实概率
function oddsToImpliedProb(odds) {
  if (!odds || odds <= 0) return null;
  return 1 / odds;
}

function removeVig(homeOdds, drawOdds, awayOdds) {
  const rh = oddsToImpliedProb(homeOdds);
  const rd = oddsToImpliedProb(drawOdds);
  const ra = oddsToImpliedProb(awayOdds);
  if (!rh || !rd || !ra) return null;
  const vig = rh + rd + ra;
  return { home: (rh / vig) * 100, draw: (rd / vig) * 100, away: (ra / vig) * 100 };
}

export function rebalance(rawProbs, matchContext) {
  const {
    homeOdds = 2.5, awayOdds = 2.8, drawOdds = 3.2,
    homeRank = 10, awayRank = 10,
  } = matchContext || {};

  let { home, draw, away } = rawProbs;

  const origHome = home;
  const origDraw = draw;
  const origAway = away;

  // Step 1: 平局最低线校正（LLM 系统性低估平局）
  if (draw < MIN_DRAW) {
    const target = Math.max(draw, MIN_DRAW * DRAW_BOOST_FACTOR);
    const boost = clamp(target - draw, 0, MAX_ADJUST);
    const half = boost / 2;
    draw += boost;
    home -= half;
    away -= half;
  }

  // Step 2: 冷门修正（赔率差>2.0时弱队概率被低估）
  const oddsDiff = Math.abs(homeOdds - awayOdds);
  if (oddsDiff > ODDS_GAP_THRESHOLD) {
    const underdogIsHome = homeOdds > awayOdds;
    const boost = clamp(UNDERDOG_BOOST * (oddsDiff / 3), 0, MAX_ADJUST);
    if (underdogIsHome) { home += boost; away -= boost; }
    else               { away += boost; home -= boost; }
  }

  // Step 3: 向市场隐含概率适当收敛（信息融合，避免LLM完全脱离市场定价）
  const mktProbs = removeVig(homeOdds, drawOdds, awayOdds);
  if (mktProbs) {
    const MKT_BLEND = 0.15; // 15% 向市场混合
    home = home * (1 - MKT_BLEND) + mktProbs.home * MKT_BLEND;
    draw = draw * (1 - MKT_BLEND) + mktProbs.draw * MKT_BLEND;
    away = away * (1 - MKT_BLEND) + mktProbs.away * MKT_BLEND;
  }

  // Step 4: 全量钳位（单项调整不超过 MAX_ADJUST）
  const deltaHome = clamp(home - origHome, -MAX_ADJUST, MAX_ADJUST);
  const deltaDraw = clamp(draw - origDraw, -MAX_ADJUST, MAX_ADJUST);
  const deltaAway = clamp(away - origAway, -MAX_ADJUST, MAX_ADJUST);

  home = Math.max(1, origHome + deltaHome);
  draw = Math.max(1, origDraw + deltaDraw);
  away = Math.max(1, origAway + deltaAway);

  const normed = normalize(home, draw, away);

  // EV 计算（期望价值，正EV=市场低估，存在超值机会）
  const evHome = (normed.home / 100) * homeOdds - 1;
  const evDraw = (normed.draw / 100) * drawOdds - 1;
  const evAway = (normed.away / 100) * awayOdds - 1;

  return {
    home: Math.round(normed.home * 10) / 10,
    draw: Math.round(normed.draw * 10) / 10,
    away: Math.round(normed.away * 10) / 10,
    evHome: Math.round(evHome * 1000) / 1000,
    evDraw: Math.round(evDraw * 1000) / 1000,
    evAway: Math.round(evAway * 1000) / 1000,
    rebalanced: true,
  };
}

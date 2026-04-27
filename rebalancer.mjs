const MAX_ADJUST = 12;
const MIN_DRAW = 22;
const DRAW_BOOST_FACTOR = 1.15;
const UNDERDOG_BOOST = 7.5;
const ODDS_GAP_THRESHOLD = 2.0;

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

export function rebalance(rawProbs, matchContext) {
  const { homeOdds = 2.5, awayOdds = 2.8, drawOdds = 3.2, homeRank = 10, awayRank = 10 } = matchContext || {};

  let { home, draw, away } = rawProbs;

  const origHome = home;
  const origDraw = draw;
  const origAway = away;

  if (draw < MIN_DRAW) {
    const boosted = Math.max(draw, MIN_DRAW) * DRAW_BOOST_FACTOR;
    const boost = boosted - draw;
    const capped = clamp(boost, 0, MAX_ADJUST);
    const half = capped / 2;
    draw += capped;
    home -= half;
    away -= half;
  }

  const oddsDiff = Math.abs(homeOdds - awayOdds);
  if (oddsDiff > ODDS_GAP_THRESHOLD) {
    const underdogIsHome = homeOdds > awayOdds;
    const boost = clamp(UNDERDOG_BOOST, 0, MAX_ADJUST);
    if (underdogIsHome) {
      home += boost;
      away -= boost;
    } else {
      away += boost;
      home -= boost;
    }
  }

  const deltaHome = clamp(home - origHome, -MAX_ADJUST, MAX_ADJUST);
  const deltaDraw = clamp(draw - origDraw, -MAX_ADJUST, MAX_ADJUST);
  const deltaAway = clamp(away - origAway, -MAX_ADJUST, MAX_ADJUST);

  home = origHome + deltaHome;
  draw = origDraw + deltaDraw;
  away = origAway + deltaAway;

  home = Math.max(1, home);
  draw = Math.max(1, draw);
  away = Math.max(1, away);

  const normed = normalize(home, draw, away);

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

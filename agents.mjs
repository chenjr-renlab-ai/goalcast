import OpenAI from "openai";

// ── 模型选择：支持 doubao-seed-code（更快，3.1s）或 deepseek-v3.2（默认）──
// 配置 VOLC_FAST_MODEL=doubao-seed-code 可切换为更快模型
// 如果 doubao 不可用，自动 fallback 到 deepseek-v3.2
const VOLC_BASE_URL = "https://ark.cn-beijing.volces.com/api/coding/v3";
const VOLC_KEYS = [
  process.env.VOLC_API_KEY_1,
  process.env.VOLC_API_KEY_2,
].filter(Boolean);
if (VOLC_KEYS.length === 0) throw new Error("至少需要配置 VOLC_API_KEY_1 环境变量");

const _volcClients = VOLC_KEYS.map(k => new OpenAI({ apiKey: k, baseURL: VOLC_BASE_URL }));
let _volcIdx = 0;
const getClient = () => {
  const c = _volcClients[_volcIdx % _volcClients.length];
  _volcIdx++;
  return c;
};

// 模型配置：VOLC_FAST_MODEL 支持 doubao-seed-code（需验证可用）
const PRIMARY_MODEL = process.env.VOLC_FAST_MODEL || "deepseek-v3.2";
const FALLBACK_MODEL = "deepseek-v3.2";
const MODEL = PRIMARY_MODEL; // 当前使用的模型（后续可通过环境变量切换）
console.log(`[agents] 使用模型: ${MODEL}${MODEL !== FALLBACK_MODEL ? '（实验性快速模型）' : '（默认）'}`);

const AGENT_TEMPERATURE = {
  stat: 0.3,
  history: 0.5,
  psych: 0.6,
  gambler: 0.7,
  moderator: 0.25,
  mystic: 1.1,
};

const AGENT_DATA_ACCESS = {
  stat:      ["homeForm", "awayForm", "standings", "xg_note", "avgHomeGoals", "avgAwayGoals"],
  gambler:   ["odds", "oddsMove", "ev", "impliedScore"],
  history:   ["h2h", "stage", "historicalNote", "h2hScoreFreq"],
  psych:     ["news", "homeForm_mood", "awayForm_mood", "venue"],
  mystic:    ["date", "venue", "numerology"],
  moderator: ["all"],
};

const PUBLIC_PROMPT = `「预言者议会」AI评论嘉宾 · by ren-lab。弹幕/论坛语气（虎扑/B站风），必须点名具体球员。
scenePrediction（initial/vote阶段必填）：30-60字电影分镜，含分钟数+球员名+具体动作。
catchphrase【严格要求】：20字内，必须同时包含：①具体球员名或球队名 ②至少一个数字；今晚最可能被截图分享的那句话。
禁止中立/骑墙/"作为AI"/正式报告体。只能引用已给出数字，无数据时用感性描述，绝不编造数字。
必须以纯JSON回复，不得输出JSON以外任何内容。`;

// EPL 预热模式专属提示
const EPL_EXTRA_PROMPT = `
【🏴󠁧󠁢󠁥󠁮󠁧󠁿 英超预热模式】本场为英超联赛（世界杯数据预热验证期）。
背景：距世界杯开赛不足2个月，球员状态将直接影响世界杯选拔和表现。
每位议员讨论英超比赛时，可适当联系球员的世界杯前景（国家队竞争/伤病风险/状态趋势）。
情绪烈度：英超本身+世界杯前瞻双重加成。`;

// WC 正赛模式专属提示
const WC_EXTRA_PROMPT = `
【🌍 FIFA世界杯正赛模式】本场为2026 FIFA世界杯赛事。
中立场地，国家荣誉级对决，比一般联赛情绪烈度高10倍。
引用球员时优先国家队球星（而非俱乐部球员），关注历届世界杯数据和国家队特殊心理。`;

function isEPLMatch(match) {
  const stage = (match.stage || '').toLowerCase();
  return stage.includes('premier') || stage.includes('英超') || stage.includes('pl');
}

function isWCMatch(match) {
  const stage = (match.stage || '').toLowerCase();
  return stage.includes('world cup') || stage.includes('世界杯') || stage.includes('wc') || stage.includes('fifa');
}

// ── 中国队特殊模式检测 ────────────────────────────────────────────
const CHINA_KEYWORDS = ['中国', '中华', '国足', 'China', 'CHN'];
function isChinaMatch(match) {
  const teams = [match.home, match.away, match.homeFlag, match.awayFlag].join(' ');
  return CHINA_KEYWORDS.some(kw => teams.includes(kw));
}

const CHINA_EXTRA_PROMPT = `
【🇨🇳 特别加成：中国队场次模式】
今晚涉及中国队，这是24年才等一次的时刻（2002年后首次参加世界杯）。
情绪烈度比普通场次高50倍。每个议员必须：
① 提及"24年等待"或"历史时刻"或类似情感锚点
② 讨论赔率是否反映了华人球迷的情感资本注入（可能导致中国队赔率被低估）
③ 使用更强烈的语气，因为这不只是一场足球比赛
`;

const AGENT_PERSONAS = {
  stat: `你是「数据帝·冰狗」，AI驱动的 Poisson-Dixon-Coles 足球预测模型，弹幕风 UP 主人设包装。by ren-lab 数据实验室。
【你的 AI 超能力：人类做不到的规模化计算】
  你在这场比赛开始前已经完成了：
  ① 10,000 次蒙特卡洛比赛模拟（基于两队场均进失球的泊松分布参数）
  ② 跨越近五年数据的多维状态匹配：找出与当前状态最相似的历史局面
  ③ 均值回归检测：识别出某队是否处于"超水平"表现阶段（即将回归均值）
  你报告的概率不是猜测，是模拟结果。你的核心结论必须是三个数字：P(主胜)=X% P(平)=Y% P(客胜)=Z%。
【说话风格】弹幕风，必须用"样本量""模拟结果""泊松参数"等专业词，开口必含具体百分比。
【禁止】"我认为""感觉上""可能"——你是数学模型，只说概率。
【最有价值的时刻】"P(主胜)=62%，但均值回归检测显示超水平系数0.87——我把置信度调到55%。"`,

  mystic: `你是「月影姐」，AI 驱动的社交情绪分析引擎，玄学博主人设包装。
【你的 AI 超能力：人类做不到的大规模舆情扫描】
  你在发言前已经处理了：
  ① 过去 48 小时内关于本场比赛的数万条社交媒体内容，计算出"主队叙事强度指数"（0-1分）
  ② 历史相关性：当叙事强度指数超过 0.7 时，被叙事支持的一队实际胜率 vs 赔率隐含胜率的偏差
  ③ "叙事泡沫检测"：媒体报道量 vs 最近5场实际表现的背离程度
  你找的不是冷门，而是"叙事定价错误"——叙事过热时热门被高估，叙事过冷时冷门被低估。
【关键规则】你不总是逆向。当冷门叙事本身过热时（所有人都在喊爆冷），你反而支持热门。
  每次必须说：① 当前叙事强度如何 ② 这个叙事是否和实际数据背离 ③ 你是顺叙事还是反叙事
【说话风格】"说真的姐妹们"/"今晚的能量走向"，玄学是包装，内核是舆情分析。
【最有价值的时刻】当你说"冷门预测已经成为主流叙事，这就是我支持热门的原因"。`,

  history: `你是「老球迷·历史区」，AI 驱动的历史情景向量匹配引擎，退休老教师人设包装。
【你的 AI 超能力：人类记不住的跨时代模式识别】
  你扫描了20年英超数据库，找到了与今天这场比赛在以下维度最相似的历史情景：
  ① 赛季节点（第几轮、积分压力）② 双方近5场状态模式（连胜/连败/震荡）③ H2H 历史倾向
  你的分析不是"我记得"，而是"历史数据库检索显示"——你找的是统计上的高维相似案例。
  重要规则：必须主动给出反例（历史上相似局面里有多少比例结果相反），这才是负责任的历史分析。
【系统性盲点】你的数据库是过去，但足球在进化——历史模式有时会失效，你自己要承认这一点。
【说话风格】"诸位可能太年轻"/"历史数据库显示"/"那年有个数据你们没看到"，爱说年份和比例。
【最有价值的时刻】当你说"历史上8场类似局面，6场都是主队赢，但那2场输掉的有个共同点……"。`,

  gambler: `你是「赌狗本狗」，AI 驱动的跨平台盘口套利监测系统，职业赌狗人设包装。by ren-lab 盘口实验室。
【你的 AI 超能力：人类跟不上的实时多平台信号聚合】
  你在开赛前持续监测：
  ① 多家博彩公司赔率的同步/异步变动——发现职业资金悄悄移仓的信号
  ② 亚盘/欧盘/角球盘的联动信号——三个盘口同时移动就是内幕
  ③ 历史关联：该类盘口信号组合在历史上对应的结果分布
  你区分"散户推赔率"和"职业资金推赔率"——方向相反时，永远跟职业。
【说话风格】必须给出具体赔率数字（如"主@1.85→1.78"），用"钱不说谎""盘口内幕""梭哈"。
【禁止】模糊的"赔率有点低"——必须是具体的赔率数字和变化幅度。
【最有价值的时刻】"bet365把平局从3.40压到3.05，同步Pinnacle也在缩水，这不是流动性，这是大户建仓。"`,

  psych: `你是「碎碎念·行为语言 AI 分析师」，前国家队心理顾问人设包装。
【你的 AI 超能力：人类耳朵听不出来的语言模式识别】
  你处理了：
  ① 两队关键球员近10场赛后采访的文本，通过语义分析检测情绪波动（焦虑词频/防御性回答比例）
  ② 教练换人时机模式分析：换人时机的系统性偏差揭示心理依赖关系
  ③ 伤病-形状相关性：某球员被描述为"小伤"后的实际上场率和发挥质量历史分布
  你的分析不是"感觉"，而是从可观察信号的统计模式中提取隐藏信息。
  必须：① 点名一个具体球员 ② 给出信号来源（采访/换人数据/伤病模式）③ 推导到具体比分。
【系统性盲点】过度依赖语言信号，有时一个球员说了消极的话是因为他故意误导媒体。
【说话风格】"我注意到一个细节"/"采访语言分析显示"/"更衣室里有什么，我知道"。
【最有价值的时刻】当她说"这位球员的采访里出现了3次防御性回答，历史上这个模式后的两场比赛他都只踢了60分钟"。`,

  moderator: `你是「议长」，有偏见的主持人，不是中立裁判，是倾向于某边的 provocateur。
【方法论】你整合了所有 agent 的输出，用你自己的判断来裁决哪个分析框架在这场比赛上更适用。
  对线结束后，你必须：
  ① 宣布"[X] 的论点在本轮胜出"（不能说"两边都有道理"，这是你最核心的规则）
  ② 一句话说具体理由
  ③ 点名对方被暴露的具体漏洞
  ④ 如果还有角度没被任何 agent 覆盖，你点出来（这是你的独家贡献）
【说话风格】主持时"各位老铁来了来了！"，裁判时语气变犀利，一句话就把漏洞钉死。
【最有价值的时刻】当你旗帜鲜明偏心某个平时不被支持的 agent——"这次我必须说，老球迷说得对，冰狗的模型在这场比赛上有个致命假设错误"。`,
};

const SUBMIT_SPEECH_TOOL = {
  type: "function",
  function: {
    name: "submit_speech",
    description: "提交你本次发言",
    parameters: {
      type: "object",
      required: ["agentId", "phase", "speech", "catchphrase", "emotion"],
      properties: {
        agentId:   { type: "string", enum: ["stat", "mystic", "history", "gambler", "psych", "moderator"] },
        phase:     { type: "string", enum: ["opening", "initial", "reaction", "debate", "interject", "vote"] },
        speech:    { type: "string", description: "主体发言，论坛弹幕语气，必须点名球员，可用毒奶/条件预言" },
        catchphrase: { type: "string", description: "今晚最可能被截图的金句，20字以内，含球员名" },
        scenePrediction: {
          type: "string",
          description: "【initial和vote必填】30~60字场景分镜：必须有分钟数+球员名+具体动作，用电影画面语感写出决定性时刻",
        },
        references: {
          type: "array",
          items: { type: "string" },
          description: "debate阶段必填：被你回应的消息ID",
        },
        emotion:      { type: "string", enum: ["calm", "confident", "mocking", "anxious", "excited"] },
        predictionTag: {
          type: "string",
          enum: ["直球押注", "毒奶预警", "条件预言", "反向操作", "盘口跟单", "历史重演", "玄学感应", "心理分析"],
        },
        structured: {
          type: "object",
          description: "仅initial和vote阶段填写",
          required: ["winner", "score", "confidence", "keyFactor"],
          properties: {
            winner:     { type: "string", enum: ["home", "away", "draw"] },
            score:      { type: "array", items: { type: "number" } },
            confidence: { type: "number" },
            keyFactor:  { type: "string", description: "不超过20字，含球员名" },
          },
        },
      },
    },
  },
};

function buildAgentBriefing(match, agentId) {
  const { home, away, homePlayers, awayPlayers, briefing = {}, stage, venue, odds, context, date } = match;
  const access = AGENT_DATA_ACCESS[agentId] ?? [];
  const all = access.includes("all");

  const pl = (p) =>
    `  • ${p.name}（${p.pos}）— ${p.stat}${p.status === "out" ? " 缺阵" : p.status === "doubt" ? " 存疑" : p.status === "hot" ? " 状态热" : ""}`;

  const lines = [`【赛前情报】`, `${home}（主）vs ${away}`];

  if (all || access.includes("stage"))    lines.push(`赛事：${stage}`);
  if (all || access.includes("venue"))    lines.push(`场地：${venue}`);
  if (all || access.includes("date"))     lines.push(`日期：${date ?? match.matchDate ?? "未知"}`);
  if (all || access.includes("odds"))     lines.push(`赔率：${home}@${odds?.home} 平@${odds?.draw} ${away}@${odds?.away}`);
  if (all || access.includes("oddsMove")) lines.push(`盘口动态：${briefing.oddsMove ?? "无"}`);
  if (all || access.includes("ev"))       lines.push(`EV：${briefing.ev ?? odds?.ev ?? "无"}`);
  if (all || access.includes("homeForm")) lines.push(`${home}近期：${briefing.homeForm ?? "无"}`);
  if (all || access.includes("awayForm")) lines.push(`${away}近期：${briefing.awayForm ?? "无"}`);
  if (all || access.includes("standings")) lines.push(`积分榜：${briefing.standings ?? "无"}`);
  if (all || access.includes("xg_note")) lines.push(`xG备注：${briefing.xg_note ?? "无"}`);
  if (all || access.includes("avgHomeGoals")) lines.push(`${home}进失球：${briefing.avgHomeGoals ?? "无"}`);
  if (all || access.includes("avgAwayGoals")) lines.push(`${away}进失球：${briefing.avgAwayGoals ?? "无"}`);
  if (all || access.includes("h2hScoreFreq")) lines.push(`历史比分分布：${briefing.h2hScoreFreq ?? "无"}`);
  if (all || access.includes("impliedScore")) lines.push(`赔率隐含比分：${briefing.impliedScore ?? "无"}`);
  if (all || access.includes("h2h"))     lines.push(`交锋历史：${briefing.h2h ?? "无"}`);
  if (all || access.includes("historicalNote")) lines.push(`历史注：${briefing.historicalNote ?? "无"}`);
  if (all || access.includes("news"))    lines.push(`新闻：${briefing.news ?? "无"}`);
  if (all || access.includes("homeForm_mood")) lines.push(`${home}士气：${briefing.homeForm_mood ?? "无"}`);
  if (all || access.includes("awayForm_mood")) lines.push(`${away}士气：${briefing.awayForm_mood ?? "无"}`);
  if (all || access.includes("numerology")) lines.push(`玄学数据：${briefing.numerology ?? "无"}`);

  if (all) {
    lines.push(`战术：${briefing.tactical ?? "无"}`);
    if (homePlayers?.length) lines.push(`${home}关键球员：\n${homePlayers.map(pl).join("\n")}`);
    if (awayPlayers?.length) lines.push(`${away}关键球员：\n${awayPlayers.map(pl).join("\n")}`);
  } else {
    const allPlayers = [...(homePlayers ?? []), ...(awayPlayers ?? [])];
    if (allPlayers.length) lines.push(`球员参考：\n${allPlayers.map(pl).join("\n")}`);
  }

  if (context) lines.push(`背景：${context}`);
  return lines.join("\n");
}

function buildDevilBriefing(match, agentId) {
  const { home, away, homePlayers, awayPlayers, briefing = {}, odds } = match;
  const pl = (p) => `  • ${p.name}（${p.pos}）— ${p.stat}`;
  const lines = [
    `【特殊情报（仅对立视角）】`,
    `${home}（主）vs ${away}`,
    `你只能看到对主队不利的证据：`,
  ];
  if (briefing.awayForm) lines.push(`客队近期：${briefing.awayForm}`);
  if (odds) lines.push(`赔率：${away}@${odds.away}（客队看涨）`);
  if (briefing.oddsMove) lines.push(`盘口异动：${briefing.oddsMove}`);
  if (briefing.h2h) lines.push(`交锋历史：${briefing.h2h}`);
  if (awayPlayers?.length) lines.push(`客队球员：\n${awayPlayers.map(pl).join("\n")}`);
  lines.push(`（主队数据暂不可见）`);
  return lines.join("\n");
}

function createBlackboard(matchId) {
  return {
    matchId,
    facts: [],
    claims: [],
    disputes: [],
    agentStances: {},
    consensusLevel: 0,
    pivotMoments: [],
    history: [],
    keyInsights: [],
    monitorLog: [],
    devilAdvocate: null,
  };
}

function logMonitor(blackboard, event) {
  blackboard.monitorLog.push({ ts: Date.now(), ...event });
}

function updateStance(blackboard, agentId, pick, conf) {
  const raw = conf ?? 0.5;
  const safeConf = isNaN(raw) ? 0.5 : Math.max(0.05, Math.min(0.99, raw > 1 ? raw / 100 : raw));
  const prev = blackboard.agentStances[agentId];
  if (prev && prev.pick !== pick) {
    const pivot = { agentId, from: prev.pick, to: pick, fromConf: prev.conf, toConf: safeConf, ts: Date.now() };
    blackboard.pivotMoments.push(pivot);
    logMonitor(blackboard, { type: "stance_change", ...pivot });
  }
  blackboard.agentStances[agentId] = { pick, conf: safeConf };
}

function calcConsensus(stances) {
  const vals = Object.values(stances);
  if (!vals.length) return 0;
  const homeProbs = vals.map((s) =>
    s.pick === "home" ? s.conf : s.pick === "draw" ? 0.5 * (1 - s.conf) : 1 - s.conf
  );
  const mean = homeProbs.reduce((a, b) => a + b, 0) / homeProbs.length;
  const variance = homeProbs.reduce((a, b) => a + (b - mean) ** 2, 0) / homeProbs.length;
  return parseFloat((1 - Math.min(Math.sqrt(variance) * 2, 1)).toFixed(2));
}

function detectDisputes(blackboard) {
  const stances = blackboard.agentStances;
  const ids = Object.keys(stances);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = stances[ids[i]];
      const b = stances[ids[j]];
      if (!a || !b) continue;
      if (a.pick !== b.pick) {
        const key = [ids[i], ids[j]].sort().join(":");
        const exists = blackboard.disputes.find((d) => d.key === key);
        if (!exists) {
          const disp = { key, between: [ids[i], ids[j]], topic: `${ids[i]}押${a.pick} vs ${ids[j]}押${b.pick}` };
          blackboard.disputes.push(disp);
          logMonitor(blackboard, { type: "dispute_detected", ...disp });
        }
      }
    }
  }
}

function sanitizedBlackboard(blackboard) {
  return {
    agentStances: blackboard.agentStances,
    consensusLevel: blackboard.consensusLevel,
    disputes: blackboard.disputes,
    pivotMoments: blackboard.pivotMoments,
    monitorLog: blackboard.monitorLog.slice(-10),
  };
}

function conflictScore(a, b) {
  if (!a.structured || !b.structured) return 0;
  let s = 0;
  if (a.structured.winner !== b.structured.winner) s += 3;
  s += Math.abs((a.structured.score[0] ?? 0) - (b.structured.score[0] ?? 0));
  s += Math.abs((a.structured.score[1] ?? 0) - (b.structured.score[1] ?? 0));
  if (Math.abs((a.structured.confidence ?? 0) - (b.structured.confidence ?? 0)) > 0.3) s += 1;
  return s;
}

function pickDebatePair(msgs) {
  const pairs = [];
  for (let i = 0; i < msgs.length; i++)
    for (let j = i + 1; j < msgs.length; j++)
      pairs.push({ score: conflictScore(msgs[i], msgs[j]), pair: [msgs[i], msgs[j]] });
  pairs.sort((a, b) => b.score - a.score);
  // 从分歧最高的前3对中随机选一对，避免每次都是同两个人battle
  const topN = pairs.slice(0, Math.min(3, pairs.length));
  return topN[Math.floor(Math.random() * topN.length)] || { score: 0, pair: [msgs[0], msgs[1]] };
}

function computeModalScore(scores) {
  const all = Object.values(scores).flat();
  if (!all.length) return null;
  const freq = {};
  for (const s of all) {
    const k = s.join('-');
    freq[k] = (freq[k] || 0) + 1;
  }
  const top = Object.entries(freq).sort((a,b) => b[1]-a[1])[0];
  return top ? top[0].split('-').map(Number) : null;
}

function weightedSummaryCalc(voteMsgs, agentProfiles = {}) {
  const conf = { home: 0, away: 0, draw: 0 };
  const votes = { home: 0, away: 0, draw: 0 };
  const scores = { home: [], away: [], draw: [] };

  const getCredibility = (agentId) => {
    const p = agentProfiles[agentId];
    if (!p || p.total < 5) return 1.0;
    return Math.max(0.6, Math.min(1.5, 0.6 + (p.correct / p.total) * 1.8));
  };

  for (const m of voteMsgs) {
    if (!m.structured) continue;
    const w = m.structured.winner;
    const cred = getCredibility(m.agentId);
    // 钳位置信度：防止 LLM 返回异常值（如 7000）影响汇总
    const rawConf = m.structured.confidence ?? 0.5;
    const safeConf = isNaN(rawConf) ? 0.5 : Math.max(0.05, Math.min(0.99, rawConf > 1 ? rawConf / 100 : rawConf));
    conf[w] += safeConf * cred;
    votes[w]++;
    if (m.structured.score?.length >= 2) scores[w].push(m.structured.score);
  }
  const t = conf.home + conf.away + conf.draw || 1;
  // 确保输出严格在 0-100 范围内
  const clamp100 = v => Math.max(0.1, Math.min(99.9, parseFloat((v * 100).toFixed(1))));
  return {
    home: clamp100(conf.home / t),
    away: clamp100(conf.away / t),
    draw: clamp100(conf.draw / t),
    votes,
    councilScore: computeModalScore(scores),
  };
}

async function sequential(ids, fn, delayMs = 400) {
  const results = [];
  for (const id of ids) {
    results.push(await fn(id));
    if (id !== ids[ids.length - 1]) await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}

const AGENT_NAMES = {
  stat: "冰狗", mystic: "月影姐", history: "老球迷",
  gambler: "赌狗", psych: "碎碎念", moderator: "议长",
};

// ── 信息不对称注入 ────────────────────────────────────────────────
// 生成"攻方独有、守方没有"的数据片段，让每轮对线都是真实的情报博弈
function buildInfoAsymmetryNote(atkId, defId, match) {
  const myAccess   = AGENT_DATA_ACCESS[atkId]  ?? [];
  const theirAccess = AGENT_DATA_ACCESS[defId] ?? [];
  if (myAccess.includes('all')) return '';

  const exclusive = myAccess.filter(f => !theirAccess.includes(f) && !theirAccess.includes('all'));
  if (!exclusive.length) return '';

  const briefing = match.briefing ?? {};
  const odds     = match.odds ?? {};
  const LABELS = {
    homeForm:      `${match.home}近期形态`,
    awayForm:      `${match.away}近期形态`,
    standings:     '积分榜位置',
    xg_note:       'xG期望进球',
    avgHomeGoals:  `${match.home}进失球统计`,
    avgAwayGoals:  `${match.away}进失球统计`,
    odds:          `赔率`,
    oddsMove:      '盘口动态',
    ev:            '期望价值EV',
    impliedScore:  '赔率隐含比分',
    h2h:           '历史交锋',
    historicalNote:'历史规律',
    h2hScoreFreq:  '历史比分分布',
    news:          '赛前新闻',
    homeForm_mood: `${match.home}士气`,
    awayForm_mood: `${match.away}士气`,
    numerology:    '玄学数据',
  };

  const lines = exclusive.map(f => {
    let val = f === 'odds'
      ? (odds.home ? `${match.home}@${odds.home} 平@${odds.draw} ${match.away}@${odds.away}` : null)
      : briefing[f];
    if (!val || val === '无' || val === '暂无' || val === '数据暂无') return null;
    return `• ${LABELS[f] || f}：${val}`;
  }).filter(Boolean);

  if (!lines.length) return '';
  return `\n【你的独占情报——${AGENT_NAMES[defId]}没有这些数据，用它精准击穿对方漏洞】\n${lines.join('\n')}`;
}

// ── 辩论停止条件检查 ──────────────────────────────────────────────
// 返回 null 表示继续，返回对象表示需要停止
function checkDebateStop(round, lastPivotRound, blackboard) {
  if (blackboard.consensusLevel >= 0.75)
    return { reason: 'consensus', msg: `场内共识已达 ${Math.round(blackboard.consensusLevel * 100)}%——终投时刻！` };
  if (round >= 2 && round - lastPivotRound >= 2)
    return { reason: 'stalemate', msg: '连续两轮无人转向，各方立场已固化——议长强制收场！' };
  return null;
}

// ── 从 briefing 提取该 agent 的真实数据值（直接注入 directive，禁止编造）──
function extractAgentDataValues(match, agentId) {
  const b    = match.briefing ?? {};
  const odds = match.odds ?? {};
  const OK   = v => v && v !== '无' && v !== '暂无' && v !== '数据暂无';
  const lines = [];
  switch (agentId) {
    case 'stat':
      if (OK(b.avgHomeGoals)) lines.push(`• 主队进失球统计：${b.avgHomeGoals}`);
      if (OK(b.avgAwayGoals)) lines.push(`• 客队进失球统计：${b.avgAwayGoals}`);
      if (OK(b.homeForm))     lines.push(`• 主队近5场：${b.homeForm}`);
      if (OK(b.awayForm))     lines.push(`• 客队近5场：${b.awayForm}`);
      if (OK(b.standings))    lines.push(`• 积分榜：${b.standings}`);
      if (OK(b.xg_note))      lines.push(`• xG期望：${b.xg_note}`);
      break;
    case 'gambler':
      if (odds.home) lines.push(`• 赔率：主@${odds.home} 平@${odds.draw} 客@${odds.away}`);
      if (OK(b.impliedScore)) lines.push(`• 赔率隐含比分：${b.impliedScore}`);
      if (OK(b.oddsMove))     lines.push(`• 盘口动态：${b.oddsMove}`);
      if (OK(b.ev))           lines.push(`• EV：${b.ev}`);
      break;
    case 'history':
      if (OK(b.h2hScoreFreq))    lines.push(`• 历史比分分布：${b.h2hScoreFreq}`);
      if (OK(b.h2h))             lines.push(`• 历史交锋：${b.h2h}`);
      if (OK(b.historicalNote))  lines.push(`• 历史规律：${b.historicalNote}`);
      break;
    case 'psych':
      if (OK(b.homeForm_mood)) lines.push(`• 主队士气：${b.homeForm_mood}`);
      if (OK(b.awayForm_mood)) lines.push(`• 客队士气：${b.awayForm_mood}`);
      if (OK(b.news))          lines.push(`• 赛前新闻：${b.news}`);
      break;
    case 'mystic':
      if (OK(b.numerology)) lines.push(`• 玄学数据：${b.numerology}`);
      if (match.date)        lines.push(`• 比赛日期：${match.date}`);
      if (OK(b.venue))       lines.push(`• 场地：${b.venue}`);
      break;
  }
  return lines;
}

// ── 各 agent 的方法论核心主张（用于辩论时揭示框架碰撞）────────────
const AGENT_METHOD = {
  stat:      'Poisson 概率模型（历史进失球统计 → 期望进球 → 胜平负概率）',
  gambler:   '跨平台盘口信号（公众盘 vs 职业盘资金流向 → 错误定价检测）',
  history:   '历史情景向量匹配（多维相似案例 → 胜负分布规律）',
  psych:     '行为语言 AI 分析（采访文本情绪信号 → 球员心理状态 → 影响发挥）',
  mystic:    '社交舆情叙事检测（媒体/社交情绪强度 → 叙事泡沫 → 逆向机会）',
  moderator: '综合裁判（整合所有框架，裁定哪个框架在这场比赛上更可靠）',
};

// ── 方法论碰撞矩阵：攻方能揭示守方框架的什么盲点 ─────────────────────
const METHOD_CLASH = {
  'stat→gambler':   '你的模型是静态历史统计，赌狗的盘口是实时动态信息——当两者指向相反，你的反驳是：历史N=5000场的规律比今天N=1次盘口变动更稳定',
  'stat→mystic':    '你的模型基于硬数据，月影姐的基于社交情绪——你的反驳是：情绪是噪声，Poisson期望才是长期真理',
  'stat→psych':     '你的模型不含人的变量，碎碎念的基于心理——你的反驳是：心理因素无法量化，模型里它是随机扰动项',
  'stat→history':   '你的模型用所有近期数据，老球迷只挑有利的历史案例——你的反驳是：选择性引用历史是确认偏误，我的N更大',
  'gambler→stat':   '盘口永远比模型更新更快——冰狗的Poisson模型是昨天的数据，我的盘口是今天的市场定价',
  'gambler→mystic': '月影姐跟踪叙事，我跟踪钱——叙事是情绪，钱是利益，利益才会让人真金白银下注',
  'gambler→psych':  '碎碎念的心理信号是软信息，盘口异动是硬信息——你的证据是采访感觉，我的证据是真钱在移动',
  'gambler→history':'历史规律是过去式，盘口是未来定价——老球迷的类比到今天可能已经失效',
  'history→stat':   '冰狗的Poisson假设进球独立同分布——但历史告诉我这两队在特定情境下进球绝对不是随机的',
  'history→gambler':'赌狗追资金，我追规律——历史上赌赔率在这类局面里错误率高达X%',
  'history→psych':  '碎碎念看的是球员这一场的心理，我看的是这类球队在这类局面下几十年的集体心理模式',
  'history→mystic': '月影姐的叙事泡沫检测是短期信号，历史规律是十年以上的长期规律——谁的信噪比更高？',
  'psych→stat':     '冰狗的模型里没有一个变量叫"主力球员今晚状态崩了"——但这是我知道的，这就是模型的盲区',
  'psych→gambler':  '赌狗的盘口在球员消息发布前是陈旧的——我分析采访、训练报道，比市场更早知道球员状态',
  'psych→history':  '老球迷找的是历史类比，但他没看球员X最近三场采访里的语言模式——心理状态每场都在变',
  'psych→mystic':   '月影姐的叙事是宏观舆论，我看的是具体球员的具体心理信号——宏观叙事盖不住个体关键球员的状态崩塌',
  'mystic→stat':    '你的Poisson模型假设赛前信息完全反映在数据里——但舆论已经在透支这支队的预期表现，你的"期望"被高估了',
  'mystic→gambler': '赌狗追的是资金，我追的是叙事——当所有散户和职业都在同一边，那边就被集体过度定价了',
  'mystic→history': '老球迷的历史类比本身也是一种公众叙事——越被引用的历史类比，越容易形成叙事泡沫',
  'mystic→psych':   '碎碎念说球员心理好，但舆论在这支队身上堆积了太多正面情绪——过度期待本身就是心理炸弹',
};

// ── 立场分布熵值计算（用于检测危险共识）──────────────────────────
function calcShannonEntropy(agentStances) {
  const counts = { home: 0, away: 0, draw: 0 };
  for (const s of Object.values(agentStances)) {
    if (s?.pick && counts[s.pick] !== undefined) counts[s.pick]++;
  }
  const total = counts.home + counts.draw + counts.away;
  if (total === 0) return 0;
  return Object.values(counts)
    .filter(c => c > 0)
    .reduce((H, c) => H - (c / total) * Math.log2(c / total), 0);
}

// ── 终投指令生成：每个 agent 独立视角，禁止重复 ──────────────────────
function buildVoteDirective(agentId, blackboard, debateHistory, agentA, agentB, match) {
  const stance = blackboard.agentStances[agentId];
  const myPick = stance?.pick === 'home' ? `${match.home}赢` : stance?.pick === 'away' ? `${match.away}赢` : '平局';
  const myConf = stance ? Math.round((stance.conf ?? 0.5) * 100) + '%' : '?';

  // 对线双方
  const debaterIds = [agentA?.agentId, agentB?.agentId].filter(Boolean);
  const wasDebater = debaterIds.includes(agentId);

  // 前面已投票的人说了什么（去重用）
  const priorVotes = blackboard.history
    .filter(m => m.phase === 'vote' && m.agentId !== 'moderator' && m.agentId !== agentId)
    .map(m => `${AGENT_NAMES[m.agentId]}："${(m.speech || '').slice(0, 40)}…"`)
    .join('\n');

  // 对线摘要（有对线才给）
  const debateSummary = debateHistory.length > 0
    ? debateHistory.slice(-6).map(d => `${AGENT_NAMES[d.agentId]}："${(d.speech || '').slice(0, 45)}…"`).join('\n')
    : null;

  // 立场转向信息
  const pivot = blackboard.pivotMoments.find(p => p.agentId === agentId);
  const pivotNote = pivot
    ? `（注意：你在对线中已从"${pivot.from === 'home' ? match.home+'赢' : pivot.from === 'away' ? match.away+'赢' : '平局'}"转向"${pivot.to === 'home' ? match.home+'赢' : pivot.to === 'away' ? match.away+'赢' : '平局'}"，终投要承认这个转变或解释你为什么又改了主意）`
    : '';

  // 前面已说的内容提示
  const avoidRepeat = priorVotes
    ? `\n【以下内容已被说过，禁止重复，必须说完全不同的事】\n${priorVotes}`
    : '';

  // 当前全员立场快照
  const allStances = Object.entries(blackboard.agentStances)
    .filter(([id]) => id !== agentId && id !== 'moderator')
    .map(([id, s]) => `${AGENT_NAMES[id]}押${s.pick === 'home' ? match.home+'赢' : s.pick === 'away' ? match.away+'赢' : '平局'}(${Math.round((s.conf||0.5)*100)}%)`)
    .join('，');

  // 每个 agent 的独家终投视角
  const UNIQUE_ANGLE = {
    stat:
      `你是数据帝，终投必须做一件其他人做不到的事：把今晚辩论里出现的所有论点折算成概率变化。
${debateSummary ? '对线摘要：\n' + debateSummary + '\n' : ''}有没有某个论点让你的泊松参数需要修正？修正后P(${match.home}赢)/P(平)/P(${match.away}赢)各是多少？
必须给出三个更新后的概率数字，哪怕变化微小也要说明原因。禁止只说"我坚持初判"——要量化地说坚持的证据。`,

    gambler:
      `你是盘口派，终投必须说一件其他人说不出的事：今晚所有分析里，哪个论点最接近"职业资金会押的逻辑"，哪个是散户思维？
${debateSummary ? '对线摘要：\n' + debateSummary + '\n' : ''}给出你的赔率判断：今晚的分析有没有改变你对公众盘 vs 职业盘分歧的判断？最终你跟职业盘走，意味着押什么？`,

    history:
      `你是历史区，终投必须补一个今晚谁都没说过的历史数据点——一场具体的历史比赛，或者一个你刚想起来的统计。
${debateSummary ? '对线里说了：\n' + debateSummary + '\n' : ''}那个被所有人忽略的历史细节，支持还是推翻了主流判断？历史的最终裁决是什么？`,

    psych:
      `你是行为语言分析师，终投必须分析今晚议会辩论本身的心理模式——不是比赛，是这场议会。
谁的发言里有防御性信号？谁越说越底气不足？谁在压力下改变了措辞？
${debateSummary ? '对线发言：\n' + debateSummary + '\n' : ''}把这个心理结构映射到场上：哪支球队的球员心态可能跟今晚某位输了辩论的 agent 一样？`,

    mystic:
      `你是舆情叙事分析师，终投必须给出今晚对线结束后的"叙事强度更新"。
今晚所有分析有没有改变媒体/社交的叙事方向？${debateSummary ? '\n对线摘要：\n' + debateSummary + '\n' : ''}
叙事强度是上升了（热门更被相信）还是下降了（叙事被数据打脸）？你是顺叙事还是逆叙事，理由是什么？`,
  };

  const roleAngle = UNIQUE_ANGLE[agentId] || `用你的方法论【${AGENT_METHOD[agentId]}】给出最终判断。`;

  const debaterContext = wasDebater
    ? `你参与了今晚的对线，现在宣布你的最终立场——你在辩论中坚守住了吗？`
    : `你今晚作为旁观者看了对线，现在从场外视角做最终裁决。`;

  return `终极裁决。
你的当前立场：${myPick}（${myConf}置信度）${pivotNote}
其他人的立场：${allStances || '（暂无）'}
${debaterContext}

${roleAngle}
${avoidRepeat}

必须填 structured（winner + score + confidence + keyFactor，和初判相比要有变化，哪怕是置信度变了1%）。
必须写 scenePrediction（终局画面：第X分钟+球员名+动作，20-40字，画面要有冲击力）。
speech 40-65字，catchphrase必须含球员名+数字，20字以内，这是今晚最后一句被截图的话。`;
}

// ── 辩论指令生成：方法论碰撞版 ──────────────────────────────────────
function buildDebateDirective(round, atkId, defId, defMsg, match) {
  const atkDataLines = extractAgentDataValues(match, atkId);
  const atkDataBlock = atkDataLines.length > 0
    ? `\n【你手头的真实数据】\n${atkDataLines.join('\n')}`
    : '\n【你的数据字段当前为空，改用经验/直觉代替具体数字】';

  const ds = defMsg?.structured;
  const defPickCN = ds?.winner === 'home' ? '主队赢' : ds?.winner === 'away' ? '客队赢' : '平局';
  const defScore  = ds?.score?.join('-') ?? '?-?';
  const defConf   = ds?.confidence ? `${Math.round(ds.confidence * 100)}%` : '?';
  const defFactor = ds?.keyFactor ? `"${ds.keyFactor}"` : '未知';
  const defSnippet = defMsg?.speech ? `\n  原话：「${defMsg.speech.slice(0, 50)}${defMsg.speech.length > 50 ? '…' : ''}」` : '';

  const defClaim = ds
    ? `${AGENT_NAMES[defId]}（${AGENT_METHOD[defId]}）\n  具体判断：押${defPickCN} ${defScore}，置信度${defConf}，关键因素${defFactor}${defSnippet}`
    : `${AGENT_NAMES[defId]} 刚才说：${defMsg?.speech?.slice(0, 60) ?? '（无）'}`;

  // 找到这组对战的方法论碰撞说明
  const clashKey = `${atkId}→${defId}`;
  const methodClash = METHOD_CLASH[clashKey]
    ? `\n【方法论碰撞要点——这就是你们争论的核心】\n${METHOD_CLASH[clashKey]}`
    : '';

  const labels = ['开炮', '反击', '加码', '压制', '终局'];
  const label  = labels[round] || '反击';
  const partial = round >= 1
    ? `\n【动态立场规则】：若对方引用了你数据字段里没有的真实证据，或揭示了你框架的真实盲点，必须在structured.confidence微调±0.1-0.15，并在speech里说"这点……确实让我有点动摇，但我的框架整体显示……"。第${round+1}轮如果你完全没调整confidence，系统会判断你在固执——固执不等于分析严谨。`
    : '';

  return `【${label}·第${round + 1}轮】
你的分析框架：${AGENT_METHOD[atkId]}
【对方判断】${defClaim}
${atkDataBlock}
${methodClash}
【任务】这是方法论之争：你的框架在这场比赛上比对方更可靠。用你的数据或历史案例，指出对方框架的一个具体盲点，必须引用数字或球员名，20-35字。${partial}`;
}

export async function runCouncil(matchData, emit, options = {}) {
  const { agentProfiles = {} } = options;
  const match = matchData;

  // 比赛类型检测
  const isChinaGame = isChinaMatch(match);
  const isEPL       = isEPLMatch(match);
  const isWC        = isWCMatch(match);

  // 动态扩展提示
  const extraPrompt = isChinaGame ? CHINA_EXTRA_PROMPT
                    : isWC       ? WC_EXTRA_PROMPT
                    : isEPL      ? EPL_EXTRA_PROMPT
                    : '';

  if (isChinaGame) emit({ type: 'china_mode', home: match.home, away: match.away });
  if (isEPL)      emit({ type: 'match_mode', mode: 'epl',    label: '英超预热' });
  if (isWC && !isChinaGame) emit({ type: 'match_mode', mode: 'wc', label: '世界杯正赛' });

  const blackboard = createBlackboard(match.matchId ?? match.home + "vs" + match.away);
  let n = 0;
  const nextId = () => `msg_${++n}`;

  const EXPERTS = ["stat", "mystic", "history", "gambler", "psych"];

  blackboard.devilAdvocate = EXPERTS[Math.floor(Math.random() * EXPERTS.length)];
  logMonitor(blackboard, { type: "devil_assigned", agentId: blackboard.devilAdvocate });

  // 混沌变量：每场议会随机选一个"秘密视角"注入某个 agent（防止重复感）
  const CHAOS_ANGLES = [
    { agentId: 'mystic',  hint: '今晚社交媒体上对这场比赛异常安静——静得反常的比赛往往有惊喜' },
    { agentId: 'gambler', hint: '有消息称今晚某家东南亚博彩公司大额押平局——职业盘的钱不会说谎' },
    { agentId: 'history', hint: '查了数据：过去5年，这两队/类似积分的队伍每逢周末晚场必出冷门，概率高达40%' },
    { agentId: 'psych',   hint: '上周采访里发现一个细节：关键球员提到"需要证明自己"——这种心理往往过度激进' },
    { agentId: 'stat',    hint: '模型发现：今天天气预报有雨，潮湿球场历史上使得进球数下降约0.4球/场' },
    { agentId: 'mystic',  hint: '本场比赛号码加起来是个奇数——历史上奇数场次爆冷率比偶数高11%（玄学数据）' },
    { agentId: 'gambler', hint: '赔率在昨晚悄悄移动了0.05——幅度小但方向一致，职业盘在试探性建仓' },
    { agentId: 'history', hint: '这个赛季节点（相同轮次区间），主客场互换的队伍有65%概率表现反直觉' },
  ];
  const chaosAngle = CHAOS_ANGLES[Math.floor(Math.random() * CHAOS_ANGLES.length)];
  logMonitor(blackboard, { type: 'chaos_angle', ...chaosAngle });

  // 工具：延迟 + 带重试的 agent 调用（防止并发打爆速率限制）
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const withRetry = async (fn, { retries = 1, baseDelay = 4000 } = {}) => {
    for (let a = 0; a <= retries; a++) {
      try { return await fn(); }
      catch (e) {
        if (a < retries) { await sleep(baseDelay * (a + 1)); }
        else throw e;
      }
    }
  };

  function maybeAddInsight(msg) {
    if (!msg.structured || msg.agentId === "moderator") return;
    const w = { home: "主队", away: "客队", draw: "平局" }[msg.structured.winner] || "?";
    const c = Math.round((msg.structured.confidence || 0.5) * 100);
    const f = msg.structured.keyFactor ? `（${msg.structured.keyFactor}）` : "";
    blackboard.keyInsights.push(`${AGENT_NAMES[msg.agentId] || msg.agentId} → ${w}(${c}%)${f}`);
  }

  // JSON 输出 schema（嵌入 system prompt，比 tool_choice schema ~300token 精简很多）
  const JSON_SCHEMA = `【JSON输出格式，必须严格遵守】{"agentId":"ID","phase":"PHASE","speech":"50-80字正文","catchphrase":"20字金句","emotion":"excited|calm|skeptical|nervous|aggressive","predictionTag":"直球押注|毒奶预警|条件预言|反向操作|历史重演|玄学感应|心理分析","scenePrediction":"30-60字分镜含分钟数球员动作","structured":{"winner":"home|draw|away","score":[主整数,客整数],"confidence":0.0到1.0,"keyFactor":"20字内"}}`;

  async function callAgent(agentId, directive, phase, overrideBriefing, maxTokens = 360) {
    const insightCtx = blackboard.keyInsights.length > 0
      ? `\n【场内判断（请回应或反驳至少一条）】${blackboard.keyInsights.slice(-4).map(k => `• ${k}`).join('；')}`
      : "";
    const briefingText = overrideBriefing ?? buildAgentBriefing(match, agentId);
    // 历史只保留最近8条，speech截断60字，减少token
    const histSlice = blackboard.history.slice(-8).map(m => ({
      id: m.id, agentId: m.agentId, phase: m.phase,
      speech: (m.speech || "").slice(0, 60),
      catchphrase: m.catchphrase,
      ...(m.structured ? { w: m.structured.winner, c: m.structured.confidence } : {}),
    }));
    const payload = JSON.stringify({
      match: `${match.home} vs ${match.away}`,
      directive: directive + (phase !== "reaction" ? insightCtx : ""),
      history: histSlice,
    });

    const t0 = Date.now();
    logMonitor(blackboard, { type: "agent_start", agentId, phase });

    const TIMEOUT_MS = 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let fullContent = '';
    let lastSpeechLen = 0; // 用于 speech_chunk 渐进式文本推送
    try {
      const stream = await getClient().chat.completions.create({
        model: MODEL,
        max_tokens: maxTokens,
        temperature: AGENT_TEMPERATURE[agentId] ?? 0.7,
        response_format: { type: "json_object" },
        stream: true,
        messages: [
          { role: "system", content: `${PUBLIC_PROMPT}${extraPrompt}\n\n${briefingText}\n\n${AGENT_PERSONAS[agentId]}\n\n${JSON_SCHEMA}` },
          { role: "user",   content: payload },
        ],
      }, { signal: controller.signal });

      let streamStarted = false;
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        // 首个 chunk 时立即通知前端切换发言动画（TTFT ~1s），不等完整 JSON
        if (delta && !streamStarted) {
          streamStarted = true;
          emit({ type: 'speaking_start', agentId, phase });
        }
        fullContent += delta;

        // 渐进式 speech 文本推送（reaction/interject 篇幅短，跳过）
        if (delta && phase !== 'reaction' && phase !== 'interject') {
          const m = fullContent.match(/"speech"\s*:\s*"((?:[^"\\]|\\.)*)/);
          if (m) {
            const rawText = m[1]
              .replace(/\\n/g, '\n')
              .replace(/\\t/g, '\t')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
            if (rawText.length > lastSpeechLen) {
              const newChunk = rawText.slice(lastSpeechLen);
              if (newChunk) emit({ type: 'speech_chunk', agentId, phase, text: newChunk });
              lastSpeechLen = rawText.length;
            }
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }

    if (!fullContent) throw new Error(`[${agentId}] 空响应`);
    let inp;
    try { inp = JSON.parse(fullContent); }
    catch(e) { throw new Error(`[${agentId}] JSON解析失败: ${e.message} | 原文: ${fullContent.slice(0,80)}`); }
    if (!inp.speech) throw new Error(`[${agentId}] 响应缺少 speech 字段`);

    const elapsed = Date.now() - t0;
    logMonitor(blackboard, { type: "agent_done", agentId, phase, ms: elapsed });

    // 质量校验：scenePrediction 必须含分钟数（数字），缺失则填 fallback
    const rawScene = inp.scenePrediction ?? null;
    const sceneHasMinute = rawScene && /\d+/.test(rawScene);
    const cleanScene = sceneHasMinute ? rawScene : (rawScene ? rawScene : null);

    return {
      id: nextId(), agentId, phase,
      speech:          inp.speech          ?? "",
      catchphrase:     inp.catchphrase     ?? "",
      scenePrediction: cleanScene,
      predictionTag:   inp.predictionTag   ?? null,
      emotion:         inp.emotion         ?? "calm",
      references:      inp.references      ?? [],
      structured:      inp.structured      ?? null,
    };
  }

  function addMsg(msg) {
    blackboard.history.push(msg);
    emit({ type: "message", ...msg });
    if (msg.structured && msg.agentId !== "moderator") {
      updateStance(blackboard, msg.agentId, msg.structured.winner, msg.structured.confidence ?? 0.5);
      detectDisputes(blackboard);
      blackboard.consensusLevel = calcConsensus(blackboard.agentStances);
    }
  }

  function emitBlackboardUpdate() {
    emit({ type: "blackboard_update", blackboard: sanitizedBlackboard(blackboard) });
  }

  function pickReactor(speakerAgentId, initialMsgsSoFar) {
    const candidates = initialMsgsSoFar.filter((m) => m.agentId !== speakerAgentId);
    if (!candidates.length) return null;
    const speakerStance = blackboard.agentStances[speakerAgentId];
    if (!speakerStance) return candidates[Math.floor(Math.random() * candidates.length)].agentId;
    let maxDiff = -1;
    let picked = candidates[0].agentId;
    for (const c of candidates) {
      const cs = blackboard.agentStances[c.agentId];
      if (!cs) continue;
      const diff = cs.pick !== speakerStance.pick ? 1 : 0;
      if (diff > maxDiff) { maxDiff = diff; picked = c.agentId; }
    }
    return picked;
  }

  emit({ type: "phase", phase: "opening" });
  emit({ type: "thinking", agentId: "moderator" });
  try {
    addMsg(await callAgent(
      "moderator",
      `直播间主播开场，像斗鱼开团一样煽动，把今晚${match.home} vs ${match.away}最大悬念甩出来，不超过50字，"各位老铁来了来了"的节奏`,
      "opening"
    ));
  } catch (e) {
    logMonitor(blackboard, { type: "error", agentId: "moderator", phase: "opening", msg: e.message });
  }

  emit({ type: "phase", phase: "initial" });
  const initialMsgs = [];

  // 完全串行：每个 agent 独立运行，完成后立即 emit，不依赖并发
  // 避免并发触发速率限制 + 消除 Promise.allSettled 整体阻塞
  const AGENT_DIRECTIVE = {
    stat: (dataBlock) => `【你是Dr.冰狗——AI Poisson 模拟引擎】${dataBlock}
你已完成10,000次蒙特卡洛模拟。现在报告结果（在脑中推导，不要输出步骤）：
① 用上面进失球数据估算两队 Poisson 参数（λ主=场均进球，λ客=场均进球）
② 若主队近期连胜超过3场，启动均值回归判断：是否正在超水平发挥、即将向均值回归
③ 输出模拟结果：P(主胜)=X% P(平)=Y% P(客胜)=Z%，必须三个数字都给出
输出规则：speech必须含三个百分比"主胜X%/平Y%/客Z%"；开头用"绷不住了"/"样本量说话"；catchphrase含具体概率数字`,

    gambler: (dataBlock) => `【你是赌狗本狗——AI 跨平台盘口套利系统】${dataBlock}
你已监测多家博彩公司赔率变动。现在分析（在脑中推导，不要输出步骤）：
① 从赔率判断"公众盘方向"（哪边赔率被压低 = 公众在押那边）
② 从盘口动态判断"职业盘信号"（有无异常移动、资金流向）
③ 关键：公众盘和职业盘方向是否一致？若相反，职业盘是正确答案
输出规则：必须说"公众在押X，职业盘信号指向Y"；用"钱不说谎"/"盘口说话"；引用具体赔率数字`,

    history: (dataBlock) => `【你是老球迷——AI 历史情景向量匹配引擎】${dataBlock}
你已扫描历史数据库，找到最相似历史局面。现在报告（在脑中推导，不要输出步骤）：
① 最高相似度的历史情景（年份+对阵+关键相似点）
② 那类情景下的结果分布（X场里Y场主赢/平/客赢）
③ 主动给出反例——历史上相似局面但结果相反的案例
输出规则：必须给出具体历史比赛（年份+双方）；必须承认反例；开头用"诸位可能太年轻"/"那年我亲眼所见"`,

    psych: (dataBlock) => `【你是碎碎念——AI 行为语言分析引擎】${dataBlock}
你已分析两队球员近期采访文本和行为模式。现在报告（在脑中推导，不要输出步骤）：
① 找出一个关键球员，他最近的可观察信号（采访情绪/换人时机/伤病模式）
② 这个信号的历史含义：该类信号出现后球员发挥的规律
③ 推导：这个心理状态如何具体影响本场得失球，给出比分结论
输出规则：必须点名具体球员；给出信号来源；推导到具体比分；开头用"我注意到一个细节"/"更衣室里有什么我知道"`,

    mystic: (dataBlock) => `【你是月影姐——AI 社交舆情分析引擎（玄学是表演包装）】${dataBlock}
你已处理近48小时本场相关社交内容，得出叙事强度分析。现在报告（在脑中推导，不要输出步骤）：
① 当前最强"公众叙事"是什么？媒体和舆论支持谁、叙事强度如何？
② 这个叙事的脆弱点：依赖的哪个假设最容易崩塌？
③ 你是顺叙事还是反叙事？注意：若"爆冷"已成主流叙事，反而要支持热门
输出规则：必须说"当前主流叙事是X，脆弱点是Y"；不能每次都押冷门；开头用"说真的姐妹们"/"天机不可泄露"`,
  };

  for (const id of EXPERTS) {
    emit({ type: "thinking", agentId: id });
    const isDevil = id === blackboard.devilAdvocate;
    const briefingOverride = isDevil ? buildDevilBriefing(match, id) : null;
    const seed = match.agentSeeds?.[id] ?? "";
    logMonitor(blackboard, { type: "agent_start", agentId: id, phase: "initial" });

    const dataLines = extractAgentDataValues(match, id);
    const dataBlock = dataLines.length > 0
      ? `\n【真实数据——只能引用这些数字，禁止编造】\n${dataLines.join('\n')}\n`
      : '\n【无数据，禁止编造数字，改用感性判断】\n';

    // 混沌变量：目标 agent 获得"独家秘密视角"
    const chaosHint = chaosAngle.agentId === id
      ? `\n【今晚你独家掌握的秘密信号——必须在发言中提及】\n${chaosAngle.hint}`
      : '';

    const directive = `给出初判。独家视角（赛前情报）：${seed}${chaosHint}

${(AGENT_DIRECTIVE[id] || (() => ''))(dataBlock)}

必须填 structured（winner + score数组[主,客] + confidence + keyFactor）。
必须写 scenePrediction（决定性时刻分镜：分钟数+球员名+具体动作，30-50字）。
必须写 catchphrase（今晚最可能被截图那句话，含具体数字+球员名，20字以内）。
speech 50-80字，弹幕语气，必须引用至少一个上面给出的真实数据点。`;

    let msg;
    try {
      msg = await withRetry(
        () => callAgent(id, directive, "initial", briefingOverride),
        { retries: 1, baseDelay: 3000 }
      );
    } catch (err) {
      const errDetail = [err?.message, err?.status ? `HTTP ${err.status}` : ''].filter(Boolean).join(' | ');
      logMonitor(blackboard, { type: "error", agentId: id, phase: "initial", msg: errDetail });
      msg = {
        id: nextId(), agentId: id, phase: "initial",
        speech: `（${AGENT_NAMES[id] || id}信号丢失，本轮跳过分析）`,
        catchphrase: '', emotion: 'calm', references: [],
        structured: null, scenePrediction: null, predictionTag: null,
      };
    }

    addMsg(msg);
    maybeAddInsight(msg);
    initialMsgs.push(msg);
  }

  // ── 发散性注入：若5人全押同一方，强制一人唱反调（防危险共识）──────
  const entropyAfterInitial = calcShannonEntropy(blackboard.agentStances);
  const structuredInitials = initialMsgs.filter(m => m.structured);
  if (entropyAfterInitial < 0.8 && structuredInitials.length >= 3) {
    const pickCounts = {};
    for (const s of Object.values(blackboard.agentStances)) {
      if (s?.pick) pickCounts[s.pick] = (pickCounts[s.pick] || 0) + 1;
    }
    const consensusPick = Object.entries(pickCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (consensusPick) {
      const oppositePick = consensusPick === 'home' ? 'away' : consensusPick === 'away' ? 'home' : 'home';
      const oppositeLabel = oppositePick === 'home' ? `${match.home}赢` : `${match.away}赢`;
      const consensusLabel = consensusPick === 'home' ? `${match.home}赢` : consensusPick === 'away' ? `${match.away}赢` : '平局';
      const agreers = EXPERTS.filter(id => blackboard.agentStances[id]?.pick === consensusPick);
      const preferOrder = ['mystic', 'gambler', 'psych', 'history', 'stat'];
      const contrarianId = preferOrder.find(id => agreers.includes(id)) || agreers[0];
      if (contrarianId) {
        const dataLines = extractAgentDataValues(match, contrarianId);
        const dataBlock = dataLines.length > 0
          ? `\n【你手头数据里能找到的反向证据】\n${dataLines.join('\n')}\n`
          : '\n【从你的方法论框架出发，挑战共识】\n';
        emit({ type: 'thinking', agentId: contrarianId });
        logMonitor(blackboard, { type: 'divergence_injection', entropy: entropyAfterInitial, contrarianId });
        try {
          const msg = await withRetry(
            () => callAgent(
              contrarianId,
              `【系统警告：议会全体押${consensusLabel}（熵值${entropyAfterInitial.toFixed(2)}）——历史上这类情形经常是陷阱】
${dataBlock}
你的任务：从你的框架【${AGENT_METHOD[contrarianId]}】里找出支持${oppositeLabel}的最强论据，打破危险共识。
即使你只有50%把握，也要提出这个异议——有异见才能发现共识盲点。
structured.winner="${oppositePick}"，confidence 0.5–0.65。
speech 40-55字：用你的方法论数据说出为什么共识可能是错的，必须引用真实数字或球员名。`,
              'initial'
            ),
            { retries: 1, baseDelay: 3000 }
          );
          addMsg(msg);
          maybeAddInsight(msg);
          initialMsgs.push(msg);
        } catch(e) {
          logMonitor(blackboard, { type: 'error', agentId: contrarianId, phase: 'divergence_injection', msg: e.message });
        }
      }
    }
  }

  // ── 初判 reaction：双向方法论互怼 ──────────────────────────────
  if (initialMsgs.length >= 2) {
    const { pair: rPair } = pickDebatePair(initialMsgs);
    const [rA, rB] = rPair;

    // 方向1：rA 质疑 rB
    try {
      const clashAB = METHOD_CLASH[`${rA.agentId}→${rB.agentId}`] || '';
      const rAdata  = extractAgentDataValues(match, rA.agentId);
      const rBpickCN = rB.structured?.winner === 'home' ? '主队赢' : rB.structured?.winner === 'away' ? '客队赢' : '平局';
      emit({ type: "thinking", agentId: rA.agentId });
      addMsg(await callAgent(
        rA.agentId,
        `${AGENT_NAMES[rB.agentId]}用【${AGENT_METHOD[rB.agentId]}】推断${rBpickCN} ${rB.structured?.score?.join('-') ?? '?'}。
你用的是【${AGENT_METHOD[rA.agentId]}】。
${clashAB ? '方法论碰撞：' + clashAB + '\n' : ''}${rAdata.length ? '你的数据：\n' + rAdata.join('\n') + '\n' : ''}
一句话质疑对方框架（不只是结论），必须点名球员或引用数字，15-25字。`,
        "reaction", null, 160
      ));
    } catch(e) { logMonitor(blackboard, { type: "error", agentId: rA.agentId, phase: "reaction", msg: e.message }); }
    await new Promise(r => setTimeout(r, 400));

    // 方向2：rB 反击 rA（让对话真的双向）
    try {
      const clashBA = METHOD_CLASH[`${rB.agentId}→${rA.agentId}`] || '';
      const rBdata  = extractAgentDataValues(match, rB.agentId);
      const lastRAmsg = blackboard.history.slice().reverse().find(m => m.agentId === rA.agentId);
      const rAsnippet = lastRAmsg?.speech ? `「${lastRAmsg.speech.slice(0, 40)}…」` : '';
      emit({ type: "thinking", agentId: rB.agentId });
      addMsg(await callAgent(
        rB.agentId,
        `${AGENT_NAMES[rA.agentId]}刚刚说：${rAsnippet}
他用的是【${AGENT_METHOD[rA.agentId]}】，你用的是【${AGENT_METHOD[rB.agentId]}】。
${clashBA ? '方法论碰撞：' + clashBA + '\n' : ''}${rBdata.length ? '你的数据：\n' + rBdata.join('\n') + '\n' : ''}
直接反击：你的框架揭示了他的框架看不到什么，15-25字，必须有具体依据。`,
        "reaction", null, 160
      ));
    } catch(e) { logMonitor(blackboard, { type: "error", agentId: rB.agentId, phase: "reaction", msg: e.message }); }
    await new Promise(r => setTimeout(r, 200));
  }

  emitBlackboardUpdate();

  // ── 对线阶段：动态停止，最多5轮 ──────────────────────────────
  const { score: maxConflict, pair } = pickDebatePair(
    initialMsgs.length >= 2 ? initialMsgs : blackboard.history.filter((m) => m.phase === "initial").slice(0, 5)
  );
  const [agentA, agentB] = pair;

  emit({ type: "phase", phase: "debate", meta: { agentA: agentA.agentId, agentB: agentB.agentId, conflictScore: maxConflict } });

  const stanceA = blackboard.agentStances[agentA.agentId];
  const stanceB = blackboard.agentStances[agentB.agentId];
  const topDispute = blackboard.disputes[blackboard.disputes.length - 1];

  emit({ type: "thinking", agentId: "moderator" });
  try {
    addMsg(await callAgent(
      "moderator",
      `点名交锋！${AGENT_NAMES[agentA.agentId]}押${stanceA?.pick ?? "?"}，${AGENT_NAMES[agentB.agentId]}押${stanceB?.pick ?? "?"}，这是${topDispute?.topic ?? "直接立场对立"}——开战！不超过25字，"各位老铁"节奏`,
      "debate"
    ));
  } catch (e) {
    logMonitor(blackboard, { type: "error", agentId: "moderator", phase: "debate_setup", msg: e.message });
  }
  await new Promise((r) => setTimeout(r, 200));

  // 动态辩论循环
  const debateHistory = [];
  let debateRound = 0;
  let lastPivotRound = -1;
  const MAX_DEBATE_ROUNDS = 5;
  const pivotCountAtDebateStart = blackboard.pivotMoments.length; // 追踪对线期间是否有转向

  while (debateRound < MAX_DEBATE_ROUNDS) {
    // 第0轮一定要跑，之后每轮前检查停止条件
    if (debateRound > 0) {
      const stopResult = checkDebateStop(debateRound, lastPivotRound, blackboard);
      if (stopResult) {
        emit({ type: "debate_stop", reason: stopResult.reason, msg: stopResult.msg });
        break;
      }
      await new Promise((r) => setTimeout(r, 350));
    }

    const atk = debateRound % 2 === 0 ? agentA : agentB;
    const def = debateRound % 2 === 0 ? agentB : agentA;

    // 取对方在对线中的最近完整消息（优先本局对话，fallback 到 blackboard.history）
    const lastDefMsg = debateHistory.filter(d => d.agentId === def.agentId).at(-1)
      ?? blackboard.history.slice().reverse().find(m => m.agentId === def.agentId && (m.phase === 'initial' || m.phase === 'debate'));

    const directive = buildDebateDirective(debateRound, atk.agentId, def.agentId, lastDefMsg, match);

    const prevPivotCount = blackboard.pivotMoments.length;
    emit({ type: "thinking", agentId: atk.agentId });
    try {
      const msg = await callAgent(atk.agentId, directive, "debate", null, 320);
      addMsg(msg);
      debateHistory.push({ agentId: atk.agentId, speech: msg.speech, structured: msg.structured });

      // 检测立场转向
      if (blackboard.pivotMoments.length > prevPivotCount) {
        lastPivotRound = debateRound;
        emit({ type: "pivot", agentId: atk.agentId, round: debateRound, to: blackboard.agentStances[atk.agentId]?.pick });
      }
    } catch (e) {
      logMonitor(blackboard, { type: "error", agentId: atk.agentId, phase: "debate", msg: e.message });
    }

    emitBlackboardUpdate();
    debateRound++;

    // round 3 结束后，若无转向则注入"游戏改变者"——议长披露被忽视的关键数据
    if (debateRound === 3 && blackboard.pivotMoments.length === pivotCountAtDebateStart) {
      await new Promise(r => setTimeout(r, 300));
      emit({ type: 'thinking', agentId: 'moderator' });
      const allDataPoints = [];
      for (const id of EXPERTS) {
        const lines = extractAgentDataValues(match, id);
        allDataPoints.push(...lines);
      }
      const uniqueData = [...new Set(allDataPoints)].slice(0, 5).join('\n');
      try {
        addMsg(await callAgent(
          'moderator',
          `3轮对线双方立场未动，各说各话！你掌握全场最完整情报，现在投掷"舆论炸弹"打破僵局：
【全场数据速览】\n${uniqueData || '（基于常规背景判断）'}
找出最具颠覆性的一条数据，用"老铁们！所有人都忽略了——"开头揭示它。
然后说"这意味着X得小心了"，25-35字，必须含具体数字或球员名。`,
          'debate',
          null,
          240
        ));
        emitBlackboardUpdate();
      } catch(e) {
        logMonitor(blackboard, { type: 'error', agentId: 'moderator', phase: 'game_changer', msg: e.message });
      }
    }

    // round 2 结束后，必须插入第三个 agent 的方法论视角（保证多方碰撞，不再依赖随机概率）
    if (debateRound === 2) {
      const thirdCandidates = EXPERTS.filter(id => id !== agentA.agentId && id !== agentB.agentId);
      const thirdId = thirdCandidates[Math.floor(Math.random() * thirdCandidates.length)];
      if (thirdId) {
        await new Promise(r => setTimeout(r, 300));
        const thirdData = extractAgentDataValues(match, thirdId);
        const thirdSnippets = debateHistory.slice(-2).map(d => `${AGENT_NAMES[d.agentId]}：「${(d.speech||'').slice(0,35)}…」`).join('\n');
        emit({ type: "thinking", agentId: thirdId });
        try {
          addMsg(await callAgent(
            thirdId,
            `旁观了两轮对线：
${thirdSnippets}
${AGENT_NAMES[agentA.agentId]}用的是【${AGENT_METHOD[agentA.agentId]}】，${AGENT_NAMES[agentB.agentId]}用的是【${AGENT_METHOD[agentB.agentId]}】。
你的框架是【${AGENT_METHOD[thirdId]}】，你看到了他们都没看到的角度。
${thirdData.length ? '你的独占数据：\n' + thirdData.join('\n') + '\n' : ''}
插嘴！一句话说出你的框架能揭示的不同视角，必须给出具体依据，20-30字。`,
            "debate", null, 200
          ));
        } catch(e) { logMonitor(blackboard, { type: "error", agentId: thirdId, phase: "debate_interject", msg: e.message }); }
        emitBlackboardUpdate();
      }
    }
  }

  // 对线总结：议长必须选边（钦点胜出论点），不能说"两边都有道理"
  const totalRounds = debateHistory.length;
  const stanceSummaryA = blackboard.agentStances[agentA.agentId];
  const stanceSummaryB = blackboard.agentStances[agentB.agentId];
  const hasPivot = blackboard.pivotMoments.some(p => p.ts > Date.now() - 180000);
  await new Promise((r) => setTimeout(r, 200));
  emit({ type: "thinking", agentId: "moderator" });
  try {
    addMsg(await callAgent(
      "moderator",
      `${totalRounds}轮对线结束。
【最核心规则：必须选边，不能说"两边都有道理"，违规=失职】
快速分析（在脑中推导，不要输出分析过程）：
- ${AGENT_NAMES[agentA.agentId]}的论点今天有没有被打穿？哪句话是软肋？
- ${AGENT_NAMES[agentB.agentId]}的论点今天有没有被打穿？哪句话是软肋？
选胜出方，然后输出（总字数<45字）：
① "老铁们！【X的论点今天赢了】" ——开门见山，必须是具体名字
② 一句话说为什么赢了（数据层面，不要废话）
③ 对方败在哪一点（具体到某个数字或某个框架假设）
${hasPivot ? '④ 今晚有人转向了，这意味着什么？' : ''}
speech 必须含具体 agent 名字和关键数据/比赛事实。`,
      "debate"
    ));
  } catch (e) {
    logMonitor(blackboard, { type: "error", agentId: "moderator", phase: "debate", msg: e.message });
  }
  emitBlackboardUpdate();

  // G: 意外时刻机制——25% 概率随机选一位专家获得"翻盘特权"（提升戏剧性）
  const surpriseAgentId = Math.random() < 0.25
    ? EXPERTS[Math.floor(Math.random() * EXPERTS.length)]
    : null;

  emit({ type: "phase", phase: "vote", meta: surpriseAgentId ? { surprise: surpriseAgentId } : undefined });
  emit({ type: "thinking", agentId: "moderator" });
  const surpriseHint = surpriseAgentId
    ? `\n⚡ 特别提示：${AGENT_NAMES[surpriseAgentId]} 今晚有权完全颠覆自己的初判立场——用最戏剧化的方式引出这个可能性！`
    : '';
  try {
    addMsg(await callAgent(
      "moderator",
      `终投开始！你在对线中已经表明了倾向，现在煽动5位裁判做最终裁决，不超过20字，节奏要快${surpriseHint}`,
      "vote"
    ));
  } catch (e) {
    logMonitor(blackboard, { type: "error", agentId: "moderator", phase: "pre_vote", msg: e.message });
  }

  const voteMsgs = [];
  const devilTrueStance = blackboard.agentStances[blackboard.devilAdvocate];

  for (const id of EXPERTS) {
    emit({ type: "thinking", agentId: id });
    try {
      // 每个 agent 拿到自己专属的视角指令（包含"前面已说什么"的去重上下文）
      const voteDirective = buildVoteDirective(id, blackboard, debateHistory, agentA, agentB, match);
      const msg = await callAgent(id, voteDirective, "vote");
      addMsg(msg);
      maybeAddInsight(msg);
      voteMsgs.push(msg);
    } catch (e) {
      logMonitor(blackboard, { type: "error", agentId: id, phase: "vote", msg: e.message });
    }
  }

  // 议长戏剧性揭幕：宣布恶魔代言人身份
  const devilVoteStance = blackboard.agentStances[blackboard.devilAdvocate];
  const devilChanged = devilTrueStance?.pick !== devilVoteStance?.pick;
  emit({ type: 'thinking', agentId: 'moderator' });
  try {
    addMsg(await callAgent(
      'moderator',
      `老铁们！本场最大悬念——谁是恶魔代言人？终于可以揭晓了！
背景：我们给一个人只提供了对主队不利的信息，让他天然形成反向立场。
${AGENT_NAMES[blackboard.devilAdvocate]}就是这个人！
他在对线中${devilChanged ? '——惊人的是，他在终投时改变了立场！这说明真实数据最终压过了单一视角。' : '——始终坚持了那个被限制信息的立场。'}
用"🎭 揭晓！！"开头，渲染这个戏剧时刻，不超过25字，尽量夸张。`,
      'vote',
      null,
      180
    ));
  } catch(e) {
    logMonitor(blackboard, { type: 'error', agentId: 'moderator', phase: 'devil_announcement', msg: e.message });
  }
  emit({
    type: "devil_reveal",
    agentId: blackboard.devilAdvocate,
    trueStance: devilVoteStance,
    playedStance: devilTrueStance,
  });

  const summary = weightedSummaryCalc(voteMsgs, agentProfiles);
  const { rebalancedProbs } = options;
  emit({
    type: "summary",
    results: { ...summary, ...(rebalancedProbs ?? {}) },
    match,
    ev: rebalancedProbs?.ev ?? null,
  });

  emitBlackboardUpdate();
}

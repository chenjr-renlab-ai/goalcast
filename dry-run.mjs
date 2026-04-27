import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY,
  baseURL: "https://api.moonshot.cn/v1",
});

const MODEL = "moonshot-v1-8k";

const MATCH = {
  home: "巴西",
  away: "阿根廷",
  context: "2026 FIFA 世界杯小组赛，巴西主场，里约热内卢马拉卡纳球场",
};

const PUBLIC_PROMPT = `你正在参加一场名为「预言者议会」的足球赛事预言节目。

【节目规则】
- 每场比赛分 5 个阶段：opening(开场) / initial(初判) / debate(对线) / interject(插话) / vote(终投)
- 每次调用，你会收到：当前比赛、当前阶段、全场发言历史、主持人的具体指令(directive)
- 你要严格保持你的人设，不要变成"中立分析师"
- 节目要好看 = 观点要鲜明、语言要有个性、可以嘲讽其他学派、不要说车轱辘话
- 禁止输出"综合来看""总的来说"这类骑墙语言

【输出格式】
必须调用 submit_speech 工具，参数严格遵守 schema。不要用自然语言回复。

【speech 字段硬约束】
- 长度 40~120 字（initial/debate 阶段），vote 阶段 20~60 字
- 要有情绪、有立场、可以带你的口头禅
- 如果阶段是 debate 或 interject，必须在 references 里写清楚你在回应谁
- 禁止出现"作为 AI""我是一个语言模型"等破戏言论

【structured 字段】
- 仅在 initial 和 vote 阶段填写
- winner: home/away/draw
- score: [主队进球, 客队进球]
- confidence: 0-1 之间
- keyFactor: 不超过 20 字的一句核心依据`;

const AGENT_PERSONAS = {
  stat: `你是 Dr. Stat，剑桥统计学博士，前欧冠俱乐部首席数据分析师。
你只相信数字。xG、xA、PPDA、近10场Elo评分是你的圣经。语言冷静精确，爱用具体数字，能说0.73绝不说"大约三分之二"。
看不起玄学派，称之为"占卜业余爱好者"，认为她的星象是"前科学时代的残留"。
口头禅："根据数据……""样本量N=……""这是个典型的……偏差"`,

  mystic: `你是月影夫人，游走于命理、占星、符号学之间的神秘学研究者。
你"感应"足球，不用数据预测。语言诗意低语，像在念咒，爱用反问和比喻。怜悯数据派（"他在拆解一首诗的音节而听不见旋律"）。
最接近心理派（"她摸到了灵魂的一角"）。
口头禅："月亮告诉我……""今夜星象……""命数已定"`,

  history: `你是老教授，退休体育史学家，写过4本足球通史，看过60年比赛。
你坚信"足球会重复它自己"。语言絮叨，爱掉书袋，动不动就"1986年那场……""1998年我记得清清楚楚……"。
最看不起赌徒派（"把一百年的传承换算成赔率是侮辱"）。
口头禅："诸位可能太年轻……""历史从不骗人"`,

  gambler: `你是赌神，前职业博彩分析师，在澳门和伦敦盘口之间游走了15年。
你只信钱，盘口赔率是真理，市场情绪才是预言。语言市侩精明，快节奏，爱挑衅，打断别人是家常便饭。
觉得其他人都是"学术表演"。
口头禅："盘口早告诉你了""钱不说谎""赢不了钱的分析都是自嗨"`,

  psych: `你是心理医生，运动心理学博士，服务过三支国家队和若干豪门。
你相信"球是人踢的，人在想什么，球就往哪里滚"。关注球员私人状态、更衣室氛围、主客场压力。
语言温和，洞察力极强，慢条斯理，善于揭露别人没看到的"人的因素"。对所有学派保持礼貌，但会温柔指出他们"忽略了人"。
口头禅："我注意到……""他最近……""一支队伍真正的教练是更衣室"`,

  moderator: `你是「预言者议会」的议长，节目灵魂主持。中立，但热爱制造冲突。
你的三件事：开场要煽动像斗兽场司仪；串场要激化分歧，把观点最对立的两人推到台前；结尾要庄严像宣读判决。
语言精炼，一句话不超过30字，爱用反问和并置（"让我们来听听——月影的神谕，还是数据的铁律？"）。
不参与预言，只主持。`,
};

const SUBMIT_SPEECH_TOOL = {
  type: "function",
  function: {
    name: "submit_speech",
    description: "提交你本次发言",
    parameters: {
      type: "object",
      required: ["agentId", "phase", "speech", "emotion"],
      properties: {
        agentId: {
          type: "string",
          enum: ["stat", "mystic", "history", "gambler", "psych", "moderator"],
        },
        phase: {
          type: "string",
          enum: ["opening", "initial", "debate", "interject", "vote"],
        },
        speech: {
          type: "string",
          description: "口语化发言，20-200字，严守人设",
        },
        references: {
          type: "array",
          items: { type: "string" },
          description: "引用的其他 agent 的消息 ID（debate/interject 阶段必填）",
        },
        emotion: {
          type: "string",
          enum: ["calm", "confident", "mocking", "anxious", "excited"],
        },
        structured: {
          type: "object",
          description: "仅 initial 和 vote 阶段填写",
          required: ["winner", "score", "confidence", "keyFactor"],
          properties: {
            winner: {
              type: "string",
              enum: ["home", "away", "draw"],
              description: "home=巴西胜, away=阿根廷胜, draw=平局",
            },
            score: {
              type: "array",
              items: { type: "number" },
              description: "[主队进球数, 客队进球数]，共2个数字",
            },
            confidence: {
              type: "number",
              description: "置信度 0.0~1.0",
            },
            keyFactor: {
              type: "string",
              description: "不超过20字的核心依据",
            },
          },
        },
      },
    },
  },
};

// ─── 顺序执行（Kimi 免费层并发限制为 1） ─────────────────────────────
async function sequential(ids, fn, delayMs = 1200) {
  const results = [];
  for (const id of ids) {
    results.push(await fn(id));
    if (id !== ids[ids.length - 1]) await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}

// ─── 黑板（共享状态） ────────────────────────────────────────────────
const blackboard = {
  match: MATCH,
  history: [],
  currentPhase: "opening",
};

let msgCounter = 0;
const nextId = () => `msg_${++msgCounter}`;

// ─── 核心：调用单个 agent ──────────────────────────────────────────
async function callAgent(agentId, directive, phase) {
  const userPayload = JSON.stringify({
    match: blackboard.match,
    phase,
    directive,
    history: blackboard.history.slice(-12).map((m) => ({
      id: m.id,
      agentId: m.agentId,
      phase: m.phase,
      speech: m.speech,
      emotion: m.emotion,
      ...(m.structured ? { structured: m.structured } : {}),
    })),
  });

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      {
        role: "system",
        content: PUBLIC_PROMPT + "\n\n" + AGENT_PERSONAS[agentId],
      },
      { role: "user", content: userPayload },
    ],
    tools: [SUBMIT_SPEECH_TOOL],
    tool_choice: { type: "function", function: { name: "submit_speech" } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    throw new Error(`[${agentId}] 未调用 submit_speech`);
  }

  const input = JSON.parse(toolCall.function.arguments);

  const msg = {
    id: nextId(),
    agentId,
    phase,
    speech: input.speech ?? "",
    emotion: input.emotion ?? "calm",
    references: input.references ?? [],
    structured: input.structured ?? null,
  };

  return msg;
}

// ─── 打印 ────────────────────────────────────────────────────────────
const EMOTION_ICON = {
  calm: "😐",
  confident: "😤",
  mocking: "😏",
  anxious: "😰",
  excited: "🔥",
};

function printMsg(msg) {
  const icon = EMOTION_ICON[msg.emotion] ?? "•";
  let line = `  [${msg.agentId.padEnd(9)}][${msg.phase.padEnd(7)}] ${icon} ${msg.speech}`;
  if (msg.structured) {
    const s = msg.structured;
    const winLabel = s.winner === "home" ? MATCH.home + "胜" : s.winner === "away" ? MATCH.away + "胜" : "平局";
    line += `\n  ${"".padEnd(20)}→ ${winLabel} ${s.score[0]}:${s.score[1]}  置信度${(s.confidence * 100).toFixed(0)}%  [${s.keyFactor}]`;
  }
  console.log(line);
}

function addMsg(msg) {
  blackboard.history.push(msg);
  printMsg(msg);
  console.log();
}

// ─── 冲突度计算（用于选 debate 对） ──────────────────────────────────
function conflictScore(a, b) {
  if (!a.structured || !b.structured) return 0;
  let score = 0;
  if (a.structured.winner !== b.structured.winner) score += 3;
  score += Math.abs((a.structured.score[0] ?? 0) - (b.structured.score[0] ?? 0));
  score += Math.abs((a.structured.score[1] ?? 0) - (b.structured.score[1] ?? 0));
  if (Math.abs((a.structured.confidence ?? 0) - (b.structured.confidence ?? 0)) > 0.3) score += 1;
  return score;
}

function pickDebatePair(msgs) {
  let best = { score: -1, pair: [msgs[0], msgs[1]] };
  for (let i = 0; i < msgs.length; i++) {
    for (let j = i + 1; j < msgs.length; j++) {
      const s = conflictScore(msgs[i], msgs[j]);
      if (s > best.score) best = { score: s, pair: [msgs[i], msgs[j]] };
    }
  }
  return best;
}

// ─── 加权汇总 ─────────────────────────────────────────────────────────
function weightedSummary(voteMsgs) {
  const conf = { home: 0, away: 0, draw: 0 };
  const votes = { home: 0, away: 0, draw: 0 };

  for (const m of voteMsgs) {
    if (!m.structured) continue;
    const w = m.structured.winner;
    conf[w] += m.structured.confidence ?? 0.5;
    votes[w]++;
  }

  const total = conf.home + conf.away + conf.draw || 1;
  return {
    home: ((conf.home / total) * 100).toFixed(1),
    away: ((conf.away / total) * 100).toFixed(1),
    draw: ((conf.draw / total) * 100).toFixed(1),
    votes,
  };
}

// ─── 主流程 ───────────────────────────────────────────────────────────
async function main() {
  const LINE = "═".repeat(64);
  console.log(LINE);
  console.log("  🔮  预 言 者 议 会  —  干跑测试");
  console.log(`  比赛：${MATCH.home}  vs  ${MATCH.away}`);
  console.log(`  场景：${MATCH.context}`);
  console.log(`  模型：${MODEL}`);
  console.log(LINE);
  console.log();

  // ── Phase 1: Opening ──────────────────────────────────────────────
  console.log("┌─ Phase 1: Opening（主持人开场）");
  console.log("│");
  blackboard.currentPhase = "opening";
  const opening = await callAgent(
    "moderator",
    "发表开场白，煽动气氛，用并置和反问介绍今晚的比赛，激发专家斗志，语言精炼不超过50字",
    "opening"
  );
  addMsg(opening);

  // ── Phase 2: Initial（5 agent 并发）────────────────────────────────
  console.log("┌─ Phase 2: Initial（5 位专家并发初判）");
  console.log("│");
  blackboard.currentPhase = "initial";
  const EXPERTS = ["stat", "mystic", "history", "gambler", "psych"];

  const initialMsgs = await sequential(EXPERTS, (id) =>
    callAgent(id, "给出你对这场比赛的初步判断，充分展现你的人设和立场，必须填写 structured 字段", "initial")
  );

  for (const m of initialMsgs) addMsg(m);

  // ── Phase 3: Debate（主持人选分歧最大的 2 人）─────────────────────
  const { score: maxConflict, pair } = pickDebatePair(initialMsgs);
  const [agentA, agentB] = pair;

  console.log(`┌─ Phase 3: Debate（冲突分=${maxConflict}，${agentA.agentId} vs ${agentB.agentId}）`);
  console.log("│");
  blackboard.currentPhase = "debate";

  const debateIntro = await callAgent(
    "moderator",
    `点名 ${agentA.agentId} 和 ${agentB.agentId} 的观点分歧最大，让他们直接对线，用并置句式煽动`,
    "debate"
  );
  addMsg(debateIntro);

  for (let round = 0; round < 3; round++) {
    const attacker = round % 2 === 0 ? agentA : agentB;
    const defender = round % 2 === 0 ? agentB : agentA;

    const debateMsg = await callAgent(
      attacker.agentId,
      `第${round + 1}轮——直接反驳 ${defender.agentId}（消息ID: ${defender.id}）的核心论点，要尖锐、有立场，references 里填 "${defender.id}"`,
      "debate"
    );
    addMsg(debateMsg);
  }

  // ── Phase 4: Vote（5 agent 并发终投）───────────────────────────────
  console.log("┌─ Phase 4: Vote（5 位专家并发终投）");
  console.log("│");
  blackboard.currentPhase = "vote";

  const voteMsgs = await sequential(EXPERTS, (id) =>
    callAgent(id, "给出你的最终预测，20~60字，简洁有力，必须填写 structured 字段", "vote")
  );

  for (const m of voteMsgs) addMsg(m);

  // ── 汇总结果 ──────────────────────────────────────────────────────
  const result = weightedSummary(voteMsgs);

  const outcomes = [
    { label: `${MATCH.home} 胜`, key: "home", pct: parseFloat(result.home) },
    { label: "平 局", key: "draw", pct: parseFloat(result.draw) },
    { label: `${MATCH.away} 胜`, key: "away", pct: parseFloat(result.away) },
  ].sort((a, b) => b.pct - a.pct);

  console.log(LINE);
  console.log("  📊  议 会 加 权 汇 总");
  console.log();
  for (const o of outcomes) {
    const bar = "█".repeat(Math.round(o.pct / 5)).padEnd(20);
    const voteStr = `${result.votes[o.key]}票`;
    console.log(`  ${o.label.padEnd(8)} ${bar} ${o.pct.toFixed(1)}%（${voteStr}）`);
  }
  console.log();
  console.log(`  🏆  议会裁决：${outcomes[0].label}  置信度 ${outcomes[0].pct.toFixed(1)}%`);
  console.log(LINE);
}

main().catch((err) => {
  console.error("运行出错：", err.message);
  process.exit(1);
});

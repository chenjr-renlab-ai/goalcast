import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const CACHE_DIR = path.join(process.cwd(), '.cache');

const client = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY,
  baseURL: 'https://api.moonshot.cn/v1',
});

const DEFAULT_SEEDS = {
  stat: '',
  mystic: '',
  history: '',
  gambler: '',
  psych: '',
};

async function ensureCacheDir() {
  await fs.promises.mkdir(CACHE_DIR, { recursive: true });
}

async function readCache(matchId) {
  try {
    const file = path.join(CACHE_DIR, `seeds-${matchId}.json`);
    const raw = await fs.promises.readFile(file, 'utf-8');
    const data = JSON.parse(raw);
    if (data.expires > Date.now()) return data.value;
    return null;
  } catch {
    return null;
  }
}

async function writeCache(matchId, value) {
  await ensureCacheDir();
  const file = path.join(CACHE_DIR, `seeds-${matchId}.json`);
  await fs.promises.writeFile(
    file,
    JSON.stringify({ expires: Date.now() + 24 * 60 * 60 * 1000, value }),
    'utf-8'
  );
}

export async function generateSeeds(matchData) {
  const cached = await readCache(matchData.id);
  if (cached) return cached;

  const { home, away, stage, briefing, odds, leagueContext } = matchData;
  const lc = leagueContext || {};

  const prompt = `你是一个足球预测系统的叙事种子生成器。请为以下英超比赛生成5个agent的叙事种子，每段50-80字。

比赛信息：
- 主队：${home}（排名第${lc.homeRank || '?'}，${lc.homePoints || '?'}分）
- 客队：${away}（排名第${lc.awayRank || '?'}，${lc.awayPoints || '?'}分）
- 轮次：英超${stage}
- 主队近况：${briefing?.homeForm || '暂无'}
- 客队近况：${briefing?.awayForm || '暂无'}
- 历史交锋：${briefing?.h2h || '暂无'}
- 赔率：主胜${odds?.home}，平局${odds?.draw}，客胜${odds?.away}
- 积分背景：${briefing?.standingsCtx || '暂无'}

请输出严格的JSON格式，包含以下5个字段，每个值为50-80字的中文叙事：
- stat：引用具体数字，揭示数据中的反直觉规律
- mystic：玄学/命理/日期/地点巧合，用星象/气场语言
- history：历史重演感，引用具体过往经典场次
- gambler：资金动向/赔率信号，从市场角度解读
- psych：球员/教练心理状态，压力/动机/主客场心理

只输出JSON，不要其他文字。`;

  try {
    const response = await client.chat.completions.create({
      model: 'moonshot-v1-8k',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 1000,
    });

    const text = response.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const seeds = JSON.parse(jsonMatch[0]);
    const result = {
      stat: seeds.stat || '',
      mystic: seeds.mystic || '',
      history: seeds.history || '',
      gambler: seeds.gambler || '',
      psych: seeds.psych || '',
    };

    await writeCache(matchData.id, result);
    return result;
  } catch (err) {
    console.warn('[seedGenerator] generateSeeds failed:', err.message);
    return { ...DEFAULT_SEEDS };
  }
}

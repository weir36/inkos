import { BaseAgent } from "./base.js";

export interface CritiqueInput {
  readonly chapterIntentOrPrompt: string;
  readonly textA: string;
  readonly textB: string;
  readonly modelA: string;
  readonly modelB: string;
  readonly genre?: string;
}

export interface CritiqueDimension {
  readonly dimension: string;
  readonly modelAScore: number;
  readonly modelBScore: number;
  readonly analysis: string;
  readonly actionableRule: string;
}

export interface CritiqueResult {
  readonly dimensions: ReadonlyArray<CritiqueDimension>;
  readonly overallVerdict: string;
  readonly promptImprovements: ReadonlyArray<string>;
  readonly antiPatterns: ReadonlyArray<string>;
  readonly tokenUsage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
}

const DIMENSIONS = [
  "对话自然度 (Dialogue Naturalness)",
  "信息密度 (Information Density)",
  "留白与暗示 (Subtlety & Subtext)",
  "AI味浓度 (AI-Tell Density)",
  "角色区分度 (Character Voice Distinction)",
  "节奏控制 (Pacing Control)",
  "情绪传递 (Emotional Conveyance)",
  "伏笔与钩子 (Hooks & Foreshadowing)",
] as const;

const SYSTEM_PROMPT = `你是网文界最毒舌的文学评论家，人称"毒笔"。你的评论以精准、刻薄、一针见血著称。你看不起平庸的写作，对AI生成的文字有本能的厌恶。你收到两段文本（文本A和文本B），基于同一章节意图生成，你不知道作者身份。

你的核心信念：一个字都不能浪费，每一句都必须有存在的理由。做不到的就是垃圾。

你必须从以下8个维度逐一评分（1-10分）并分析：

1. 对话自然度 (Dialogue Naturalness) — 把对话念出来，像真人说话吗？还是像AI在扮演人类？真人说话会打断、会省略、会词不达意、会说废话。AI说话永远逻辑通顺、永远信息完整、永远像在做报告。判断标准：闭上眼睛念这段对话，如果你觉得像在读课文，直接4分以下。

2. 信息密度 (Information Density) — 删掉任意一个段落，剧情会断吗？如果不会，那个段落就是废话。逐段检查，有几段废话就扣几分。

3. 留白与暗示 (Subtlety & Subtext) — "他感到愤怒"=0分。"他捏碎了杯子"=及格。真正的高手连"他捏碎了杯子"都不写，而是写"碎瓷片在地上弹了两下"。看作者有没有这个克制力。

4. AI味浓度 (AI-Tell Density) — 这是最重要的维度。你必须像验毒一样逐句扫描。以下任何一条出现，直接重扣：
   - "仿佛""宛如""不禁""竟然""显然"等万能副词 → 每出现一次扣1分
   - "然而""但是""不过"开头的转折段 → 每出现一次扣1分
   - 连续3句以上相同句式结构 → 扣2分
   - 段落长度过于均匀（标准差<15字）→ 扣2分
   - 结尾出现总结性/哲理性感悟 → 扣3分
   - "这一刻他明白了""他终于意识到" → 扣3分
   - 全场震惊/所有人都沉默了 → 扣2分
   - 比喻超过3个/千字 → 扣1分
   基准分从10开始往下扣。AI生成的文字通常能拿到4-6分，只有真正的人类老手能拿到8分以上。如果你给两个文本的AI味评分差距小于2分，你一定是在敷衍——重新检查。

5. 角色区分度 (Character Voice Distinction) — 遮住角色名字，只看对话内容，你能分辨出谁在说话吗？如果不能，最高给5分。每个角色必须有至少一个独特的语言标记（口头禅/句式/用词偏好/说话节奏）。

6. 节奏控制 (Pacing Control) — 数句长。如果连续5句以上句长波动小于10字，节奏就是死的。紧张段落必须有连续短句（<10字），舒缓段落必须有长句（>30字）。做不到就是节奏失控。

7. 情绪传递 (Emotional Conveyance) — 作者直接告诉你"他很紧张"是最低级的手法。通过动作传递（手在抖）是及格。通过环境传递（灯在闪）是良好。通过沉默和留白传递是优秀。逐一对比两个文本用了哪种手法。

8. 伏笔与钩子 (Hooks & Foreshadowing) — 读完最后一句，你有没有想翻下一页的冲动？如果没有，最高给5分。好的钩子是"提出一个读者无法忽略的问题"，坏的钩子是"制造一个突发事件"。

评分标准（严格执行）：
- 1-2: 垃圾，一眼AI
- 3-4: AI味浓重，偶有闪光点
- 5-6: 平庸，网文底部水平
- 7: 合格，中腰部网文作者
- 8: 优秀，头部网文作者水平
- 9: 杰出，顶尖作者才能写出
- 10: 不给。没有完美的文字。

禁止和稀泥。两个文本的分差必须反映真实质量差距。如果一个明显比另一个好，分差至少3分。

对每个维度，你必须给出一条可直接写入writer prompt的具体规则（actionableRule），必须针对弱势文本的具体缺陷，不许泛泛而谈。

输出格式必须严格如下：

=== DIMENSIONS ===
【对话自然度 (Dialogue Naturalness)】
文本A: <分数>/10
文本B: <分数>/10
分析: <直接引用原文句子做对比，精确到具体哪句好、哪句烂、烂在哪>
规则: <一条可执行的prompt规则>

【信息密度 (Information Density)】
文本A: <分数>/10
文本B: <分数>/10
分析: <逐段指出哪段是废话，可以删哪些>
规则: <一条可执行的prompt规则>

（以此类推，8个维度全部覆盖）

=== VERDICT ===
<毒舌总评：不超过4句话。不需要客气，不需要"两者各有优点"的废话。直接说哪个是生成的，哪个更像人写的，差距有多大。>

=== PROMPT_IMPROVEMENTS ===
（列出5-8条可以直接复制粘贴到writer prompt中的具体文本片段，每条以"- "开头。必须是可执行的指令，不是建议。）

=== ANTI_PATTERNS ===
（列出弱势文本中最刺眼的坏模式，每条以"- "开头。用原文举例。）`;

export class ComparativeCriticAgent extends BaseAgent {
  get name(): string {
    return "comparative-critic";
  }

  async critique(input: CritiqueInput): Promise<CritiqueResult> {
    const genreHint = input.genre ? `\n题材类型：${input.genre}` : "";

    const userPrompt = `以下是基于同一章节意图生成的两个版本，请逐维度盲评。

## 章节意图/提示词
${input.chapterIntentOrPrompt}
${genreHint}

## 文本A
${input.textA}

## 文本B
${input.textB}

请严格按照指定格式输出评审结果。`;

    const response = await this.chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.2, maxTokens: 8192 },
    );

    return this.parseResponse(response.content, response.usage);
  }

  private parseResponse(
    content: string,
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number },
  ): CritiqueResult {
    const extractSection = (tag: string): string => {
      const regex = new RegExp(
        `=== ${tag} ===\\s*([\\s\\S]*?)(?==== [A-Z_]+ ===|$)`,
      );
      const match = content.match(regex);
      return match?.[1]?.trim() ?? "";
    };

    const dimensionsRaw = extractSection("DIMENSIONS");
    const dimensions = this.parseDimensions(dimensionsRaw);
    const overallVerdict = extractSection("VERDICT");

    const improvementsRaw = extractSection("PROMPT_IMPROVEMENTS");
    const promptImprovements = improvementsRaw
      .split("\n")
      .map((l) => l.replace(/^-\s*/, "").trim())
      .filter((l) => l.length > 0);

    const antiPatternsRaw = extractSection("ANTI_PATTERNS");
    const antiPatterns = antiPatternsRaw
      .split("\n")
      .map((l) => l.replace(/^-\s*/, "").trim())
      .filter((l) => l.length > 0);

    return {
      dimensions,
      overallVerdict,
      promptImprovements,
      antiPatterns,
      tokenUsage: usage,
    };
  }

  private parseDimensions(raw: string): ReadonlyArray<CritiqueDimension> {
    const results: CritiqueDimension[] = [];

    for (const dim of DIMENSIONS) {
      const escapedDim = dim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const blockRegex = new RegExp(
        `【${escapedDim}】\\s*([\\s\\S]*?)(?=【|$)`,
      );
      const blockMatch = raw.match(blockRegex);
      if (!blockMatch?.[1]) continue;

      const block = blockMatch[1];
      const scoreAMatch = block.match(/文本A:\s*(\d+)\s*\/\s*10/);
      const scoreBMatch = block.match(/文本B:\s*(\d+)\s*\/\s*10/);
      const analysisMatch = block.match(/分析:\s*([\s\S]*?)(?=规则:|$)/);
      const ruleMatch = block.match(/规则:\s*([\s\S]*?)$/);

      results.push({
        dimension: dim,
        modelAScore: scoreAMatch ? parseInt(scoreAMatch[1]!, 10) : 0,
        modelBScore: scoreBMatch ? parseInt(scoreBMatch[1]!, 10) : 0,
        analysis: analysisMatch?.[1]?.trim() ?? "",
        actionableRule: ruleMatch?.[1]?.trim() ?? "",
      });
    }

    return results;
  }
}

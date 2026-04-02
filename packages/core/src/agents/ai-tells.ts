/**
 * Structural AI-tell detection — pure rule-based analysis (no LLM).
 *
 * Detects patterns common in AI-generated Chinese text:
 * - dim 20: Paragraph length uniformity (low variance)
 * - dim 21: Filler/hedge word density
 * - dim 22: Formulaic transition patterns
 * - dim 23: List-like structure (consecutive same-prefix sentences)
 * - dim 24: Ellipsis overuse (…… for suspense - HUMAN feature, not AI)
 * - dim 25: Onomatopoeia independence (sound effects as standalone lines)
 * - dim 26: Bracket key markers overuse
 * - dim 27: Dialogue ratio detection
 */

export interface AITellIssue {
  readonly severity: "warning" | "info";
  readonly category: string;
  readonly description: string;
  readonly suggestion: string;
}

export interface AITellResult {
  readonly issues: ReadonlyArray<AITellIssue>;
}

// Hedge/filler words common in AI Chinese text
const HEDGE_WORDS = ["似乎", "可能", "或许", "大概", "某种程度上", "一定程度上", "在某种意义上"];

// Formulaic transition words
const TRANSITION_WORDS = ["然而", "不过", "与此同时", "另一方面", "尽管如此", "话虽如此", "但值得注意的是"];

// Human-style markers (not AI tells - these indicate human writing like 天才俱乐部)
const HUMAN_ELLIPSIS = "……";
const HUMAN_BRACKET = "【";
const HUMAN_ONOMATOPOEIA = ["咔嚓", "嘭", "沙沙", "砰", "叮", "嗖", "轰", "咣", "嘶", "哐"];

const SPEECH_VERBS = ["问道", "说道", "喊道", "回道", "笑道", "怒道", "低声道", "轻声道", "应道", "冷道", "叹道", "骂道", "吼道", "嘀咕道"];

/**
 * Analyze text content for structural AI-tell patterns.
 * Returns issues that can be merged into audit results.
 */
export function analyzeAITells(content: string): AITellResult {
  const issues: AITellIssue[] = [];

  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // dim 20: Paragraph length uniformity (needs ≥3 paragraphs)
  if (paragraphs.length >= 3) {
    const paragraphLengths = paragraphs.map((p) => p.length);
    const mean = paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length;
    if (mean > 0) {
      const variance = paragraphLengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / paragraphLengths.length;
      const stdDev = Math.sqrt(variance);
      const cv = stdDev / mean;
      if (cv < 0.15) {
        issues.push({
          severity: "warning",
          category: "段落等长",
          description: `段落长度变异系数仅${cv.toFixed(3)}（阈值<0.15），段落长度过于均匀，呈现AI生成特征`,
          suggestion: "增加段落长度差异：短段落用于节奏加速或冲击，长段落用于沉浸描写",
        });
      }
    }
  }

  // dim 21: Hedge word density
  const totalChars = content.length;
  if (totalChars > 0) {
    let hedgeCount = 0;
    for (const word of HEDGE_WORDS) {
      const regex = new RegExp(word, "g");
      const matches = content.match(regex);
      hedgeCount += matches?.length ?? 0;
    }
    const hedgeDensity = hedgeCount / (totalChars / 1000);
    if (hedgeDensity > 3) {
      issues.push({
        severity: "warning",
        category: "套话密度",
        description: `套话词（似乎/可能/或许等）密度为${hedgeDensity.toFixed(1)}次/千字（阈值>3），语气过于模糊犹豫`,
        suggestion: "用确定性叙述替代模糊表达：去掉「似乎」直接描述状态，用具体细节替代「可能」",
      });
    }
  }

  // dim 22: Formulaic transition repetition
  const transitionCounts: Record<string, number> = {};
  for (const word of TRANSITION_WORDS) {
    const regex = new RegExp(word, "g");
    const matches = content.match(regex);
    const count = matches?.length ?? 0;
    if (count > 0) {
      transitionCounts[word] = count;
    }
  }
  const repeatedTransitions = Object.entries(transitionCounts)
    .filter(([, count]) => count >= 3);
  if (repeatedTransitions.length > 0) {
    const detail = repeatedTransitions
      .map(([word, count]) => `"${word}"×${count}`)
      .join("、");
    issues.push({
      severity: "warning",
      category: "公式化转折",
      description: `转折词重复使用：${detail}。同一转折模式≥3次暴露AI生成痕迹`,
      suggestion: "用情节自然转折替代转折词，或换用不同的过渡手法（动作切入、时间跳跃、视角切换）",
    });
  }

  // dim 23: List-like structure (consecutive sentences with same prefix pattern)
  const sentences = content
    .split(/[。！？\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  if (sentences.length >= 3) {
    let consecutiveSamePrefix = 1;
    let maxConsecutive = 1;
    for (let i = 1; i < sentences.length; i++) {
      const prevPrefix = sentences[i - 1]!.slice(0, 2);
      const currPrefix = sentences[i]!.slice(0, 2);
      if (prevPrefix === currPrefix) {
        consecutiveSamePrefix++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveSamePrefix);
      } else {
        consecutiveSamePrefix = 1;
      }
    }
    if (maxConsecutive >= 3) {
      issues.push({
        severity: "info",
        category: "列表式结构",
        description: `检测到${maxConsecutive}句连续以相同开头的句子，呈现列表式AI生成结构`,
        suggestion: "变换句式开头：用不同主语、时间词、动作词开头，打破列表感",
      });
    }
  }

  const ellipsisCount = (content.match(new RegExp(HUMAN_ELLIPSIS, "g")) || []).length;
  const sentenceCount = content.split(/[。！？]/).filter(s => s.trim().length > 0).length;
  if (sentenceCount > 10 && ellipsisCount > 0) {
    const ellipsisRatio = ellipsisCount / (sentenceCount / 10);
    if (ellipsisRatio > 0.5) {
      issues.push({
        severity: "info",
        category: "悬念省略号",
        description: `省略号使用${ellipsisCount}次（每10句${ellipsisRatio.toFixed(1)}次），呈现人类悬疑写法`,
        suggestion: "省略号是制造悬念的人类写法，保持这种风格",
      });
    }
  }

  const onoCount = HUMAN_ONOMATOPOEIA.reduce((count, word) => {
    const regex = new RegExp(`^${word}[。！？]?$`, "gm");
    const matches = content.match(regex);
    return count + (matches?.length ?? 0);
  }, 0);
  if (onoCount >= 3) {
    issues.push({
      severity: "info",
      category: "拟声词独立",
      description: `检测到${onoCount}个独立成段的拟声词（咔嚓/嘭/嗖等），呈现人类动作描写风格`,
      suggestion: "拟声词独立成段是人类写法，保持这种节奏感",
    });
  }

  const bracketCount = (content.match(new RegExp(HUMAN_BRACKET, "g")) || []).length;
  if (bracketCount >= 3) {
    issues.push({
      severity: "info",
      category: "关键标记",
      description: `检测到${bracketCount}个【】关键信息标记，呈现人类重点标注风格`,
      suggestion: "【】标记关键信息是人类写法，保持",
    });
  }

  const dialogueCount = (content.match(/[「"\u201c『].*?[」"\u201d』]/g) || []).length;
  const speechVerbPattern = new RegExp(`(?:${SPEECH_VERBS.join("|")})`, "g");
  const directSpeech = (content.match(speechVerbPattern) || []).length;
  const totalDialogue = dialogueCount + directSpeech;
  if (totalDialogue > 0 && sentenceCount > 0) {
    const dialogueRatio = totalDialogue / (sentenceCount / 100);
    if (dialogueRatio > 30) {
      issues.push({
        severity: "info",
        category: "对话驱动",
        description: `检测到高对话占比（每100句${dialogueRatio.toFixed(0)}句带引号或说话动词），呈现对话驱动剧情的人类风格`,
        suggestion: "对话多是人类写法，保持高对话占比",
      });
    }
  }

  const allSentences = content.split(/[。！？\n]/).filter(s => s.trim().length > 0);
  if (allSentences.length > 20) {
    const shortSentences = allSentences.filter(s => s.trim().length <= 8);
    const shortRatio = shortSentences.length / allSentences.length;
    if (shortRatio < 0.2) {
      issues.push({
        severity: "warning",
        category: "短句不足",
        description: `短句（≤8字）占比仅${(shortRatio * 100).toFixed(0)}%，人类网文大神通常 ≥ 34%。节奏偏平`,
        suggestion: "增加极短句打破均匀节奏：独立动作句、单字反应、环境音效",
      });
    }

    const sentLengths = allSentences.map(s => s.trim().length);
    const mean = sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length;
    const stdDev = Math.sqrt(sentLengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / sentLengths.length);
    if (stdDev < 10) {
      issues.push({
        severity: "warning",
        category: "句长均匀",
        description: `句长标准差仅${stdDev.toFixed(1)}字（人类网文通常 ≥ 14），节奏单调如机器`,
        suggestion: "交替使用极短句（≤5字）和长句（≥30字），制造呼吸感",
      });
    }
  }

  const rhetoricalQuestions = (content.match(/[难道|怎么可能|岂不是|何尝不|怎么会|凭什么|谁让|哪有|哪来的|算什么]/g) || []).length;
  const questionMarks = (content.match(/？/g) || []).length;
  const totalRhetorical = rhetoricalQuestions + questionMarks;
  if (sentenceCount > 20 && totalRhetorical === 0) {
    issues.push({
      severity: "info",
      category: "缺少反问",
      description: "全文无反问句。人类网文每2000字至少1次反问推进节奏",
      suggestion: "用反问替代部分陈述句：'他觉得不可能' → '这怎么可能？'",
    });
  }

  return { issues };
}

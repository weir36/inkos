export interface TensionScore {
  readonly chapter: number;
  readonly score: number;
  readonly factors: ReadonlyArray<string>;
}

export interface TensionDiagnosis {
  readonly type: "low_streak" | "no_climax" | "monotone" | "no_release" | "healthy";
  readonly description: string;
  readonly severity: "critical" | "warning" | "info";
}

export interface TensionGuidance {
  readonly scores: ReadonlyArray<TensionScore>;
  readonly diagnoses: ReadonlyArray<TensionDiagnosis>;
  readonly recommendation: string;
}

export interface TensionInput {
  readonly chapterSummaries: string;
  readonly emotionalArcs: string;
  readonly currentChapter: number;
}

interface ParsedChapterRow {
  readonly chapter: number;
  readonly keyEvents: string;
  readonly foreshadowing: string;
  readonly emotionalTone: string;
  readonly chapterType: string;
}

interface ParsedArcRow {
  readonly chapter: number;
  readonly intensity: number;
}

const CONFLICT_KEYWORDS = ["战斗", "冲突", "对决", "背叛", "死", "爆发", "危机", "battle", "fight", "betrayal", "death", "crisis"];
const FORESHADOW_RESOLVE_KEYWORDS = ["回收", "resolve", "payoff"];
const HIGH_ENERGY_KEYWORDS = ["紧张", "愤怒", "悲痛", "恐惧", "兴奋", "tense", "angry", "fearful", "excited"];
const LOW_ENERGY_KEYWORDS = ["平静", "日常", "过渡", "calm", "daily", "transition"];
const HIGH_TENSION_TYPES = ["战斗章", "高潮", "Payoff", "Combat"];
const LOW_TENSION_TYPES = ["过渡章", "Transition", "Setup"];

function parseMarkdownTable(content: string): ReadonlyArray<ReadonlyArray<string>> {
  const lines = content.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 3) return [];
  const dataLines = lines.filter((l) => !/^\|\s*[-:]+/.test(l));
  return dataLines.map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim())
  );
}

function parseChapterSummaries(content: string): ReadonlyArray<ParsedChapterRow> {
  const rows = parseMarkdownTable(content);
  if (rows.length < 2) return [];
  const header = rows[0]!;
  const chapterIdx = header.findIndex((h) => /章节|chapter/i.test(h));
  const eventsIdx = header.findIndex((h) => /关键事件|key.?events?/i.test(h));
  const foreshadowIdx = header.findIndex((h) => /伏笔动态|foreshadow/i.test(h));
  const toneIdx = header.findIndex((h) => /情绪基调|emotion|tone/i.test(h));
  const typeIdx = header.findIndex((h) => /章节类型|chapter.?type/i.test(h));
  if (chapterIdx === -1) return [];
  return rows.slice(1).reduce<ParsedChapterRow[]>((acc, row) => {
    const chapterNum = parseInt(row[chapterIdx] ?? "", 10);
    if (isNaN(chapterNum)) return acc;
    acc.push({
      chapter: chapterNum,
      keyEvents: eventsIdx >= 0 ? (row[eventsIdx] ?? "") : "",
      foreshadowing: foreshadowIdx >= 0 ? (row[foreshadowIdx] ?? "") : "",
      emotionalTone: toneIdx >= 0 ? (row[toneIdx] ?? "") : "",
      chapterType: typeIdx >= 0 ? (row[typeIdx] ?? "") : "",
    });
    return acc;
  }, []);
}

function parseEmotionalArcs(content: string): ReadonlyArray<ParsedArcRow> {
  const rows = parseMarkdownTable(content);
  if (rows.length < 2) return [];
  const header = rows[0]!;
  const chapterIdx = header.findIndex((h) => /章节|chapter/i.test(h));
  const intensityIdx = header.findIndex((h) => /强度|intensity/i.test(h));
  if (chapterIdx === -1 || intensityIdx === -1) return [];
  return rows.slice(1).reduce<ParsedArcRow[]>((acc, row) => {
    const chapterNum = parseInt(row[chapterIdx] ?? "", 10);
    const intensity = parseFloat(row[intensityIdx] ?? "");
    if (isNaN(chapterNum) || isNaN(intensity)) return acc;
    acc.push({ chapter: chapterNum, intensity });
    return acc;
  }, []);
}

function containsAny(text: string, keywords: ReadonlyArray<string>): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function scoreChapter(row: ParsedChapterRow, arcIntensities: ReadonlyMap<number, ReadonlyArray<number>>): TensionScore {
  let score = 3;
  const factors: string[] = [];

  if (containsAny(row.keyEvents, CONFLICT_KEYWORDS)) {
    score += 2;
    factors.push("关键事件含冲突词");
  }

  if (containsAny(row.foreshadowing, FORESHADOW_RESOLVE_KEYWORDS)) {
    score += 2;
    factors.push("伏笔回收");
  }

  if (containsAny(row.emotionalTone, HIGH_ENERGY_KEYWORDS)) {
    score += 1;
    factors.push("高能情绪基调");
  }

  if (containsAny(row.emotionalTone, LOW_ENERGY_KEYWORDS)) {
    score -= 1;
    factors.push("低能情绪基调");
  }

  if (HIGH_TENSION_TYPES.some((t) => row.chapterType.includes(t))) {
    score += 1;
    factors.push("高张力章节类型");
  }

  if (LOW_TENSION_TYPES.some((t) => row.chapterType.includes(t))) {
    score -= 1;
    factors.push("低张力章节类型");
  }

  const intensities = arcIntensities.get(row.chapter);
  if (intensities && intensities.length > 0) {
    const maxIntensity = Math.max(...intensities);
    if (maxIntensity >= 8) {
      score += 1;
      factors.push("情感弧线高强度");
    }
  }

  score = Math.max(0, Math.min(10, score));

  if (factors.length === 0) {
    factors.push("基准张力");
  }

  return { chapter: row.chapter, score, factors };
}

function computeStdDev(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function diagnose(scores: ReadonlyArray<TensionScore>): ReadonlyArray<TensionDiagnosis> {
  const window = scores.slice(-Math.min(10, scores.length));
  const diagnoses: TensionDiagnosis[] = [];
  const values = window.map((s) => s.score);

  let maxLowStreak = 0;
  let currentLowStreak = 0;
  for (const v of values) {
    if (v <= 3) {
      currentLowStreak++;
      maxLowStreak = Math.max(maxLowStreak, currentLowStreak);
    } else {
      currentLowStreak = 0;
    }
  }
  if (maxLowStreak >= 3) {
    diagnoses.push({
      type: "low_streak",
      description: `连续${maxLowStreak}章低张力，读者可能流失`,
      severity: "critical",
    });
  }

  const last8 = values.slice(-Math.min(8, values.length));
  if (last8.length >= 8 && !last8.some((v) => v >= 7)) {
    diagnoses.push({
      type: "no_climax",
      description: "近8章无高潮章节，建议安排爆发",
      severity: "warning",
    });
  }

  const last6 = values.slice(-Math.min(6, values.length));
  if (last6.length >= 6 && computeStdDev(last6) < 1.0) {
    diagnoses.push({
      type: "monotone",
      description: "近6章张力波动不足，节奏单调",
      severity: "warning",
    });
  }

  let maxHighStreak = 0;
  let currentHighStreak = 0;
  for (const v of values) {
    if (v >= 6) {
      currentHighStreak++;
      maxHighStreak = Math.max(maxHighStreak, currentHighStreak);
    } else {
      currentHighStreak = 0;
    }
  }
  if (maxHighStreak >= 4) {
    diagnoses.push({
      type: "no_release",
      description: `连续${maxHighStreak}章高张力无释放，读者可能疲劳`,
      severity: "warning",
    });
  }

  if (diagnoses.length === 0) {
    diagnoses.push({
      type: "healthy",
      description: "张力曲线正常",
      severity: "info",
    });
  }

  return diagnoses;
}

const RECOMMENDATIONS: Record<TensionDiagnosis["type"], string> = {
  low_streak: "下一章建议安排冲突爆发或重大信息揭示，提升张力",
  no_climax: "下一章建议安排高潮场景（战斗/反转/真相大白）",
  monotone: "下一章建议制造节奏变化（如从战斗切到情感/从日常切到危机）",
  no_release: "下一章建议安排短暂的喘息或情感释放，再为下一轮高潮蓄力",
  healthy: "张力曲线健康，继续当前节奏",
};

const SEVERITY_ORDER: Record<TensionDiagnosis["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function analyzeTensionCurve(input: TensionInput): TensionGuidance {
  const chapters = parseChapterSummaries(input.chapterSummaries);
  const arcs = parseEmotionalArcs(input.emotionalArcs);

  const arcMap = new Map<number, number[]>();
  for (const arc of arcs) {
    const existing = arcMap.get(arc.chapter);
    if (existing) {
      existing.push(arc.intensity);
    } else {
      arcMap.set(arc.chapter, [arc.intensity]);
    }
  }

  const relevant = chapters.filter((c) => c.chapter < input.currentChapter);
  const scores = relevant.map((row) => scoreChapter(row, arcMap));
  const diagnoses = diagnose(scores);

  const mostSevere = [...diagnoses].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  )[0]!;

  return {
    scores,
    diagnoses,
    recommendation: RECOMMENDATIONS[mostSevere.type],
  };
}

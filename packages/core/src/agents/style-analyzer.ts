/**
 * Style fingerprint analysis — pure text analysis (no LLM).
 * Extracts statistical features from reference text to build a StyleProfile.
 */

import type { StyleProfile } from "../models/style-profile.js";

// Common rhetorical patterns in Chinese fiction
const RHETORICAL_PATTERNS: ReadonlyArray<{ readonly name: string; readonly regex: RegExp }> = [
  { name: "比喻(像/如/仿佛)", regex: /[像如仿佛似](?:是|同|一般|一样)/g },
  { name: "排比", regex: /[，。；]([^，。；]{2,6})[，。；]\1/g },
  { name: "反问", regex: /难道|怎么可能|岂不是|何尝不/g },
  { name: "夸张", regex: /天崩地裂|惊天动地|翻天覆地|震耳欲聋/g },
  { name: "拟人", regex: /[风雨雪月花树草石](?:在|像|仿佛).*?(?:笑|哭|叹|呻|吟|怒|舞)/g },
  { name: "短句节奏", regex: /[。！？][^。！？]{1,8}[。！？]/g },
];

/**
 * Analyze a reference text and extract its style profile.
 * The returned profile can be serialized to style_profile.json.
 */
export function analyzeStyle(text: string, sourceName?: string): StyleProfile {
  const sentences = text
    .split(/[。！？\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Sentence length stats
  const sentenceLengths = sentences.map((s) => s.length);
  const avgSentenceLength = sentenceLengths.length > 0
    ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
    : 0;
  const sentenceLengthStdDev = sentenceLengths.length > 1
    ? Math.sqrt(
        sentenceLengths.reduce((sum, l) => sum + (l - avgSentenceLength) ** 2, 0) /
          sentenceLengths.length,
      )
    : 0;

  // Paragraph length stats
  const paragraphLengths = paragraphs.map((p) => p.length);
  const avgParagraphLength = paragraphLengths.length > 0
    ? paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length
    : 0;
  const minParagraph = paragraphLengths.length > 0 ? Math.min(...paragraphLengths) : 0;
  const maxParagraph = paragraphLengths.length > 0 ? Math.max(...paragraphLengths) : 0;

  // Vocabulary diversity (TTR — Type-Token Ratio)
  // Use character-level for Chinese (each char is roughly a "token")
  const chars = text.replace(/[\s\n\r，。！？、：；""''（）【】《》\d]/g, "");
  const uniqueChars = new Set(chars);
  const vocabularyDiversity = chars.length > 0 ? uniqueChars.size / chars.length : 0;

  // Top sentence opening patterns (first 2 chars)
  const openingCounts: Record<string, number> = {};
  for (const s of sentences) {
    if (s.length >= 2) {
      const opening = s.slice(0, 2);
      openingCounts[opening] = (openingCounts[opening] ?? 0) + 1;
    }
  }
  const topPatterns = Object.entries(openingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .filter(([, count]) => count >= 3)
    .map(([pattern, count]) => `${pattern}...(${count}次)`);

  // Rhetorical features
  const rhetoricalFeatures: string[] = [];
  for (const { name, regex } of RHETORICAL_PATTERNS) {
    const matches = text.match(regex);
    if (matches && matches.length >= 2) {
      rhetoricalFeatures.push(`${name}(${matches.length}处)`);
    }
  }

  const totalChars = text.length;
  const dialogueMatches = text.match(/[「"\u201c『][\s\S]*?[」"\u201d』]/g) ?? [];
  const dialogueChars = dialogueMatches.reduce((sum, m) => sum + m.length, 0);
  const dialogueRatio = totalChars > 0 ? dialogueChars / totalChars : 0;

  const ellipsisCount = (text.match(/……/g) ?? []).length;
  const ellipsisDensity = totalChars > 0 ? ellipsisCount / (totalChars / 1000) : 0;

  const shortSentences = sentences.filter((s) => s.length <= 8);
  const shortSentenceRatio = sentences.length > 0 ? shortSentences.length / sentences.length : 0;

  const exclamationCount = (text.match(/！/g) ?? []).length;
  const exclamationDensity = totalChars > 0 ? exclamationCount / (totalChars / 1000) : 0;

  const dialogueLengths = dialogueMatches.map((m) => m.length);
  const avgDialogueTurnLength = dialogueLengths.length > 0
    ? dialogueLengths.reduce((a, b) => a + b, 0) / dialogueLengths.length
    : 0;

  // Metaphor density: count metaphor patterns per 1000 characters
  const metaphorRegex = /[像如仿佛似](?:是|同|一般|一样)/g;
  const metaphorMatches = text.match(metaphorRegex) ?? [];
  const metaphorDensity = totalChars > 0 ? metaphorMatches.length / (totalChars / 1000) : 0;

  // Emotional temperature: ratio of emotion-laden characters
  const emotionWords = /[怒恨悲喜乐哭笑惧惊恐愁忧闷烦痛苦怜悯嫉妒羡慕兴奋激动紧张焦虑绝望震惊感动愤怒]/g;
  const emotionMatches = text.match(emotionWords) ?? [];
  const emotionalTemperature = chars.length > 0 ? emotionMatches.length / chars.length : 0;

  // Signature vocabulary: top recurring 2-gram and 3-gram frequencies
  const ngramCounts = new Map<string, number>();
  const stopWords = new Set(["的是", "了的", "在了", "不是", "他的", "她的", "这个", "那个", "一个", "没有", "已经", "可以", "就是", "因为", "所以", "但是", "而且", "如果", "虽然", "不过"]);
  for (let i = 0; i < chars.length - 1; i++) {
    const bigram = chars.slice(i, i + 2);
    if (!stopWords.has(bigram)) {
      ngramCounts.set(bigram, (ngramCounts.get(bigram) ?? 0) + 1);
    }
    if (i < chars.length - 2) {
      const trigram = chars.slice(i, i + 3);
      ngramCounts.set(trigram, (ngramCounts.get(trigram) ?? 0) + 1);
    }
  }
  const signatureVocabulary = [...ngramCounts.entries()]
    .filter(([, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, frequency]) => ({ word, frequency }));

  return {
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    sentenceLengthStdDev: Math.round(sentenceLengthStdDev * 10) / 10,
    avgParagraphLength: Math.round(avgParagraphLength),
    paragraphLengthRange: { min: minParagraph, max: maxParagraph },
    vocabularyDiversity: Math.round(vocabularyDiversity * 1000) / 1000,
    topPatterns,
    rhetoricalFeatures,
    dialogueRatio: Math.round(dialogueRatio * 1000) / 1000,
    ellipsisDensity: Math.round(ellipsisDensity * 10) / 10,
    shortSentenceRatio: Math.round(shortSentenceRatio * 1000) / 1000,
    exclamationDensity: Math.round(exclamationDensity * 10) / 10,
    avgDialogueTurnLength: Math.round(avgDialogueTurnLength * 10) / 10,
    metaphorDensity: Math.round(metaphorDensity * 10) / 10,
    emotionalTemperature: Math.round(emotionalTemperature * 10000) / 10000,
    signatureVocabulary,
    sourceName,
    analyzedAt: new Date().toISOString(),
  };
}

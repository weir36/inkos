export interface StyleProfile {
  readonly avgSentenceLength: number;
  readonly sentenceLengthStdDev: number;
  readonly avgParagraphLength: number;
  readonly paragraphLengthRange: {
    readonly min: number;
    readonly max: number;
  };
  readonly vocabularyDiversity: number;
  readonly topPatterns: ReadonlyArray<string>;
  readonly rhetoricalFeatures: ReadonlyArray<string>;
  readonly dialogueRatio: number;
  readonly ellipsisDensity: number;
  readonly shortSentenceRatio: number;
  readonly exclamationDensity: number;
  readonly avgDialogueTurnLength: number;
  /** Metaphor/simile density per 1000 characters */
  readonly metaphorDensity: number;
  /** Emotional temperature: ratio of emotion-laden words (0-1 scale) */
  readonly emotionalTemperature: number;
  /** Top recurring signature words/phrases that characterize this author */
  readonly signatureVocabulary: ReadonlyArray<{ readonly word: string; readonly frequency: number }>;
  readonly sourceName?: string;
  readonly analyzedAt?: string;
}

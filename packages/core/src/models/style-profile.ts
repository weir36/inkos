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
  readonly sourceName?: string;
  readonly analyzedAt?: string;
}

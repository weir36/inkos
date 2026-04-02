import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface PreflightWarning {
  readonly severity: "critical" | "warning" | "info";
  readonly category: string;
  readonly description: string;
  readonly suggestion: string;
}

export interface PreflightResult {
  readonly warnings: ReadonlyArray<PreflightWarning>;
  readonly passed: boolean;
}

export interface PreflightInput {
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly chapterIntent?: string;
  readonly genre?: string;
}

interface ParsedHookRow {
  readonly hookId: string;
  readonly description: string;
  readonly status: string;
  readonly plantedChapter: number;
  readonly lastAdvancedChapter: number;
}

interface ParsedSummaryRow {
  readonly chapter: number;
  readonly title: string;
  readonly characters: ReadonlyArray<string>;
  readonly chapterType: string;
}

interface ParsedSubplotRow {
  readonly subplotId: string;
  readonly subplotName: string;
  readonly chaptersSinceActive: number;
  readonly status: string;
}

export class PreflightAgent {
  async run(input: PreflightInput): Promise<PreflightResult> {
    const storyDir = join(input.bookDir, "story");

    const [pendingHooks, chapterSummaries, subplotBoard] = await Promise.all([
      this.readFileSafe(join(storyDir, "pending_hooks.md")),
      this.readFileSafe(join(storyDir, "chapter_summaries.md")),
      this.readFileSafe(join(storyDir, "subplot_board.md")),
    ]);

    const warnings: PreflightWarning[] = [
      ...this.checkHookDebt(pendingHooks, input.chapterNumber),
      ...this.checkChapterTypeMonotony(chapterSummaries),
      ...this.checkCharacterDisappearance(chapterSummaries, input.chapterNumber),
      ...this.checkSubplotStagnation(subplotBoard),
    ];

    return {
      warnings,
      passed: warnings.every((w) => w.severity !== "critical"),
    };
  }

  private checkHookDebt(
    content: string,
    currentChapter: number,
  ): ReadonlyArray<PreflightWarning> {
    const hooks = this.parseHookTable(content);
    const warnings: PreflightWarning[] = [];

    for (const hook of hooks) {
      if (
        hook.status.toLowerCase() === "open"
        && currentChapter - hook.lastAdvancedChapter > 10
      ) {
        warnings.push({
          severity: "critical",
          category: "伏笔超期",
          description: `伏笔超期未推进：${hook.hookId}（${hook.description}），已${currentChapter - hook.lastAdvancedChapter}章未推进`,
          suggestion: `在本章推进或提及伏笔${hook.hookId}，或将其状态更新为deferred`,
        });
      }
    }

    return warnings;
  }

  private checkChapterTypeMonotony(
    content: string,
  ): ReadonlyArray<PreflightWarning> {
    const summaries = this.parseSummaryTable(content);
    if (summaries.length < 3) return [];

    const recentTypes = summaries
      .slice(-10)
      .map((s) => s.chapterType.trim())
      .filter((t) => t.length > 0);

    if (recentTypes.length < 3) return [];

    let consecutiveCount = 1;
    const lastType = recentTypes[recentTypes.length - 1]!;

    for (let i = recentTypes.length - 2; i >= 0; i--) {
      if (recentTypes[i] === lastType) {
        consecutiveCount++;
      } else {
        break;
      }
    }

    if (consecutiveCount >= 3) {
      return [
        {
          severity: "warning",
          category: "类型单调",
          description: `连续${consecutiveCount}章相同类型（${lastType}），建议变换节奏`,
          suggestion: `尝试切换章节类型，如从${lastType}转为过渡、日常或冲突章节`,
        },
      ];
    }

    return [];
  }

  private checkCharacterDisappearance(
    content: string,
    currentChapter: number,
  ): ReadonlyArray<PreflightWarning> {
    const summaries = this.parseSummaryTable(content);
    if (summaries.length === 0) return [];

    const characterAppearances = new Map<string, ReadonlyArray<number>>();

    for (const summary of summaries) {
      for (const character of summary.characters) {
        const existing = characterAppearances.get(character) ?? [];
        characterAppearances.set(character, [...existing, summary.chapter]);
      }
    }

    const warnings: PreflightWarning[] = [];

    for (const [name, chapters] of characterAppearances) {
      if (chapters.length < 3) continue;

      const lastAppearance = Math.max(...chapters);
      const chaptersSinceLastAppearance = currentChapter - lastAppearance;

      if (chaptersSinceLastAppearance >= 5) {
        warnings.push({
          severity: "info",
          category: "角色消失",
          description: `角色${name}已${chaptersSinceLastAppearance}章未出场`,
          suggestion: `考虑在近期章节中安排${name}的出场或提及，维持角色存在感`,
        });
      }
    }

    return warnings;
  }

  private checkSubplotStagnation(
    content: string,
  ): ReadonlyArray<PreflightWarning> {
    const subplots = this.parseSubplotTable(content);
    const warnings: PreflightWarning[] = [];

    for (const subplot of subplots) {
      if (
        subplot.chaptersSinceActive > 5
        && subplot.status.toLowerCase() !== "resolved"
      ) {
        warnings.push({
          severity: "warning",
          category: "支线停滞",
          description: `支线${subplot.subplotName}已停滞${subplot.chaptersSinceActive}章`,
          suggestion: `推进支线${subplot.subplotName}的剧情，或明确标记为已解决`,
        });
      }
    }

    return warnings;
  }

  private parseHookTable(content: string): ReadonlyArray<ParsedHookRow> {
    if (!content) return [];

    const rows: ParsedHookRow[] = [];
    const linePattern = /^\|(.+)\|$/gm;
    let match = linePattern.exec(content);

    while (match) {
      const cells = match[1]!.split("|").map((c) => c.trim());

      if (cells.length >= 5 && !/^[-\s:]+$/.test(cells[0]!)) {
        const plantedChapter = parseInt(cells[3]!, 10);
        const lastAdvancedChapter = parseInt(cells[4]!, 10);

        if (!isNaN(plantedChapter) && !isNaN(lastAdvancedChapter)) {
          rows.push({
            hookId: cells[0]!,
            description: cells[1]!,
            status: cells[2]!,
            plantedChapter,
            lastAdvancedChapter,
          });
        }
      }

      match = linePattern.exec(content);
    }

    return rows;
  }

  private parseSummaryTable(content: string): ReadonlyArray<ParsedSummaryRow> {
    if (!content) return [];

    const rows: ParsedSummaryRow[] = [];
    const linePattern = /^\|(.+)\|$/gm;
    let match = linePattern.exec(content);

    while (match) {
      const cells = match[1]!.split("|").map((c) => c.trim());

      if (cells.length >= 8 && !/^[-\s:]+$/.test(cells[0]!)) {
        const chapter = parseInt(cells[0]!, 10);

        if (!isNaN(chapter)) {
          const characters = cells[2]!
            .split(/[、,，]/)
            .map((c) => c.trim())
            .filter((c) => c.length > 0);

          rows.push({
            chapter,
            title: cells[1]!,
            characters,
            chapterType: cells[7]!,
          });
        }
      }

      match = linePattern.exec(content);
    }

    return rows;
  }

  private parseSubplotTable(content: string): ReadonlyArray<ParsedSubplotRow> {
    if (!content) return [];

    const rows: ParsedSubplotRow[] = [];
    const linePattern = /^\|(.+)\|$/gm;
    let match = linePattern.exec(content);

    while (match) {
      const cells = match[1]!.split("|").map((c) => c.trim());

      if (cells.length >= 7 && !/^[-\s:]+$/.test(cells[0]!)) {
        const chaptersSinceActive = parseInt(cells[5]!, 10);

        if (!isNaN(chaptersSinceActive)) {
          rows.push({
            subplotId: cells[0]!,
            subplotName: cells[1]!,
            chaptersSinceActive,
            status: cells[6]!,
          });
        }
      }

      match = linePattern.exec(content);
    }

    return rows;
  }

  private async readFileSafe(path: string): Promise<string> {
    try {
      return await readFile(path, "utf-8");
    } catch {
      return "";
    }
  }
}

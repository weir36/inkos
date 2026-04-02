import { BaseAgent } from "./base.js";
import type { BookConfig } from "../models/book.js";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface OutlineExtenderInput {
  readonly bookDir: string;
  readonly chapterNumber: number;
  readonly book: BookConfig;
}

export interface OutlineExtenderResult {
  readonly extended: boolean;
  readonly addedChapters: number;
  readonly message: string;
}

interface VolumeBoundary {
  readonly name: string;
  readonly startCh: number;
  readonly endCh: number;
}

export class OutlineExtenderAgent extends BaseAgent {
  get name(): string {
    return "outline-extender";
  }

  async extend(input: OutlineExtenderInput): Promise<OutlineExtenderResult> {
    const { bookDir, chapterNumber, book } = input;
    const storyDir = join(bookDir, "story");

    const outlineRaw = await readFile(join(storyDir, "volume_outline.md"), "utf-8").catch(() => "");
    if (!outlineRaw) {
      return { extended: false, addedChapters: 0, message: "No volume outline found" };
    }

    const volumes = this.parseVolumeBoundaries(outlineRaw);
    if (volumes.length === 0) {
      return { extended: false, addedChapters: 0, message: "No structured volume boundaries found" };
    }

    const currentVolume = volumes.find((v) => chapterNumber >= v.startCh && chapterNumber <= v.endCh);
    if (!currentVolume) {
      const lastVolume = volumes[volumes.length - 1]!;
      const remaining = lastVolume.endCh - chapterNumber;
      if (remaining > 5) {
        return { extended: false, addedChapters: 0, message: "Sufficient outline remaining" };
      }
      return this.generateExtension(storyDir, outlineRaw, lastVolume, chapterNumber, book);
    }

    const remainingChapters = currentVolume.endCh - chapterNumber;
    if (remainingChapters > 5) {
      return { extended: false, addedChapters: 0, message: "Sufficient outline remaining" };
    }

    return this.generateExtension(storyDir, outlineRaw, currentVolume, chapterNumber, book);
  }

  private async generateExtension(
    storyDir: string,
    outlineRaw: string,
    currentVolume: VolumeBoundary,
    _chapterNumber: number,
    book: BookConfig,
  ): Promise<OutlineExtenderResult> {
    const [storyBible, currentState, chapterSummaries, pendingHooks] = await Promise.all([
      readFile(join(storyDir, "story_bible.md"), "utf-8").catch(() => ""),
      readFile(join(storyDir, "current_state.md"), "utf-8").catch(() => ""),
      readFile(join(storyDir, "chapter_summaries.md"), "utf-8").catch(() => ""),
      readFile(join(storyDir, "pending_hooks.md"), "utf-8").catch(() => ""),
    ]);

    const nextStartCh = currentVolume.endCh + 1;
    const lang = book.language ?? "zh";
    const isZh = lang === "zh";

    const systemPrompt = isZh
      ? `你是一位资深小说大纲策划师。基于当前故事状态、未闭合伏笔和已有剧情弧线，为小说生成下一卷大纲。

要求：
- 从第${nextStartCh}章开始，生成20-30章的大纲
- 每章一行描述，格式与已有大纲保持一致
- 包含卷标题和章节范围（如：第X卷 标题名（第${nextStartCh}-${nextStartCh + 24}章））
- 推进或回收现有伏笔
- 保持故事节奏和张力
- 使用中文输出`
      : `You are an expert novel outline planner. Based on the current story state, pending hooks, and the arc so far, generate the next volume outline.

Requirements:
- Start from Chapter ${nextStartCh}, generate 20-30 chapter outlines
- One line description per chapter, matching the format of existing outlines
- Include a volume header with chapter range (e.g., Volume X: Title (Chapters ${nextStartCh}-${nextStartCh + 24}))
- Advance or resolve existing pending hooks
- Maintain story pacing and tension
- Output in English`;

    const userPrompt = [
      "## Existing Outline (last section)",
      outlineRaw.slice(-3000),
      "",
      storyBible ? `## Story Bible\n${storyBible.slice(-2000)}` : "",
      currentState ? `## Current State\n${currentState.slice(-2000)}` : "",
      chapterSummaries ? `## Recent Chapter Summaries\n${chapterSummaries.slice(-2000)}` : "",
      pendingHooks ? `## Pending Hooks\n${pendingHooks.slice(-2000)}` : "",
    ].filter(Boolean).join("\n\n");

    const response = await this.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.7, maxTokens: 4096 },
    );

    const newOutlineSection = response.content.trim();
    if (!newOutlineSection) {
      return { extended: false, addedChapters: 0, message: "LLM returned empty outline extension" };
    }

    const chapterLinePattern = /^(?:第\d+章|Chapter\s+\d+|\d+[.、)）])/gm;
    const chapterMatches = newOutlineSection.match(chapterLinePattern);
    const addedChapters = chapterMatches?.length ?? 0;

    const updatedOutline = outlineRaw.trimEnd() + "\n\n" + newOutlineSection + "\n";
    await writeFile(join(storyDir, "volume_outline.md"), updatedOutline, "utf-8");

    return {
      extended: true,
      addedChapters,
      message: `Extended outline with ${addedChapters} new chapters starting from Chapter ${nextStartCh}`,
    };
  }

  private parseVolumeBoundaries(outline: string): ReadonlyArray<VolumeBoundary> {
    const volumes: VolumeBoundary[] = [];
    const lines = outline.split("\n");
    const volumeHeader = /^(第[一二三四五六七八九十百千万零〇\d]+卷|Volume\s+\d+)/i;
    const rangePattern = /[（(]\s*(?:第|[Cc]hapters?\s+)?(\d+)\s*[-–~～—]\s*(\d+)\s*(?:章)?\s*[）)]|(?:第|[Cc]hapters?\s+)(\d+)\s*[-–~～—]\s*(\d+)\s*(?:章)?/i;

    for (const rawLine of lines) {
      const line = rawLine.replace(/^#+\s*/, "").trim();
      if (!volumeHeader.test(line)) continue;

      const rangeMatch = line.match(rangePattern);
      if (!rangeMatch) continue;

      const startCh = parseInt(rangeMatch[1] ?? rangeMatch[3] ?? "0", 10);
      const endCh = parseInt(rangeMatch[2] ?? rangeMatch[4] ?? "0", 10);
      if (startCh <= 0 || endCh <= 0) continue;

      const rangeIndex = rangeMatch.index ?? line.length;
      const name = line.slice(0, rangeIndex).replace(/[（(]\s*$/, "").trim();
      if (name.length > 0) {
        volumes.push({ name, startCh, endCh });
      }
    }
    return volumes;
  }
}

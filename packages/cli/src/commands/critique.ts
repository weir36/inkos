import { Command } from "commander";
import { ComparativeCriticAgent, type AgentContext } from "@actalk/inkos-core";
import { loadConfig, buildPipelineConfig, findProjectRoot, log, logError } from "../utils.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const critiqueCommand = new Command("critique")
  .description("Compare chapter outputs from different models");

critiqueCommand
  .command("compare")
  .description("Compare two chapter files using the ComparativeCriticAgent")
  .argument("<fileA>", "First chapter file")
  .argument("<fileB>", "Second chapter file")
  .option("--model-a <name>", "Model name for file A (e.g. \"deepseek\")")
  .option("--model-b <name>", "Model name for file B (e.g. \"opus\")")
  .option("--intent <text>", "Chapter intent/prompt")
  .option("--genre <genre>", "Genre ID")
  .option("--json", "Output raw JSON")
  .action(async (fileA: string, fileB: string, opts: {
    modelA?: string;
    modelB?: string;
    intent?: string;
    genre?: string;
    json?: boolean;
  }) => {
    try {
      const textA = await readFile(resolve(fileA), "utf-8");
      const textB = await readFile(resolve(fileB), "utf-8");

      const root = findProjectRoot();
      const config = await loadConfig();
      const pipelineConfig = buildPipelineConfig(config, root);

      const agentCtx: AgentContext = {
        client: pipelineConfig.client,
        model: pipelineConfig.model,
        projectRoot: root,
        logger: pipelineConfig.logger,
      };

      const agent = new ComparativeCriticAgent(agentCtx);
      const result = await agent.critique({
        textA,
        textB,
        modelA: opts.modelA ?? "Model A",
        modelB: opts.modelB ?? "Model B",
        chapterIntentOrPrompt: opts.intent ?? "",
        genre: opts.genre,
      });

      if (opts.json) {
        log(JSON.stringify(result, null, 2));
        return;
      }

      log("\nComparative Critique\n");

      if (result.dimensions && result.dimensions.length > 0) {
        const nameWidth = Math.max(10, ...result.dimensions.map((d) => d.dimension.length));
        log(`  ${"Dimension".padEnd(nameWidth)}  Score A  Score B  Analysis`);
        log(`  ${"─".repeat(nameWidth)}  ${"─".repeat(7)}  ${"─".repeat(7)}  ${"─".repeat(30)}`);
        for (const dim of result.dimensions) {
          log(`  ${dim.dimension.padEnd(nameWidth)}  ${String(dim.modelAScore).padStart(7)}  ${String(dim.modelBScore).padStart(7)}  ${dim.analysis}`);
        }
        log("");
      }

      if (result.overallVerdict) {
        log(`  Verdict: ${result.overallVerdict}`);
        log("");
      }

      if (result.promptImprovements && result.promptImprovements.length > 0) {
        log("  Prompt Improvements:");
        for (let i = 0; i < result.promptImprovements.length; i++) {
          log(`    ${i + 1}. ${result.promptImprovements[i]}`);
        }
        log("");
      }

      if (result.antiPatterns && result.antiPatterns.length > 0) {
        log("  Anti-patterns:");
        for (let i = 0; i < result.antiPatterns.length; i++) {
          log(`    ${i + 1}. ${result.antiPatterns[i]}`);
        }
        log("");
      }
    } catch (e) {
      logError(`Critique failed: ${e}`);
      process.exit(1);
    }
  });

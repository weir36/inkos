# InkOS Evolution Plan — Novel Quality Enhancement

## Goal
Make InkOS generate web novels indistinguishable from top-tier human authors, regardless of which LLM model is used.

## Strategy: Feedback Loop
```
1. Write same chapter with DeepSeek + Opus
2. Comparative Critic (Opus) identifies gaps
3. Gaps become rules in writer-prompts.ts and ai-tells.ts
4. DeepSeek + improved prompts → better output
5. Repeat until gap narrows
```

## Current Model Routing (configured in /Users/weir/Desktop/小说/)
- writer/auditor → Claude Opus 4.6 via OpenCode Zen (US proxy 66.42.112.94:8787)
- reviser/architect → Claude Sonnet 4.6 via same proxy
- Default (planner/composer/observer/reflector) → DeepSeek V3 via OpenRouter
- Project .env overrides global with DeepSeek as default; modelOverrides in inkos.json handle the rest

## Phase 1: Comparative Critic Agent [DONE]
- [x] Create `comparative-critic.ts` with savage critic persona
- [x] Create `inkos critique compare` CLI command
- [x] Register in CLI index.ts
- [x] Test with chapters 79 (DeepSeek) vs 81 (Opus)
- [x] Extract first batch of prompt improvements
- [x] Run round 2: improved DeepSeek (82) vs Opus (81)
- [x] Extract second batch from round 2 critique

## Phase 2: Multi-Author Style Learning [DONE — 3 novels]
Novels analyzed:
- [x] 天才俱乐部 (城城与蝉) — 9.2MB, 悬疑/科幻
- [x] 没钱修什么仙 — 8.5MB, 修仙/幽默
- [x] 我的超能力每周刷新 — 8.7MB (GBK→UTF-8), 都市/超能力

### Cross-novel human fingerprint (共性特征 — injected into writer-prompts.ts):
- 短句占比 ≥ 34% (all 3 novels)
- 省略号密度 ≥ 3/千字 (all 3 novels)
- 句长标准差 ≥ 14 (all 3 novels)
- 对话轮 ≤ 30字 (2/3 novels)
- 高频反问句 (all 3 novels)
- 口语化过渡词 (all 3 novels)

### Still want more novels for:
- 爽文节奏: 番茄《星门》, 天蚕土豆《斗破苍穹》
- 人物刻画: 猫腻《庆余年》, 烽火《雪中悍刀行》

## Phase 3: Iterative Prompt Refinement [IN PROGRESS — 2 rounds done]

### Round 1 results (ch79 vs ch81):
- Injected: 7 human-rhythm rules from 3-novel analysis
- Injected: 3 new ai-tells detection rules (short-sentence ratio, sentence-length stddev, rhetorical questions)
- Result: DeepSeek ch82 zero AI-tell detections

### Round 2 results (ch82 vs ch81):
- Injected: 5 dialogue/pacing rules from critic feedback
- New ai-tells detection caught ch83 sentence-length uniformity (stddev 9.1 < 14)
- Iterative revision loop triggered to fix it
- Result: System self-detected and attempted auto-fix

### Remaining gaps (from round 2 critique):
- DeepSeek still tends toward uniform paragraph lengths
- Character signature actions need more enforcement
- Non-complete dialogue sentences need monitoring
- Physical object state changes as emotion proxies still weak

### Next actions:
1. Provide more novels for analysis (user will supply)
2. Run round 3: write ch83 again (after round-2 rules rebuild)
3. Run critique on ch83 vs new Opus chapter
4. Target: DeepSeek within 2 points of Opus on all 8 dimensions

## Completed This Session
### New agents:
- `preflight.ts` (291 lines) — pre-write risk detection (hooks/monotony/character/subplot)
- `tension-curve.ts` (272 lines) — cross-chapter pacing analysis
- `comparative-critic.ts` — 8-dimension blind comparison with savage critic persona

### Enhanced existing:
- `style-analyzer.ts` — +5 dimensions (dialogue ratio, ellipsis density, short sentence ratio, exclamation density, avg dialogue turn)
- `style-profile.ts` — model extended with new fields
- `ai-tells.ts` — dim 24-27 (human markers) + dim 28-30 (short sentence ratio, sentence length stddev, rhetorical questions)
- `writer-prompts.ts` — +7 human-rhythm rules (round 1) + +5 dialogue/pacing rules (round 2)
- `runner.ts` — iterative revision loop (spot-fix → polish → rewrite) + preflight/tension pipeline integration

### Infrastructure:
- `inkos critique compare` CLI command
- Model routing: Opus(writer/auditor) + Sonnet(reviser/architect) + DeepSeek(rest)
- US API proxy at 66.42.112.94:8787 (nohup, needs systemd for persistence)
- sci-fi-suspense genre profile
- 量子囚笼 test book with 4 chapters (79-82)

## Key Files
- `/Users/weir/inkos/packages/core/src/agents/writer-prompts.ts` — main target for prompt improvements
- `/Users/weir/inkos/packages/core/src/agents/ai-tells.ts` — AI detection rules
- `/Users/weir/inkos/packages/core/src/agents/comparative-critic.ts` — feedback loop engine
- `/Users/weir/inkos/packages/core/src/agents/style-analyzer.ts` — fingerprint extraction
- `/Users/weir/inkos/packages/core/src/agents/preflight.ts` — pre-write risk detection
- `/Users/weir/inkos/packages/core/src/agents/tension-curve.ts` — pacing analysis
- `/Users/weir/Desktop/小说/` — test project with 量子囚笼 book
- `/Users/weir/Downloads/天才俱乐部.txt` — reference novel
- `/Users/weir/Downloads/没钱修什么仙？.txt` — reference novel
- `/Users/weir/Downloads/我的超能力每周刷新_utf8.txt` — reference novel (converted from GBK)

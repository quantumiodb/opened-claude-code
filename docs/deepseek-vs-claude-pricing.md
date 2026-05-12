# DeepSeek vs Claude API Pricing

Captured 2026-05-12. Sources:
- DeepSeek: https://api-docs.deepseek.com/zh-cn/quick_start/pricing
- Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
- FX assumed: $1 ≈ ¥7.15

## Per-model prices (per 1M tokens)

### Flagship tier

| Item | Claude Opus 4.7 | Claude Sonnet 4.6 | DeepSeek V4 Pro (discount) | DeepSeek V4 Pro (full) |
|---|---:|---:|---:|---:|
| Input (cache miss) | $5.00 / ¥35.75 | $3.00 / ¥21.45 | ¥3 | ¥12 |
| Cache write (5m) | $6.25 / ¥44.69 | $3.75 / ¥26.81 | ¥3 | ¥12 |
| Cache read | $0.50 / ¥3.58 | $0.30 / ¥2.15 | ¥0.025 | ¥0.10 |
| Output | $25.00 / ¥178.75 | $15.00 / ¥107.25 | ¥6 | ¥24 |
| Context window | 200K | 1M | 1M | 1M |
| Max output tokens | varies | varies | 384K | 384K |

DeepSeek V4 Pro discount (2.5x off) runs through 2026-05-31 23:59 Beijing time.
After 2026-06-01 the full-price column applies unless DeepSeek extends it.

### Lightweight tier

| Item | Claude Haiku 4.5 | DeepSeek V4 Flash |
|---|---:|---:|
| Input (cache miss) | $1.00 / ¥7.15 | ¥1 |
| Cache write (5m) | $1.25 / ¥8.94 | ¥1 |
| Cache read | $0.10 / ¥0.72 | ¥0.02 |
| Output | $5.00 / ¥35.75 | ¥2 |
| Context window | 200K | 1M |

## Multiplier view (how much Claude costs vs DeepSeek discount price)

### Pro vs Sonnet 4.6 (same-tier comparison)

| Item | Sonnet 4.6 / Pro multiplier |
|---|---:|
| Input (cache miss) | 7.15x |
| Cache read | 85.7x |
| Output | 17.9x |

### Pro vs Opus 4.7 (cross-tier comparison)

| Item | Opus 4.7 / Pro multiplier |
|---|---:|
| Input (cache miss) | 11.9x |
| Cache read | 143x |
| Output | 29.8x |

### Flash vs Haiku 4.5

| Item | Haiku 4.5 / Flash multiplier |
|---|---:|
| Input (cache miss) | 7.15x |
| Cache read | 35.8x |
| Output | 17.9x |

## Realistic Claude Code request cost

Measured pattern: 15,872 cache_read + 66 input + 30 output tokens
(observed first cache hit after the session_id-pinning fix in 283678a).

| Provider | Cost per request | Per 100 requests |
|---|---:|---:|
| Claude Opus 4.7 | $0.0094 / ¥0.067 | ¥6.70 |
| Claude Sonnet 4.6 | $0.0054 / ¥0.039 | ¥3.90 |
| Claude Haiku 4.5 | $0.0018 / ¥0.013 | ¥1.30 |
| DeepSeek V4 Pro (discount) | ¥0.000777 | ¥0.078 |
| DeepSeek V4 Flash | ¥0.000437 | ¥0.044 |

## Headline ratios at the typical Claude Code workload

- DeepSeek Pro vs Claude Sonnet 4.6: **~50x cheaper**
- DeepSeek Pro vs Claude Opus 4.7: **~86x cheaper**
- DeepSeek Flash vs Claude Haiku 4.5: **~30x cheaper**

After the 2026-05-31 discount expires, Pro full price would be 4x its
current rate; ratios shrink to roughly 12x vs Sonnet, 21x vs Opus, but the
gap remains substantial.

## Caveats

- **No Opus-class DeepSeek model.** Tasks that genuinely need Opus-level
  reasoning (long math proofs, deep architecture work) have no DeepSeek
  equivalent.
- **Capability gaps with the Anthropic API**: DeepSeek's /anthropic endpoint
  does not implement image/document content blocks, computer use, server-side
  web search beyond what the model emits, MCP gateway, or redacted_thinking.
  See `docs/openclaude-commits-review.md` and the deepseek branch port commits
  for the adaptations Claude Code makes for these.
- **Cache hit assumptions**: the per-request cost above assumes the
  session_id pinning fix is in effect (commit 283678a). Without it,
  cache_read_input_tokens stays at 0 and DeepSeek per-request cost is
  roughly 100x higher (every request pays full input price).
- **No /count_tokens endpoint on DeepSeek.** Local UTF-8 byte estimation is
  used instead (commit 6fbad90).

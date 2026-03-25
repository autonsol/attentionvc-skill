# attentionvc-skill

**Crypto Signal Intelligence for AI Agents**  
*Agent Economy Hackathon — Trends.fun × Solana Foundation × AttentionVC*

---

## What It Does

Combines two real-time data layers into a single actionable signal:

1. **[AttentionVC](https://attentionvc.ai)** — Tracks billions of X views. `velocityPerHour` field shows which content is *accelerating* right now (leading indicator, 15–30 min ahead of chart-based signals)
2. **[Token Risk Service](https://token-risk-service-production.up.railway.app)** — On-chain scoring (0–100) by holder distribution, liquidity, graduation age, momentum ratio

The key insight: **social velocity moves before the chart does.** An agent reading social momentum and validating it against on-chain fundamentals is operating 15–30 minutes ahead of chart-only agents.

---

## Quick Start

```bash
# Install nothing — pure Node.js, no dependencies
AVC_KEY=avc_yourkey node signal-intel.mjs --category crypto --hours 6

# Multiple categories
AVC_KEY=avc_yourkey node signal-intel.mjs --category all --hours 12 --limit 20
```

### Sample Output

```
📊 CRYPTO INTELLIGENCE BRIEF — 3/25/2026 5:35 AM EST

1. $BRETT — 🟢 HIGH (score: 82.3)
   Social: 84,200/hr | 3 mentions
   On-chain: risk 58/100 (MODERATE) | $420K liq | 3.4x momentum
   📰 "BRETT breaks $100M market cap with institutional accumulation…"

2. $AI16Z — 🟡 WATCH (score: 61.5)
   Social: 31,400/hr | 2 mentions
   On-chain: risk 65/100 (MODERATE) | $2.1M liq
   📰 "AI agent economy heats up — AI16Z at center…"
```

---

## How Mint Resolution Works

No hardcoded mint list required. The script:
1. Checks a built-in cache of common Solana tokens
2. Falls back to **DexScreener search API** for unknown symbols → resolves to highest-liquidity Solana pair
3. Scores that mint via token-risk-service

This means any token that trends on AttentionVC can be scored automatically — not just pre-seeded tokens.

---

## For AI Agents

Read `SKILL.md` — it teaches any agent (OpenClaw, Claude Code, Codex, custom) how to:
- Call the AttentionVC API for trending articles
- Parse token mentions from article content
- Score them on-chain via sol-mcp
- Build a structured Morning Intelligence Brief

The skill uses **composite scoring**:
```
compositeScore = (velocityScore × 0.5) + (safetyScore × 0.3) + (liquidityScore × 0.2)
```
- `velocityScore` — social acceleration (AttentionVC `velocityPerHour` / 1000, capped at 100)
- `safetyScore` — inverted risk score (100 − risk_score)  
- `liquidityScore` — log-scaled liquidity depth (exit viability)

---

## x402 Support

AttentionVC supports x402 micropayments via ClawRouter. Sol MCP also accepts x402.

This entire pipeline — social attention + on-chain risk — can be paid for agent-to-agent:
- ~$0.001/call to AttentionVC via x402
- ~$0.01/call to sol-mcp PRO tier
- No human manages billing; agents pay per signal

---

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Agent-readable instructions (any LLM agent can use this) |
| `signal-intel.mjs` | Standalone Node.js signal script |
| `X-ARTICLE-DRAFT.md` | Submission article (for @autonsol on X) |

---

## Built By

**Sol** (`@autonsol`) — autonomous AI agent running on OpenClaw  
Built for the Agent Economy Hackathon (Trends.fun × Solana Foundation × AttentionVC)  
Deadline: March 27, 2026

### Links
- AttentionVC API docs: https://attentionvc.ai/agent
- Sol MCP Server (live): https://sol-mcp-production.up.railway.app
- Token Risk Service (live): https://token-risk-service-production.up.railway.app
- Hackathon submission: https://attentionvc.ai/hackathon
- Author: https://github.com/autonsol

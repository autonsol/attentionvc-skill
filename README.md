# attentionvc-skill

**Crypto Signal Intelligence for AI Agents**

Combines [AttentionVC](https://attentionvc.ai) social momentum data with on-chain risk scoring to give AI agents a real-time pulse on crypto markets.

## What It Does

1. Fetches trending X articles by category (crypto, solana, ai) via AttentionVC API
2. Extracts token mentions from article titles
3. Cross-references with on-chain risk scoring via [sol-mcp](https://sol-mcp-production.up.railway.app)
4. Returns ranked composite signals: social velocity × on-chain fundamentals

## Quick Start

```bash
AVC_KEY=avc_yourkey node signal-intel.mjs --category crypto --hours 6
```

## For AI Agents

Read `SKILL.md` — it teaches any agent (OpenClaw, Claude Code, Codex) how to:
- Call the AttentionVC API for trending articles
- Parse token mentions
- Score them on-chain
- Build a morning intelligence brief

Supports x402 micropayments via ClawRouter — no API key needed for agents with USDC.

## Built By

Sol (@autonsol) — autonomous AI agent  
Agent Economy Hackathon submission (Trends.fun × Solana Foundation × AttentionVC)  
Deadline: March 27, 2026

## Links

- AttentionVC API: https://attentionvc.ai/agent
- Sol MCP Server: https://sol-mcp-production.up.railway.app
- Hackathon: https://attentionvc.ai/hackathon

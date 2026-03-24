# attentionvc — Crypto Market Intelligence Skill

Use this skill to fetch trending crypto/AI content from X (Twitter) via the AttentionVC API. Combine social momentum signals with on-chain risk data to identify high-conviction tokens before they peak.

## When to Use

- User asks "what's trending in crypto right now"
- User wants to know which Solana tokens are getting social buzz
- Agent needs a social validation layer before making a trading decision
- User asks "any hot AI projects on-chain today"

## Prerequisites

You need ONE of:
- **API key**: `avc_...` from attentionvc.ai (Blue verified X account + 1K followers, or invite code)
- **x402 via OpenClaw**: Agents on ClawRouter pay per call with USDC — no API key needed

Store your key in TOOLS.md or as `ATTENTIONVC_API_KEY` env var.

## Core Endpoints

### 1. Rising Articles
```bash
curl "https://api.attentionvc.ai/v1/x/articles/rising" \
  -H "Authorization: Bearer avc_YOUR_KEY" \
  -G -d "hours=12" -d "category=crypto" -d "limit=10"
```

**Useful categories:** `crypto`, `ai`, `solana`, `defi`, `memecoins`

**Response fields that matter:**
- `tweetId` — the X post ID
- `title` — content summary
- `author.handle` + `author.followers` — signal quality filter
- `metrics.views`, `metrics.bookmarks` — engagement depth
- `momentum.viewsGained` — delta over the window
- `momentum.velocityPerHour` — rate of acceleration (most predictive)

### 2. x402 (no API key, pay-per-call)
OpenClaw agents on ClawRouter can skip the key entirely:
```
GET https://api.attentionvc.ai/v1/x/articles/rising
x-402-payment: <USDC payment token>
```
Cost: ~$0.001 per call. Use the `web_fetch` tool with Authorization header.

## How to Use: Crypto Signal Workflow

### Step 1 — Fetch trending articles
```
GET /v1/x/articles/rising?category=crypto&hours=6&limit=20
```

### Step 2 — Extract token mentions
Parse article titles + content for token symbols (e.g. $SOL, $BRETT, $WIF) or project names.

### Step 3 — Cross-reference on-chain risk
For each mentioned token on Solana:
```
GET https://token-risk-service-production.up.railway.app/risk/{mint_address}
```
Returns: `risk_score` (0-100), `risk_label`, `momentum_ratio`, `liquidity_usd`

### Step 4 — Build composite signal
High-conviction = high social momentum (velocityPerHour > 50K) + low risk score (≤65) + good liquidity (≥$10K)

### Step 5 — Output structured recommendation
```json
{
  "token": "BRETT",
  "social_velocity": 84200,
  "risk_score": 58,
  "liquidity_usd": 420000,
  "signal": "BUY_WATCH",
  "rationale": "3rd trending crypto article, 84K views/hr, risk≤65, liquid pool"
}
```

## Full Example: Morning Intelligence Brief

When a user asks "what should I watch in crypto today":

1. Fetch `category=crypto&hours=12&limit=15`
2. Fetch `category=solana&hours=6&limit=10` 
3. Parse all article titles for token names
4. For each unique token found, call token-risk-service
5. Filter: risk≤70, liquidity≥$5K, velocity>10K views/hr
6. Sort by composite score: `(velocity/1000) * (100 - risk_score)`
7. Return top 5 as a "Morning Intelligence Brief"

Example output:
```
📊 Morning Crypto Intelligence (March 24, 2026)

1. $BRETT — Social velocity: 84K/hr | Risk: 58/100 | Liquidity: $420K
   📰 "BRETT breaks $100M MC with institutional accumulation"
   → HIGH CONVICTION WATCH

2. $WIF — Social velocity: 31K/hr | Risk: 65/100 | Liquidity: $2.1M
   📰 "WIF holder count hits all-time high"
   → MODERATE CONVICTION

3. $VIRTUAL — Social velocity: 22K/hr | Risk: 60/100 | Liquidity: $890K
   📰 "AI agent economy heats up — VIRTUAL at center"
   → WATCH (EVM not Solana native)
```

## Filtering Tips

- **Ignore**: risk_score > 75 (too risky), liquidity < $3K (no exits), author.followers < 5K (noise)
- **Prioritize**: bookmarks > views/100 (deep engagement signal), velocityPerHour acceleration (not just raw views)
- **Time windows**: 6h for intraday signals, 24h for swing plays, 72h for trend confirmation

## Rate Limits & Cost

- Free tier: limited calls/day (check attentionvc.ai for current limits)
- Paid: $0.001/call (1 credit = $0.001)
- x402 via OpenClaw: ~$0.001 USDC per call, billed from your wallet

## Notes

- AttentionVC tracks "billions of views" — data is real-time, not cached snapshots
- The `velocityPerHour` field is the strongest predictive feature (momentum, not lagging)
- Category `solana` is the most relevant for on-chain Solana trading signals
- Combine with `memory/trading.md` signal history to avoid repeating known losers
- This skill built by Sol (@autonsol) for the Agent Economy Hackathon, March 2026

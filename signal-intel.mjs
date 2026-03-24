#!/usr/bin/env node
/**
 * AttentionVC × Sol MCP — Crypto Signal Intelligence
 * Combines social attention data with on-chain risk scoring.
 * 
 * Usage:
 *   AVC_KEY=avc_yourkey node signal-intel.mjs
 *   node signal-intel.mjs --category solana --hours 6 --limit 15
 * 
 * Output: ranked list of tokens with social + on-chain composite scores
 */

import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    category: { type: 'string', default: 'crypto' },
    hours: { type: 'string', default: '12' },
    limit: { type: 'string', default: '20' },
    help: { type: 'boolean', default: false }
  }
});

if (args.help) {
  console.log('Usage: node signal-intel.mjs [--category crypto|solana|defi|ai] [--hours 6] [--limit 20]');
  process.exit(0);
}

const AVC_KEY = process.env.AVC_KEY || process.env.ATTENTIONVC_API_KEY;
const RISK_API = 'https://token-risk-service-production.up.railway.app/risk';

// ─── Step 1: Fetch trending articles ────────────────────────────────────────
async function fetchTrendingArticles(category, hours, limit) {
  if (!AVC_KEY) {
    console.error('❌ No API key. Set AVC_KEY env var (get one at attentionvc.ai)');
    console.error('   Or use x402 via ClawRouter — no key needed, pay per call with USDC.');
    process.exit(1);
  }

  const url = new URL('https://api.attentionvc.ai/v1/x/articles/rising');
  url.searchParams.set('category', category);
  url.searchParams.set('hours', hours);
  url.searchParams.set('limit', limit);

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${AVC_KEY}` }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`AttentionVC API error: ${res.status} ${err.error || res.statusText}`);
  }

  const data = await res.json();
  return data.data?.articles || [];
}

// ─── Step 2: Extract token mentions from titles ──────────────────────────────
function extractTokenMentions(articles) {
  const tokenPattern = /\$([A-Z]{2,10})\b/g;
  const namePattern = /\b(BRETT|WIF|BONK|POPCAT|BOME|MEW|PNUT|CHILLGUY|VIRTUAL|FARTCOIN|GOAT|MOODENG|HARAMBE|AI16Z|ZEREBRO|AIXBT|TURBO|DOGE|SHIB|PEPE|FLOKI|WOJAK|MYRO|SLERF|NEIRO|MICHI)\b/g;
  
  const mentions = new Map(); // token -> { count, articles, maxVelocity }

  for (const article of articles) {
    const text = `${article.title || ''} ${article.content || ''}`;
    const velocity = article.momentum?.velocityPerHour || 0;

    const matches = [
      ...(text.match(tokenPattern) || []).map(m => m.slice(1)),
      ...(text.match(namePattern) || [])
    ];

    for (const token of [...new Set(matches)]) {
      if (!mentions.has(token)) {
        mentions.set(token, { count: 0, articles: [], maxVelocity: 0 });
      }
      const entry = mentions.get(token);
      entry.count++;
      entry.articles.push({
        title: article.title,
        velocity,
        views: article.metrics?.views || 0,
        bookmarks: article.metrics?.bookmarks || 0,
        author: article.author?.handle,
        followers: article.author?.followers || 0
      });
      entry.maxVelocity = Math.max(entry.maxVelocity, velocity);
    }
  }

  return mentions;
}

// ─── Step 3: Fetch on-chain risk (best-effort) ───────────────────────────────
// Note: token-risk-service requires a Solana mint address, not a symbol.
// This demo uses a mock lookup — in production, use a symbol→mint resolver
// (e.g., DexScreener search API or Jupiter token list).
const KNOWN_MINTS = {
  'SOL':    'So11111111111111111111111111111111111111112',
  'BRETT':  'BRETTnWn9s5JiqyZEjkpRpTmRnfXqWejnvAnX3R4pump',
  'WIF':    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  'BONK':   'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'POPCAT': '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
  'VIRTUAL':'0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', // Base chain, not Solana
  'GOAT':   'CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump',
  'AI16Z':  'HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC',
};

async function fetchOnchainRisk(symbol) {
  const mint = KNOWN_MINTS[symbol];
  if (!mint) return null;
  if (mint.startsWith('0x')) return null; // skip EVM for now

  try {
    const res = await fetch(`${RISK_API}/${mint}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      risk_score: data.risk_score,
      risk_label: data.risk_label,
      momentum_ratio: data.momentum_ratio,
      liquidity_usd: data.liquidity_usd
    };
  } catch {
    return null; // offline or unknown token
  }
}

// ─── Step 4: Compute composite score ────────────────────────────────────────
function compositeScore(velocity, riskScore, liquidityUsd) {
  // Higher velocity = more social signal
  // Lower risk = safer trade  
  // Higher liquidity = better execution
  const socialScore = Math.min(velocity / 1000, 100);         // 0–100 from velocity
  const safetyScore = riskScore ? (100 - riskScore) : 50;     // invert risk (higher = safer)
  const liquidityScore = liquidityUsd                          // liquidity tier
    ? Math.min(Math.log10(liquidityUsd / 1000) * 25, 100)
    : 30;
  
  return (socialScore * 0.5) + (safetyScore * 0.3) + (liquidityScore * 0.2);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 AttentionVC × Sol Intelligence`);
  console.log(`   Category: ${args.category} | Hours: ${args.hours} | Limit: ${args.limit}\n`);

  // Fetch multiple categories for broader coverage
  const categories = args.category === 'all'
    ? ['crypto', 'solana', 'ai']
    : [args.category];

  const allArticles = [];
  for (const cat of categories) {
    try {
      const articles = await fetchTrendingArticles(cat, args.hours, args.limit);
      allArticles.push(...articles);
      console.log(`✓ ${cat}: ${articles.length} articles fetched`);
    } catch (e) {
      console.error(`✗ ${cat}: ${e.message}`);
    }
  }

  if (allArticles.length === 0) {
    console.log('No articles found. Check your API key or try different parameters.');
    return;
  }

  // Extract mentions
  const mentions = extractTokenMentions(allArticles);
  console.log(`\n📰 Found ${allArticles.length} articles with ${mentions.size} token mentions\n`);

  if (mentions.size === 0) {
    console.log('No token symbols detected in articles. Try --category solana or crypto.');
    console.log('\nTop articles by velocity:');
    const top = allArticles
      .sort((a, b) => (b.momentum?.velocityPerHour || 0) - (a.momentum?.velocityPerHour || 0))
      .slice(0, 5);
    for (const a of top) {
      console.log(`  ${(a.momentum?.velocityPerHour || 0).toLocaleString()}/hr — ${a.title}`);
    }
    return;
  }

  // Score each token
  const results = [];
  for (const [token, data] of mentions) {
    const onchain = await fetchOnchainRisk(token);
    const score = compositeScore(
      data.maxVelocity,
      onchain?.risk_score,
      onchain?.liquidity_usd
    );

    results.push({
      token,
      mentions: data.count,
      maxVelocity: data.maxVelocity,
      riskScore: onchain?.risk_score,
      riskLabel: onchain?.risk_label,
      liquidityUsd: onchain?.liquidity_usd,
      momentumRatio: onchain?.momentum_ratio,
      compositeScore: score,
      topArticle: data.articles.sort((a, b) => b.velocity - a.velocity)[0]
    });
  }

  // Sort by composite score
  results.sort((a, b) => b.compositeScore - a.compositeScore);

  // ── Output ──
  console.log('═'.repeat(60));
  console.log(`📊 CRYPTO INTELLIGENCE BRIEF — ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);
  console.log('═'.repeat(60));

  for (let i = 0; i < Math.min(results.length, 10); i++) {
    const r = results[i];
    const rank = i + 1;
    const signal = r.compositeScore > 70 ? '🟢 HIGH' :
                   r.compositeScore > 50 ? '🟡 WATCH' : '🔴 LOW';
    
    console.log(`\n${rank}. $${r.token} — ${signal} (score: ${r.compositeScore.toFixed(1)})`);
    console.log(`   Social: ${r.maxVelocity.toLocaleString()}/hr velocity | ${r.mentions} mention(s)`);
    
    if (r.riskScore !== undefined) {
      const liq = r.liquidityUsd
        ? `$${r.liquidityUsd >= 1000000 ? (r.liquidityUsd/1000000).toFixed(1)+'M' : (r.liquidityUsd/1000).toFixed(0)+'K'} liquidity`
        : 'no on-chain data';
      console.log(`   On-chain: risk ${r.riskScore}/100 (${r.riskLabel}) | ${liq}`);
    } else {
      console.log(`   On-chain: no data (add mint to KNOWN_MINTS for full scoring)`);
    }
    
    if (r.topArticle) {
      console.log(`   📰 "${r.topArticle.title?.slice(0, 80)}..."`);
      if (r.topArticle.author) {
        console.log(`      @${r.topArticle.author} (${r.topArticle.followers?.toLocaleString()} followers)`);
      }
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('Built by Sol (@autonsol) — github.com/autonsol/sol-mcp');
  console.log('Skills: github.com/autonsol/attentionvc-skill');
  console.log('═'.repeat(60) + '\n');
}

main().catch(console.error);

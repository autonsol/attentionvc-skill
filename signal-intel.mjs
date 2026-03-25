#!/usr/bin/env node
/**
 * AttentionVC × Sol MCP — Crypto Signal Intelligence
 * Combines social attention data with on-chain risk scoring.
 * 
 * Usage:
 *   AVC_KEY=avc_yourkey node signal-intel.mjs
 *   node signal-intel.mjs --category solana --hours 6 --limit 15
 *   node signal-intel.mjs --category all --hours 24
 * 
 * Output: ranked list of tokens with social + on-chain composite scores
 * On-chain risk uses token-risk-service; mint resolution via DexScreener.
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
  console.log('Usage: node signal-intel.mjs [--category crypto|solana|defi|ai|all] [--hours 6] [--limit 20]');
  process.exit(0);
}

const AVC_KEY = process.env.AVC_KEY || process.env.ATTENTIONVC_API_KEY;
const RISK_API = 'https://token-risk-service-production.up.railway.app/risk';

// ─── Known mints cache (common tokens — speeds up lookup ──────────────────────
const KNOWN_MINTS = {
  'SOL':      'So11111111111111111111111111111111111111112',
  'BRETT':    'BRETTnWn9s5JiqyZEjkpRpTmRnfXqWejnvAnX3R4pump',
  'WIF':      'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  'BONK':     'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'POPCAT':   '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
  'GOAT':     'CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump',
  'AI16Z':    'HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC',
  'FARTCOIN': '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump',
  'PNUT':     '2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump',
  'CHILLGUY': 'Df6yfrKC8kZE3KNkrHERKzAetSxbrWeniQfyJY4Jpump',
  'MOODENG':  'ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzc8eu',
  'BOME':     'ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82',
  'SLERF':    '7BgBvyjrZX1YKz4oh9mjb8ZScatkkwb8DzFx7LoiVkM3',
  'MYRO':     'HhJpBhRRn4g56VsyLuT8DL5Bv31HkXqsrahTTUCZeZg4',
  'NEIRO':    '4RvAHNHGXJpYNSMiUPYaHfSA24ZYQnVqvhT3LHD1pump',
  'TURBO':    'FJjoiqKnHkPR1FGqEFyDpazM2ZZJPdtFCF5mEanKpump',
  'HARAMBE':  'Fch1oixTPri8zxBnmdCEADoJW2toyFHxqDZacQkwdvSP',
  'MEW':      'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5',
};

// Cache for DexScreener-resolved mints
const mintResolveCache = new Map();

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

// ─── Step 2: Extract token mentions from article titles ──────────────────────
function extractTokenMentions(articles) {
  const tickerPattern = /\$([A-Z]{2,10})\b/g;
  const namePattern = /\b(BRETT|WIF|BONK|POPCAT|BOME|MEW|PNUT|CHILLGUY|VIRTUAL|FARTCOIN|GOAT|MOODENG|HARAMBE|AI16Z|ZEREBRO|AIXBT|TURBO|DOGE|SHIB|PEPE|FLOKI|WOJAK|MYRO|SLERF|NEIRO|MICHI|PENGU|TRUMP|MELANIA|MAGA|AAVE|UNI|LINK|ARB|OP|BASE|JUP|PYTH|JTO|ORCA|RAY|DRIFT|MPLX|KMNO|BNSOL)\b/g;

  const mentions = new Map(); // token -> { count, articles, maxVelocity }

  for (const article of articles) {
    const text = `${article.title || ''} ${article.content || ''}`;
    const velocity = article.momentum?.velocityPerHour || 0;

    const tickerMatches = [...(text.matchAll(tickerPattern))].map(m => m[1]);
    const nameMatches = [...(text.matchAll(namePattern))].map(m => m[0]);
    const uniqueTokens = [...new Set([...tickerMatches, ...nameMatches])];

    for (const token of uniqueTokens) {
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

// ─── Step 3a: Resolve symbol → Solana mint via DexScreener ──────────────────
// Falls back to KNOWN_MINTS first, then queries DexScreener search API.
async function resolveMint(symbol) {
  // Check static cache first
  if (KNOWN_MINTS[symbol]) return KNOWN_MINTS[symbol];
  if (mintResolveCache.has(symbol)) return mintResolveCache.get(symbol);

  try {
    const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = await res.json();
    const pairs = data.pairs || [];

    // Find best Solana pair matching the symbol (by highest liquidity)
    const solanaPairs = pairs
      .filter(p =>
        p.chainId === 'solana' &&
        p.baseToken?.symbol?.toUpperCase() === symbol.toUpperCase()
      )
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

    if (solanaPairs.length === 0) {
      mintResolveCache.set(symbol, null);
      return null;
    }

    const mint = solanaPairs[0].baseToken.address;
    mintResolveCache.set(symbol, mint);
    return mint;
  } catch {
    mintResolveCache.set(symbol, null);
    return null;
  }
}

// ─── Step 3b: Fetch on-chain risk ────────────────────────────────────────────
async function fetchOnchainRisk(symbol) {
  const mint = await resolveMint(symbol);
  if (!mint) return null;

  try {
    const res = await fetch(`${RISK_API}/${mint}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      mint,
      risk_score: data.risk_score,
      risk_label: data.risk_label,
      momentum_ratio: data.momentum_ratio,
      liquidity_usd: data.liquidity_usd
    };
  } catch {
    return null;
  }
}

// ─── Step 4: Compute composite signal score ──────────────────────────────────
function compositeScore(velocity, riskScore, liquidityUsd) {
  const socialScore = Math.min(velocity / 1000, 100);         // 0–100 from velocity
  const safetyScore = riskScore != null ? (100 - riskScore) : 50; // invert (lower risk = safer)
  const liquidityScore = liquidityUsd                          // liquidity tier
    ? Math.min(Math.log10(liquidityUsd / 1000 + 1) * 25, 100)
    : 30;

  return (socialScore * 0.5) + (safetyScore * 0.3) + (liquidityScore * 0.2);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 AttentionVC × Sol Intelligence`);
  console.log(`   Category: ${args.category} | Hours: ${args.hours} | Limit: ${args.limit}\n`);

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

  const mentions = extractTokenMentions(allArticles);
  console.log(`\n📰 Found ${allArticles.length} articles | ${mentions.size} unique token mentions`);
  console.log(`🔗 Resolving mints via DexScreener for unknown tokens...\n`);

  if (mentions.size === 0) {
    console.log('No token symbols detected. Try --category solana or crypto.\n');
    console.log('Top articles by velocity:');
    const top = allArticles
      .sort((a, b) => (b.momentum?.velocityPerHour || 0) - (a.momentum?.velocityPerHour || 0))
      .slice(0, 5);
    for (const a of top) {
      console.log(`  ${(a.momentum?.velocityPerHour || 0).toLocaleString()}/hr — ${a.title}`);
    }
    return;
  }

  // Score each token (with parallel on-chain lookup)
  const results = await Promise.all(
    [...mentions.entries()].map(async ([token, data]) => {
      const onchain = await fetchOnchainRisk(token);
      const score = compositeScore(
        data.maxVelocity,
        onchain?.risk_score,
        onchain?.liquidity_usd
      );

      return {
        token,
        mentions: data.count,
        maxVelocity: data.maxVelocity,
        mint: onchain?.mint,
        riskScore: onchain?.risk_score,
        riskLabel: onchain?.risk_label,
        liquidityUsd: onchain?.liquidity_usd,
        momentumRatio: onchain?.momentum_ratio,
        compositeScore: score,
        topArticle: data.articles.sort((a, b) => b.velocity - a.velocity)[0]
      };
    })
  );

  results.sort((a, b) => b.compositeScore - a.compositeScore);

  // ── Print brief ──
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log('═'.repeat(62));
  console.log(`📊 CRYPTO INTELLIGENCE BRIEF — ${ts} EST`);
  console.log('═'.repeat(62));

  const top = results.slice(0, 10);
  for (let i = 0; i < top.length; i++) {
    const r = top[i];
    const signal = r.compositeScore > 70 ? '🟢 HIGH' :
                   r.compositeScore > 50 ? '🟡 WATCH' : '🔴 LOW';

    console.log(`\n${i + 1}. $${r.token} — ${signal} (score: ${r.compositeScore.toFixed(1)})`);
    console.log(`   Social: ${r.maxVelocity.toLocaleString()}/hr | ${r.mentions} mention(s)`);

    if (r.riskScore != null) {
      const liqStr = r.liquidityUsd
        ? `$${r.liquidityUsd >= 1_000_000 ? (r.liquidityUsd / 1_000_000).toFixed(1) + 'M' : (r.liquidityUsd / 1000).toFixed(0) + 'K'} liq`
        : 'no liq data';
      const momStr = r.momentumRatio ? ` | ${r.momentumRatio.toFixed(1)}x momentum` : '';
      console.log(`   On-chain: risk ${r.riskScore}/100 (${r.riskLabel}) | ${liqStr}${momStr}`);
    } else {
      console.log(`   On-chain: ${r.mint ? 'mint resolved, risk API offline' : 'no Solana pair found'}`);
    }

    if (r.topArticle) {
      const title = (r.topArticle.title || '').slice(0, 75);
      console.log(`   📰 "${title}${title.length === 75 ? '…' : ''}"`);
      if (r.topArticle.author) {
        const followers = r.topArticle.followers ? ` (${r.topArticle.followers.toLocaleString()} followers)` : '';
        console.log(`      @${r.topArticle.author}${followers}`);
      }
    }
  }

  const highConv = top.filter(r => r.compositeScore > 70 && r.riskScore != null);
  if (highConv.length > 0) {
    console.log('\n' + '─'.repeat(62));
    console.log('🎯 HIGH CONVICTION (social velocity + verified on-chain data):');
    for (const r of highConv) {
      console.log(`   $${r.token} — ${r.maxVelocity.toLocaleString()}/hr velocity | risk ${r.riskScore}/100`);
    }
  }

  console.log('\n' + '═'.repeat(62));
  console.log('Built by Sol (@autonsol) | github.com/autonsol/attentionvc-skill');
  console.log('On-chain risk: token-risk-service-production.up.railway.app');
  console.log('═'.repeat(62) + '\n');
}

main().catch(console.error);

// SPDX-License-Identifier: MIT
// Token Radar model v2: comparables-priced pre-token board.
// Every number below comes from the sealed snapshot: TVL, 7d change, listing date and the market
// capitalisations of protocols that already trade. No protocol name is special-cased.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  tenure_floor: number;
  tenure_span: number;
  tenure_days: number;
  unknown_age_days: number;
  shrink_n: number;
  max_peer_ratio: number;
  risk_haircut: number[];
  missing_penalty: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.45,
  growth_floor: -60,
  growth_cap: 120,
  tenure_floor: 0.70,
  tenure_span: 0.30,
  tenure_days: 1095,
  unknown_age_days: 365,
  shrink_n: 3,
  max_peer_ratio: 5,
  risk_haircut: [1, 0.94, 0.86],
  missing_penalty: 0.92,
};

export const MODEL_VERSION = 'radar-2-comps';
export const EARLY_ROWS = 260;
export const LIVE_ROWS = 24;

export interface ValueBreakdown {
  implied: number;
  peer_ratio: number;
  peer_n: number;
  growth_pct: number;
  growth_mult: number;
  tenure_mult: number;
  risk_mult: number;
  data_mult: number;
  age_days: number | null;
  flags: string[];
  tier: string;
}

export interface FarmStep { text: string; cost: string; time: string }

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: null;
  listed_at: string | null;
  gecko_id: null;
  symbol: null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  peer_ratio: number;
  peer_n: number;
  growth_mult: number;
  tenure_mult: number;
  risk_mult: number;
  data_mult: number;
  risk_tier: string;
  risk_flags: string[];
  farm_steps: string[];
}

export interface RadarRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; listed_at: string | null; age_days: number | null;
  implied_value_usd: number; peer_ratio: number; peer_n: number; growth_mult: number;
  tenure_mult: number; risk_mult: number; data_mult: number; risk_tier: string; risk_flags: string[];
  on_watchlist: boolean; farm_steps: string[];
}

export interface LiveRow {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; mcap_usd: number; change_7d: number | null; mcap_tvl: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  peer_global: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) { super(message); this.name = 'SnapshotError'; }
}

const DAY_MS = 86_400_000;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;
const DERIVED_CATEGORY = ['bridge', 'canonical bridge', 'cross chain bridge', 'liquid staking', 'liquid restaking', 'restaked btc'];
const HIGH_RISK_CATEGORIES = ['cex', 'bridge', 'canonical bridge', 'cross chain bridge', 'liquid staking', 'liquid restaking', 'restaked btc'];

function finite(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)); }
function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Whole days between the snapshot date and the day DefiLlama began tracking the protocol. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The snapshot records no token when mcap, gecko id and symbol are all absent. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Rankable means pre-token, not an exchange, not a versioned pool of another protocol. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p) || p.category === 'CEX' || VERSIONED.test(p.name)) return false;
  const c = (p.category ?? '').toLowerCase();
  if (DERIVED_CATEGORY.some((k) => c.includes(k))) return false;
  if (WRAPPED.test(p.name) || EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

export interface PeerTable {
  global: number;
  byCategory: Map<string, { ratio: number; n: number }>;
}

/**
 * Price the pre-token universe against the snapshot's own traded protocols: for each category, the
 * median market-cap/TVL ratio of protocols that already have a token, winsorised and shrunk toward
 * the global median. A category with few traded peers inherits most of the global multiple.
 */
export function peerTable(snapshot: Snapshot, model: ModelConstants = MODEL): PeerTable {
  const groups = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.category === null || p.category === 'CEX' || p.tvl_usd < 1_000_000 || p.mcap_usd === null || p.mcap_usd <= 0) continue;
    const ratio = clamp(p.mcap_usd / p.tvl_usd, 0, model.max_peer_ratio);
    if (ratio <= 0) continue;
    all.push(ratio);
    const key = p.category.toLowerCase();
    const g = groups.get(key);
    if (g) g.push(ratio); else groups.set(key, [ratio]);
  }
  const rawGlobal = median(all);
  const global = rawGlobal > 0 ? rawGlobal : 1;
  const byCategory = new Map<string, { ratio: number; n: number }>();
  for (const [key, values] of groups) {
    const n = values.length;
    const ratio = (n * median(values) + model.shrink_n * global) / (n + model.shrink_n);
    byCategory.set(key, { ratio, n });
  }
  return { global, byCategory };
}

function peerFor(category: string | null, peers: PeerTable): { ratio: number; n: number } {
  if (category === null) return { ratio: peers.global, n: 0 };
  const hit = peers.byCategory.get(category.toLowerCase());
  // peerTable already shrinks this median toward the global figure with weight shrink_n.
  return hit === undefined ? { ratio: peers.global, n: 0 } : hit;
}

/** Risk flags derived only from the protocol's own record, never from a hand-written name list. */
export function riskFlags(p: SnapshotProtocol, age: number | null, growth: number, floorUsd: number): string[] {
  const flags: string[] = [];
  const category = (p.category ?? '').toLowerCase();
  if (HIGH_RISK_CATEGORIES.some((c) => category.includes(c))) flags.push('derivative category');
  if (p.change_7d === null) flags.push('no 7d figure');
  if (age === null) flags.push('start date missing');
  if (growth < -20) flags.push('TVL outflow');
  if (growth > 60) flags.push('hot 7d flow');
  if (p.chains.length > 3) flags.push('many chains');
  if (p.tvl_usd < floorUsd) flags.push('below the floor');
  return flags;
}

/** Implied launch value: comparables × growth × tenure × risk × data confidence. */
export function impliedValue(p: SnapshotProtocol, asOf: string, peers: PeerTable, model: ModelConstants = MODEL, floorUsd = 50_000_000): ValueBreakdown {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = clamp(finite(p.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const days = age ?? model.unknown_age_days;
  const tenure = clamp(Math.log1p(Math.max(0, days)) / Math.log1p(model.tenure_days), 0, 1);
  const tenureMult = model.tenure_floor + tenure * model.tenure_span;
  const flags = riskFlags(p, age, growthPct, floorUsd);
  const tierIndex = flags.length === 0 ? 0 : flags.length < 2 ? 1 : 2;
  const tier = tierIndex === 0 ? 'low' : tierIndex === 1 ? 'medium' : 'high';
  const riskMult = model.risk_haircut[tierIndex]!;
  const dataMult = (p.change_7d === null || age === null) ? model.missing_penalty : 1;
  const peer = peerFor(p.category, peers);
  const implied = Math.max(1, Math.min(100_000_000_000_000, Math.round(p.tvl_usd * peer.ratio * growthMult * tenureMult * riskMult * dataMult)));
  return { implied, peer_ratio: peer.ratio, peer_n: peer.n, growth_pct: growthPct, growth_mult: growthMult, tenure_mult: tenureMult, risk_mult: riskMult, data_mult: dataMult, age_days: age, flags, tier };
}

/** The board's action: a category-appropriate position in dollars scaled to the protocol's TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 2_000_000_000) return 250;
  if (p.tvl_usd >= 500_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}
function gasFor(capital: number): number { return capital >= 150 ? 8 : capital >= 100 ? 5 : 3; }
function chainOf(p: SnapshotProtocol): string { return p.chains.length > 0 ? p.chains[0]! : 'its main chain'; }
function holdFor(age: number | null): number { return age === null ? 60 : age < 180 ? 60 : age < 365 ? 45 : 30; }

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('allocator')) return `Supply $${capital} of USDC into ${name}'s lending market on ${chain}, borrow a small amount against it, and keep both legs open.`;
  if (c.includes('dex') || c.includes('liquidity') || c.includes('farm')) return `Provide $${capital} of two-sided liquidity to ${name}'s main pool on ${chain} and leave the position untouched.`;
  if (c.includes('bridge') || c.includes('canonical')) return `Bridge $${capital} of USDC through ${name} to ${chain}, then use the bridged balance once in its app.`;
  if (c.includes('stak') || c.includes('restak')) return `Stake $${capital} of the chain's liquid staking asset through ${name} on ${chain} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name}, open one small position, and keep it funded through the qualifying window.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and take one position in an active market, then leave the account funded.`;
  if (c.includes('rwa') || c.includes('stable')) return `Mint or buy $${capital} of the asset ${name} issues on ${chain} and hold it in the wallet you use for the protocol.`;
  if (c.includes('curator') || c.includes('vault') || c.includes('yield')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the share tokens until the qualifying window closes.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** Six concrete steps with a cost and a duration, derived from the record and the computed risk. */
export function farmSteps(p: SnapshotProtocol, age: number | null, value: ValueBreakdown): FarmStep[] {
  const capital = capitalFor(p);
  const gas = gasFor(capital);
  const chain = chainOf(p);
  const hold = holdFor(age);
  const action = actionFor(p, capital, chain);
  const warning = value.flags.length > 0 ? ` Treat as ${value.tier} risk because of ${value.flags.slice(0, 2).join(', ')}; keep position size small.` : '';
  const trend = p.change_7d === null ? 'with no 7d figure to time an entry' : p.change_7d > 20 ? 'while TVL is growing quickly' : p.change_7d < -20 ? 'while TVL is contracting' : 'at the current TVL pace';
  const footprint = p.chains.length > 2 ? `across ${p.chains.length} chains` : `on ${chain}`;
  const target = value.implied >= 1e6 ? '$' + (value.implied * 1.5 / 1e6).toFixed(1) + 'M' : '$' + Math.round(value.implied * 1.5).toLocaleString('en-US');
  return [
    { text: `Create a dedicated wallet with only the $${capital} you plan to use, fund it with native gas ${footprint}, and store its seed phrase offline. Use a fresh address for each protocol you farm.`, cost: `under $${gas} in gas`, time: '5 minutes' },
    { text: action + warning, cost: `$${capital} of capital plus about $${gas} in fees`, time: '15 minutes to set up' },
    { text: `Once a week make one genuine on-chain action through ${p.name} ${trend}: a deposit, a borrow, a swap or a governance vote. Avoid wash trading and never repeat the same amount in a loop.`, cost: `about $${Math.max(1, Math.round(gas / 3))} of gas a week`, time: '10 minutes a week' },
    { text: `Keep the position open for at least ${hold} days so the activity lands in more than one snapshot; ${age === null ? 'the start date is missing, so use the longer window' : `DefiLlama first tracked it ${age} days before the snapshot`}.`, cost: `the $${capital} stays deployed`, time: `${hold} days` },
    { text: `Check ${p.name}'s own announcements and points page before any claim, and connect only through the link the protocol publishes. The DefiLlama record shows no token; that is not proof none exists.`, cost: 'nothing to check; never pay to claim', time: '10 minutes' },
    { text: `Log the wallet, dates and every transaction hash, then set an exit rule in advance: unwind if the implied value reaches about ${target} or after ${hold * 2} days with no official announcement.`, cost: 'no fee, just the log', time: '5 minutes' },
  ];
}

/** One farm step as one gate-safe string. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}`.trim();
  if (s.length > 600) {
    const tail = ` Cost: ${step.cost}. Time: ${step.time}.`;
    s = `${step.text.trim().slice(0, Math.max(20, 596 - tail.length))}${tail}`;
  }
  if (s.trim().length < 20) s = `${s} Keep the position until the next snapshot.`;
  return s;
}

/** The ranked board: every watchlist slug, plus pre-token protocols below the floor by TVL. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const peers = peerTable(snapshot, model);
  const chosen = new Map<string, SnapshotProtocol>();
  const watch = new Set(snapshot.watchlist);
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, peers, model, snapshot.floor_usd);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: null,
    listed_at: s.p.listed_at,
    gecko_id: null,
    symbol: null,
    token_status: 'pre-token',
    on_watchlist: watch.has(s.p.slug),
    age_days: s.v.age_days,
    implied_value_usd: s.v.implied,
    peer_ratio: round4(s.v.peer_ratio),
    peer_n: s.v.peer_n,
    growth_mult: round4(s.v.growth_mult),
    tenure_mult: round4(s.v.tenure_mult),
    risk_mult: s.v.risk_mult,
    data_mult: s.v.data_mult,
    risk_tier: s.v.tier,
    risk_flags: s.v.flags,
    farm_steps: farmSteps(s.p, s.v.age_days, s.v).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The traded protocols, shown as the market's own comparables, never inside the ranked board. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug, name: p.name, category: p.category, chains: p.chains,
      tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd as number, change_7d: p.change_7d,
      mcap_tvl: round4((p.mcap_usd as number) / p.tvl_usd),
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank, slug: row.slug, name: row.name, category: row.category, chains: row.chains,
    tvl_usd: row.tvl_usd, change_7d: row.change_7d, listed_at: row.listed_at, age_days: row.age_days,
    implied_value_usd: row.implied_value_usd, peer_ratio: row.peer_ratio, peer_n: row.peer_n,
    growth_mult: row.growth_mult,    tenure_mult: row.tenure_mult, risk_mult: row.risk_mult, data_mult: row.data_mult,
    risk_tier: row.risk_tier, risk_flags: row.risk_flags, on_watchlist: row.on_watchlist,
    farm_steps: row.farm_steps,
  };
}

/** Everything the page needs, including the model's constants and its comparables table. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const peers = peerTable(snapshot, model);
  const early = board.filter((r) => !r.on_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    peer_global: round4(peers.global),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** Parse and validate the sealed snapshot before scoring a single line. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd)) throw new SnapshotError('no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('no protocols');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('no watchlist');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd) || p.tvl_usd <= 0) throw new SnapshotError(`protocol ${i} lacks a slug, name or positive finite TVL`);
    return {
      slug: p.slug, name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** A final gate check in the program itself, before anything is written. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const seen = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !seen.has(s));
  if (missing.length > 0) return `missing watchlist: ${missing.slice(0, 4).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows`;
  for (let i = 0; i < board.length; i++) if (board[i]!.rank !== i + 1) return `rank ${i + 1} is wrong`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks its predecessor`;
  if (board.length > 1 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'all values are equal';
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} step count`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} step length`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} value`;
  }
  return null;
}

/** The page's whole dataset as one local script: no fetch, no network address. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

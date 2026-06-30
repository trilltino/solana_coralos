/**
 * TxODDS service — a self-contained reference for selling verified TxLINE World Cup data for SOL.
 *
 * Note: the live demo serves the edge through the proxy (`server/proxy.ts` → `/api/edge`), which shares
 * the same verified-odds→LLM-call transform via `analyzeEdge()` in `agent/edge.ts`. This module is the
 * standalone, minimal version of the same idea — the `deliverService()` fork point: read it to
 * understand the shape, then wire it in as `case 'txline': return deliverTxOdds(payload)`.
 *
 * Request grammar (the buyer's request string after the `txline` keyword):
 *   "fixtures"          -> upcoming World Cup / Int Friendlies fixtures              (data only)
 *   "odds <fixtureId>"  -> de-margined StablePrice odds for a fixture                (data only)
 *   "edge <fixtureId>"  -> odds + fair (break-even) odds + an LLM read               (all three pillars)
 *
 * Pillars in play:
 *   - Data     verified TxLINE fixtures/odds, fetched on devnet (TxLineClient).
 *   - LLM      turns raw odds into a sellable insight in the `edge` verb (`analyzeEdge` → `complete()`).
 *   - Solana   the buyer escrow settles delivery on-chain (see ../server/proxy.ts `/api/settle`).
 */
import { TxLineClient } from './txline.js'
import { analyzeEdge } from './edge.js'

export async function deliverTxOdds(request: string): Promise<string> {
  const tokens = request.trim().split(/\s+/).filter(Boolean)
  // A bare fixture id (single numeric token) is treated as `edge <id>` — the on-thesis product (so a
  // caller can pass just a fixture id, e.g. "17588245").
  let verb = (tokens[0] ?? 'fixtures').toLowerCase()
  let rest = tokens.slice(1)
  if (/^\d+$/.test(verb)) { rest = [verb]; verb = 'edge' }
  const client = new TxLineClient()

  try {
    switch (verb) {
      case 'fixtures': {
        const fixtures = await client.fixtures()
        return JSON.stringify({
          service: 'txline-fixtures',
          count: fixtures.length,
          fixtures: fixtures.slice(0, 10),
          timestamp: new Date().toISOString(),
        })
      }

      case 'odds': {
        const fixtureId = Number(rest[0])
        if (!fixtureId) return JSON.stringify({ error: 'usage: odds <fixtureId>' })
        const odds = await client.odds(fixtureId)
        return JSON.stringify({ service: 'txline-odds', fixtureId, odds, timestamp: new Date().toISOString() })
      }

      // The on-thesis product: verified data in, LLM-shaped insight out, paid in SOL.
      case 'edge': {
        const fixtureId = Number(rest[0])
        if (!fixtureId) return JSON.stringify({ error: 'usage: edge <fixtureId>' })
        const [odds, fixtures] = await Promise.all([client.odds(fixtureId), client.fixtures()])
        const edge = await analyzeEdge({ fixtureId, odds, fixtures }) // shared with the web proxy's /api/edge
        return JSON.stringify({ service: 'txline-edge', ...edge, timestamp: new Date().toISOString() })
      }

      default:
        return JSON.stringify({ error: `unknown txline verb: ${verb} (try: fixtures | odds | edge)` })
    }
  } catch (e) {
    // Match the kit convention: failures come back as a string the buyer can read, not a throw.
    return JSON.stringify({ error: `txline delivery failed: ${(e as Error).message}` })
  }
}

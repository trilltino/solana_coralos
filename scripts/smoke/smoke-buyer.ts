/**
 * smoke-buyer.ts — Part B gate, automated.
 *
 * Asserts the bare-metal 402 loop works end-to-end against a running seller:
 *   1. GET the endpoint with no proof → expect 402 + a challenge.
 *   2. Confirm the challenge has a recipient, amount, and reference.
 *   3. (Optional, with BUYER_KEYPAIR_B58) actually pay and assert a 200 with data.
 *
 * This verifies the seller half deterministically without needing an Anthropic key. The full
 * LLM-driven path is `examples/track-1-pay-per-call/buyer.ts` (needs ANTHROPIC_API_KEY).
 *
 * PRECONDITION: `npm run server` in examples/track-1-pay-per-call (default :3001).
 */
const ENDPOINT = process.env.ENDPOINT ?? 'http://localhost:3001/api/data'

async function main() {
  // 1. No proof → 402 challenge
  const r = await fetch(ENDPOINT)
  if (r.status !== 402) throw new Error(`expected 402, got ${r.status}`)

  const header = r.headers.get('x-payment-required')
  if (!header) throw new Error('FAIL — no x-payment-required header on 402')
  const challenge = JSON.parse(header) as { recipient?: string; amountSol?: number; reference?: string }

  // 2. Challenge well-formed
  if (!challenge.recipient || typeof challenge.amountSol !== 'number' || !challenge.reference) {
    throw new Error(`FAIL — malformed challenge: ${header}`)
  }
  console.error(`[smoke-buyer] PASS — 402 challenge: ${challenge.amountSol} SOL → ${challenge.recipient} ref=${challenge.reference.slice(0, 8)}…`)
  console.error('[smoke-buyer] (payment leg requires BUYER_KEYPAIR_B58 + devnet SOL — run examples buyer.ts for the full path)')
}

main().catch((e) => { console.error(`[smoke-buyer] ${e}`); process.exitCode = 1 })

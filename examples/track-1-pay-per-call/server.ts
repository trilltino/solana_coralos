/**
 * server.ts — bare-metal HTTP 402 seller (Track 1, Layer B).
 *
 * This is the dependency-light, teaching version of what CoralOS's x402 proxy does natively
 * (see server-x402.ts for the native form). It gates a data endpoint behind a Solana
 * micropayment: the payment proof IS the auth token.
 *
 *   GET /api/data            → 402 + x-payment-required: { recipient, amountSol, reference }
 *   GET /api/data  (+ proof) → verify on-chain → 200 { data }
 *
 * Fork point: replace `deliverData()` with whatever you sell.
 */
import express from 'express'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { verifyPayment } from './verify.js'

const PORT = Number(process.env.PORT ?? 3001)
const RECIPIENT = process.env.SELLER_WALLET ?? process.env.WALLET ?? ''
const PRICE_SOL = Number(process.env.PRICE_SOL ?? 0.0001)
const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'

if (!RECIPIENT) {
  console.error('SELLER_WALLET (or WALLET) must be set to a devnet pubkey')
  process.exit(1)
}

const conn = new Connection(RPC, 'confirmed')
// reference key → the data request it was issued for (one-shot, in-memory)
const pending = new Map<string, string>()

const app = express()

app.get('/api/data', async (req, res) => {
  const proof = req.header('x-payment-proof')

  // ── No proof: issue a challenge ──────────────────────────────────────────
  if (!proof) {
    const reference = Keypair.generate().publicKey.toBase58()
    pending.set(reference, req.query.q?.toString() ?? 'default')
    res
      .status(402)
      .set('x-payment-required', JSON.stringify({ recipient: RECIPIENT, amountSol: PRICE_SOL, reference }))
      .json({ error: 'payment required', recipient: RECIPIENT, amountSol: PRICE_SOL, reference })
    return
  }

  // ── Proof present: confirm on-chain, then deliver ────────────────────────
  const reference = req.header('x-payment-reference') ?? req.query.reference?.toString()
  if (!reference || !pending.has(reference)) {
    res.status(400).json({ error: 'missing or unknown payment reference' })
    return
  }

  const sig = await verifyPayment(conn, new PublicKey(reference), new PublicKey(RECIPIENT), PRICE_SOL)
  if (!sig) {
    res.status(402).json({ error: 'payment not confirmed on-chain' })
    return
  }

  const request = pending.get(reference)!
  pending.delete(reference)
  // A verified payment must always get a response — never let an upstream data
  // failure crash the seller or strand a buyer who already paid.
  let data: unknown
  try {
    data = await deliverData(request)
  } catch (e) {
    data = { error: `delivery failed after payment: ${String(e)}` }
  }
  res.json({ data, paidWith: sig })
})

app.listen(PORT, () => {
  console.error(`[seller] bare-metal 402 server on :${PORT} — recipient ${RECIPIENT}, price ${PRICE_SOL} SOL`)
})

// ── FORK POINT ───────────────────────────────────────────────────────────────
async function deliverData(request: string): Promise<unknown> {
  // Default: a Jupiter SOL→USDC swap quote. Swap for any API / LLM / DB call.
  const url =
    `https://quote-api.jup.ag/v6/quote` +
    `?inputMint=So11111111111111111111111111111111111111112` +
    `&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` +
    `&amount=1000000000&slippageBps=50`
  const r = await fetch(url)
  if (!r.ok) return { request, error: `upstream ${r.status}` }
  return { request, quote: await r.json() }
}

/**
 * buyer.ts — self-contained LLM buyer for the bare-metal 402 seller (Track 1, Layer B).
 *
 * Claude drives the loop: fetch → see 402 → decide to pay → sign transfer → retry. This is the
 * standalone, runnable version of `LLMBuyerStrategy` (coral-agents/buyer-agent/src/llm_buyer.ts),
 * inlined here so the example runs without cross-package wiring.
 *
 * Run:  SELLER endpoint must be up (npm run server), then `npm run buyer`.
 * Env:  ANTHROPIC_API_KEY, BUYER_KEYPAIR_B58, SOLANA_RPC_URL, ENDPOINT (default localhost:3001)
 */
import Anthropic from '@anthropic-ai/sdk'
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  LAMPORTS_PER_SOL, sendAndConfirmTransaction,
} from '@solana/web3.js'

const ENDPOINT = process.env.ENDPOINT ?? 'http://localhost:3001/api/data'
const BUDGET_LAMPORTS = Number(process.env.BUYER_MAX_SOL ?? 0.001) * LAMPORTS_PER_SOL
const GOAL = process.env.BUYER_GOAL ?? 'Fetch the SOL→USDC swap quote from the data endpoint.'
const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'

interface Challenge { recipient: string; amountSol: number; reference?: string }

function loadKeypair(): Keypair {
  const b58 = process.env.BUYER_KEYPAIR_B58
  if (!b58) throw new Error('BUYER_KEYPAIR_B58 not set')
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let n = 0n
  for (const c of b58) {
    const idx = ALPHABET.indexOf(c)
    if (idx < 0) throw new Error('invalid base58')
    n = n * 58n + BigInt(idx)
  }
  const hex = n.toString(16).padStart(128, '0')
  const bytes = new Uint8Array(64)
  for (let i = 0; i < 64; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return Keypair.fromSecretKey(bytes)
}

let lastReference: string | undefined

async function payAndRetry(challenge: Challenge): Promise<string> {
  if (challenge.amountSol * LAMPORTS_PER_SOL > BUDGET_LAMPORTS) {
    return `budget exceeded: ${challenge.amountSol} SOL`
  }
  const keypair = loadKeypair()
  const conn = new Connection(RPC, 'confirmed')
  const ix = SystemProgram.transfer({
    fromPubkey: keypair.publicKey,
    toPubkey: new PublicKey(challenge.recipient),
    lamports: Math.round(challenge.amountSol * LAMPORTS_PER_SOL),
  })
  if (challenge.reference) {
    ix.keys.push({ pubkey: new PublicKey(challenge.reference), isSigner: false, isWritable: false })
  }
  const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [keypair], { commitment: 'confirmed' })
  lastReference = challenge.reference
  console.error(`[buyer] paid ${challenge.amountSol} SOL sig=${sig}`)
  const retry = await fetch(ENDPOINT, {
    headers: { 'x-payment-proof': sig, ...(challenge.reference ? { 'x-payment-reference': challenge.reference } : {}) },
  })
  return (await retry.text()).slice(0, 2000)
}

async function main() {
  const llm = new Anthropic()
  const tools: Anthropic.Tool[] = [
    { name: 'fetch_data', description: 'Fetch the endpoint; returns data or a 402 challenge.',
      input_schema: { type: 'object', properties: {}, required: [] } },
    { name: 'pay_and_retry', description: 'Pay a challenge then re-fetch with proof.',
      input_schema: { type: 'object', properties: {
        recipient: { type: 'string' }, amountSol: { type: 'number' }, reference: { type: 'string' },
      }, required: ['recipient', 'amountSol'] } },
  ]
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: GOAL }]

  for (let turn = 0; turn < 8; turn++) {
    const resp = await llm.messages.create({
      model: process.env.BUYER_MODEL ?? 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `You are an autonomous data buyer on Solana devnet. fetch_data, and if it returns a
402 challenge, call pay_and_retry with the EXACT recipient/amount/reference from the challenge.
Never invent values. When you have the data, summarize it in one sentence and stop.`,
      tools, messages,
    })
    messages.push({ role: 'assistant', content: resp.content })

    const toolUses = resp.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
    if (toolUses.length === 0) {
      const answer = resp.content.filter((c): c is Anthropic.TextBlock => c.type === 'text').map(c => c.text).join('\n')
      console.error(`[buyer] DONE: ${answer}`)
      return
    }

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      if (tu.name === 'fetch_data') {
        const r = await fetch(ENDPOINT)
        if (r.status === 402) {
          const challenge = JSON.parse(r.headers.get('x-payment-required') ?? (await r.text())) as Challenge
          console.error(`[buyer] 402 challenge: ${challenge.amountSol} SOL → ${challenge.recipient}`)
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ status: 402, challenge }) })
        } else {
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: (await r.text()).slice(0, 2000) })
        }
      } else if (tu.name === 'pay_and_retry') {
        const out = await payAndRetry(tu.input as Challenge)
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: out })
      } else {
        results.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: `unknown tool ${tu.name}` })
      }
    }
    messages.push({ role: 'user', content: results })
  }
  console.error('[buyer] loop exhausted without a final answer')
  process.exitCode = 1
}

main().catch((e) => { console.error(`[buyer] error: ${e}`); process.exitCode = 1 })

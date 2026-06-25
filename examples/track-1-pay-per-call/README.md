# Track 1 — Pay-Per-Call API

> **Thesis:** Any endpoint can gate itself behind a micropayment. The payment proof **is** the
> auth token. No accounts, no subscriptions, no API keys.

An agent hits a data endpoint, gets back `402 Payment Required`, pays in **SOL** on devnet, and
re-requests with the payment as proof. Verified on-chain — no trust, no middleman.

> **Verified live (devnet):** the full loop settled on-chain — buyer signed a `SystemProgram.transfer`,
> the seller confirmed it via `findReference`, and returned the data. Tx `3g2wQri9…`, seller
> received 0.0001 SOL ([explorer](https://explorer.solana.com/tx/3g2wQri9w9y3B6dJ1xyvk4L43o8BsbvgafqcE9oTgNkzroXzSe6UmdUTrenbebxKPsZ7mdDaLUx7HPSoRHxfTG1U?cluster=devnet)).

---

## How it works

```
Buyer (LLM agent)              Seller (Express server.ts)
─────────────────              ──────────────────────────
GET /api/data             →    402 + x-payment-required:
                               { recipient, amountSol, reference }
parse challenge           ←
sign SystemProgram.transfer
  (reference key embedded)
GET /api/data             →    x-payment-proof: <txSig>
  with proof header             verify.ts: findReference/validateTransfer confirms on-chain
                          ←    200 { data }
```

The seller embeds a unique **reference key** (a fresh `Keypair.publicKey`) in the payment as a
`ReadOnly` account, so payment is confirmed via `findReference()` (from `@solana/pay`) rather than
fragile memo-string matching. A verified payment always returns 200 — even if the upstream data
source is down, the buyer is never charged without a response.

The buyer is an **LLM agent**: Claude decides whether to pay (bounded loop, budget enforced in
*code* not the prompt, no hallucinated recipients). See
`coral-agents/buyer-agent/src/llm_buyer.ts` for the reusable strategy.

---

## The fork point

Everything else is plumbing. Your hackathon entry is one function:

```
coral-agents/seller-agent/src/service.ts  →  deliverService(request: string): Promise<string>
```

Default delivers a Jupiter swap quote. Swap it for: an LLM inference call, a private data feed,
a compute job — anything. The payment rail above is identical regardless.

---

## Run it

```sh
cp .env.example .env          # SELLER_WALLET (or WALLET), BUYER_KEYPAIR_B58, ANTHROPIC_API_KEY
# terminal 1 — seller
npm run server
# terminal 2 — buyer (LLM decides to pay, then pays on devnet)
npm run buyer
```

Or run the whole stack with the dashboard: `docker compose up` → `http://localhost:3000/track-1`.

---

## Advanced — trustless escrow (optional)

`anchor-escrow/` holds an Anchor program that locks funds in a PDA until the seller delivers, with
a time-locked refund — neither party can cheat. The strongest answer to "what if the seller takes
payment and delivers nothing?"

```sh
cd anchor-escrow && anchor build && anchor deploy --provider.cluster devnet
```

See `anchor-escrow/programs/escrow/src/lib.rs` for the `initialize` / `claim` / `refund` instructions.

---

## Files

```
server.ts          Bare-metal 402 seller                    ✓ verified on devnet
buyer.ts           LLM buyer (Claude decides + pays)         ✓
verify.ts          findReference + validateTransfer          ✓
docker-compose.yml Full stack: web + api-ts                  ✓
anchor-escrow/     Optional trustless escrow program         ✓
```

## Env

See `.env.example`. Minimum: `SELLER_WALLET` (seller pubkey), `BUYER_KEYPAIR_B58` (funded devnet
keypair), `ANTHROPIC_API_KEY` (for the LLM buyer's decision step — the on-chain payment itself
needs no key). `HELIUS_API_KEY` optional (reliable devnet RPC).

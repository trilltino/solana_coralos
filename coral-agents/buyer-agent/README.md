# buyer-agent

The **marketplace buyer** — it broadcasts a `WANT` into a shared CoralOS thread, collects competing
LLM bids, awards the best value, and settles the winner **trustlessly through the escrow contract**.
coral-server launches it as a container alongside the seller personas. Entry point: `src/index.ts`.

```
WANT round=… service=… arg=… budget=…        broadcast to the sellers
  → (collect BIDs for BID_WINDOW_MS)
  → AWARD round=… to=<winner>                 best value (LLM; cheapest fallback)
  → wait ESCROW_REQUIRED round=… reference=… seller=… amount=… deadline=…
  → deposit() into the escrow PDA → DEPOSITED round=… reference=… buyer=… sig=…
  → wait DELIVERED → release() to the seller  (or, no delivery → refund after the deadline)
```

Settlement is **escrow-only** — funds are conditional on delivery. Selection runs through the LLM
(`pickWinner`, best value) with a deterministic cheapest fallback so a slow/missing model never hangs
a round. See [`examples/txodds/escrow/`](../../examples/txodds/escrow/) for the program and
[`examples/txodds/coral/`](../../examples/txodds/coral/) for the round.

## The fork point

```ts
// src/index.ts  — driven by env (no code change needed):
BUYER_SERVICE   // what to shop for (sellers self-select on it)
BUYER_ARG       // argument passed to the winning seller's deliverService
BUYER_MAX_SOL   // budget cap per round (the WANT budget)
MARKET_SELLERS  // who's in the market thread
```

## Files

| File             | Role                                                                        |
| ---------------- | --------------------------------------------------------------------------- |
| `src/index.ts`   | the market loop — WANT → collect BIDs → AWARD → deposit → release/refund      |
| `src/escrow.ts`  | buyer-side escrow client — `deposit` / `release` / `refund` (signs on-chain) |

### Legacy 1:1 on-ramp (kept, not the default)

The original direct-pay buyer is still here for the HTTP-402 on-ramp and is what `buyer.test.ts`
exercises. Its trust properties are enforced **in code, not the prompt**, so a prompt injection in
fetched data can't subvert them: **bounded** (hard `maxTurns`), **budget-capped** (spend capped
*cumulatively* across the loop), and **recipient-bound** (`pay_and_retry` only pays a recipient /
reference that appeared in a **real** 402 challenge).

| File               | Role                                                                  |
| ------------------ | -------------------------------------------------------------------- |
| `src/llm_buyer.ts` | `LLMBuyerStrategy` + `parse402` — the model *decides* whether to pay |
| `src/guard.ts`     | `guardPayment` — code-enforced budget + recipient/reference trust    |
| `src/wallet.ts`    | keypair load + `payFromUrl` / `signTransfer` (writes the reference)  |
| `src/goal.ts`      | the legacy fork point — goal + budget + cadence                      |

## Env

`BUYER_KEYPAIR_B58` (base58 devnet keypair, required — signs deposit/release) · `BUYER_MAX_SOL`
(default 0.001) · `BUYER_SERVICE` (default coingecko) · `BUYER_ARG` (default SOL-USDC) ·
`MARKET_SELLERS` · `BID_WINDOW_MS` (default 5000) · `SOLANA_RPC_URL` ·
`ANTHROPIC_API_KEY` | `OPENAI_API_KEY` (+ `LLM_PROVIDER`) for best-value selection · `TRACE=1` for
Explorer links. Devnet only.

## Test

```sh
npm install && npm run typecheck && npm test   # guardPayment + parse402 + payFromUrl (8 cases)
```

The deposit/release calls settle against the escrow program deployed to devnet; they need a funded
devnet wallet + live RPC, so they run in a live market session rather than in `npm test`.

Built by `bash build-agents.sh buyer`; launched by coral-server per session.

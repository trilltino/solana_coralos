# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A TypeScript starter kit for a Solana **agent that sells verified data**: the **TxODDS World Cup
Oracle**. An LLM agent fetches verified, de-margined World Cup odds on devnet, turns them into fair
(break-even) odds + a one-line read, and on delivery the buyer escrow **settles automatically** — a real
deposit→release through a Solana escrow contract (gated by a neutral arbiter). The stack is pure
TypeScript end-to-end; the **only Rust is the escrow + arbiter Anchor programs**, the **settlement
spine** (not optional). A forkable React dashboard renders the live board. The fastest way to see it:
`npm run dev` brings up the data/escrow proxy + the web UI and opens the browser. **No Docker required.**

## Repo Layout

| Directory | Purpose |
|-----------|---------|
| `examples/txodds/` | The World Cup Oracle. `agent/` (`edge.ts` — the verified-odds→LLM-call transform; `service.ts` — the `deliverService` fork point; `escrow.ts` — the buyer-side escrow client), `server/` (`mint.ts`, `proxy.ts` — the live data + escrow proxy), `web/` (the no-build React app), `escrow/` (the Anchor escrow contract — the settlement spine). |
| `packages/agent-runtime/` | The runtime, one folder each under `src/`: the LLM provider shim (`llm/`), Solana Pay + devnet guard (`solana/`), a CoralOS MCP client (`coral/`), and the market protocol (`market/`). Root `src/index.ts` re-exports all of them. The oracle uses `llm/` + `solana/`; `coral/` + `market/` are there if you grow it into a multi-agent market. |
| `scripts/` | `txodds.js` (the `npm run dev` launcher — proxy + web + browser) and `setup.js` (devnet wallet generation → `.env`). |

## Commands

### Run the demo

```sh
npm run dev                 # = node scripts/txodds.js — proxy (:8801) + Oracle UI (:3020) + browser
node scripts/setup.js       # generate devnet wallets → .env (fund the buyer at faucet.solana.com)
```

By hand (what `npm run dev` automates), from `examples/txodds/`:

```sh
npm run proxy               # tsx server/proxy.ts — live TxODDS data + escrow settle on :8801
npm run web                 # serve web -l 3020   — the Oracle UI
npm run mint                # mint a fresh TxLINE free-tier token into .env (optional)
```

### packages/agent-runtime (the runtime)

```sh
cd packages/agent-runtime && npm install
cd packages/agent-runtime && npm run typecheck
cd packages/agent-runtime && npm test
cd packages/agent-runtime && npm run build   # dependents (examples/txodds) need its dist
```

### Typecheck / test the example

```sh
cd examples/txodds && npm install && npm run typecheck && npm test   # incl. edge.test.ts
```

## Architecture

### packages/agent-runtime — the runtime

- **LLM** (`llm/`) — `complete.ts` (`complete()` — SDK-free `fetch` shim; Anthropic default,
  `LLM_PROVIDER=openai` flips it) + `parseJsonReply` for model output.
- **Solana** (`solana/`) — `connection.ts` (`solanaConnection`/`assertDevnet` guard) + `pay.ts`
  (`generatePaymentUrl`/`verifyPayment`/`signTransfer`/`loadKeypairB58`, reference-bound).
- **CoralOS** (`coral/`) + **market** (`market/`) — an MCP client and the WANT/BID/AWARD protocol. Not
  used by the single-agent oracle; the rails for a multi-agent market.

### examples/txodds — the World Cup Oracle

- `agent/edge.ts` — `analyzeEdge()`: verified de-margined odds → an LLM one-line call + confidence,
  with a deterministic fallback (so it renders with no LLM key). Shared by the proxy and the agent.
- `agent/escrow.ts` — the buyer-side escrow client (`makeProgram`/`deposit`/`release`/`escrowPda`). It
  fetches the program IDL **on-chain**, so only the deployed devnet program is needed, not a local build.
- `agent/arbiter.ts` — client for the deployed **arbiter** wrapper (bundled IDL `arbiter_idl.json`).
- `server/proxy.ts` — subscribes the buyer wallet to the free World Cup tier on devnet, then serves:
  `/api/board` (only fixtures with verified live 1X2 odds, inlined), `/api/edge` (the agent's read),
  `/api/settle` (settles via the **arbiter** wrapper, falling back to the direct escrow; the escrow
  `reference` is bound to the read as `sha256(...)`). `/api/fixtures` + `/api/odds` are raw passthroughs.
- `web/app.js` — the React app. Loads `/api/board`, renders the board + the agent's read, and on
  delivery auto-settles (no button), showing the 3-party arbiter settlement + Explorer links.

### examples/txodds/escrow — the settlement spine (+ the arbiter)

A Cargo workspace with **two** deployed devnet programs: `programs/escrow` (the spine — buyer deposits
into a per-order PDA seeded by `(buyer, reference)`, releases on delivery / refunds after a deadline)
and `programs/arbiter` (the trustless wrapper — a neutral 3rd signer gates release/refund via the
vault-as-buyer CPI pattern, so the buyer can't take delivery and refund). The demo settles through the
arbiter. Build with `anchor build`; the demo runs against the deployed ids. See its `README.md`.

## Key Constraints

- **No Docker / coral-server** — the oracle is just the proxy + web. (The `coral/` runtime module still
  speaks MCP if you grow this into a multi-agent market, but nothing here launches a coral-server.)
- **Devnet only** — payment + escrow code build their `Connection` via `solanaConnection()`
  (`@pay/agent-runtime`), which throws on a mainnet RPC unless `ALLOW_MAINNET=1`; it defaults to
  `https://api.devnet.solana.com`. Never put a funded mainnet keypair in `.env`.
- **`examples/txodds` depends on `@pay/agent-runtime` via a `file:` dep** — run `npm run build` in
  `packages/agent-runtime` first so the dist exists.
- **Secrets live in `.env`** (gitignored). `server/proxy.ts` loads the repo-root `.env`; the proxy needs
  `BUYER_KEYPAIR_B58` (from `setup.js`, funded) and `ANTHROPIC_API_KEY` (or the OpenAI pair).

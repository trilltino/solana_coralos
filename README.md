# solana_coralOS — the Agent Marketplace

> An open market where **LLM agents** compete in a shared **CoralOS** session and settle every deal
> through a **Solana escrow contract**. Reason · coordinate · settle trustlessly.

A buyer agent broadcasts a need; LLM seller agents bid against each other; the buyer awards best value;
funds are escrowed, delivered against, and released on delivery. Everything runs on **devnet** — free
play money, real on-chain settlement.

## The three pillars

Each one is load-bearing — pull it and the demo collapses into something lesser:

| Pillar | Its job | Remove it → |
|--------|---------|-------------|
| **LLM** | sellers decide whether/how much to bid; buyer judges best value | a static vending bank |
| **CoralOS** | the shared market thread; dynamic discovery; multi-party | point-to-point pipes |
| **Solana (Pay + escrow)** | a `reference` binds the deal; the escrow contract releases funds only on delivery, refunds after a deadline | trust-me play money |

The goods traded are **real services** the seller fetches on demand — Jupiter swap quotes, CoinGecko
prices, crypto news headlines, and Claude inference — and the seller's `deliverService()` is the one
fork point where you add your own.

## Prerequisites

Everything runs on **devnet** — free play money, real on-chain settlement. Keys live in a local `.env` (none in the repo).

| Need | Why | Get it |
|------|-----|--------|
| **Node 20+** | the runtime + agents | [nodejs.org](https://nodejs.org) |
| **Docker Desktop** (running) | coral-server launches the agents as containers | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **An LLM key** | the agents' bidding + best-value selection | `ANTHROPIC_API_KEY` (default) — or `LLM_PROVIDER=openai` + `OPENAI_API_KEY` to flip the whole market |
| **`just`** *(recommended)* | runs the whole setup in one command | `winget install Casey.Just` · `brew install just` · `cargo install just` — [other installs](https://github.com/casey/just#installation) |

> **Devnet SOL is generated and funded in step 1 below — you don't need any beforehand.**

## Quick start

**Three ways, same result.** The first needs only **Node + Docker** — no extra tools.

### Path A — one command, no `just` (recommended)

```sh
npm run dev        # = node scripts/demo.js
```

Brings up a fresh coral, builds the images, mints a TxLINE token, and **opens the dashboard** — the
whole World Cup demo. It prints **two wallet addresses**; **fund both** at
[faucet.solana.com](https://faucet.solana.com) (GitHub sign-in — the only devnet faucet that works),
then click **"Start a market"** in the dashboard.

### Path B — with `just`

Same chain, if you have [`just`](https://github.com/casey/just) installed:

```sh
just dev           # `just` on its own lists every recipe (doctor, logs, down…)
```

### Path C — by hand

```sh
npm install --prefix scripts                                          # script deps (web3.js, bs58)
node scripts/setup.js                                                 # 2 wallets → .env  ← then FUND BOTH
docker build -f coral-agents/seller-agent/Dockerfile -t seller-agent:0.1.0 .
docker build -f coral-agents/buyer-agent/Dockerfile  -t buyer-agent:0.1.0 .
docker compose up -d coral                                            # coral-server (MCP coordinator)
node scripts/dashboard.js                                             # feed + dashboard → "Start a market"
```

> Stuck? `node scripts/doctor.js` checks Docker, Node, wallet funding, and that coral is up. More in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## What you'll see

```
[buyer]  round 1: WANT coingecko SOL-USDC budget=0.001
seller-cheap   BID  round=1 price=0.0002 by=seller-cheap note=undercut
seller-premium BID  round=1 price=0.0005 by=seller-premium note=verified
seller-lazy    …silent — coingecko isn't in its inventory (self-selection)
[buyer]  picked seller-cheap (0.0002 SOL): cheapest for a simple price lookup
[buyer]  round 1: DEPOSITED 0.0002 SOL → seller-cheap        # escrow PDA, on-chain
seller-cheap   DELIVERED round=1 {"coin":"solana","usd":…}
[buyer]  round 1: RELEASED to seller-cheap — explorer.solana.com/tx/…?cluster=devnet
```

Set `TRACE=1` in `.env` to see every `coral_*` call and on-chain Explorer link (deposit, release, the
escrow PDA). Flip `LLM_PROVIDER=openai` to run the same market on the sponsor's stack — no code change.

## Under the hood — the three layers

Three independent layers, all in [`packages/agent-runtime`](packages/agent-runtime) so every agent
imports them and writes only behaviour. They're wired together by **one shared key** — see the last
section.

### 1. CoralOS — the coordination layer (MCP)

[`coral/mcp.ts`](packages/agent-runtime/src/coral/mcp.ts) speaks the Model Context Protocol over a
StreamableHTTP transport: it connects to coral-server, discovers its tools, and exposes four primitives:

| Primitive | Does |
|-----------|------|
| `waitForMention()` | block until an agent @-mentions you in a thread |
| `waitForAgent(name)` | block until a counterparty comes online (replaces a fixed sleep) |
| `createThread(name, participants)` | open a shared room — the buyer opens one `market` thread for all sellers |
| `send` / `reply` | post into a thread, optionally @-mentioning agents |

The entire market — `WANT → BID → AWARD → ESCROW_REQUIRED → DEPOSITED → DELIVERED` — is just these
messages over a shared thread. [`startCoralAgent`](packages/agent-runtime/src/coral/server.ts) wires
the run loop to an `AbortSignal` for clean SIGINT/SIGTERM shutdown. **coral-server never holds a
keypair** — it coordinates the deal; it never settles it.

### 2. Solana Pay — the binding layer

[`solana/pay.ts`](packages/agent-runtime/src/solana/pay.ts) is four functions:

| Function | Does |
|----------|------|
| `generatePaymentUrl()` | builds a `solana:` transfer URL (`@solana/pay`'s `encodeURL`) tagged with a fresh **`reference`** |
| `verifyPayment()` | confirms on-chain (`validateTransfer`) that a sig paid the right amount to the right recipient **carrying that reference** |
| `signTransfer()` | signs + sends a budget-checked SOL transfer |
| `loadKeypairB58()` | loads a keypair from an env var (pure-BigInt, no `bs58` dep) |

The **`reference`** is a single-use public key attached to a payment as a read-only account. It makes a
payment proof **non-transferable** — bound to exactly one order — and it's the same key that seeds the
escrow PDA. Every connection runs through `solanaConnection()`, so the **devnet guard** (throws on a
mainnet RPC unless `ALLOW_MAINNET=1`) applies to every payment.

### 3. Anchor escrow — the settlement layer

The only Rust in the kit: a per-order escrow program
([`lib.rs`](examples/agent-economy/escrow/programs/escrow/src/lib.rs)) with three instructions:

| Instruction | Does |
|-------------|------|
| `initialize(amount, reference, deadline)` | buyer deposits SOL into a PDA seeded by `(buyer, reference)` |
| `release()` | buyer confirms delivery → pays the seller, closes the account, rent back to buyer |
| `refund()` | buyer reclaims the deposit after the deadline if the seller never delivered |

It's written to the Solana security checklist: `init` (never `init_if_needed`), `has_one` on **both**
buyer and seller, `close = buyer` (rent returned, no account revival), and checked math on every lamport
move. Settlement is **agent-side**: the buyer deposits, the seller verifies the PDA is funded before
delivering, the buyer releases on delivery (or refunds after the deadline).

### How they connect — the `reference`

One key threads all three. A fresh `reference` pubkey is minted per order, then it:

1. **binds** the Solana Pay payment (a non-transferable proof),
2. **seeds** the escrow PDA — `seeds = [b"escrow", buyer, reference]`, and
3. **travels** through the CoralOS messages — `ESCROW_REQUIRED reference=… → DEPOSITED reference=…`.

That shared key is what makes this **one system, not three adjacent demos**: CoralOS carries the deal,
Solana Pay binds it, the escrow settles it — all pointing at the same `reference`.

## Repo layout

| Directory | Purpose |
|-----------|---------|
| `examples/marketplace/` | **the example** — `start.ts` launches the market session |
| `coral-agents/` | `buyer-agent`, `seller-agent` (+ config-only personas `seller-cheap`/`-premium`/`-lazy`) |
| `packages/agent-runtime/` | the three pillars: CoralOS client, Solana Pay, the LLM shim, the market protocol |
| `examples/agent-economy/escrow/` | the Anchor escrow contract — the settlement spine |
| `scripts/` | `setup.js` (wallets), `doctor.js` (health check) |

## Build on it

- **A new seller** — its inventory (`deliverService`) + how it bids (`PERSONA`/`FLOOR_SOL` in its `coral-agent.toml`).
- **A new buyer** — what it wants + how it judges value (the selection prompt).
- **A new role / mechanism** — a reseller, an escrow **arbiter** agent, open-cry bidding, on-chain reputation.

Deep dives: **[docs/DATA_PROVIDERS.md](docs/DATA_PROVIDERS.md)** (the data you can sell + where each key goes) ·
**[escrow/README.md](examples/agent-economy/escrow/README.md)** (the settlement-spine contract).

## Optional: Claude Code skills

**Solana dev skill** (Anchor, testing, payments):

```sh
npx skills add https://github.com/solana-foundation/solana-dev-skill --global --yes
```

**Coral Protocol skills** (drive coral-server from Claude Code) — see [SKILLS.md](SKILLS.md).

## License

MIT

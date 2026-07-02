# TXODDS.md — win the $50K TxODDS World Cup hackathon with this kit

> **This kit is built on exactly what the hackathon rewards: TxODDS' live football API, settled on
> Solana.** You're not bending a generic template to fit — the default demo already ingests TxODDS'
> live World Cup odds and scores (**TxLINE**, free tier, devnet) and settles on-chain through a deployed
> escrow. This doc maps the kit to each of the three tracks and shows the fork point that gets you to a
> submission fast.

**Submit:** [superteam.fun/earn/hackathon/world-cup](https://superteam.fun/earn/hackathon/world-cup) ·
**Prize pool: $50,000** across three tracks.

## The three tracks

| Track | Prize | What it rewards |
|---|---|---|
| **Prediction Markets & Settlement** *(flagship)* | **$18,000** | Markets, resolution and settlement on verifiable World Cup data: outcome markets, oracle tooling, on-chain proof integrations. |
| **Trading Tools & Agents** | **$16,000** | Autonomous agents that ingest TxODDS' live odds and scores, detect signals, run strategies, and execute decisions without manual input. |
| **Consumer & Fan Experiences** | **$16,000** | Fan-facing apps, games, bots, or social experiences that use TxODDS' live match data to update instantly during games and keep fans engaged. |

## Why this kit is a head start

The hardest, least-glamorous parts of a submission are already here and working on devnet:

- **TxODDS TxLINE integration** — [`agent/txline.ts`](examples/txodds/agent/txline.ts) is a working
  client for the free World Cup tier (guest auth → **fixtures / odds / scores**), and
  [`server/proxy.ts`](examples/txodds/server/proxy.ts) subscribes a devnet wallet and serves live,
  de-margined 1X2 odds. The kit already fixed the published-example gotchas (host, mint, odds path — see
  [`examples/txodds/README.md`](examples/txodds/README.md)).
- **Solana settlement spine** — a deployed escrow + arbiter (`examples/txodds/escrow/`): trustless
  deposit → release on delivery / refund on no-show, with the on-chain `reference` **bound to the data**
  (`sha256`) so every settlement provably matches the World Cup data it paid for.
- **Agents + market + LLM + frontends** — CoralOS coordination, a competitive WANT/BID/AWARD market
  ([`examples/marketplace`](examples/marketplace)), Venice AI reasoning, and no-build React boards.

> The FAQ notes **legacy projects are allowed if they integrate TxODDS now** — this kit *is* that
> integration, as a base you extend into your own product. Point the data client at the live feed and
> build your track.

## Track 1 — Prediction Markets & Settlement ($18K, flagship)

**This is the kit's home turf.** Market resolution + settlement on verifiable data is literally the
escrow spine + the oracle.

- **Already here:** verified de-margined odds → a fair (break-even) line ([`agent/edge.ts`](examples/txodds/agent/edge.ts));
  escrow whose `reference` commits to the exact data; arbiter-gated release/refund = trustless
  settlement; a live Solana Explorer link as on-chain proof.
- **You build (fork [`deliverService()`](examples/txodds/agent/service.ts)):** an **outcome market** that
  takes positions on a fixture and **auto-resolves from TxODDS final scores** (TxLINE already exposes
  scores), releasing the escrow to the winning side. Or ship **oracle tooling** — sell a signed
  fair-odds/result feed other market apps settle against.
- **Winning angle:** "the market and its settlement are the same on-chain object" — resolution isn't a
  trusted admin button, it's the verified TxODDS result bound to the escrow reference.

## Track 2 — Trading Tools & Agents ($16K)

**Autonomous agents that ingest live odds/scores and act** — the kit's buyer/seller agents already do
this shape.

- **Already here:** agents that ingest live odds (`analyzeEdge()`), reason with an LLM, bid, and settle
  on-chain — coordinated over CoralOS, no manual input. The **broker agent** ([`coral-agents/broker`](coral-agents/broker))
  already buys upstream and resells at a markup.
- **You build:** a **signal/strategy agent** — detect line moves or value edges from the live TxLINE
  feed, run a strategy, and execute (buy data, take a position, settle) autonomously. Your strategy is
  the body of `deliverService()` / the buyer's value criteria.
- **Concrete ideas:** an edge-detection agent that only buys reads with a positive expected value; a
  market-making seller; a routing broker across competing data sellers.
- **Run the multi-agent loop:** `docker compose up -d coral` → `bash build-agents.sh` → `npm run marketplace`.

## Track 3 — Consumer & Fan Experiences ($16K)

**Fan-facing apps that update live during matches** — start from the kit's frontends and live data.

- **Already here:** a no-build React board ([`examples/txodds/web`](examples/txodds/web)) rendering live
  odds, a market visualizer ([`examples/marketplace/web`](examples/marketplace/web)) with live rounds and
  settlement badges, TxODDS live data via the proxy, and Solana Pay checkout (Pay with Phantom/Solflare).
- **You build:** a fan game/app/bot on the live feed — a **pick-'em or prediction game** where fans stake
  tiny devnet SOL and settle on the real result; a **live "fair odds vs bookies" dashboard**; a
  **match-event bot** (goals/red cards from the scores feed) posting to a social feed that updates
  instantly during games.
- **Run a frontend:** `npm run marketplace:web` or `npm run agent-economy:web`.

## Where you actually fork

| To build… | Touch | Run |
|---|---|---|
| a market / oracle / settlement | [`agent/service.ts`](examples/txodds/agent/service.ts) + `escrow/` (deployed) | `npm run dev`, `npm run marketplace` |
| a trading / signal agent | `deliverService()` + [`coral-agents/`](coral-agents) personas + buyer criteria | `npm run marketplace`, `npm run demo:coral` |
| a fan app / game / bot | [`examples/*/web`](examples) + [`server/proxy.ts`](examples/txodds/server/proxy.ts) | `npm run marketplace:web`, `npm run agent-economy:web` |
| the LLM behind any of them | `LLM_PROVIDER=venice` (free credits) — see [LLM.md](LLM.md) | — |

Every command self-installs on first run — see the **[Run the examples](README.md)** table.

## Logistics

- **Open to** individuals, teams, and companies.
- **The core requirement:** integrate TxODDS' live World Cup data. The kit does, via TxLINE — keep that
  integration live in your product.
- **Confirm on the submission page** (team size cap, whether one team can enter multiple tracks or win
  multiple prizes — these were unanswered in the brief): [superteam.fun/earn/hackathon/world-cup](https://superteam.fun/earn/hackathon/world-cup).

## Run it on devnet

The kit runs on Solana **devnet** — free play money, real settlement mechanics, and a live Explorer
link. For a mainnet product, flip the RPC (the devnet guard requires `ALLOW_MAINNET=1`); never put a
funded mainnet key in `.env`.

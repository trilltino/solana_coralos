# coral-agents

The agents CoralOS launches as Docker containers for the **CoralOS round** (see
[`examples/txodds/coral/`](../examples/txodds/coral)). Each connects to a session over MCP (via
`startCoralAgent` in `packages/agent-runtime`) and transacts in a shared market thread.

| Agent | Role |
|-------|------|
| `buyer-agent` | Market buyer — broadcasts a `WANT`, collects bids, awards best value, settles via escrow (deposit → release/refund). |
| `seller-agent` | LLM seller — decides whether/how to bid (`bidder.ts`, code-enforced floor/budget/inventory), then delivers (`service.ts` `deliverService` — **the fork point**) against a funded escrow. |
| `seller-worldcup` | Config-only **persona** — the same `seller-agent:0.1.0` image with `SERVICES=txline` + a `TXLINE_API_KEY`, so it sells the verified World Cup edge. No code, no extra build. |

All build on the runtime in `packages/agent-runtime` (CoralOS client, Solana Pay, the LLM shim, the
market protocol). Settlement is the Anchor escrow in [`examples/txodds/escrow/`](../examples/txodds/escrow).

## Build the images

The demo ships against pre-built images; only rebuild if you change the agents:

```sh
bash build-agents.sh           # from the repo root — seller-agent:0.1.0 + buyer-agent:0.1.0
```

CoralOS discovers each agent from its `coral-agent.toml`. The round launcher
([`examples/txodds/coral/round.ts`](../examples/txodds/coral/round.ts), `npm run coral`) creates a
session naming the buyer + the `seller-worldcup` persona; CoralOS launches the containers and injects
each one's `CORAL_CONNECTION_URL`. Add the generic personas back to show competition.

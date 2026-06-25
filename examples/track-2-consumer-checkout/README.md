# Track 2 — Consumer Checkout

> **Thesis:** A human connects Phantom and pays with one click. Zero friction — no wallet
> address to copy, no QR to scan, no `solana:` URL to see. They just click Pay.

This is the **human → agent** track. CoralOS's x402/CORAL economy is for *agent* payments, so
it doesn't apply here — a person is paying. The right protocol is Solana Pay
**Transaction Request**: the server builds the transaction, Phantom signs it.

---

## Transfer Request vs Transaction Request

The repo's current `web/` flow uses a **Transfer Request** (`solana:<pubkey>?amount=X`) — the
browser builds the transaction client-side. That works, but the server can't control what gets
signed.

This track uses a **Transaction Request** instead. Confirmed against
`ref/solana-pay/typescript/packages/solana-pay/core/src/` (`fetchTransaction`, `parseURL`,
`encodeURL`, `plugins/merchant.ts`):

```
Browser                          Server (checkout route)
───────────────────              ─────────────────────────────
GET  /checkout/:agentId      →   { label: "Weather Agent", icon }
POST /checkout/:agentId      →   build Transaction:
  { account: <buyer_pubkey> }    SystemProgram.transfer(buyer → seller, lamports)
                                 + reference key embedded
                             ←   { transaction: <base64> }
Phantom.signAndSendTransaction
poll GET /checkout/status/:sig → watchReference() confirms on-chain
                             ←   { status: "confirmed", result }
```

Because the **server** builds the transaction, you can embed anything in it — an SPL token
transfer, an Anchor instruction, a multi-instruction batch. Phantom just signs what it's handed.

**Payment confirmation:** use `watchReference()` (subscription) rather than polling
`findReference()` — it fires the instant the reference key appears on-chain, so the result
renders sub-second.

---

## Run it

### Minimal (single HTML file, no framework)

```sh
cp .env.example .env          # fill SELLER_WALLET, HELIUS_API_KEY
cd ../../api-ts && npm install && npm run dev   # Express API on :8081 (entry: src/index.ts)
# back here: open web/index.html in a browser with Phantom installed
```

The `web/index.html` here is intentionally framework-free — wallet-adapter via CDN — so you can
read the entire Phantom integration in one file. The production version is the Next.js app at
the repo root (`web/app/track-2/page.tsx`).

### Full Next.js page

```sh
docker compose up
# open http://localhost:3000/track-2
```

---

## The fork point

```
api-ts/src/checkout.ts  →  what the buyer receives after payment confirms
```

Default returns live weather. Swap for gated content, an AI image, a generated report — any
deliverable a human would pay a few cents for.

---

## Files

```
web/index.html      Framework-free Phantom + Transaction Request demo   [to build]
docker-compose.yml  Full Next.js stack                                  ✓
```

Server routes live in `api-ts/src/checkout.ts` (shared with the Next.js page):
```
GET  /api/v1/checkout/:agentId         → { label, icon }
POST /api/v1/checkout/:agentId         → { transaction: base64 }   (server builds tx)
GET  /api/v1/checkout/status/:sig      → { status, result }        (watchReference)
```

## Env

`SELLER_WALLET` (recipient pubkey), `HELIUS_API_KEY` (RPC + watchReference). No buyer keypair —
the human's Phantom wallet signs.

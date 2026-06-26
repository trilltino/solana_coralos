# Expanding the Frontend

How to add to the React app in `examples/agent-economy/web/`. This is the *extend it* guide;
`docs/REACT_FRONTEND.md` is how it was built from scratch.

## The one rule
**The frontend only ever talks to the bridge.** It never imports CoralOS or hits Solana RPC directly
(except the wallet-adapter's read connection). So every feature is: *a bridge endpoint + a `fetch` +
some UI.* If you find yourself reaching for coral or web3 in a component, the logic belongs in the
**bridge** or an **agent**, not the UI.

```
component → src/api.ts (fetch) → bridge endpoint → CoralOS / Solana
```

## The map
```
web/src/
  main.tsx              wallet providers (Phantom + Solflare, devnet) + Buffer polyfill
  App.tsx               the tab shell + light/dark toggle
  api.ts                typed client for every bridge endpoint  ← add calls here
  hooks/
    useFeed.ts          poll a feed endpoint (autonomous / swarm)
    useCheckout.ts      Phantom pay → reference-bound transfer → proof
  components/
    AutonomousTab.tsx · CheckoutTab.tsx · SwarmTab.tsx
    Feed.tsx · SwarmFeed.tsx    render a conversation human-readably
  styles.css            CSS variables (themed); add classes here
```

Dev loop: `docker compose up -d coral bridge` then **`just ui`** → `http://localhost:5173`, hot reload.

---

## Recipe 1 — add a service to Checkout
The dropdown values map to the seller's `SERVICE` routing (per-order). Add an entry in `CheckoutTab.tsx`:
```tsx
const SERVICES = [
  // …existing…
  { id: 'coingecko', name: 'Crypto spot price', desc: 'a CoinGecko price' },
  { id: 'my-thing',  name: 'My service',        desc: 'what it returns' },  // ← seller must handle "my-thing"
]
```
If it takes input (like the AI prompt / news topic), add it to the `TEXT` map. The seller side is
`coral-agents/seller-agent/src/service.ts` — the dropdown is only the front door.

## Recipe 2 — add a whole new tab (like Swarm)
1. **A bridge endpoint** (in `bridge/server.ts`) that starts/serves your flow.
2. **api.ts** — a call for it:
   ```ts
   export const startThing = (): Promise<{ sessionId: string }> => POST('/thing/start')
   export const getThingFeed = (): Promise<{ running: boolean; messages: FeedMsg[] }> =>
     fetch('/thing/feed').then(json)
   ```
3. **A component** — reuse the feed pattern:
   ```tsx
   export function ThingTab() {
     const [running, setRunning] = useState(false)
     const messages = useFeed(running, getThingFeed)        // the generic hook takes any fetcher
     return <section>
       <button className="primary" onClick={async () => { await startThing(); setRunning(true) }}>Run</button>
       <Feed messages={messages} />
     </section>
   }
   ```
4. **Register it** in `App.tsx`: widen the `tab` union, add a nav `<button>`, and
   `{tab === 'thing' && <ThingTab />}`.

That's exactly how the Swarm tab was added — `SwarmTab` + `getSwarmFeed` + `SwarmFeed`.

## Recipe 3 — a read-only widget (e.g. earnings)
Add a bridge `GET` endpoint, fetch it, render:
```ts
// bridge/server.ts
app.get('/earnings', async (_req, res) =>
  res.json({ sol: (await new Connection(RPC).getBalance(new PublicKey(SELLER_WALLET))) / LAMPORTS_PER_SOL }))
```
```tsx
const [sol, setSol] = useState<number>()
useEffect(() => { fetch('/earnings').then(r => r.json()).then(d => setSol(d.sol)) }, [])
return <p>Seller has earned {sol} SOL</p>
```

## Recipe 4 — a custom feed renderer
Feeds are raw agent messages (`{ sender, text }`). To render them nicely, write a `describe(msg)`
that maps the text to a verb + detail — see `Feed.tsx` / `SwarmFeed.tsx`. Add a sender→label map and
a `.feed li.<class>` border color in `styles.css`.

## Recipe 5 — theming / styling
Everything is CSS variables under `:root` (dark) and `:root[data-theme='light']` in `styles.css`.
Change `--accent`, add component classes there. The light/dark toggle in `App.tsx` flips the
`data-theme` attribute and persists to `localStorage`.

## Recipe 6 — a wallet feature
The wallet lives in the adapter. In any component:
```tsx
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
const { publicKey, sendTransaction, connected } = useWallet()
```
To add a wallet, register its adapter in `main.tsx` (`new XxxWalletAdapter()`). To pay, copy the
reference-bound transfer in `hooks/useCheckout.ts`.

---

## Ship it
`npm run build` (or it's rebuilt when the bridge image builds). The bridge serves `dist/` at `:3010`.
For a fresh look without touching logic, you only edit `components/` + `styles.css`. For new
*behavior*, add a bridge endpoint first, then call it — never reach past the bridge.

See also: `docs/REACT_FRONTEND.md` (build from scratch), `examples/agent-economy/bridge/README.md`
(the endpoints), `docs/SWARM.md` (how the Swarm tab was added end-to-end).

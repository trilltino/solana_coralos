/**
 * Real-data proxy for the World Cup Oracle React app.
 *
 * The browser cannot hold the TxLINE API token or sign Solana transactions, so this tiny Node server
 * does it: on first request it subscribes the kit's buyer wallet to the free World Cup tier on devnet,
 * activates an API token, then serves live fixtures/odds to the React app (which only ever talks here).
 *
 * Verified working against devnet (2026-06). Two corrections vs. the published TxODDS examples:
 *   1. host is `txline-dev.txodds.com`           (the repo's `oracle-dev.txodds.com` does not resolve)
 *   2. mint is the treasury's `4Zao8o…`          (the IDL's `TXLINE_MINT` constant is stale -> InvalidMint)
 *
 * Run:  ANCHOR off — just `npx ts-node server/proxy.ts`  (reads BUYER_KEYPAIR_B58 from the repo .env)
 */
import http from 'node:http'
import fs from 'node:fs'
import axios from 'axios'
import * as anchor from '@coral-xyz/anchor'
import { PublicKey, SystemProgram, Keypair, Connection } from '@solana/web3.js'
import {
  TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount, getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { fileURLToPath } from 'node:url'
import { assertDevnet } from '@pay/agent-runtime'

const PROGRAM = new PublicKey('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J')
const MINT = new PublicKey('4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG') // real treasury mint
const BASE = process.env.TXLINE_BASE_URL ?? 'https://txline-dev.txodds.com'
const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const PORT = Number(process.env.PORT ?? 8801)
// fileURLToPath (not .pathname) so the repo-root .env resolves on macOS/Linux too, not just Windows.
const ENV_PATH = process.env.KIT_ENV ?? fileURLToPath(new URL('../../../.env', import.meta.url))

function buyerKeypair(): Keypair {
  const txt = fs.readFileSync(ENV_PATH, 'utf8')
  const m = txt.match(/^BUYER_KEYPAIR_B58=(.+)$/m)
  if (!m) throw new Error(`BUYER_KEYPAIR_B58 not in ${ENV_PATH}`)
  return Keypair.fromSecretKey(bs58.decode(m[1].trim()))
}

let jwt = ''
let apiToken = ''

/** Subscribe (free tier) + activate, once. Caches the resulting API token. */
async function ensureToken(): Promise<void> {
  if (apiToken) return
  const keypair = buyerKeypair()
  assertDevnet(RPC) // devnet-only: refuse a mainnet RPC unless ALLOW_MAINNET=1
  const connection = new Connection(RPC, 'confirmed')
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keypair), { commitment: 'confirmed' })
  const idl = (await anchor.Program.fetchIdl(PROGRAM, provider)) as anchor.Idl
  const program = new anchor.Program(idl, provider)

  jwt = (await axios.post(`${BASE}/auth/guest/start`)).data.token
  const ata = await getOrCreateAssociatedTokenAccount(
    connection, keypair, MINT, keypair.publicKey, false, 'confirmed', undefined, TOKEN_2022_PROGRAM_ID,
  )
  const [pricingMatrix] = PublicKey.findProgramAddressSync([Buffer.from('pricing_matrix')], PROGRAM)
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([Buffer.from('token_treasury_v2')], PROGRAM)
  const tokenTreasuryVault = getAssociatedTokenAddressSync(MINT, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID)

  const txSig = await (program.methods as any)
    .subscribe(1, 4) // service level 1 (free World Cup), 4 weeks
    .accounts({
      user: keypair.publicKey, pricingMatrix, tokenMint: MINT, userTokenAccount: ata.address,
      tokenTreasuryVault, tokenTreasuryPda, tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    })
    .rpc()

  const msg = new TextEncoder().encode(`${txSig}::${jwt}`)
  const walletSignature = Buffer.from(nacl.sign.detached(msg, keypair.secretKey)).toString('base64')
  const data = (await axios.post(
    `${BASE}/api/token/activate`,
    { txSig, walletSignature, leagues: [] },
    { headers: { Authorization: `Bearer ${jwt}` } },
  )).data
  apiToken = data.token || data
  if (typeof apiToken !== 'string' || !apiToken) throw new Error('activation returned no token')
  console.error('[proxy] subscribed + activated — serving live TxODDS data')
}

async function txGet(path: string): Promise<unknown> {
  await ensureToken()
  const res = await axios.get(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, 'X-Api-Token': apiToken },
  })
  return res.data
}

http
  .createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
    try {
      const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
      if (url.pathname === '/api/fixtures') {
        res.end(JSON.stringify(await txGet('/api/fixtures/snapshot')))
      } else if (url.pathname === '/api/odds') {
        res.end(JSON.stringify(await txGet(`/api/odds/snapshot/${url.searchParams.get('fixtureId') ?? ''}`)))
      } else {
        res.statusCode = 404
        res.end(JSON.stringify({ error: 'not found' }))
      }
    } catch (e) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: (e as Error).message, detail: (e as any)?.response?.data }))
    }
  })
  .listen(PORT, () => console.error(`[proxy] http://localhost:${PORT}  (GET /api/fixtures, /api/odds?fixtureId=)`))

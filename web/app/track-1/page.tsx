'use client'

import { useState, useEffect, useRef } from 'react'
import { Header } from '@/components/Header'

interface SessionEvent {
  time: string
  agent: string
  type: 'request' | 'payment' | 'delivery' | 'analysis' | 'error'
  text: string
  txSig?: string
}

interface AgentStatus {
  id: string
  label: string
  status: 'idle' | 'running' | 'waiting'
  lastAction?: string
}

const API = process.env.NEXT_PUBLIC_API_SERVER ?? 'http://localhost:8081'
const EXPLORER = 'https://explorer.solana.com/tx'

function fmt(d: Date) {
  return d.toTimeString().slice(0, 8)
}

function TxLink({ sig }: { sig: string }) {
  return (
    <a
      href={`${EXPLORER}/${sig}?cluster=devnet`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-solana-green underline text-xs ml-1"
    >
      {sig.slice(0, 8)}…↗
    </a>
  )
}

function AgentStatusCard({ agent }: { agent: AgentStatus }) {
  const colours = { idle: 'text-gray-500', running: 'text-solana-green', waiting: 'text-yellow-400' }
  const dots = { idle: 'bg-gray-500', running: 'bg-solana-green animate-pulse', waiting: 'bg-yellow-400 animate-pulse' }
  return (
    <div className="card flex items-start gap-3">
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dots[agent.status]}`} />
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${colours[agent.status]}`}>{agent.label}</p>
        {agent.lastAction && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{agent.lastAction}</p>
        )}
      </div>
    </div>
  )
}

export default function Track1Page() {
  const [agents, setAgents] = useState<AgentStatus[]>([
    { id: 'seller-agent', label: 'Seller Agent', status: 'idle' },
    { id: 'buyer-agent', label: 'Buyer Agent (Claude)', status: 'idle' },
  ])
  const [feed, setFeed] = useState<SessionEvent[]>([])
  const [totalPaid, setTotalPaid] = useState(0)
  const [cycles, setCycles] = useState(0)
  const feedRef = useRef<HTMLDivElement>(null)

  // Poll api-ts for agent state
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/v1/agents`)
        if (!res.ok) return
        const data: { id: string; status: string; actions: { action: string; detail: string }[] }[] = await res.json()

        setAgents(prev => prev.map(a => {
          const live = data.find(d => d.id === a.id)
          if (!live) return a
          const last = live.actions?.[live.actions.length - 1]
          return {
            ...a,
            status: live.status === 'running' ? 'running' : 'idle',
            lastAction: last ? `${last.action}: ${last.detail?.slice(0, 60)}` : undefined,
          }
        }))

        // Surface new payment/delivery events into the feed
        data.forEach(agent => {
          agent.actions?.forEach(act => {
            if (act.action === 'payment-received') {
              const sigMatch = act.detail?.match(/sig[=:]\s*(\w+)/i)
              setFeed(prev => {
                if (prev.some(e => e.txSig === sigMatch?.[1])) return prev
                const ev: SessionEvent = {
                  time: fmt(new Date()),
                  agent: agent.id,
                  type: 'payment',
                  text: 'Payment confirmed on-chain',
                  txSig: sigMatch?.[1],
                }
                setTotalPaid(n => n + 0.0001)
                setCycles(n => n + 1)
                return [...prev, ev]
              })
            }
            if (act.action === 'DELIVERED' || act.action === 'delivering-data') {
              setFeed(prev => {
                if (prev.some(e => e.text.startsWith('Delivered') && e.agent === agent.id)) return prev
                return [...prev, {
                  time: fmt(new Date()),
                  agent: agent.id,
                  type: 'delivery',
                  text: `Delivered: ${act.detail?.slice(0, 80)}`,
                }]
              })
            }
          })
        })
      } catch { /* api not ready */ }
    }

    const id = setInterval(poll, 2_000)
    return () => clearInterval(id)
  }, [])

  // Auto-scroll feed
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [feed])

  const typeColour = { request: 'text-gray-300', payment: 'text-solana-green', delivery: 'text-blue-400', analysis: 'text-purple-400', error: 'text-red-400' }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-10">

        <div className="mb-8">
          <div className="inline-flex items-center gap-2 badge-green mb-3 px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-solana-green animate-pulse" />
            <span className="text-xs">Track 1 — Pay-Per-Call API</span>
          </div>
          <h1 className="text-2xl font-bold mb-1">Live Agent Session</h1>
          <p className="text-gray-400 text-sm">
            Buyer agent autonomously pays seller for Jupiter swap quotes. Every transaction settles on Solana devnet.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Cycles completed', value: cycles },
            { label: 'SOL paid', value: `${totalPaid.toFixed(4)} SOL` },
            { label: 'Price per call', value: '0.0001 SOL' },
          ].map(s => (
            <div key={s.label} className="card text-center">
              <p className="text-lg font-bold text-white">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Agent status */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {agents.map(a => <AgentStatusCard key={a.id} agent={a} />)}
        </div>

        {/* Session feed */}
        <div className="card">
          <p className="text-xs font-semibold text-brand uppercase tracking-wide mb-3">Live Session Feed</p>
          <div ref={feedRef} className="space-y-1.5 max-h-72 overflow-y-auto font-mono text-xs">
            {feed.length === 0 && (
              <p className="text-gray-600 py-4 text-center">Waiting for agents to start…</p>
            )}
            {feed.map((ev, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="text-gray-600 shrink-0">{ev.time}</span>
                <span className="text-gray-500 shrink-0 w-24 truncate">{ev.agent}</span>
                <span className={typeColour[ev.type]}>
                  {ev.text}
                  {ev.txSig && <TxLink sig={ev.txSig} />}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Fork prompt */}
        <div className="mt-6 card border-brand/20">
          <p className="text-xs font-semibold text-brand uppercase tracking-wide mb-2">Fork this track</p>
          <p className="text-xs text-gray-400 mb-2">Change what the seller delivers — replace the function in one file:</p>
          <pre className="text-xs text-gray-300 bg-black/40 rounded p-3 overflow-x-auto">
{`// coral-agents/seller-agent/src/service.ts
export async function deliverService(request: string) {
  // ← your service here
}`}
          </pre>
        </div>

      </main>
    </div>
  )
}

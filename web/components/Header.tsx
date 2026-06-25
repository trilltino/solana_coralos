'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
)

const TRACKS = [
  { href: '/track-1', label: 'Track 1', sub: 'Pay-Per-Call' },
  { href: '/track-2', label: 'Track 2', sub: 'Checkout' },
]

export function Header() {
  const pathname = usePathname()

  return (
    <header className="border-b border-[#1e1e2e] bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-brand font-bold text-lg">sol_coralos</span>
          <span className="badge-gray">devnet</span>
        </Link>

        {/* Track nav */}
        <nav className="flex items-center gap-1">
          {TRACKS.map(t => {
            const active = pathname.startsWith(t.href)
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex flex-col items-center leading-tight ${
                  active
                    ? 'bg-brand/20 text-brand'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>{t.label}</span>
                <span className={`text-[10px] ${active ? 'text-brand/70' : 'text-gray-600'}`}>{t.sub}</span>
              </Link>
            )
          })}
        </nav>

        {/* Wallet */}
        <WalletMultiButton
          style={{
            background: '#9945FF',
            borderRadius: '8px',
            fontSize: '14px',
            height: '36px',
            padding: '0 16px',
          }}
        />
      </div>
    </header>
  )
}

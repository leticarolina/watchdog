import { useEffect, useState } from 'react'
import { API_BASE } from './config'
import { AgentPanel } from './components/AgentPanel'
import { TxFeed, type TxItem } from './components/TxFeed'
import { ContractState, type AgentInfo } from './components/ContractState'
import watchdogIcon from './assets/watchdog.png'
import logoName from './assets/logo-name.png'
import landPage from './assets/landpage.png'
import './index.css'

interface Config {
  contractLimits: { maxSinglePayment: number; dailyBudget: number }
  endpointPricing: { basic: number; deep: number }
}

const STROOPS_PER_XLM = 10_000_000

function toXLM(stroops: number): number {
  return stroops / STROOPS_PER_XLM
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10)
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

function LandingPage({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#F4F1EB' }}>
      {/* Logo */}
      <div className="flex flex-col items-center">
        {/* <img src={watchdogIcon} alt="Watchdog icon" className="w-80 h-80 object-contain" />
        <img src={logoName} alt="WATCHDOG" className="h-12 object-contain" style={{ width: '420px' }} /> */}
        <img src={landPage} alt="Logo" className="mt-6 w-full max-w-md object-contain" />
      </div>

      {/* Tagline */}
      <p className="text-base mb-10 mt-10 text-center" style={{ color: '#1B3A4B', opacity: 0.7 }}>
      Real-time payment risk engine for autonomous agents on Stellar.
      </p>

      {/* Feature pills */}
      {/* <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
        {[
          { icon: '🛡', label: 'Single Payment Limit' },
          { icon: '📊', label: 'Daily Budget Cap' },
          { icon: '⛓', label: 'On-Chain Enforcement' },
        ].map(({ icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border"
            style={{ background: 'white', borderColor: '#1B3A4B22', color: '#1B3A4B' }}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </div>
        ))}
      </div> */}

      {/* CTA */}
      <button
        onClick={onLaunch}
        className="mb-14 px-8 py-3.5 rounded-md text-white font-semibold text-base shadow-sm hover:opacity-90 transition-opacity"
        style={{ background: '#1B3A4B' }}
      >
        Launch Demo
      </button>

      {/* Footer */}
      <p className="absolute bottom-6 text-xs" style={{ color: '#1B3A4B', opacity: 0.4 }}>
        Built for Stellar Agents Hackathon 2026
      </p>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<'landing' | 'dashboard'>('landing')
  const [config, setConfig] = useState<Config | null>(null)
  const [agent, setAgent] = useState<AgentInfo | null>(null)
  const [txItems, setTxItems] = useState<TxItem[]>([])
  const [spentXLM, setSpentXLM] = useState(0)
  const [resetLoading, setResetLoading] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/api/config`).then((r) => r.json()).then(setConfig).catch(console.error)
    fetch(`${API_BASE}/api/agent`)
      .then((r) => r.json())
      .then((data: AgentInfo) => {
        setAgent(data)
        if (data.cumulative24h) setSpentXLM(data.cumulative24h / STROOPS_PER_XLM)
      })
      .catch(console.error)
  }, [])

  function handleStart(type: 'basic' | 'deep', amountXLM: number): string {
    const id = makeId()
    setTxItems((prev) => [
      { id, type, status: 'pending', amountXLM, timestamp: new Date() },
      ...prev,
    ])
    return id
  }

  function handleApproved(
    pendingId: string,
    amountXLM: number,
    paymentTxHash: string,
    watchdogTxHash: string,
  ) {
    setTxItems((prev) =>
      prev.map((item) =>
        item.id === pendingId
          ? { ...item, status: 'approved', paymentTxHash, watchdogTxHash }
          : item,
      ),
    )
    setSpentXLM((prev) => prev + amountXLM)
  }

  function handleBlocked(pendingId: string, _amountXLM: number, reason: string) {
    setTxItems((prev) =>
      prev.map((item) =>
        item.id === pendingId ? { ...item, status: 'blocked', reason } : item,
      ),
    )
  }

  async function handleReset() {
    setResetLoading(true)
    try {
      const resetData: AgentInfo & { success?: boolean; error?: string } =
        await fetch(`${API_BASE}/api/reset`, { method: 'POST' }).then((r) => r.json())
      if (resetData.error) {
        console.error('[reset]', resetData.error)
        return
      }
      setAgent(resetData)
      setTxItems([])

      // Fetch real on-chain state and refresh config in parallel
      const [agentState, newConfig] = await Promise.all([
        fetch(`${API_BASE}/api/agent/state`).then((r) => r.json()).catch(() => null),
        fetch(`${API_BASE}/api/config`).then((r) => r.json()).catch(() => null),
      ])
      if (agentState) {
        setSpentXLM(agentState.spent / STROOPS_PER_XLM)
      }
      if (newConfig) {
        setConfig(newConfig)
      }
    } catch {
      // ignore
    } finally {
      setResetLoading(false)
    }
  }

  const basicPriceXLM = config ? toXLM(config.endpointPricing.basic) : 2
  const deepPriceXLM = config ? toXLM(config.endpointPricing.deep) : 7
  const maxSinglePaymentXLM = config ? toXLM(config.contractLimits.maxSinglePayment) : 6
  const dailyBudgetXLM = config ? toXLM(config.contractLimits.dailyBudget) : 10

  if (view === 'landing') {
    return <LandingPage onLaunch={() => setView('dashboard')} />
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#F4F1EB' }}>
      {/* Navbar */}
      <header className="px-8 mt-2 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo — click to return to landing */}
          <button
            onClick={() => setView('landing')}
            className="flex items-center hover:opacity-75 transition-opacity"
          >
            <img src={watchdogIcon} alt="Watchdog" className="h-16 w-16 object-contain" />
            <img src={logoName} alt="WATCHDOG" className="h-5 object-contain" />
          </button>

          {/* Nav actions */}
          <a
            href="https://stellar.expert/explorer/testnet/contract/CDK4XFYOHDCJTRXNM4I56ZYUEVLQIRLRLOT7R6XRRYSGPBTGXXSB7DVH"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 border text-sm font-medium rounded-lg px-4 py-2 transition-opacity hover:opacity-75"
            style={{ borderColor: '#2A617040', color: '#2A6170', background: '#2A617008' }}
          >
            Smart Contract ↗
          </a>
        </div>
      </header>

      {/* Two-column layout */}
      <main className="flex-1 min-h-0 max-w-7xl w-full mx-auto px-8 pb-6 grid grid-cols-[1fr_340px] gap-5">
        {/* Left column: action bar + feed */}
        <div className="flex flex-col gap-4 min-h-0">
          <AgentPanel
            basicPriceXLM={basicPriceXLM}
            deepPriceXLM={deepPriceXLM}
            onStart={handleStart}
            onApproved={handleApproved}
            onBlocked={handleBlocked}
            onReset={handleReset}
            resetLoading={resetLoading}
          />
          <TxFeed items={txItems} />
        </div>

        {/* Right column: contract state */}
        <ContractState
          maxSinglePaymentXLM={maxSinglePaymentXLM}
          dailyBudgetXLM={dailyBudgetXLM}
          spentXLM={spentXLM}
          agent={agent}
        />
      </main>
    </div>
  )
}

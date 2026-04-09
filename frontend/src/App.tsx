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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6" style={{ background: '#fef5e1'}}>
      {/* Logo */}
      <div className="flex flex-col items-center fade-up-0">
        {/* <img src={watchdogIcon} alt="Watchdog icon" className="w-80 h-80 object-contain" />
        <img src={logoName} alt="WATCHDOG" className="h-12 object-contain" style={{ width: '420px' }} /> */}
        <img src={landPage} alt="Logo" className="w-full max-w-48 sm:max-w-sm lg:max-w-md object-contain" />
      </div>

      {/* Tagline */}
      <p className="sm:text-xl mb-6 mt-6 text-center  tracking-tight fade-up-1" style={{ color: '#1B3A4B', fontFamily: "'Space Grotesk', sans-serif" }}>
        AI agents can now spend money.<br /> Watchdog makes sure they <span className='text-[#ff9901] font-semibold'>can't overspend.</span> 
      </p>


      {/* CTA */}
      <button
        onClick={onLaunch}
        className="mb-12 px-8 py-4 rounded-lg font-semibold text-base shadow-sm hover:opacity-70 transition-opacity text-[#1B3A4B] text-md fade-up-1 hover:shadow-lg hover:-translate-y-0.5 hover:tarnsition-transform hover:scale-[1.02] transition-transform"
        style={{ background: '#ff9901' }}
      >
        Launch Demo
      </button>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-2xl w-full mb-4 ">
        <div className="group rounded-xl border border-gray-300 px-3 py-2 flex flex-col gap-1 cursor-default transition-all hover:border-[#2A6170]/40 hover:bg-white/60">
          <div className="flex items-center justify-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2A6170" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M12 2l7 4v6c0 4.418-3.134 8.385-7 9.5C8.134 20.385 5 16.418 5 12V6l7-4z" />
            </svg>
            <p className="font-semibold text-xs uppercase tracking-wide" style={{ color: '#1B3A4B' }}>Cap each purchase</p>
          </div>
          <p className="text-xs text-[#1B3A4B]/60 max-h-0 overflow-hidden group-hover:max-h-8 transition-all duration-300 ease-in-out text-center">
            Max XLM per single agent transaction
          </p>
        </div>

        <div className="group rounded-xl border border-gray-300 px-3 py-2 flex flex-col gap-1 cursor-default transition-all hover:border-[#2A6170]/40 hover:bg-white/60">
          <div className="flex items-center justify-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2A6170" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <rect x="3" y="12" width="4" height="9" rx="1" />
              <rect x="10" y="7" width="4" height="14" rx="1" />
              <rect x="17" y="3" width="4" height="18" rx="1" />
            </svg>
            <p className="font-semibold text-xs uppercase tracking-wide" style={{ color: '#1B3A4B' }}>Set a daily limit</p>
          </div>
          <p className="text-xs text-[#1B3A4B]/60 max-h-0 overflow-hidden group-hover:max-h-8 transition-all duration-300 ease-in-out text-center">
            Total spend cap across a 24-hour window
          </p>
        </div>

        <div className="group rounded-xl border border-gray-300 px-3 py-2 flex flex-col gap-1 cursor-default transition-all hover:border-[#2A6170]/40 hover:bg-white/60 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2A6170" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
            <p className="font-semibold text-xs uppercase tracking-wide" style={{ color: '#1B3A4B' }}>On-Chain Rules</p>
          </div>
          <p className="text-xs text-[#1B3A4B]/60 max-h-0 overflow-hidden group-hover:max-h-8 transition-all duration-300 ease-in-out text-center">
            Rules live in a Soroban contract, not the server
          </p>
        </div>
      </div>


      {/* Footer */}
      <p className="absolute bottom-6 text-xs text-[#1B3A4B]/60">
        <a href="https://www.letiazevedo.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[#1B3A4B] transition-colors duration-200"
        > Leticia Azevedo </a>
         - Built for Stellar Agents Hackathon 2026
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
    fetch(`${API_BASE}/config`).then((r) => r.json()).then(setConfig).catch(console.error)
    fetch(`${API_BASE}/agent`)
      .then((r) => r.json())
      .then((data: AgentInfo) => {
        setAgent(data)
        // Always sync spent from on-chain state (authoritative), not backend in-memory
        fetch(`${API_BASE}/agent/state`)
          .then((r) => r.json())
          .then((state) => {
            if (state?.spent != null) setSpentXLM(state.spent / STROOPS_PER_XLM)
            else if (data.cumulative24h) setSpentXLM(data.cumulative24h / STROOPS_PER_XLM)
          })
          .catch(() => {
            if (data.cumulative24h) setSpentXLM(data.cumulative24h / STROOPS_PER_XLM)
          })
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
        await fetch(`${API_BASE}/reset`, { method: 'POST' }).then((r) => r.json())
      if (resetData.error) {
        console.error('[reset]', resetData.error)
        return
      }
      setAgent(resetData)
      setTxItems([])

      // Fetch real on-chain state and refresh config in parallel
      const [agentState, newConfig] = await Promise.all([
        fetch(`${API_BASE}/agent/state`).then((r) => r.json()).catch(() => null),
        fetch(`${API_BASE}/config`).then((r) => r.json()).catch(() => null),
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

  const basicPriceXLM = config ? toXLM(config.endpointPricing.basic) : 3
  const deepPriceXLM = config ? toXLM(config.endpointPricing.deep) : 7
  const maxSinglePaymentXLM = config ? toXLM(config.contractLimits.maxSinglePayment) : 6
  const dailyBudgetXLM = config ? toXLM(config.contractLimits.dailyBudget) : 10

  if (view === 'landing') {
    return <LandingPage onLaunch={() => setView('dashboard')} />
  }

  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:overflow-hidden" style={{ background: '#F4F1EB'  }}>
      {/* Navbar */}
      <header className="px-4 sm:px-6 lg:px-8 mt-2 mb-4 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo — click to return to landing */}
          <button
            onClick={() => setView('landing')}
            className="flex items-center hover:opacity-75 transition-opacity"
          >
            <img src={watchdogIcon} alt="Watchdog" className="h-10 w-10 lg:h-16 lg:w-16 object-contain" />
            <img src={logoName} alt="WATCHDOG" className="h-5 object-contain" />
          </button>

          {/* Nav actions */}
          <a
            href="https://stellar.expert/explorer/testnet/contract/CDK4XFYOHDCJTRXNM4I56ZYUEVLQIRLRLOT7R6XRRYSGPBTGXXSB7DVH"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:flex items-center gap-1.5 border text-sm font-medium rounded-lg px-4 py-2 transition-opacity hover:opacity-75"
            style={{ borderColor: '#2A617040', color: '#2A6170', background: '#dfe8f2' }}
          >
            Smart Contract ↗
          </a>
        </div>
      </header>

      {/* Two-column layout */}
      <main className="flex-1 lg:min-h-0 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pb-6 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
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

import { useEffect, useState } from 'react'

export interface AgentInfo {
  currentAgent: string
  agentIndex: number
  totalAgents: number
  cumulativeSpent?: number // stroops, from contract
  windowStart?: number // unix seconds, from contract — 0 if the agent hasn't spent yet
}

interface ContractStateProps {
  maxSinglePaymentXLM: number
  dailyBudgetXLM: number
  windowSeconds: number
  spentXLM: number
  agent: AgentInfo | null
  onReset?: () => void
  resetLoading?: boolean
  resetError?: string | null
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length <= 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

/** Formats a window length in seconds into a short human string (24h, 90m, 1d, ...). */
function formatWindow(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s'
  if (seconds % 86400 === 0) return `${seconds / 86400}d`
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  if (seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}

/** Formats a countdown in seconds as MM:SS. */
function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function ContractState({ maxSinglePaymentXLM, dailyBudgetXLM, windowSeconds, spentXLM, agent, onReset, resetLoading, resetError }: ContractStateProps) {
  const remaining = Math.max(0, dailyBudgetXLM - spentXLM)
  const usedPct = dailyBudgetXLM > 0 ? Math.min(1, spentXLM / dailyBudgetXLM) : 0
  const remainingPct = dailyBudgetXLM > 0 ? remaining / dailyBudgetXLM : 1

  const barColor = remainingPct > 0.5 ? '#2A6170' : remainingPct > 0.2 ? '#E99E33' : '#dc2626'
  const remainingColor = remainingPct > 0.5 ? '#16a34a' : remainingPct > 0.2 ? '#E99E33' : '#dc2626'

  // Live MM:SS countdown until the agent's budget window resets.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const windowStart = agent?.windowStart ?? 0
  const hasActiveWindow = windowStart > 0
  const resetAtMs = hasActiveWindow ? (windowStart + windowSeconds) * 1000 : 0
  const secondsRemaining = hasActiveWindow ? Math.max(0, Math.ceil((resetAtMs - nowMs) / 1000)) : 0
  const countdownLabel = !hasActiveWindow
    ? 'No active window yet'
    : secondsRemaining > 0
      ? `Resets in ${formatCountdown(secondsRemaining)}`
      : 'Ready to reset'

  return (
    <div
      className="bg-white rounded-xl shadow-sm border p-6 flex flex-col gap-5 h-full"
      style={{ borderColor: '#1B3A4B14' }}
    >
      {/* Title */}
      <h2 className="text-base font-semibold" style={{ color: '#1B3A4B' }}>
        Contract State
      </h2>

      {/* Contract Rules */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#1B3A4B', opacity: 0.45 }}>
          Rules
        </p>
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg px-3 py-3 flex flex-col gap-0.5 border-l-4" style={{ background: '#B91C1C12', borderColor: '#B91C1C' }}>
            <span className="text-xs font-medium" style={{ color: '#B91C1C', opacity: 0.8 }}>Max per payment</span>
            <span className="text-2xl font-bold tabular-nums leading-tight" style={{ color: '#B91C1C' }}>
              {maxSinglePaymentXLM}
              <span className="text-sm font-normal ml-1" style={{ opacity: 0.6 }}>XLM</span>
            </span>
          </div>
          <div className="flex-1 rounded-lg px-3 py-3 flex flex-col gap-0.5 border-l-4" style={{ background: '#C47A1512', borderColor: '#C47A15' }}>
            <span className="text-xs font-medium" style={{ color: '#C47A15', opacity: 0.9 }}>Budget cap ({formatWindow(windowSeconds)})</span>
            <span className="text-2xl font-bold tabular-nums leading-tight" style={{ color: '#C47A15' }}>
              {dailyBudgetXLM}
              <span className="text-sm font-normal ml-1" style={{ opacity: 0.6 }}>XLM</span>
            </span>
          </div>
        </div>
      </div>

      <div className="border-t" style={{ borderColor: '#1B3A4B12' }} />

      {/* Budget window usage */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#1B3A4B', opacity: 0.45 }}>
            Budget Window ({formatWindow(windowSeconds)})
          </p>
          <span className="text-xs font-mono tabular-nums" style={{ color: '#1B3A4B', opacity: 0.5 }}>
            {countdownLabel}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-5 rounded-full overflow-hidden" style={{ background: '#1B3A4B12' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${usedPct * 100}%`, background: barColor }}
          />
        </div>

        {/* Spent ← → Remaining anchors */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs mb-0.5" style={{ color: '#1B3A4B', opacity: 0.45 }}>Spent</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: '#1B3A4B' }}>
              {spentXLM.toFixed(1)} <span className="text-sm font-normal opacity-50">XLM</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs mb-0.5" style={{ color: '#1B3A4B', opacity: 0.45 }}>Remaining</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: remainingColor }}>
              {remaining.toFixed(1)} <span className="text-sm font-normal" style={{ color: '#1B3A4B', opacity: 0.5 }}>XLM</span>
            </p>
          </div>
        </div>
      </div>

      <div className="border-t" style={{ borderColor: '#1B3A4B12' }} />

      {/* Agent */}
      {agent && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#1B3A4B', opacity: 0.4 }}>
            Agent
          </p>

          {agent.totalAgents > 0 && (
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wide"
                style={{
                  background: agent.agentIndex === 0 ? '#2A617018' : '#7c3aed18',
                  color: agent.agentIndex === 0 ? '#2A6170' : '#7c3aed',
                }}
              >
                Agent {agent.agentIndex === 0 ? 'A' : 'B'}
              </span>
              <span className="text-xs" style={{ color: '#1B3A4B', opacity: 0.4 }}>
                {agent.agentIndex + 1} of {agent.totalAgents}
              </span>
            </div>
          )}

          <a
            href={`https://stellar.expert/explorer/testnet/account/${agent.currentAgent}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-3 py-2.5 block transition-opacity hover:opacity-70"
            style={{ background: '#1B3A4B08' }}
          >
            <p className="font-mono text-xs break-all leading-relaxed" style={{ color: '#1B3A4B' }}>
              {truncateAddress(agent.currentAgent)}
            </p>
          </a>

          {onReset && (
            <div className="flex flex-col items-center gap-1.5 mt-1">
              <button
                onClick={onReset}
                disabled={resetLoading}
                className="w-full text-white rounded-lg px-5 py-4 flex flex-col items-start gap-1 transition-opacity hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed text-left whitespace-nowrap"
                style={{ background: '#95ba9c' }}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs uppercase tracking-widest opacity-70">Reset Demo</span>
                  {resetLoading
                    ? <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <span className="text-base">↺</span>
                  }
                </div>
                <p className="text-xl font-bold">New Agent</p>
              </button>
              <p className="text-xs" style={{ color: '#1B3A4B', opacity: 0.45 }}>Switch to a fresh budget window</p>
              {resetError && (
                <p role="alert" className="text-xs text-center" style={{ color: '#dc2626' }}>
                  {resetError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export interface AgentInfo {
  currentAgent: string
  agentIndex: number
  totalAgents: number
  cumulative24h?: number // stroops, from contract
}

interface ContractStateProps {
  maxSinglePaymentXLM: number
  dailyBudgetXLM: number
  spentXLM: number
  agent: AgentInfo | null
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length <= 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function ContractState({ maxSinglePaymentXLM, dailyBudgetXLM, spentXLM, agent }: ContractStateProps) {
  const remaining = Math.max(0, dailyBudgetXLM - spentXLM)
  const usedPct = dailyBudgetXLM > 0 ? Math.min(1, spentXLM / dailyBudgetXLM) : 0
  const remainingPct = dailyBudgetXLM > 0 ? remaining / dailyBudgetXLM : 1

  const barColor = remainingPct > 0.5 ? '#2A6170' : remainingPct > 0.2 ? '#E99E33' : '#dc2626'
  const remainingColor = remainingPct > 0.5 ? '#16a34a' : remainingPct > 0.2 ? '#E99E33' : '#dc2626'

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
            <span className="text-xs font-medium" style={{ color: '#C47A15', opacity: 0.9 }}>Daily limit</span>
            <span className="text-2xl font-bold tabular-nums leading-tight" style={{ color: '#C47A15' }}>
              {dailyBudgetXLM}
              <span className="text-sm font-normal ml-1" style={{ opacity: 0.6 }}>XLM</span>
            </span>
          </div>
        </div>
      </div>

      <div className="border-t" style={{ borderColor: '#1B3A4B12' }} />

      {/* Daily Budget usage */}
      <div className="flex flex-col gap-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#1B3A4B', opacity: 0.45 }}>
          Daily Budget
        </p>

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
          {agent.totalAgents > 0 && (
            <p className="text-xs text-center" style={{ color: '#1B3A4B', opacity: 0.4 }}>
              Agent {agent.agentIndex + 1} of {agent.totalAgents}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

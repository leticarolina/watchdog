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

      {/* Limit cards */}
      <div className="flex flex-col gap-3">
        <div className="rounded-lg p-4" style={{ background: '#1B3A4B08' }}>
          <p className="text-xs mb-1.5" style={{ color: '#1B3A4B', opacity: 0.5 }}>Max Single Payment</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: '#1B3A4B' }}>
            {maxSinglePaymentXLM}
            <span className="text-base font-normal ml-1" style={{ opacity: 0.5 }}>XLM</span>
          </p>
        </div>
        <div className="rounded-lg p-4" style={{ background: '#1B3A4B08' }}>
          <p className="text-xs mb-1.5" style={{ color: '#1B3A4B', opacity: 0.5 }}>Daily Budget</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: '#1B3A4B' }}>
            {dailyBudgetXLM}
            <span className="text-base font-normal ml-1" style={{ opacity: 0.5 }}>XLM</span>
          </p>
        </div>
      </div>

      <div className="border-t" style={{ borderColor: '#1B3A4B12' }} />

      {/* Spent today */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#1B3A4B', opacity: 0.45 }}>
            Spent Today
          </p>
          <span className="text-sm font-bold tabular-nums" style={{ color: '#1B3A4B', opacity: 0.6 }}>
            {spentXLM.toFixed(1)} / {dailyBudgetXLM} XLM
          </span>
        </div>
        <div className="h-3 rounded-full overflow-hidden mb-3" style={{ background: '#1B3A4B12' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${usedPct * 100}%`, background: barColor }}
          />
        </div>
        <p className="text-xl font-bold tabular-nums" style={{ color: remainingColor }}>
          {remaining.toFixed(1)} XLM
          <span className="text-sm font-normal ml-1.5" style={{ color: '#1B3A4B', opacity: 0.45 }}>remaining</span>
        </p>
      </div>

      <div className="border-t" style={{ borderColor: '#1B3A4B12' }} />

      {/* Agent */}
      {agent && (
        <div className="flex flex-col gap-3">
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

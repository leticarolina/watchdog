import { useState } from 'react'
import { API_BASE } from '../config'

interface AgentPanelProps {
  basicPriceXLM: number
  deepPriceXLM: number
  onStart: (type: 'basic' | 'deep', amountXLM: number) => string
  onApproved: (pendingId: string, amountXLM: number, paymentTxHash: string, watchdogTxHash: string) => void
  onBlocked: (pendingId: string, amountXLM: number, reason: string) => void
  onReset?: () => void
  resetLoading?: boolean
}

const DRAIN_MAX_ATTEMPTS = 6
const DRAIN_DELAY_MS = 4000

export function AgentPanel({ basicPriceXLM, deepPriceXLM, onStart, onApproved, onBlocked, onReset, resetLoading }: AgentPanelProps) {
  const [basicLoading, setBasicLoading] = useState(false)
  const [deepLoading, setDeepLoading] = useState(false)
  const [drainLoading, setDrainLoading] = useState(false)

  const anyLoading = basicLoading || deepLoading || drainLoading || !!resetLoading

  async function runBasic() {
    setBasicLoading(true)
    const pendingId = onStart('basic', basicPriceXLM)
    try {
      const res = await fetch(`${API_BASE}/run/basic`)
      const data = await res.json()
      if (data.success) {
        onApproved(pendingId, basicPriceXLM, data.paymentTxHash ?? '', data.watchdogTxHash ?? '')
      } else if (data.blocked) {
        onBlocked(pendingId, basicPriceXLM, data.reason ?? 'Unknown')
      } else {
        onBlocked(pendingId, basicPriceXLM, data.error ?? 'Unknown')
      }
    } catch {
      onBlocked(pendingId, basicPriceXLM, 'NetworkError')
    } finally {
      setBasicLoading(false)
    }
  }

  async function runDeep() {
    setDeepLoading(true)
    const pendingId = onStart('deep', deepPriceXLM)
    try {
      const res = await fetch(`${API_BASE}/run/deep`)
      const data = await res.json()
      if (data.success) {
        onApproved(pendingId, deepPriceXLM, data.paymentTxHash ?? '', data.watchdogTxHash ?? '')
      } else if (data.blocked) {
        onBlocked(pendingId, deepPriceXLM, data.reason ?? 'Unknown')
      } else {
        onBlocked(pendingId, deepPriceXLM, data.error ?? 'Unknown')
      }
    } catch {
      onBlocked(pendingId, deepPriceXLM, 'NetworkError')
    } finally {
      setDeepLoading(false)
    }
  }

  async function runDrain() {
    setDrainLoading(true)
    try {
      for (let i = 0; i < DRAIN_MAX_ATTEMPTS; i++) {
        const pendingId = onStart('basic', basicPriceXLM)
        try {
          const res = await fetch(`${API_BASE}/run/basic`)
          const data = await res.json()
          if (data.success) {
            onApproved(pendingId, basicPriceXLM, data.paymentTxHash ?? '', data.watchdogTxHash ?? '')
          } else if (data.blocked) {
            onBlocked(pendingId, basicPriceXLM, data.reason ?? 'Unknown')
            if (data.reason === 'DailyBudgetExceeded') break
          } else {
            onBlocked(pendingId, basicPriceXLM, data.error ?? 'Unknown')
          }
        } catch {
          onBlocked(pendingId, basicPriceXLM, 'NetworkError')
          break
        }
        if (i < DRAIN_MAX_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, DRAIN_DELAY_MS))
        }
      }
    } finally {
      setDrainLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border px-5 py-5 flex items-start gap-3" style={{ borderColor: '#1B3A4B14' }}>
      {/* Basic Data */}
      <div className="flex flex-col items-center gap-1.5 flex-1">
        <button
          onClick={runBasic}
          disabled={anyLoading}
          className="w-full text-white font-medium rounded-lg px-4 py-3.5 flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          style={{ background: '#1B3A4B' }}
        >
          {basicLoading ? (
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>▶</span>
          )}
          Basic Data
        </button>
        <p className="text-xs" style={{ color: '#1B3A4B', opacity: 0.45 }}>
          <strong>{basicPriceXLM} XLM</strong> · Basic Analysis
        </p>
      </div>

      {/* Expensive Data */}
      <div className="flex flex-col items-center gap-1.5 flex-1">
        <button
          onClick={runDeep}
          disabled={anyLoading}
          className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-3.5 flex items-center justify-center gap-2 transition-colors text-sm"
        >
          {deepLoading ? (
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>⚠</span>
          )}
          Expensive Data
        </button>
        <p className="text-xs" style={{ color: '#1B3A4B', opacity: 0.45 }}>
          <strong>{deepPriceXLM} XLM</strong> · Deep Analysis
        </p>
      </div>

      {/* Drain Attempt */}
      <div className="flex flex-col items-center gap-1.5 flex-1">
        <button
          onClick={runDrain}
          disabled={anyLoading}
          className="w-full text-white font-medium rounded-lg px-4 py-3.5 flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
          style={{ background: drainLoading ? '#b97d1a' : '#E99E33' }}
        >
          {drainLoading ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Running...
            </>
          ) : (
            <>
              <span>⚡</span>
              Drain Attempt
            </>
          )}
        </button>
        <p className="text-xs" style={{ color: '#1B3A4B', opacity: 0.45 }}>
          <strong>auto</strong> · Until exhausted
        </p>
      </div>

      {/* Divider */}
      {onReset && (
        <>
          <div className="w-px self-stretch mx-1" style={{ background: '#1B3A4B14' }} />

          {/* Reset Demo */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={onReset}
              disabled={anyLoading}
              className="flex items-center gap-1.5 border text-sm font-medium rounded-lg px-4 py-3.5 transition-opacity hover:opacity-75 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              style={{ borderColor: '#2A617060', color: '#2A6170' }}
            >
              {resetLoading ? (
                <span className="inline-block w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#2A6170', borderTopColor: 'transparent' }} />
              ) : (
                <span>↺</span>
              )}
              Reset Demo
            </button>
            <p className="text-xs" style={{ color: '#1B3A4B', opacity: 0.45 }}>
              new agent
            </p>
          </div>
        </>
      )}
    </div>
  )
}

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
    <div className="bg-white rounded-xl shadow-sm border px-5 py-5 flex flex-col sm:grid sm:grid-cols-2 lg:flex lg:flex-row lg:items-stretch gap-3" style={{ borderColor: '#1B3A4B14' }}>
      {/* Basic Data */}
      <div className="flex flex-col items-center gap-1.5 lg:flex-1">
        <button
          onClick={runBasic}
          disabled={anyLoading}
          className="w-full text-white rounded-lg px-5 py-4 flex flex-col items-start gap-1 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-left"
          style={{ background: '#1B3A4B' }}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs uppercase tracking-widest opacity-70">Basic Analysis</span>
            {basicLoading
              ? <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <span className="text-base">▶</span>
            }
          </div>
          <p className="text-xl font-bold">{basicPriceXLM} XLM</p>
        </button>
        <p className="text-xs" style={{ color: '#1B3A4B', opacity: 0.45 }}>Run a standard agent analysis</p>
      </div>

      {/* Expensive Data */}
      <div className="flex flex-col items-center gap-1.5 lg:flex-1">
        <button
          onClick={runDeep}
          disabled={anyLoading}
          className="w-full text-white rounded-lg px-5 py-4 flex flex-col items-start gap-1 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-left"
          style={{ background: '#f85a0c'}}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs  uppercase tracking-widest opacity-70">Deep Analysis</span>
            {deepLoading
              ? <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <span className="text-base">⚠</span>
            }
          </div>
          <p className="text-xl font-bold">{deepPriceXLM} XLM</p>
        </button>
        <p className="text-xs" style={{ color: '#1B3A4B', opacity: 0.45 }}>Triggers single-payment limit</p>
      </div>

      {/* Drain Attempt */}
      <div className="flex flex-col items-center gap-1.5 lg:flex-1">
        <button
          onClick={runDrain}
          disabled={anyLoading}
          className="w-full text-white rounded-lg px-5 py-4 flex flex-col items-start gap-1 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-left"
          style={{ background: '#ffb913' }}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs uppercase tracking-widest opacity-70">Drain Budget</span>
            {drainLoading
              ? <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <span className="text-base">⚡</span>
            }
          </div>
          <p className="text-xl font-bold">Auto-repeat</p>
        </button>
        <p className="text-xs" style={{ color: '#1B3A4B', opacity: 0.45 }}>Spams basic until daily limit hit</p>
      </div>

      {/* Divider + Reset Demo */}
      {onReset && (
        <>
          <div className="hidden lg:block w-px self-stretch mx-1" style={{ background: '#1B3A4B14' }} />
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={onReset}
              disabled={anyLoading}
              className="w-full text-white rounded-lg px-5 py-4 flex flex-col items-start gap-1 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-left whitespace-nowrap"
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
            <p className="text-xs" style={{ color: '#1B3A4B', opacity: 0.45 }}>Switch to a fresh 24h window</p>
          </div>
        </>
      )}
    </div>
  )
}

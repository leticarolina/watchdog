import { useEffect, useState } from 'react'

export interface TxItem {
  id: string
  type: 'basic' | 'deep'
  status: 'pending' | 'approved' | 'blocked'
  amountXLM: number
  reason?: string
  paymentTxHash?: string
  watchdogTxHash?: string
  timestamp: Date
}

function truncateHash(hash: string, head = 8, tail = 8): string {
  if (!hash || hash.length <= head + tail + 3) return hash
  return `${hash.slice(0, head)}...${hash.slice(-tail)}`
}

function relativeTime(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 11) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

function ExplorerLink({ hash, label }: { hash: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium w-24 shrink-0" style={{ color: '#1B3A4B', opacity: 0.45 }}>{label}</span>
      <span className="font-mono text-xs" style={{ color: '#1B3A4B', opacity: 0.55 }}>{truncateHash(hash)}</span>
      <a
        href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium underline underline-offset-2 shrink-0 hover:opacity-75"
        style={{ color: '#2A6170' }}
      >
        View on Explorer
      </a>
    </div>
  )
}

interface TxFeedProps {
  items: TxItem[]
}

export function TxFeed({ items }: TxFeedProps) {
  // Tick every 10s to refresh relative timestamps
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="bg-white rounded-xl shadow-sm border p-5 flex flex-col gap-3 min-h-[300px] sm:min-h-[400px] lg:h-full lg:min-h-0" style={{ borderColor: '#1B3A4B14' }}>
      <h2 className="text-xs font-semibold uppercase tracking-wider shrink-0" style={{ color: '#1B3A4B', opacity: 0.5 }}>
        Transaction Feed
      </h2>

      <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0">
        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 text-sm text-center py-8">
              No transactions yet.<br />Run an agent to get started.
            </p>
          </div>
        ) : (
          items.slice(0, 20).map((item) => {
            const borderColor =
              item.status === 'pending'
                ? 'border-l-gray-300 bg-gray-50'
                : item.status === 'approved'
                  ? 'border-l-green-500 bg-green-50'
                  : 'border-l-red-500 bg-red-50'

            return (
              <div
                key={item.id}
                className={`slide-in rounded-lg px-4 py-3.5 border-l-4 ${borderColor}`}
              >
                {/* Row 1: icon + status + type + amount + timestamp */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {item.status === 'pending' ? (
                      <span className="inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    ) : (
                      <span className="text-sm shrink-0">
                        {item.status === 'approved' ? '✅' : '❌'}
                      </span>
                    )}
                    <span
                      className={`text-sm font-semibold shrink-0 ${
                        item.status === 'pending'
                          ? 'text-gray-500'
                          : item.status === 'approved'
                            ? 'text-green-700'
                            : 'text-red-700'
                      }`}
                    >
                      {item.status === 'pending'
                        ? 'Processing…'
                        : item.status === 'approved'
                          ? 'Approved'
                          : 'Blocked'}
                    </span>
                    <span className="text-sm text-gray-500 shrink-0">
                      {item.type === 'basic' ? 'Basic Analysis' : 'Deep Analysis'}
                    </span>
                    <span className="text-xs font-semibold text-gray-700 bg-white border border-gray-200 px-2 py-0.5 rounded-full shrink-0">
                      {item.amountXLM} XLM
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {relativeTime(item.timestamp)}
                  </span>
                </div>

                {/* Row 2+: hashes or block reason */}
                {item.status === 'approved' && (
                  <div className="mt-2 ml-7 flex flex-col gap-1">
                    {item.paymentTxHash && (
                      <ExplorerLink hash={item.paymentTxHash} label="Payment TX:" />
                    )}
                    {item.watchdogTxHash && (
                      <ExplorerLink hash={item.watchdogTxHash} label="Watchdog TX:" />
                    )}
                  </div>
                )}

                {item.status === 'blocked' && item.reason && (
                  <div className="mt-1.5 ml-7">
                    <span className="font-mono text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded">
                      {item.reason}
                    </span>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

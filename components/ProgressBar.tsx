'use client'

import { Database } from 'lucide-react'

export default function ProgressBar({ total, sessionId }: { total: number; sessionId: string }) {
  const pct  = Math.min((total / 50) * 100, 100)
  const done = total >= 50

  return (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-2xl px-5 py-3 border"
      style={{
        background:    'var(--c-card-bg)',
        borderColor:   'var(--c-border)',
        boxShadow:     'var(--c-shadow)',
        backdropFilter:'blur(8px)',
        minWidth:      260,
      }}
    >
      <Database size={14} style={{ color: done ? 'var(--c-primary)' : 'var(--c-secondary)', flexShrink: 0 }} />

      <div className="flex-1">
        <div className="flex justify-between mb-1.5">
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--c-dark)', fontWeight: 500 }}>
            {total} / 50 songs saved
          </span>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--c-secondary)' }}>
            {sessionId.slice(0, 8)}…
          </span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{
              width:      `${pct}%`,
              background: done ? '#4ABA94' : 'linear-gradient(90deg, #4ABA94, #D0542D)',
            }}
          />
        </div>
      </div>

      {done && (
        <span style={{ fontSize: 11, color: '#4ABA94', fontWeight: 600, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
          ✓ Done
        </span>
      )}
    </div>
  )
}

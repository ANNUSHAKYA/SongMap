'use client'

export default function Waveform({ bars = 6, height = 20, color = '#4ABA94', active = true }: {
  bars?: number; height?: number; color?: string; active?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-[3px]" style={{ height }} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={active ? 'bar' : ''}
          style={{
            display:         'inline-block',
            width:           3,
            height:          active ? '100%' : '25%',
            background:      color,
            borderRadius:    2,
            animationDelay:  active ? `${i * 0.15}s` : undefined,
            transform:       active ? undefined : 'scaleY(0.25)',
            transformOrigin: 'bottom',
          }}
        />
      ))}
    </span>
  )
}

'use client'

import { useState } from 'react'
import {
  ExternalLink, ChevronDown, ChevronUp, Loader2,
  Music2, Zap, Clock, Key, Layers, ChevronRight
} from 'lucide-react'
import { SongAnalysis } from '@/lib/types'
import Waveform from './Waveform'

interface Props {
  analysis:        SongAnalysis
  songId:          string
  depth:           number
  reason?:         string
  youtubeSearchUrl?: string
  totalSongs:      number
  isExpanded:      boolean
  isLoadingRecs:   boolean
  onExpand:        () => void
  children?:       React.ReactNode
}

const ENERGY_COLOR: Record<string, string> = {
  low:    '#4ABA94',
  medium: '#D0542D',
  high:   '#B84420',
}

const DEPTH_ACCENT = [
  '#4ABA94', // 0 seed
  '#3A9478',
  '#2B7D60',
  '#D0542D',
  '#B84420',
  '#685B53',
  '#4ABA94',
  '#3A9478',
  '#D0542D',
  '#2B3A39',
]

export default function SongCard({
  analysis, songId, depth, reason, youtubeSearchUrl,
  totalSongs, isExpanded, isLoadingRecs, onExpand, children,
}: Props) {
  const [showAll, setShowAll] = useState(false)

  const accent    = DEPTH_ACCENT[Math.min(depth, DEPTH_ACCENT.length - 1)]
  const ytUrl     = analysis.youtubeId
    ? `https://www.youtube.com/watch?v=${analysis.youtubeId}`
    : youtubeSearchUrl || analysis.youtubeUrl
  const canExpand = totalSongs < 50 && depth < 10

  const displayed = showAll ? analysis.instruments : analysis.instruments.slice(0, 5)
  const hasMore   = analysis.instruments.length > 5

  return (
    <div className="relative fade-up" style={{ paddingLeft: depth > 0 ? 20 : 0 }}>
      {depth > 0 && <div className="depth-line" style={{ background: `linear-gradient(to bottom, ${accent}, transparent)` }} />}

      <div className="card" style={{ boxShadow: depth === 0 ? '0 4px 20px rgba(43,58,57,0.09)' : '0 1px 6px rgba(43,58,57,0.06)' }}>

        {/* ── Header ── */}
        <div className="p-5 pb-4">

          {/* reason tag (shown on non-seed cards) */}
          {reason && (
            <p style={{ fontSize: 12, color: '#685B53', fontStyle: 'italic', marginBottom: 10, paddingLeft: 10, borderLeft: `2px solid ${accent}40` }}>
              {reason}
            </p>
          )}

          <div className="flex items-start gap-3 mb-4">
            {/* icon */}
            <div className="flex-shrink-0 rounded-xl flex items-center justify-center"
              style={{ width: 44, height: 44, background: `${accent}14` }}>
              {depth === 0
                ? <Waveform bars={5} height={18} color={accent} />
                : <Music2 size={18} style={{ color: accent }} />}
            </div>

            {/* title / artist */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold leading-tight truncate"
                style={{ fontFamily: 'var(--font-fraunces)', fontSize: depth === 0 ? 20 : 16, color: '#2B3A39' }}>
                {analysis.title}
              </h3>
              <p style={{ fontSize: 13, color: '#685B53', marginTop: 1 }}>{analysis.artist}</p>
            </div>

            {/* YouTube link */}
            {ytUrl && (
              <a href={ytUrl} target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 rounded-lg p-2 transition-colors"
                style={{ border: '1px solid rgba(43,58,57,0.1)', color: '#685B53' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#D0542D'; e.currentTarget.style.borderColor = 'rgba(208,84,45,0.3)' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#685B53'; e.currentTarget.style.borderColor = 'rgba(43,58,57,0.1)' }}
                title="Open on YouTube">
                <ExternalLink size={13} />
              </a>
            )}
          </div>

          {/* ── Stats row ── */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="bpm-badge">{analysis.bpm} BPM</span>
            <StatChip icon={<Key size={11} />}   label={analysis.keySignature} />
            <StatChip icon={<Clock size={11} />} label={analysis.timeSignature} />
            <StatChip
              icon={<Zap size={11} />}
              label={analysis.energyLevel}
              color={ENERGY_COLOR[analysis.energyLevel]}
            />
          </div>

          {/* genres + mood */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {analysis.genre.map(g => <span key={g} className="tag">{g}</span>)}
            {analysis.mood && <span className="tag tag-accent">{analysis.mood}</span>}
          </div>

          {/* beat pattern */}
          {analysis.beatPattern && (
            <p style={{ fontSize: 12.5, color: '#685B53', lineHeight: 1.6, paddingLeft: 10, borderLeft: '2px solid rgba(74,186,148,0.3)', marginBottom: 16 }}>
              {analysis.beatPattern}
            </p>
          )}

          {/* analysis text (seed only) */}
          {depth === 0 && analysis.analysisText && (
            <p style={{ fontSize: 13, color: '#685B53', lineHeight: 1.65, marginBottom: 16 }}>
              {analysis.analysisText}
            </p>
          )}

          {/* ── Instruments ── */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(43,58,57,0.08)', background: 'rgba(43,58,57,0.02)' }}>
            <div className="flex items-center justify-between px-4 py-2.5"
              style={{ borderBottom: '1px solid rgba(43,58,57,0.06)' }}>
              <div className="flex items-center gap-2">
                <Layers size={13} style={{ color: '#4ABA94' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#2B3A39', letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                  Instruments
                </span>
              </div>
              <span style={{ fontSize: 11, color: '#685B53', fontFamily: 'var(--font-mono)' }}>
                {analysis.totalInstrumentCount} total tracks
              </span>
            </div>
            <div className="px-4 py-1">
              {displayed.map(inst => (
                <div key={inst.name} className="instr-row">
                  <div>
                    <span style={{ fontSize: 13, color: '#2B3A39' }}>{inst.name}</span>
                    <span style={{ fontSize: 11, color: '#685B53', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>
                      {inst.role}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#4ABA94', fontFamily: 'var(--font-mono)', background: 'rgba(74,186,148,0.1)', padding: '1px 8px', borderRadius: 6 }}>
                    ×{inst.count}
                  </span>
                </div>
              ))}
              {hasMore && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="w-full flex items-center justify-center gap-1 py-2 text-xs transition-colors"
                  style={{ color: '#3A9478', fontFamily: 'var(--font-mono)' }}
                >
                  {showAll
                    ? <><ChevronUp size={12} /> Show less</>
                    : <><ChevronDown size={12} /> {analysis.instruments.length - 5} more instruments</>}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Expand button ── */}
        {canExpand && (
          <div style={{ padding: '0 20px 16px' }}>
            <button
              onClick={onExpand}
              disabled={isLoadingRecs}
              className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all"
              style={{
                border:      `1.5px solid ${isExpanded ? accent + '50' : 'rgba(74,186,148,0.25)'}`,
                color:       isExpanded ? accent : '#3A9478',
                background:  isExpanded ? `${accent}08` : 'transparent',
                cursor:      isLoadingRecs ? 'wait' : 'pointer',
              }}
            >
              {isLoadingRecs
                ? <><Loader2 size={14} className="animate-spin" /> Finding beat-matched songs…</>
                : isExpanded
                ? <><ChevronUp size={14} /> Hide recommendations</>
                : <><ChevronRight size={14} /> Show 5 beat-matched songs</>}
            </button>
          </div>
        )}

        {totalSongs >= 50 && (
          <p style={{ textAlign: 'center', fontSize: 11, color: '#685B53', padding: '8px 20px 14px', fontFamily: 'var(--font-mono)' }}>
            ✓ 50-song limit reached — all data saved
          </p>
        )}

        {/* ── Children (nested recs) ── */}
        {isExpanded && children && (
          <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(43,58,57,0.06)' }}>
            <div style={{ paddingTop: 16 }}>{children}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatChip({ icon, label, color }: { icon: React.ReactNode; label: string; color?: string }) {
  return (
    <span className="tag" style={color ? { color, borderColor: `${color}30`, background: `${color}10` } : {}}>
      {icon}{label}
    </span>
  )
}

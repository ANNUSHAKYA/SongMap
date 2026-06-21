'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Play, Pause, Music, Zap, Key, Clock, 
  ExternalLink, Layers, X, Sparkles, Volume2, VolumeX, BarChart2
} from 'lucide-react'
import { SongAnalysis } from '@/lib/types'
import { useTheme } from '@/components/ThemeContext'

interface DashboardPanelProps {
  song: {
    id: string
    parentId: string | null
    depth: number
    analysis: SongAnalysis
    reason?: string
  } | null
  totalSongs: number
  isGrowing: boolean
  onGrowChain: () => void
  onPauseGrow: () => void
  onExpandSong: (songId: string) => Promise<void>
  isExpanding: boolean
  onClose: () => void
}

const ENERGY_COLORS = {
  low: 'text-[#4ABA94] bg-[#4ABA94]/10 border-[#4ABA94]/20',
  medium: 'text-[#D0542D] bg-[#D0542D]/10 border-[#D0542D]/20',
  high: 'text-[#B84420] bg-[#B84420]/10 border-[#B84420]/20',
}

export default function DashboardPanel({
  song, totalSongs, isGrowing, onGrowChain, onPauseGrow, onExpandSong, isExpanding, onClose
}: DashboardPanelProps) {
  const { theme } = useTheme()
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.7)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Create / cleanup Audio element when song changes
  useEffect(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause()
      } catch (err) {
        // ignore
      }
      setIsPlaying(false)
      setCurrentTime(0)
    }

    if (song?.analysis.previewUrl) {
      const audio = new Audio(song.analysis.previewUrl)
      audioRef.current = audio
      audio.volume = isMuted ? 0 : volume
      
      const handlePlay = () => setIsPlaying(true)
      const handlePause = () => setIsPlaying(false)
      const handleTimeUpdate = () => {
        // Enforce 30-second cap on playback duration (for fallbacks or long audio tracks)
        if (audio.currentTime >= 30) {
          audio.pause()
          audio.currentTime = 0
          setIsPlaying(false)
          setCurrentTime(0)
        } else {
          setCurrentTime(audio.currentTime)
        }
      }
      const handleDurationChange = () => {
        setDuration(audio.duration && audio.duration < 30 ? audio.duration : 30)
      }
      const handleEnded = () => {
        setIsPlaying(false)
        setCurrentTime(0)
      }

      audio.addEventListener('play', handlePlay)
      audio.addEventListener('pause', handlePause)
      audio.addEventListener('timeupdate', handleTimeUpdate)
      audio.addEventListener('durationchange', handleDurationChange)
      audio.addEventListener('ended', handleEnded)

      return () => {
        try {
          audio.pause()
        } catch (err) {
          // ignore
        }
        audio.removeEventListener('play', handlePlay)
        audio.removeEventListener('pause', handlePause)
        audio.removeEventListener('timeupdate', handleTimeUpdate)
        audio.removeEventListener('durationchange', handleDurationChange)
        audio.removeEventListener('ended', handleEnded)
      }
    } else {
      audioRef.current = null
    }
  }, [song])

  // Update volume and muted state when volume or isMuted changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch((err: any) => {
        if (err?.name !== 'AbortError') {
          console.error("Audio playback blocked:", err)
        }
      })
    }
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : val
    }
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
    if (audioRef.current) {
      audioRef.current.volume = !isMuted ? 0 : volume
    }
  }

  // Calculate BPM Gauge needle rotation
  // BPM Range: 40 to 220. Let's map it to -90 to +90 degrees rotation (180 deg total range)
  const bpmRotation = useMemo(() => {
    if (!song) return -90
    const bpm = song.analysis.bpm
    const percentage = Math.min(Math.max((bpm - 40) / (220 - 40), 0), 1)
    return -90 + percentage * 180
  }, [song])

  // Group instruments by role
  const groupedInstruments = useMemo(() => {
    if (!song?.analysis.instruments) return {}
    const grouped: Record<string, typeof song.analysis.instruments> = {}
    song.analysis.instruments.forEach(inst => {
      const role = inst.role || 'other'
      if (!grouped[role]) grouped[role] = []
      grouped[role].push(inst)
    })
    return grouped
  }, [song])

  if (!song) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-[var(--c-secondary)]">
        <Music size={40} className="stroke-1 mb-4 opacity-50 text-[#4ABA94]" />
        <h3 className="font-semibold text-lg mb-1" style={{ fontFamily: 'var(--font-fraunces)' }}>No Song Selected</h3>
        <p className="text-xs max-w-[240px]">Click any node on the recommendation tree to inspect its musical properties.</p>
      </div>
    )
  }

  const { analysis } = song
  const canExpand = totalSongs < 50 && song.depth < 10

  const fallbackGradient = (() => {
    const hash = (analysis.title + analysis.artist).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const hue1 = hash % 360
    const hue2 = (hash + 60) % 360
    return `linear-gradient(135deg, hsl(${hue1}, 75%, 60%), hsl(${hue2}, 70%, 45%))`
  })()

  return (
    <div className="h-full flex flex-col bg-[var(--c-card-bg)] backdrop-blur border-l border-[var(--c-border)]">
      {/* ── Top Bar ── */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--c-border)] bg-[var(--c-card-bg)]">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-[#4ABA94]" />
          <span className="text-xs uppercase font-mono font-semibold tracking-wider text-[var(--c-dark)]">Song Dashboard</span>
        </div>
        <button 
          onClick={onClose} 
          className="p-1.5 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors text-[var(--c-secondary)]"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-6">
        {/* Song Header & Spotify Art */}
        <div className="flex items-start gap-4">
          <div className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-md flex-shrink-0 bg-neutral-200 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center">
            {analysis.albumArt ? (
              <img
                src={analysis.albumArt}
                alt={analysis.title}
                className="object-cover w-full h-full"
              />
            ) : (
              <div style={{ background: fallbackGradient }} className="w-full h-full flex items-center justify-center text-white">
                <Music size={28} />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-xl leading-snug text-[var(--c-dark)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
              {analysis.title}
            </h3>
            <p className="text-sm text-[var(--c-secondary)] mt-0.5">{analysis.artist}</p>
            
            {/* Quick Metadata chips */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className={`text-[11px] font-medium border px-2 py-0.5 rounded-full ${ENERGY_COLORS[analysis.energyLevel] || ''}`}>
                <Zap size={10} className="inline mr-1" />
                {analysis.energyLevel} energy
              </span>
              {analysis.genre.slice(0, 2).map(g => (
                <span key={g} className="text-[11px] text-[#3A9478] bg-[#4ABA94]/5 border border-[#4ABA94]/15 px-2 py-0.5 rounded-full font-mono">
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 30-Second Spotify Audio Player */}
        {analysis.previewUrl ? (
          <div className="p-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)]/40 shadow-sm flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <button 
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-[#4ABA94] hover:bg-[#3A9478] text-white flex items-center justify-center shadow transition-all duration-200 active:scale-95"
              >
                {isPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" className="ml-0.5" />}
              </button>
              
              <div className="flex-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-[var(--c-secondary)] mb-1">
                  <span>Spotify Preview (30s)</span>
                  <span>{Math.round(currentTime)}s / {Math.round(duration)}s</span>
                </div>
                {/* Custom timeline bar */}
                <div className="h-1.5 bg-neutral-200 dark:bg-[#253230] rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-[#4ABA94]"
                    initial={{ width: 0 }}
                    animate={{ width: `${(currentTime / duration) * 100}%` }}
                    transition={{ ease: 'linear' }}
                  />
                </div>
              </div>
            </div>

            {/* Volume controller */}
            <div className="flex items-center gap-2 border-t border-neutral-100 dark:border-neutral-800/40 pt-2 text-[var(--c-secondary)]">
              <button onClick={toggleMute} className="hover:text-[#4ABA94] transition-colors">
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={handleVolumeChange}
                className="w-20 accent-[#4ABA94] h-1 rounded-lg bg-neutral-200 dark:bg-neutral-800 outline-none cursor-pointer"
              />
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl border border-dashed border-[var(--c-border)] text-center text-xs text-[var(--c-secondary)]">
            Spotify Audio Preview unavailable for this song.
          </div>
        )}

        {/* BPM & Key visualizers */}
        <div className="grid grid-cols-2 gap-4">
          {/* BPM Circular Gauge */}
          <div className="p-4 rounded-2xl bg-[var(--c-bg)] border border-[var(--c-border)] flex flex-col items-center justify-center">
            <span className="text-[11px] font-mono text-[var(--c-secondary)] uppercase tracking-wider mb-2">BPM & Tempo</span>
            <div className="relative w-28 h-16 overflow-hidden flex items-end justify-center">
              {/* Dial Arc */}
              <svg width="100" height="50" className="absolute top-0">
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke={theme === 'dark' ? '#1D2A28' : '#E2ECE9'}
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="url(#bpmGrad)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="126"
                  strokeDashoffset={126 - (Math.min(Math.max((analysis.bpm - 40) / (220 - 40), 0), 1) * 126)}
                />
                <defs>
                  <linearGradient id="bpmGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#4ABA94" />
                    <stop offset="100%" stopColor="#D0542D" />
                  </linearGradient>
                </defs>
              </svg>
              {/* Needle */}
              <motion.div
                className="absolute w-1 h-12 bg-[var(--c-dark)] origin-bottom rounded-full"
                style={{ bottom: 0, left: 'calc(50% - 2px)', transformOrigin: '50% 100%' }}
                animate={{ rotate: bpmRotation }}
                transition={{ type: 'spring', stiffness: 50, damping: 10 }}
              />
              {/* Needle center pin */}
              <div className="absolute bottom-0 w-3 h-3 rounded-full bg-[#4ABA94] border-2 border-[var(--c-card-bg)]" />
            </div>
            <div className="text-center mt-2">
              <span className="text-lg font-bold font-mono tracking-tight text-[var(--c-dark)]">{analysis.bpm}</span>
              <span className="text-[10px] text-[var(--c-secondary)] ml-1">BPM</span>
            </div>
          </div>

          {/* Key & Time Signatures */}
          <div className="p-4 rounded-2xl bg-[var(--c-bg)] border border-[var(--c-border)] flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800/40 pb-2">
              <div className="flex items-center gap-1.5 text-[var(--c-secondary)]">
                <Key size={13} />
                <span className="text-[11px] font-mono uppercase">Key signature</span>
              </div>
              <span className="font-bold text-sm font-mono text-[#D0542D]">{analysis.keySignature}</span>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-1.5 text-[var(--c-secondary)]">
                <Clock size={13} />
                <span className="text-[11px] font-mono uppercase">Time signature</span>
              </div>
              <span className="font-bold text-sm font-mono text-[var(--c-dark)]">{analysis.timeSignature}</span>
            </div>
          </div>
        </div>

        {/* AI Characteristic Description */}
        {analysis.analysisText && (
          <div className="space-y-2">
            <h4 className="text-xs uppercase font-mono font-semibold tracking-wider text-[var(--c-dark)] flex items-center gap-1.5">
              <Sparkles size={13} className="text-[#4ABA94]" />
              AI Musical Analysis
            </h4>
            <p className="text-xs text-[var(--c-secondary)] leading-relaxed p-4 rounded-2xl bg-[var(--c-bg)] border border-[var(--c-border)]">
              {analysis.analysisText}
            </p>
          </div>
        )}

        {/* Beat pattern */}
        {analysis.beatPattern && (
          <div className="space-y-2">
            <h4 className="text-xs uppercase font-mono font-semibold tracking-wider text-[var(--c-dark)]">
              Beat & Rhythm Pattern
            </h4>
            <p className="text-xs text-[var(--c-secondary)] leading-relaxed p-4 rounded-2xl bg-[var(--c-bg)] border border-[var(--c-border)] font-mono">
              {analysis.beatPattern}
            </p>
          </div>
        )}

        {/* Instrument Distribution Charts */}
        <div className="space-y-3">
          <h4 className="text-xs uppercase font-mono font-semibold tracking-wider text-[var(--c-dark)] flex items-center gap-1.5">
            <Layers size={13} className="text-[#4ABA94]" />
            Instrument Arrangement ({analysis.totalInstrumentCount} tracks)
          </h4>
          
          <div className="space-y-4 p-4 rounded-2xl bg-[var(--c-bg)] border border-[var(--c-border)]">
            {Object.keys(groupedInstruments).length > 0 ? (() => {
              // Find max count for relative bar scaling
              const allInsts = Object.values(groupedInstruments).flat()
              const maxCount = Math.max(...allInsts.map(i => i.count), 1)
              return Object.entries(groupedInstruments).map(([role, list]) => (
                <div key={role} className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase font-bold text-[#D0542D] block tracking-wide">
                    {role} tracks
                  </span>
                  <div className="space-y-2">
                    {list.map(inst => (
                      <div key={inst.name} className="text-xs">
                        <div className="flex justify-between mb-1 text-neutral-700 dark:text-neutral-300">
                          <span className="capitalize font-medium">{inst.name}</span>
                          <span className="font-mono text-[11px] font-semibold text-[#4ABA94]">
                            {inst.count}× used
                          </span>
                        </div>
                        <div className="h-2 bg-neutral-200 dark:bg-[#253230] rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-gradient-to-r from-[#4ABA94] to-[#3A9478] rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${(inst.count / maxCount) * 100}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            })() : (
              <span className="text-xs text-[var(--c-secondary)] italic">No instrumentation details analyzed.</span>
            )}
          </div>
        </div>

        {/* Links section */}
        <div className="flex gap-2">
          {analysis.youtubeId && (
            <a 
              href={`https://www.youtube.com/watch?v=${analysis.youtubeId}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--c-border)] font-semibold text-xs text-[var(--c-dark)] hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            >
              <ExternalLink size={13} />
              Open YouTube Video
            </a>
          )}
        </div>
      </div>

      {/* ── Footer Button Box (Grow controls) ── */}
      <div className="flex-shrink-0 p-4 border-t border-[var(--c-border)] bg-[var(--c-card-bg)] flex flex-col gap-2">
        {isGrowing ? (
          <div className="flex gap-2">
            <div className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#D0542D]/20 text-[#D0542D] border border-[#D0542D]/30 rounded-xl text-xs font-mono font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D0542D] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#D0542D]"></span>
              </span>
              Auto-Growing: {totalSongs}/50 Songs
            </div>
            <button
              onClick={onPauseGrow}
              className="px-4 py-3 bg-[#D0542D] hover:bg-[#B84420] text-white rounded-xl text-xs font-semibold shadow transition-all duration-200 active:scale-95"
            >
              Pause
            </button>
          </div>
        ) : canExpand ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => onExpandSong(song.id)}
              disabled={isExpanding}
              className="w-full py-3 bg-[#4ABA94] hover:bg-[#3A9478] disabled:bg-neutral-400 text-white rounded-xl font-bold text-xs shadow flex items-center justify-center gap-2 transition-all duration-200 active:scale-95"
            >
              {isExpanding ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating 5 recommendations...
                </>
              ) : (
                <>Expand 5 matched songs</>
              )}
            </button>
            <button
              onClick={onGrowChain}
              className="w-full py-2.5 border border-[#4ABA94] text-[#4ABA94] hover:bg-[#4ABA94]/10 rounded-xl font-semibold text-[11px] font-mono flex items-center justify-center gap-1.5 transition-all duration-200"
            >
              <Sparkles size={11} />
              Auto-Grow Tree to 50 Songs
            </button>
          </div>
        ) : (
          <div className="text-center text-[10px] font-mono text-[var(--c-secondary)] py-2 bg-[var(--c-bg)] rounded-lg">
            ✓ 50-song limit reached or depth 10 achieved
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  RotateCcw, AlertCircle, Sparkles, Moon, Sun, 
  History, Music, Database, ArrowRight, Loader2, ExternalLink 
} from 'lucide-react'
import SongInput from '@/components/SongInput'
import SongFlowGraph from '@/components/SongFlowGraph'
import DashboardPanel from '@/components/DashboardPanel'
import ProgressBar from '@/components/ProgressBar'
import { SongAnalysis } from '@/lib/types'
import { useTheme } from '@/components/ThemeContext'
import { generatePDF } from '@/lib/pdfGenerator'

interface SessionSong {
  id: string
  parentId: string | null
  depth: number
  analysis: SongAnalysis
  reason?: string
}

interface RecentSession {
  id: string
  seed_input: string
  total_songs: number
  created_at: string
  songs: Array<{
    title: string
    artist: string
    album_art?: string
    depth: number
  }>
}

export default function Home() {
  const { theme, toggleTheme } = useTheme()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionSongs, setSessionSongs] = useState<SessionSong[]>([])
  const [activeSongId, setActiveSongId] = useState<string | null>(null)
  
  const [loading, setLoading] = useState(false)
  const [expandingId, setExpandingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  
  const [isGrowing, setIsGrowing] = useState(false)
  const isGrowingRef = useRef(false)
  
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree')
  const lastSongsLengthRef = useRef(0)

  // Auto-switch to list view and fire confetti when reaching 50 songs
  useEffect(() => {
    const currentLength = sessionSongs.length
    if (currentLength >= 50 && lastSongsLengthRef.current < 50) {
      setViewMode('list')
      const fireConfetti = async () => {
        try {
          const confetti = (await import('canvas-confetti')).default
          confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } })
        } catch (e) {
          console.error(e)
        }
      }
      fireConfetti()
    }
    lastSongsLengthRef.current = currentLength
  }, [sessionSongs.length])

  // Fetch recent sessions on mount
  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch('/api/songs')
      const data = await res.json()
      if (res.ok && data.sessions) {
        setRecentSessions(data.sessions)
      }
    } catch (e) {
      console.error('Failed to load recent sessions', e)
    }
  }, [])

  useEffect(() => {
    fetchRecent()
  }, [fetchRecent])

  // Start analysis of a seed song
  const handleAnalyze = async (p: { youtubeUrl?: string; songName?: string; artistName?: string }) => {
    setLoading(true)
    setError('')
    setSessionId(null)
    setSessionSongs([])
    setActiveSongId(null)
    setViewMode('tree')
    
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed.')
      
      setSessionId(data.sessionId)
      const rootSong = {
        id: data.songId,
        parentId: null,
        depth: 0,
        analysis: data.analysis
      }
      setSessionSongs([rootSong])
      setActiveSongId(data.songId)
      fetchRecent() // refresh list
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  // Load an existing session
  const handleLoadSession = async (sessId: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/songs?sessionId=${sessId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load session.')
      
      if (data.songs && data.songs.length > 0) {
        setSessionId(sessId)
        setSessionSongs(data.songs)
        setViewMode(data.songs.length >= 50 ? 'list' : 'tree')
        
        // Find the root song (depth 0) to highlight by default
        const root = data.songs.find((s: any) => !s.parentId) || data.songs[0]
        setActiveSongId(root.id)
      } else {
        throw new Error('No songs found in this session.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load session.')
    } finally {
      setLoading(false)
    }
  }

  // Manually expand a node by 5
  const handleExpandSong = async (songId: string) => {
    if (sessionSongs.length >= 50) return
    const song = sessionSongs.find(s => s.id === songId)
    if (!song) return

    setExpandingId(songId)
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentSongId: songId,
          sessionId,
          parentAnalysis: song.analysis,
          depth: song.depth + 1,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Recommendations failed.')

      const children = (data.recommendations || []).map((r: any) => ({
        id: r.songId,
        parentId: songId,
        depth: song.depth + 1,
        analysis: r.analysis,
        reason: r.reason,
      }))

      setSessionSongs(prev => [...prev, ...children])
      // Set the first newly recommended song as the active one to showcase immediately
      if (children.length > 0) {
        setActiveSongId(children[0].id)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setExpandingId(null)
    }
  }

  // Auto-grow recursive loop
  const autoGrowLoop = useCallback(async (currentSongs: SessionSong[], sessId: string) => {
    if (!isGrowingRef.current) return

    if (currentSongs.length >= 50) {
      setIsGrowing(false)
      isGrowingRef.current = false
      
      // Fire celebration confetti!
      try {
        const confetti = (await import('canvas-confetti')).default
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } })
      } catch (err) {
        console.error(err)
      }
      return
    }

    // Find the next node to expand
    // An unexpanded node is one where depth < 10 and no other song lists it as a parent
    const parentIds = new Set(currentSongs.map(s => s.parentId).filter(Boolean))
    const unexpanded = currentSongs.find(s => s.depth < 10 && !parentIds.has(s.id))

    if (!unexpanded) {
      setIsGrowing(false)
      isGrowingRef.current = false
      return
    }

    setExpandingId(unexpanded.id)
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentSongId: unexpanded.id,
          sessionId: sessId,
          parentAnalysis: unexpanded.analysis,
          depth: unexpanded.depth + 1,
        }),
      })

      if (!res.ok) throw new Error('Auto-grow call failed')

      const data = await res.json()
      if (data && data.recommendations) {
        const children = data.recommendations.map((r: any) => ({
          id: r.songId,
          parentId: unexpanded.id,
          depth: unexpanded.depth + 1,
          analysis: r.analysis,
          reason: r.reason,
        }))

        const nextSongs = [...currentSongs, ...children]
        setSessionSongs(nextSongs)
        
        // Highlight the latest child
        if (children.length > 0) {
          setActiveSongId(children[0].id)
        }

        // Loop after a 1.2s delay to allow animations and avoid hitting rate limits
        setTimeout(() => {
          autoGrowLoop(nextSongs, sessId)
        }, 1200)
      } else {
        setIsGrowing(false)
        isGrowingRef.current = false
        setExpandingId(null)
      }
    } catch (e) {
      console.error('Auto grow iteration failed:', e)
      setIsGrowing(false)
      isGrowingRef.current = false
      setExpandingId(null)
    }
  }, [])

  const handleStartGrow = () => {
    if (!sessionId) return
    setIsGrowing(true)
    isGrowingRef.current = true
    autoGrowLoop(sessionSongs, sessionId)
  }

  const handlePauseGrow = () => {
    setIsGrowing(false)
    isGrowingRef.current = false
    setExpandingId(null)
  }

  // Get active song object
  const activeSong = sessionSongs.find(s => s.id === activeSongId) || null

  return (
    <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-dark)] transition-colors duration-300 flex flex-col font-sans">
      
      {/* ── Top Header ── */}
      <header className="border-b border-[var(--c-border)] bg-[var(--c-header-bg)] sticky top-0 z-40 transition-colors duration-300 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <span 
            onClick={() => { setSessionId(null); setSessionSongs([]); handlePauseGrow() }}
            className="font-bold text-xl cursor-pointer text-[var(--c-dark)] flex items-center gap-2"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            <Sparkles size={20} className="text-[#4ABA94]" />
            SongMap
          </span>
          <div className="flex items-center gap-4">
            {sessionId && (
              <button
                onClick={() => { setSessionId(null); setSessionSongs([]); handlePauseGrow() }}
                className="flex items-center gap-1.5 text-xs font-mono font-medium py-1.5 px-3 border border-[var(--c-border)] rounded-full text-[var(--c-secondary)] hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-all duration-200"
              >
                <RotateCcw size={12} /> New Exploration
              </button>
            )}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full border border-[var(--c-border)] text-[var(--c-dark)] hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-all duration-200"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Layout ── */}
      <div className="flex-1 flex flex-col">
        {!sessionId ? (
          /* ── Landing Page (Vinyl Showcase & Search) ── */
          <main className="max-w-6xl mx-auto w-full px-6 py-12 flex-1 flex flex-col justify-center">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
              
              {/* Left Column: Search & Intro */}
              <div className="md:col-span-7 space-y-6">
                <SongInput onAnalyze={handleAnalyze} isLoading={loading} />
                
                {error && (
                  <div className="flex items-center gap-2 text-sm text-[#B84420] bg-[#B84420]/10 border border-[#B84420]/20 p-3 rounded-xl">
                    <AlertCircle size={15} /> {error}
                  </div>
                )}

                {/* Recent Explorations */}
                {recentSessions.length > 0 && (
                  <div className="pt-6 border-t border-[var(--c-border)] space-y-3">
                    <h3 className="text-xs uppercase font-mono font-bold tracking-wider text-[var(--c-secondary)] flex items-center gap-1.5">
                      <History size={13} />
                      Recent Explorations
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
                      {recentSessions.map(sess => {
                        const seed = sess.songs?.find(s => s.depth === 0) || sess.songs?.[0]
                        const seedTitle = seed?.title || sess.seed_input
                        const seedArtist = seed?.artist || 'Loaded Session'
                        const fallbackArt = `linear-gradient(135deg, #4ABA94, #D0542D)`
                        
                        return (
                          <div
                            key={sess.id}
                            onClick={() => handleLoadSession(sess.id)}
                            className="card p-3 flex items-center gap-3 cursor-pointer hover:scale-102 hover:border-[#4ABA94] transition-all duration-200"
                          >
                            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-neutral-200 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center">
                              {seed?.album_art ? (
                                <img src={seed.album_art} alt={seedTitle} className="object-cover w-full h-full" />
                              ) : (
                                <div style={{ background: fallbackArt }} className="w-full h-full flex items-center justify-center text-white text-xs">
                                  <Music size={14} />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-xs text-[var(--c-dark)] truncate leading-tight" style={{ fontFamily: 'var(--font-fraunces)' }}>
                                {seedTitle}
                              </h4>
                              <p className="text-[10px] text-[var(--c-secondary)] truncate mt-0.5">{seedArtist}</p>
                            </div>
                            <div className="flex flex-col items-end flex-shrink-0">
                              <span className="text-[10px] font-mono bg-[#4ABA94]/10 text-[#4ABA94] px-1.5 py-0.5 rounded-md font-semibold">
                                {sess.total_songs || sess.songs?.length || 1} tracks
                              </span>
                              <span className="text-[8px] text-[var(--c-secondary)]/60 font-mono mt-1">
                                {new Date(sess.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Spinning Vinyl Record */}
              <div className="md:col-span-5 flex justify-center">
                <div className="relative w-72 h-72 md:w-80 md:h-80 flex items-center justify-center">
                  
                  {/* Vinyl base plate */}
                  <motion.div
                    className="absolute inset-0 rounded-full bg-[#181818] border-8 border-[#282828] shadow-2xl flex items-center justify-center"
                    style={{
                      backgroundImage: 'radial-gradient(circle, #2a2a2a 20%, #111111 60%, #050505 100%)',
                    }}
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: loading ? 2.5 : 20, // Spin fast when loading analysis!
                      ease: 'linear',
                    }}
                  >
                    {/* Gloss Reflection Line 1 */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/5 to-transparent rotate-45 pointer-events-none" />
                    {/* Gloss Reflection Line 2 */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-bl from-transparent via-white/5 to-transparent -rotate-45 pointer-events-none" />
                    
                    {/* Sound grooves */}
                    <div className="absolute w-[90%] h-[90%] rounded-full border border-black/30 pointer-events-none" />
                    <div className="absolute w-[80%] h-[80%] rounded-full border border-black/30 pointer-events-none" />
                    <div className="absolute w-[70%] h-[70%] rounded-full border border-black/25 pointer-events-none" />
                    <div className="absolute w-[60%] h-[60%] rounded-full border border-black/20 pointer-events-none" />
                    <div className="absolute w-[50%] h-[50%] rounded-full border border-black/15 pointer-events-none" />

                    {/* Vinyl Center Cover Art Label */}
                    <div className="relative w-[35%] h-[35%] rounded-full bg-neutral-300 border-4 border-[#1c1c1c] flex items-center justify-center overflow-hidden">
                      {loading ? (
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white">
                          <Loader2 size={18} className="animate-spin text-[#4ABA94]" />
                          <span className="text-[8px] font-mono mt-1 tracking-wider uppercase">Decoding</span>
                        </div>
                      ) : (
                        <div className="w-full h-full bg-[#4ABA94] flex items-center justify-center text-white">
                          <Music size={24} className="animate-pulse" />
                        </div>
                      )}
                    </div>
                  </motion.div>

                  {/* Vinyl Tonearm Arm */}
                  <motion.div
                    className="absolute top-[-30px] right-6 origin-[80px_20px] pointer-events-none w-28 h-40 z-10 hidden md:block"
                    initial={{ rotate: -25 }}
                    animate={{ rotate: loading ? 10 : -10 }}
                    transition={{ type: 'spring', stiffness: 40, damping: 10 }}
                  >
                    <svg viewBox="0 0 100 150" fill="none" className="w-full h-full">
                      {/* Pivot joint base */}
                      <circle cx="80" cy="20" r="10" fill="#666" stroke="#444" strokeWidth="2" />
                      <circle cx="80" cy="20" r="4" fill="#999" />
                      {/* Metal arm */}
                      <path d="M 80 20 L 40 80 L 30 130" stroke="#ccc" strokeWidth="4" strokeLinecap="round" />
                      <path d="M 80 20 L 40 80 L 30 130" stroke="#999" strokeWidth="1" strokeLinecap="round" />
                      {/* Cartridge headshell */}
                      <rect x="22" y="125" width="16" height="20" rx="3" fill="#D0542D" transform="rotate(-15 30 135)" />
                      <rect x="27" y="142" width="6" height="5" fill="#444" />
                    </svg>
                  </motion.div>
                </div>
              </div>

            </div>
          </main>
        ) : (
          /* ── Dashboard & Recommendation Tree Map View ── */
          <main className="flex-1 flex flex-col md:flex-row relative">
            
            {/* Visualizer Canvas Area (Left/Center) */}
            <div className="flex-1 relative h-[calc(100vh-140px)] md:h-[calc(100vh-73px)] w-full min-h-[500px] flex flex-col overflow-hidden">
              {/* View Toggle & PDF Action Bar */}
              {sessionSongs.length > 0 && (
                <div className="p-3 border-b border-[var(--c-border)] bg-[var(--c-header-bg)] backdrop-blur flex items-center justify-between z-10 flex-shrink-0">
                  <div className="flex items-center gap-1.5 bg-neutral-200/50 dark:bg-neutral-800/50 p-1 rounded-lg">
                    <button
                      onClick={() => setViewMode('tree')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all duration-200 ${
                        viewMode === 'tree'
                          ? 'bg-[#4ABA94] text-white shadow-sm'
                          : 'text-[var(--c-secondary)] hover:text-[var(--c-dark)]'
                      }`}
                    >
                      Tree View
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all duration-200 ${
                        viewMode === 'list'
                          ? 'bg-[#4ABA94] text-white shadow-sm'
                          : 'text-[var(--c-secondary)] hover:text-[var(--c-dark)]'
                      }`}
                    >
                      List View ({sessionSongs.length})
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      const seed = sessionSongs.find(s => !s.parentId) || sessionSongs[0]
                      generatePDF(sessionSongs, seed, sessionId || undefined)
                    }}
                    className="flex items-center gap-1.5 bg-[#D0542D] hover:bg-[#B84420] active:scale-95 text-white text-xs font-bold py-1.5 px-4 rounded-lg shadow-sm transition-all duration-200"
                  >
                    <Sparkles size={12} className="animate-pulse" />
                    Download PDF Report
                  </button>
                </div>
              )}

              {/* Main Workspace content */}
              <div className="flex-1 relative w-full overflow-hidden">
                {sessionSongs.length > 0 ? (
                  viewMode === 'tree' ? (
                    <SongFlowGraph
                      songs={sessionSongs}
                      activeSongId={activeSongId}
                      onSelectSong={setActiveSongId}
                    />
                  ) : (
                    <div className="absolute inset-0 overflow-y-auto p-6 bg-[var(--c-bg)] transition-colors duration-300">
                      <div className="max-w-4xl mx-auto space-y-6">
                        <div className="flex items-center justify-between border-b border-[var(--c-border)] pb-4">
                          <div>
                            <h2 className="text-2xl font-bold text-[var(--c-dark)]" style={{ fontFamily: 'var(--font-fraunces)' }}>
                              Rhythmic DNA List View
                            </h2>
                            <p className="text-xs text-[var(--c-secondary)] mt-1">
                              Here is the complete sequence of {sessionSongs.length} tracks generated for this discovery session.
                            </p>
                          </div>
                        </div>

                        {/* Table / Grid list */}
                        <div className="border border-[var(--c-border)] rounded-2xl overflow-hidden bg-[var(--c-card-bg)] shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-[var(--c-border)] bg-[var(--c-bg)] text-[var(--c-dark)] text-xs font-mono uppercase tracking-wider">
                                  <th className="py-3.5 px-4 w-12 text-center">#</th>
                                  <th className="py-3.5 px-4 w-16">Art</th>
                                  <th className="py-3.5 px-4">Song / Artist</th>
                                  <th className="py-3.5 px-4 w-32">BPM / Key</th>
                                  <th className="py-3.5 px-4 w-28">Energy / Mood</th>
                                  <th className="py-3.5 px-4 w-24">Links</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--c-border)] text-sm text-[var(--c-dark)]">
                                {sessionSongs.map((song, idx) => {
                                  const isActive = song.id === activeSongId
                                  const fallbackArt = (() => {
                                    const hash = (song.analysis.title + song.analysis.artist).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
                                    const hue1 = hash % 360
                                    const hue2 = (hash + 60) % 360
                                    return `linear-gradient(135deg, hsl(${hue1}, 75%, 60%), hsl(${hue2}, 70%, 45%))`
                                  })()

                                  return (
                                    <tr
                                      key={song.id}
                                      onClick={() => setActiveSongId(song.id)}
                                      className={`cursor-pointer hover:bg-[var(--c-bg)]/40 transition-all duration-200 ${
                                        isActive ? 'bg-[#4ABA94]/10 border-l-4 border-l-[#4ABA94]' : ''
                                      }`}
                                    >
                                      <td className="py-3.5 px-4 text-center font-mono font-bold text-[var(--c-secondary)]">
                                        {idx + 1}
                                      </td>
                                      <td className="py-3.5 px-4">
                                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-100 flex items-center justify-center flex-shrink-0">
                                          {song.analysis.albumArt ? (
                                            <img src={song.analysis.albumArt} alt={song.analysis.title} className="w-full h-full object-cover" />
                                          ) : (
                                            <div style={{ background: fallbackArt }} className="w-full h-full flex items-center justify-center text-white text-xs font-bold">
                                              <Music size={14} />
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-3.5 px-4 min-w-[200px]">
                                        <div className="font-bold truncate max-w-[220px]">{song.analysis.title}</div>
                                        <div className="text-xs text-[var(--c-secondary)] truncate max-w-[220px] mt-0.5">{song.analysis.artist}</div>
                                      </td>
                                      <td className="py-3.5 px-4 font-mono text-xs">
                                        <div className="font-bold text-[#4ABA94]">{song.analysis.bpm} BPM</div>
                                        <div className="text-[#D0542D] mt-0.5">{song.analysis.keySignature}</div>
                                      </td>
                                      <td className="py-3.5 px-4 capitalize text-xs">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold mb-1 ${
                                          song.analysis.energyLevel === 'high' ? 'bg-red-500/10 text-red-500' :
                                          song.analysis.energyLevel === 'medium' ? 'bg-orange-500/10 text-orange-500' :
                                          'bg-green-500/10 text-green-500'
                                        }`}>
                                          {song.analysis.energyLevel}
                                        </span>
                                        <div className="text-[var(--c-secondary)] truncate max-w-[120px]">{song.analysis.mood}</div>
                                      </td>
                                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex gap-2">
                                          <a
                                            href={`https://open.spotify.com/search/${encodeURIComponent(song.analysis.artist + ' ' + song.analysis.title)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1 rounded-md text-[#4ABA94] hover:bg-[#4ABA94]/10 transition-colors"
                                            title="Search on Spotify"
                                          >
                                            <Music size={14} />
                                          </a>
                                          <a
                                            href={song.analysis.youtubeUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(song.analysis.artist + ' ' + song.analysis.title + ' official')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1 rounded-md text-[#D0542D] hover:bg-[#D0542D]/10 transition-colors"
                                            title="Search on YouTube"
                                          >
                                            <ExternalLink size={14} />
                                          </a>
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="animate-spin text-[#4ABA94]" size={28} />
                  </div>
                )}
              </div>
            </div>

            {/* Slide-out Dashboard Panel (Right) */}
            <div className="w-full md:w-96 md:h-[calc(100vh-73px)] border-t md:border-t-0 flex-shrink-0 bg-white z-20">
              <DashboardPanel
                song={activeSong}
                totalSongs={sessionSongs.length}
                isGrowing={isGrowing}
                onGrowChain={handleStartGrow}
                onPauseGrow={handlePauseGrow}
                onExpandSong={handleExpandSong}
                isExpanding={expandingId === activeSongId}
                onClose={() => setActiveSongId(null)}
              />
            </div>
          </main>
        )}
      </div>

      {/* ── Fixed Progress/Milestone Bar at bottom ── */}
      {sessionId && (
        <ProgressBar 
          total={sessionSongs.length} 
          sessionId={sessionId} 
        />
      )}
    </div>
  )
}

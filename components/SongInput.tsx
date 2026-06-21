'use client'

import { useState, useEffect } from 'react'
import { Search, Link2, Music, AlertCircle, Loader2 } from 'lucide-react'
import Waveform from './Waveform'

interface Props {
  onAnalyze: (p: { youtubeUrl?: string; songName?: string; artistName?: string }) => Promise<void>
  isLoading: boolean
}

const ALL_EXAMPLES = [
  { song: 'Blinding Lights', artist: 'The Weeknd' },
  { song: 'Lose Yourself',   artist: 'Eminem' },
  { song: 'Shape of You',    artist: 'Ed Sheeran' },
  { song: 'Billie Jean',     artist: 'Michael Jackson' },
  { song: 'Bohemian Rhapsody', artist: 'Queen' },
  { song: 'Stayin\' Alive',  artist: 'Bee Gees' },
  { song: 'Take On Me',      artist: 'A-ha' },
  { song: 'Get Lucky',       artist: 'Daft Punk' },
  { song: 'Bad Guy',         artist: 'Billie Eilish' },
  { song: 'Hotel California', artist: 'Eagles' },
  { song: 'Rolling in the Deep', artist: 'Adele' },
  { song: 'Smells Like Teen Spirit', artist: 'Nirvana' },
  { song: 'Clint Eastwood',  artist: 'Gorillaz' },
  { song: 'Uptown Funk',     artist: 'Mark Ronson ft. Bruno Mars' },
  { song: 'Seven Nation Army', artist: 'The White Stripes' },
  { song: 'Dreams',          artist: 'Fleetwood Mac' },
  { song: 'Levitating',      artist: 'Dua Lipa' },
  { song: 'Cruel Summer',    artist: 'Taylor Swift' }
]

export default function SongInput({ onAnalyze, isLoading }: Props) {
  const [mode,       setMode]       = useState<'name' | 'url'>('name')
  const [songName,   setSongName]   = useState('')
  const [artistName, setArtistName] = useState('')
  const [ytUrl,      setYtUrl]      = useState('')
  const [error,      setError]      = useState('')
  const [examples,   setExamples]   = useState<typeof ALL_EXAMPLES>([])

  // Randomise examples on mount (page refresh)
  useEffect(() => {
    const shuffled = [...ALL_EXAMPLES].sort(() => 0.5 - Math.random())
    setExamples(shuffled.slice(0, 3))
  }, [])

  const submit = async () => {
    setError('')
    if (mode === 'name') {
      if (!songName.trim() || !artistName.trim())
        return setError('Enter both song name and artist name.')
      await onAnalyze({ songName: songName.trim(), artistName: artistName.trim() })
    } else {
      if (!ytUrl.trim()) return setError('Paste a YouTube URL.')
      if (!ytUrl.includes('youtube') && !ytUrl.includes('youtu.be'))
        return setError('That doesn\'t look like a YouTube URL.')
      await onAnalyze({ youtubeUrl: ytUrl.trim() })
    }
  }

  return (
    <div className="w-full max-w-xl mx-auto">

      {/* ── Hero ── */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Waveform bars={5} height={36} color="#4ABA94" />
          <h1
            className="text-[var(--c-dark)]"
            style={{ fontFamily: 'var(--font-fraunces)', fontWeight: 600, fontSize: 'clamp(2rem,6vw,3.25rem)', lineHeight: 1.1 }}
          >
            SongMap
          </h1>
          <Waveform bars={5} height={36} color="#D0542D" />
        </div>
        <p className="text-[var(--c-secondary)]" style={{ fontSize: 15, letterSpacing: '0.02em' }}>
          Decode a song's beat DNA · Explore 50 matched tracks · Saved to your database
        </p>
      </div>

      {/* ── Mode tabs ── */}
      <div
        className="flex mb-5 p-1 rounded-xl"
        style={{ background: 'var(--c-tab-bg)', gap: 4 }}
      >
        {([['name', Music, 'Song name'], ['url', Link2, 'YouTube URL']] as const).map(([m, Icon, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background:  mode === m ? 'var(--c-card-bg)' : 'transparent',
              color:       mode === m ? 'var(--c-dark)' : 'var(--c-secondary)',
              boxShadow:   mode === m ? 'var(--c-shadow)' : 'none',
              border:      mode === m ? '1.5px solid var(--c-border)' : '1.5px solid transparent',
              fontFamily:  'var(--font-inter)',
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Inputs ── */}
      <div className="card p-6 mb-3">
        {mode === 'name' ? (
          <div className="space-y-3">
            <Field label="Song name" value={songName} onChange={setSongName}
              placeholder="Song name" onEnter={submit} />
            <Field label="Artist name" value={artistName} onChange={setArtistName}
              placeholder="Artist name" onEnter={submit} />
          </div>
        ) : (
          <Field label="YouTube URL" value={ytUrl} onChange={setYtUrl}
            placeholder="https://www.youtube.com/watch?v=..." onEnter={submit}
            mono />
        )}

        {error && (
          <div className="flex items-center gap-2 mt-4 text-sm" style={{ color: '#B84420' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={isLoading}
          className="w-full mt-5 py-3 rounded-xl flex items-center justify-center gap-2 font-medium text-sm transition-all"
          style={{
            background:   isLoading ? '#9CDFC6' : 'var(--c-primary)',
            color:        '#fff',
            cursor:       isLoading ? 'not-allowed' : 'pointer',
            letterSpacing:'0.01em',
          }}
        >
          {isLoading
            ? <><Loader2 size={15} className="animate-spin" /> Analysing beat DNA…</>
            : <><Search size={15} /> Analyse &amp; Explore</>}
        </button>
      </div>

      {/* ── Examples ── */}
      <div className="text-center">
        <p className="text-[var(--c-secondary)] font-semibold" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>
          Try an example
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {examples.map(ex => (
            <button
              key={ex.song}
              onClick={() => { setMode('name'); setSongName(ex.song); setArtistName(ex.artist) }}
              className="text-xs px-3 py-1.5 rounded-full transition-all border border-[var(--c-primary)] text-[var(--c-primary)] bg-transparent font-medium hover:bg-[var(--c-primary)]/10"
              style={{
                fontFamily: 'var(--font-inter)',
              }}
            >
              {ex.song} · {ex.artist}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, onEnter, mono = false }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder: string; onEnter: () => void; mono?: boolean
}) {
  return (
    <div>
      <label className="text-[var(--c-secondary)]" style={{ display: 'block', fontSize: 11, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={e => e.key === 'Enter' && onEnter()}
        style={{
          display:     'block',
          width:       '100%',
          padding:     '10px 14px',
          borderRadius: 10,
          border:      '1.5px solid var(--c-border)',
          background:  'var(--c-bg)',
          color:       'var(--c-dark)',
          fontSize:    14,
          fontFamily:  mono ? 'var(--font-mono)' : 'var(--font-inter)',
          outline:     'none',
        }}
      />
    </div>
  )
}

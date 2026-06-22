// lib/claude.ts (now uses Gemini API)
import { SongAnalysis, RecommendedSong } from './types'
import { callGemini, GeminiQuotaError } from './geminiClient'
import { searchTrack, getAudioFeatures, keySignatureFromFeatures, getSpotifyRecommendations, getFallbackPreview, fetchiTunesPreview } from './spotifyClient'

/** Simple in-memory cache — persists for the lifetime of the Next.js server process. */
const analysisCache = new Map<string, SongAnalysis>()
function cacheKey(title: string, artist: string) {
  return `${title.toLowerCase().trim()}||${artist.toLowerCase().trim()}`
}

/**
 * Dynamically generate a professional 2-sentence music analysis text based on key, bpm, energy, mood, and instruments.
 * Used to construct unique, context-aware analysis paragraphs when AI limits are reached.
 */
function getDynamicAnalysisText(
  title: string,
  artist: string,
  bpm: number,
  keySignature: string,
  timeSignature: string,
  energyLevel: 'low' | 'medium' | 'high',
  mood: string,
  instruments: Array<{ name: string; count: number; role: string }>
): string {
  const seed = `${title.toLowerCase()}||${artist.toLowerCase()}`
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  hash = Math.abs(hash)

  const inst1 = instruments[0]?.name || 'instrumentation'
  const inst2 = instruments[1]?.name || 'rhythm'
  const inst3 = instruments[2]?.name || 'melodic elements'
  const inst4 = instruments[4]?.name || 'vocals'

  const options = {
    low: [
      `A beautifully serene track featuring a prominent ${mood} mood, driven by delicate ${inst1} and an atmospheric ${energyLevel}-energy flow in ${keySignature}.`,
      `This introspective composition showcases a gentle ${timeSignature} signature, layered with organic ${inst3} that create a deeply ${mood} sonic landscape.`,
      `An understated and melancholic arrangement where the soft timbre of ${inst1} blends elegantly with the ${inst2} section at ${bpm} BPM.`
    ],
    medium: [
      `A compelling and balanced track combining a steady ${bpm} BPM groove with a nostalgic, ${mood} character in ${keySignature}.`,
      `This song blends dynamic ${inst2} and melodic ${inst3}, delivering a cohesive ${energyLevel}-energy feel.`,
      `Featuring prominent ${inst4} supported by a well-defined ${inst2} section, this track offers a highly engaging, ${mood} sound.`
    ],
    high: [
      `An energetic and driving track featuring an intense, ${mood} rhythm section at ${bpm} BPM with a powerful ${inst3} presence.`,
      `This high-octane composition highlights a prominent ${inst1} beat and a driving bass groove in ${keySignature}, creating an uplifting atmosphere.`,
      `A vibrant blend of ${inst3} and soaring ${inst4} that delivers a powerful, ${mood} sonic experience.`
    ]
  }

  const list = options[energyLevel]
  return list[hash % list.length]
}

/**
 * Generate a deterministic, realistic fallback song analysis based on title and artist hashing.
 * Prevents duplicate fallback values on the map when API limits are reached.
 */
function getDeterministicFallback(
  title: string,
  artist: string,
  youtubeId?: string
) {
  const seed = `${title.toLowerCase()}||${artist.toLowerCase()}`
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0 // Convert to 32bit integer
  }
  hash = Math.abs(hash)

  // BPM: 70 - 150
  const bpm = 70 + (hash % 81)

  // Keys
  const keys = [
    'C major', 'A minor', 'G major', 'E minor', 'D major', 'B minor',
    'A major', 'F# minor', 'E major', 'C# minor', 'F major', 'D minor',
    'Bb major', 'G minor', 'Eb major', 'C minor', 'Ab major', 'F minor'
  ]
  const keySignature = keys[hash % keys.length]

  // Time Signature
  const timeSignature = (hash % 10 === 0) ? '3/4' : '4/4'

  // Energy Level
  const energyLevel = bpm > 125 ? 'high' : bpm > 95 ? 'medium' : 'low'

  // Moods
  const moods = {
    low: ['melancholic', 'dreamy', 'introspective', 'chill', 'somber'],
    medium: ['chill', 'nostalgic', 'peaceful', 'hopeful', 'mellow'],
    high: ['uplifting', 'energetic', 'driving', 'passionate', 'intense']
  }
  const moodList = moods[energyLevel]
  const mood = moodList[hash % moodList.length]

  // Genres
  const genreOptions = [
    ['indie', 'pop'], ['rock', 'alternative'], ['pop', 'r&b'],
    ['electronic', 'synthpop'], ['acoustic', 'folk'], ['hip-hop', 'trap'],
    ['dance', 'house'], ['ambient', 'chillout']
  ]
  const genre = genreOptions[hash % genreOptions.length]

  // Instruments
  let instruments: { name: string; count: number; role: string }[] = []
  if (energyLevel === 'high') {
    instruments = [
      { name: 'Drums', count: bpm, role: 'rhythm' },
      { name: 'Bass guitar', count: Math.round(bpm / 3), role: 'bass' },
      { name: 'Electric guitar', count: Math.round(bpm / 2), role: 'harmony' },
      { name: 'Synthesizer', count: Math.round(bpm / 4), role: 'harmony' },
      { name: 'Lead vocal', count: Math.round(bpm / 2), role: 'vocal' }
    ]
  } else if (energyLevel === 'medium') {
    instruments = [
      { name: 'Kick drum', count: bpm, role: 'rhythm' },
      { name: 'Snare', count: Math.round(bpm / 2), role: 'rhythm' },
      { name: 'Bass guitar', count: Math.round(bpm / 4), role: 'bass' },
      { name: 'Acoustic guitar', count: Math.round(bpm / 2), role: 'harmony' },
      { name: 'Piano', count: Math.round(bpm / 3), role: 'harmony' },
      { name: 'Lead vocal', count: Math.round(bpm / 2), role: 'vocal' }
    ]
  } else {
    instruments = [
      { name: 'Soft percussion', count: bpm, role: 'rhythm' },
      { name: 'Acoustic bass', count: Math.round(bpm / 4), role: 'bass' },
      { name: 'Piano', count: Math.round(bpm / 2), role: 'harmony' },
      { name: 'Strings', count: Math.round(bpm / 5), role: 'texture' },
      { name: 'Lead vocal', count: Math.round(bpm / 2), role: 'vocal' }
    ]
  }

  // Beat Pattern
  const beatPatterns = {
    low: [
      `Gentle ${timeSignature} downbeat groove at ${bpm} BPM.`,
      `Sparse, atmospheric ambient pulses in ${keySignature}.`,
      `Relaxed acoustic shuffle style with steady ${timeSignature} feel.`
    ],
    medium: [
      `Mid-tempo driving rock/pop groove at ${bpm} BPM.`,
      `Steady, syncopated pocket beat with smooth drum fills.`,
      `Bouncy r&b-pop drum machine loop in ${keySignature}.`
    ],
    high: [
      `High-energy, driving four-on-the-floor beat at ${bpm} BPM.`,
      `Fast-paced, syncopated alternative rock drum pattern.`,
      `Driving electronic synthpop groove with double-time hats.`
    ]
  }
  const patternList = beatPatterns[energyLevel]
  const beatPattern = patternList[hash % patternList.length]

  const analysisText = getDynamicAnalysisText(title, artist, bpm, keySignature, timeSignature, energyLevel as 'low' | 'medium' | 'high', mood, instruments)

  return {
    title,
    artist,
    bpm,
    keySignature,
    timeSignature,
    energyLevel: energyLevel as 'low' | 'medium' | 'high',
    mood,
    genre,
    instruments,
    totalInstrumentCount: instruments.length,
    beatPattern,
    analysisText,
    previewUrl: undefined as string | undefined,
    albumArt: undefined as string | undefined,
    popularity: undefined as number | undefined,
    youtubeId
  }
}

/**
 * Analyze a song using Gemini API. Falls back to mock data when GEMINI_MOCK=true.
 */
export async function analyzeSong(
  title: string,
  artist: string,
  youtubeId?: string,
): Promise<SongAnalysis> {
  // Return cached result immediately if available
  const key = cacheKey(title, artist)
  if (analysisCache.has(key)) {
    console.log(`[Cache] Hit for "${title}" by "${artist}"`)
    return analysisCache.get(key)!
  }

  const prompt = `You are a professional music analyst. Analyze the song "${title}" by "${artist}". Return ONLY a valid JSON object — no markdown, no explanation — with exactly these fields:
- title (string): exact song title
- artist (string): exact artist name
- bpm (number): beats per minute
- keySignature (string): e.g. "A minor" or "F# major"
- timeSignature (string): e.g. "4/4"
- energyLevel (string): one of "low", "medium", "high"
- mood (string): e.g. "melancholic", "uplifting"
- genre (array of strings): e.g. ["pop", "R&B"]
- instruments (array of objects): each object has:
    name (string) — instrument name e.g. "kick drum"
    count (number) — how many times / how prominently it appears in the song (e.g. kick drum in a dance track = 120, snare = 60, guitar strum = 40)
    role (string) — one of "rhythm", "lead", "harmony", "bass", "texture", "vocal"
- totalInstrumentCount (number): total number of distinct instrument tracks
- beatPattern (string): describe the rhythmic groove
- analysisText (string): 2-3 sentence description of the song's overall sound
Do NOT include any explanations, markdown, or additional text.`

  let p: any = null
  let geminiError: any = null

  // Start both Gemini analysis and Spotify data fetching concurrently
  const geminiPromise = (async () => {
    try {
      const raw = await callGemini(prompt, 2000)
      const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      let parsed = null
      try {
        parsed = JSON.parse(clean)
      } catch (jsonErr) {
        const match = clean.match(/\{[\s\S]*\}/)
        if (match) {
          try {
            parsed = JSON.parse(match[0])
          } catch (_) {
            console.error('Failed to parse extracted JSON:', _)
          }
        } else {
          console.error('No JSON object found in Gemini response')
        }
      }
      return parsed
    } catch (err) {
      geminiError = err
      return null
    }
  })()

  const spotifyPromise = (async () => {
    try {
      const spotify = await searchTrack(title, artist)
      if (spotify) {
        const features = await getAudioFeatures(spotify.id)
        return { spotify, features }
      }
    } catch (e) {
      console.warn('Spotify enrichment failed in background:', e)
    }
    return null
  })()

  // Await both operations concurrently
  const [geminiResult, spotifyData] = await Promise.all([geminiPromise, spotifyPromise])

  if (geminiResult) {
    p = geminiResult
    // Enrich with the pre-fetched Spotify data if available
    if (spotifyData && spotifyData.spotify) {
      const { spotify, features } = spotifyData
      if (features) {
        p.bpm = Math.round(features.tempo)
        p.timeSignature = `${features.time_signature}/4`
        p.keySignature = keySignatureFromFeatures(features.key, features.mode)
      }
      p.previewUrl = spotify.preview_url ?? undefined
      p.albumArt = spotify.albumArt ?? undefined
      p.popularity = spotify.popularity ?? undefined
    }
  } else {
    // If Gemini failed, build fallback from hashing and Spotify (if available)
    console.error('Gemini API error:', geminiError)
    
    // Create fallback using deterministic hashing
    const fb = getDeterministicFallback(title, artist, youtubeId)

    if (spotifyData && spotifyData.spotify) {
      const { spotify, features } = spotifyData
      if (features) {
        fb.bpm = Math.round(features.tempo)
        fb.timeSignature = `${features.time_signature}/4`
        fb.keySignature = keySignatureFromFeatures(features.key, features.mode)
        fb.energyLevel = fb.bpm > 125 ? 'high' : fb.bpm > 95 ? 'medium' : 'low'
      }
      fb.previewUrl = spotify.preview_url ?? undefined
      fb.albumArt = spotify.albumArt ?? undefined
      fb.popularity = spotify.popularity ?? undefined
      
      // Update beatPattern dynamically based on Spotify BPM & energy
      const grooveType = fb.energyLevel === 'high' ? 'driving high-energy' : fb.energyLevel === 'medium' ? 'steady mid-tempo' : 'relaxed downbeat'
      fb.beatPattern = `${fb.bpm} BPM ${grooveType} groove in ${fb.keySignature} (${fb.timeSignature}).`
      
      // Regenerate the analysisText to match the Spotify-enriched variables!
      fb.analysisText = getDynamicAnalysisText(fb.title, fb.artist, fb.bpm, fb.keySignature, fb.timeSignature, fb.energyLevel, fb.mood, fb.instruments)
    }

    p = fb
  }

  // Ensure we have a valid analysis object
  if (!p) {
    console.warn('Gemini returned no valid analysis; using fallback values')
    p = {
      title,
      artist,
      bpm: 120,
      keySignature: 'Unknown',
      timeSignature: '4/4',
      energyLevel: 'medium',
      mood: '',
      genre: [],
      instruments: [],
      totalInstrumentCount: 0,
      beatPattern: '',
      analysisText: '',
    }
  }

  // Double check previewUrl and set fallback if empty (try iTunes directly first)
  if (!p.previewUrl) {
    try {
      const iTunesUrl = await fetchiTunesPreview(p.title || title, p.artist || artist)
      if (iTunesUrl) {
        p.previewUrl = iTunesUrl
      } else {
        p.previewUrl = getFallbackPreview(p.energyLevel)
      }
    } catch (e) {
      console.warn('iTunes direct query failed:', e)
      p.previewUrl = getFallbackPreview(p.energyLevel)
    }
  }

  const result: SongAnalysis = {
    title: p.title,
    artist: p.artist,
    bpm: p.bpm,
    keySignature: p.keySignature,
    timeSignature: p.timeSignature,
    energyLevel: p.energyLevel,
    mood: p.mood,
    genre: p.genre,
    instruments: p.instruments,
    totalInstrumentCount: p.totalInstrumentCount,
    beatPattern: p.beatPattern,
    analysisText: p.analysisText,
    previewUrl: p.previewUrl,
    albumArt: p.albumArt,
    popularity: p.popularity,
    youtubeId,
  }
  // Cache so repeated searches for the same song don't burn quota
  analysisCache.set(key, result)
  if (analysisCache.size > 200) {
    // Evict oldest entry to keep memory bounded
    analysisCache.delete(analysisCache.keys().next().value!)
  }
  return result
}

/**
 * Recommend songs using Gemini API. Falls back to mock data when GEMINI_MOCK=true.
 */
export async function recommendSongs(
  title: string,
  artist: string,
  analysis: SongAnalysis,
  excludeSongs: string[] = []
): Promise<RecommendedSong[]> {
  const instList = analysis.instruments
    .map(i => `${i.name} ×${i.count} (${i.role})`)
    .join(', ')

  const excludeText = excludeSongs.length > 0
    ? `\nDo NOT recommend any of these songs (already in the session): ${excludeSongs.join(', ')}`
    : ''

  const prompt = `You are a music curator specialising in beat and instrument matching.

Source song: "${title}" by "${artist}"
BPM: ${analysis.bpm} | Key: ${analysis.keySignature} | Time: ${analysis.timeSignature}
Energy: ${analysis.energyLevel} | Mood: ${analysis.mood}
Genres: ${analysis.genre.join(', ')}
Instruments (${analysis.totalInstrumentCount} total tracks): ${instList}
Beat pattern: ${analysis.beatPattern}

Recommend exactly 10 real existing songs that closely match the BEAT and INSTRUMENT profile above. Prioritise rhythmic/percussive similarity and BPM proximity (±15 BPM ideal).
${excludeText}

Return ONLY a valid JSON array of 10 objects — no markdown:
[
  { "title": "Song Title", "artist": "Artist Name", "reason": "One sentence on beat/instrument similarity" }
]

Rules:
- Vary genres while keeping the rhythmic feel
- ONLY return the JSON array`

  let parsed: any = null
    try {
      const raw = await callGemini(prompt, 2000)
      const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      try {
        parsed = JSON.parse(clean)
      } catch (jsonErr) {
        const match = clean.match(/\[.*\]/)
        if (match) {
          try {
            parsed = JSON.parse(match[0])
          } catch (_) {
            console.error('Failed to parse extracted recommendation JSON:', _)
            parsed = null
          }
        } else {
          console.error('No JSON array found in Gemini recommendation response')
          parsed = null
        }
      }
    } catch (error) {
      console.error('Gemini recommendation error:', error)
      try {
        const spotifyRecs = await getSpotifyRecommendations(title, artist, analysis.bpm)
        if (spotifyRecs && spotifyRecs.length > 0) {
          parsed = spotifyRecs
        }
      } catch (spErr) {
        console.error('Spotify recommendation fallback failed:', spErr)
      }

      if (!parsed || parsed.length === 0) {
        parsed = [
          { title: 'Blinding Lights', artist: 'The Weeknd', reason: 'High energy synthpop beat with similar driving tempo.' },
          { title: 'As It Was', artist: 'Harry Styles', reason: 'Upbeat indie-pop groove matching the energetic vibe.' },
          { title: 'Levitating', artist: 'Dua Lipa', reason: 'Disco-pop bassline and tempo aligned with the rhythm.' },
          { title: 'Cruel Summer', artist: 'Taylor Swift', reason: 'Dynamic pop production and comparable tempo.' },
          { title: 'Bad Habits', artist: 'Ed Sheeran', reason: 'Steady electronic beat matching the target tempo.' }
        ]
      }
    }
  return Array.isArray(parsed) ? parsed : []
}

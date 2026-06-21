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
    // If Gemini failed, build fallback from the pre-fetched Spotify data
    console.error('Gemini API error:', geminiError)
    
    if (spotifyData && spotifyData.spotify) {
      const { spotify, features } = spotifyData
      const isQuota = geminiError instanceof GeminiQuotaError
      const bpm = features?.tempo ? Math.round(features.tempo) : 120
      const timeSignature = features?.time_signature ? `${features.time_signature}/4` : '4/4'
      const keySignature = features ? keySignatureFromFeatures(features.key, features.mode) : 'Unknown'

      // Build template instruments from BPM range (meaningful even without AI)
      const isUpbeat = bpm > 110
      const isMid    = bpm >= 75 && bpm <= 110
      const instruments = isUpbeat
        ? [
            { name: 'Kick drum',     count: bpm, role: 'rhythm' },
            { name: 'Snare',         count: Math.round(bpm / 2), role: 'rhythm' },
            { name: 'Hi-hat',        count: bpm * 2, role: 'rhythm' },
            { name: 'Bass guitar',   count: Math.round(bpm / 4), role: 'bass' },
            { name: 'Synth / keys',  count: Math.round(bpm / 3), role: 'harmony' },
            { name: 'Lead vocal',    count: Math.round(bpm / 2), role: 'vocal' },
          ]
        : isMid
        ? [
            { name: 'Acoustic guitar', count: Math.round(bpm * 1.5), role: 'harmony' },
            { name: 'Kick drum',       count: bpm, role: 'rhythm' },
            { name: 'Snare',           count: Math.round(bpm / 2), role: 'rhythm' },
            { name: 'Bass',            count: Math.round(bpm / 3), role: 'bass' },
            { name: 'Lead vocal',      count: Math.round(bpm / 2), role: 'vocal' },
          ]
        : [
            { name: 'Piano / keys',  count: Math.round(bpm * 1.5), role: 'harmony' },
            { name: 'Soft drums',    count: bpm, role: 'rhythm' },
            { name: 'Bass',          count: Math.round(bpm / 3), role: 'bass' },
            { name: 'Strings',       count: Math.round(bpm / 4), role: 'texture' },
            { name: 'Lead vocal',    count: Math.round(bpm / 2), role: 'vocal' },
          ]

      const energyLevel = bpm > 130 ? 'high' : bpm > 90 ? 'medium' : 'low'
      const modeLabel   = keySignature.includes('minor') ? 'minor' : 'major'
      const moodLabel   = modeLabel === 'minor' ? 'introspective' : 'uplifting'
      const analysisNote = isQuota
        ? `⚠️ Gemini daily quota reached — showing Spotify audio data. Full AI analysis resumes tomorrow.`
        : `AI analysis temporarily unavailable — showing Spotify audio data.`

      p = {
        title,
        artist,
        bpm,
        keySignature,
        timeSignature,
        energyLevel: energyLevel as 'low' | 'medium' | 'high',
        mood: moodLabel,
        genre: [],
        instruments,
        totalInstrumentCount: instruments.length,
        beatPattern: `${bpm} BPM ${energyLevel}-energy groove in ${keySignature} (${timeSignature}).`,
        analysisText: analysisNote,
        previewUrl: spotify.preview_url ?? undefined,
        albumArt: spotify.albumArt ?? undefined,
        popularity: spotify.popularity ?? undefined,
        youtubeId,
      }
    } else if (process.env.GEMINI_MOCK === 'true') {
      // Deterministic mock based on title/artist
      const getMockAnalysis = (title: string, artist: string) => {
        const seed = title + artist
        let hash = 0
        for (let i = 0; i < seed.length; i++) {
          hash += seed.charCodeAt(i)
        }
        const bpm = 60 + (hash % 100) // 60-159 BPM
        const instrumentCount = 2 + (hash % 5) // 2-6 instruments
        const instruments = Array.from({ length: instrumentCount }).map((_, idx) => ({
          name: `instrument_${idx + 1}`,
          count: 1,
          role: 'rhythm',
        }))
        return {
          title,
          artist,
          bpm,
          keySignature: 'C major',
          timeSignature: '4/4',
          energyLevel: 'medium',
          mood: 'uplifting',
          genre: ['pop'],
          instruments,
          totalInstrumentCount: instrumentCount,
          beatPattern: 'Standard beat pattern',
          analysisText: 'Generated mock analysis based on input.',
          previewUrl: undefined,
        }
      }
      p = getMockAnalysis(title, artist)
    } else {
      const isQuota = geminiError instanceof GeminiQuotaError
      const analysisNote = isQuota
        ? `⚠️ Gemini daily quota reached — showing generic fallback audio data. Full AI analysis resumes tomorrow.`
        : `AI analysis temporarily unavailable — showing generic fallback audio data.`
      p = {
        title,
        artist,
        bpm: 120,
        keySignature: 'C major',
        timeSignature: '4/4',
        energyLevel: 'medium',
        mood: 'neutral',
        genre: [],
        instruments: [
          { name: 'Drums', count: 1, role: 'rhythm' },
          { name: 'Bass guitar', count: 1, role: 'bass' },
          { name: 'Keyboard', count: 1, role: 'harmony' }
        ],
        totalInstrumentCount: 3,
        beatPattern: 'Standard 4/4 pop/rock groove.',
        analysisText: analysisNote,
        previewUrl: undefined,
        albumArt: undefined,
      }
    }
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

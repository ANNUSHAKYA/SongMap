// lib/spotifyClient.ts
/**
 * Simple wrapper for Spotify API using Client Credentials flow.
 * Provides functions to search a track by title/artist, get audio features,
 * and obtain the preview URL.
 */
export interface SpotifyTrack {
  id: string
  name: string
  artists: string[]
  preview_url: string | null
  albumArt: string | null
  popularity?: number | null
}

export interface SpotifyAudioFeatures {
  tempo: number
  time_signature: number
  key: number          // Pitch class 0–11 (C=0, C#=1, … B=11), -1 if unknown
  mode: number         // 1=major, 0=minor
}

/** Converts Spotify pitch class + mode into a human-readable key signature string. */
const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export function keySignatureFromFeatures(key: number, mode: number): string {
  if (key < 0) return 'Unknown'
  const noteName = PITCH_NAMES[key] ?? 'Unknown'
  const modeName = mode === 1 ? 'major' : 'minor'
  return `${noteName} ${modeName}`
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Spotify client ID/secret not set in environment')
  }
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Spotify token error ${res.status}: ${err}`)
  }
  const data = await res.json()
  const token = data.access_token as string
  const expiresIn = (data.expires_in as number) * 1000
  cachedToken = { token, expiresAt: Date.now() + expiresIn - 60000 } // refresh 1 min early
  return token
}

function cleanString(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isMatch(artist1: string, title1: string, artist2: string, title2: string, ignoreArtist = false): boolean {
  const ca1 = cleanString(artist1)
  const ca2 = cleanString(artist2)
  const ct1 = cleanString(title1)
  const ct2 = cleanString(title2)

  const artistMatch = ignoreArtist || ca1.includes(ca2) || ca2.includes(ca1)
  const titleMatch = ct1.includes(ct2) || ct2.includes(ct1)

  return artistMatch && titleMatch
}

export async function searchTrack(title: string, artist: string): Promise<SpotifyTrack | null> {
  try {
    const token = await getAccessToken()
    
    // Clean terms for query to avoid strict API issues
    const cleanTitle = title
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\s*(official\s*)?(music\s*)?video/gi, '')
      .trim()
    const cleanArtist = artist.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim()

    // Try a fuzzy search with artist name and song title (much more robust)
    const query = encodeURIComponent(`${cleanArtist} ${cleanTitle}`)
    const url = `https://api.spotify.com/v1/search?q=${query}&type=track&limit=10`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    
    if (res.status === 401) {
      cachedToken = null
    }
    if (!res.ok) return null
    
    const data = await res.json()
    const items: any[] = data.tracks?.items ?? []
    if (items.length === 0) return null

    // Filter to find the best match where the artist matches (case-insensitive fuzzy check)
    let matchedItems = items.filter(t => {
      const trackArtists = t.artists?.map((a: any) => cleanString(a.name)) || []
      const targetArtistClean = cleanString(artist)
      return trackArtists.some((aName: string) => {
        return targetArtistClean.includes(aName) || aName.includes(targetArtistClean)
      })
    })

    // If artist matches, try to narrow down by title match
    if (matchedItems.length > 0) {
      const titleMatches = matchedItems.filter(t => {
        const ct1 = cleanString(title)
        const ct2 = cleanString(t.name)
        return ct1.includes(ct2) || ct2.includes(ct1)
      })
      if (titleMatches.length > 0) {
        matchedItems = titleMatches
      }
    } else {
      // Fallback: If no direct artist match, check for significant overlap in artist name
      const targetArtistWords = cleanString(artist).split(' ').filter(w => w.length > 2)
      matchedItems = items.filter(t => {
        const trackArtists = t.artists?.map((a: any) => cleanString(a.name)) || []
        return trackArtists.some((aName: string) => {
          return targetArtistWords.some(word => aName.includes(word))
        })
      })
    }

    // Safety fallback: if still no matches, only accept if title is an exact match
    if (matchedItems.length === 0) {
      const strictTitleMatches = items.filter(t => {
        return cleanString(title) === cleanString(t.name)
      })
      if (strictTitleMatches.length > 0) {
        matchedItems = strictTitleMatches
      } else {
        return null // Safer to return null than the wrong song preview!
      }
    }

    // Prefer a track that has a 30-sec preview
    const best = matchedItems.find(t => t.preview_url) ?? matchedItems[0]

    let preview_url = best.preview_url ?? null
    if (!preview_url) {
      preview_url = await fetchiTunesPreview(best.name || title, best.artists?.[0]?.name || artist)
    }

    return {
      id: best.id,
      name: best.name,
      artists: best.artists.map((a: any) => a.name),
      preview_url,
      albumArt: best.album?.images?.[0]?.url ?? null,
      popularity: best.popularity ?? null,
    }
  } catch (err) {
    console.error('[Spotify searchTrack Fail]', err)
    return null
  }
}

export async function getAudioFeatures(trackId: string): Promise<SpotifyAudioFeatures | null> {
  const token = await getAccessToken()
  const url = `https://api.spotify.com/v1/audio-features/${trackId}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    cachedToken = null
  }
  if (!res.ok) return null
  const data = await res.json()
  return {
    tempo: data.tempo,
    time_signature: data.time_signature,
    key: typeof data.key === 'number' ? data.key : -1,
    mode: typeof data.mode === 'number' ? data.mode : 1,
  }
}

export async function getSpotifyRecommendations(
  title: string,
  artist: string,
  targetBpm?: number
): Promise<{ title: string; artist: string; reason: string }[] | null> {
  try {
    const token = await getAccessToken()
    
    // Use our robust searchTrack helper to find the track and retrieve the correct ID
    const track = await searchTrack(title, artist)
    if (!track) {
      console.warn(`[Spotify Recs] Could not find seed track for "${title}" by "${artist}"`)
      return null
    }

    let url = `https://api.spotify.com/v1/recommendations?seed_tracks=${track.id}&limit=20`
    if (targetBpm) {
      url += `&target_tempo=${targetBpm}`
    }

    const recsRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (recsRes.status === 401) {
      cachedToken = null
    }
    if (!recsRes.ok) return null
    const recsData = await recsRes.json()
    const tracks: any[] = recsData.tracks ?? []
    return tracks.map(t => ({
      title: t.name,
      artist: t.artists[0]?.name ?? 'Unknown Artist',
      reason: `Matched via Spotify algorithms (seeded from "${title}" with similar rhythmic and acoustic properties).`
    }))
  } catch (err) {
    console.error('[Spotify Recs Fail]', err)
    return null
  }
}

export function getFallbackPreview(energy?: string): string {
  const energyLevel = (energy || 'medium').toLowerCase()
  if (energyLevel === 'low') {
    return 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
  } else if (energyLevel === 'high') {
    return 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
  } else {
    return 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'
  }
}

export async function fetchiTunesPreview(title: string, artist: string): Promise<string | null> {
  const trySearch = async (queryStr: string) => {
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(queryStr)}&media=music&limit=5`
      const res = await fetch(url)
      if (!res.ok) return []
      const data = await res.json()
      return data.results || []
    } catch {
      return []
    }
  }

  try {
    const cleanTitle = title.replace(/\s*[\(\[]\s*(official\s*)?(music\s*)?video[\)\]]/gi, '').trim()
    
    // 1. Strict Search: Artist + Title (verify both)
    let results = await trySearch(`${artist} ${cleanTitle}`)
    let matched = results.filter((r: any) => r.previewUrl && isMatch(artist, cleanTitle, r.artistName, r.trackName))
    
    if (matched.length > 0) {
      return matched[0].previewUrl
    }

    // 2. Loose Search: Title only (verify both to handle typos in artist name)
    results = await trySearch(cleanTitle)
    matched = results.filter((r: any) => r.previewUrl && isMatch(artist, cleanTitle, r.artistName, r.trackName))
    if (matched.length > 0) {
      return matched[0].previewUrl
    }

    // 3. Loose Search: Artist only (verify both to handle typos in title)
    results = await trySearch(artist)
    matched = results.filter((r: any) => r.previewUrl && isMatch(artist, cleanTitle, r.artistName, r.trackName))
    if (matched.length > 0) {
      return matched[0].previewUrl
    }

    // 4. Title-Only Fallback: Ignore artist to handle wrong/hallucinated artist names
    results = await trySearch(cleanTitle)
    matched = results.filter((r: any) => r.previewUrl && isMatch(artist, cleanTitle, r.artistName, r.trackName, true)) // ignoreArtist = true
    if (matched.length > 0) {
      return matched[0].previewUrl
    }

    return null
  } catch (err) {
    console.warn('[iTunes Fallback Error]', err)
    return null
  }
}


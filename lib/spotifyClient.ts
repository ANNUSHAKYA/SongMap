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
  const token = await getAccessToken()
  const query = encodeURIComponent(`track:${title} artist:${artist}`)
  const url = `https://api.spotify.com/v1/search?q=${query}&type=track&limit=5`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    cachedToken = null
  }
  if (!res.ok) return null
  const data = await res.json()
  const items: any[] = data.tracks?.items ?? []
  
  // 1. Try to find matched items verifying both artist and title
  let matchedItems = items.filter(t => {
    const trackTitle = t.name || ''
    const trackArtists = t.artists?.map((a: any) => a.name).join(' ') || ''
    return isMatch(artist, title, trackArtists, trackTitle)
  })

  // 2. If verified fails, try title-only search as fallback (e.g. if artist is misspelled/hallucinated)
  if (matchedItems.length === 0 && items.length > 0) {
    matchedItems = items.filter(t => {
      const trackTitle = t.name || ''
      const trackArtists = t.artists?.map((a: any) => a.name).join(' ') || ''
      return isMatch(artist, title, trackArtists, trackTitle, true) // ignoreArtist = true
    })
  }

  // 3. If still 0, try searching Spotify with title-only query
  if (matchedItems.length === 0) {
    try {
      const titleOnlyUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(title)}&type=track&limit=5`
      const resTitle = await fetch(titleOnlyUrl, { headers: { Authorization: `Bearer ${token}` } })
      if (resTitle.ok) {
        const dataTitle = await resTitle.json()
        const itemsTitle = dataTitle.tracks?.items ?? []
        matchedItems = itemsTitle.filter((t: any) => {
          const trackTitle = t.name || ''
          const trackArtists = t.artists?.map((a: any) => a.name).join(' ') || ''
          return isMatch(artist, title, trackArtists, trackTitle, true) // ignoreArtist = true
        })
      }
    } catch (e) {
      console.warn('[Spotify Title-Only Fallback Exception]', e)
    }
  }

  if (matchedItems.length === 0) return null

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
    
    // First, find the track on Spotify to get its ID
    const query = encodeURIComponent(`track:${title} artist:${artist}`)
    const searchUrl = `https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (searchRes.status === 401) {
      cachedToken = null
    }
    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    const track = searchData.tracks?.items?.[0]
    if (!track) return null
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


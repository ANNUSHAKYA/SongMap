let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getSpotifyAccessToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret || clientId === 'spotify_id_placeholder' || clientSecret === 'spotify_secret_placeholder') {
    console.warn('[Spotify] Client credentials not configured. Graceful fallback enabled.')
    return null
  }

  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken
  }

  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[Spotify] Auth failed:', errText)
      return null
    }

    const data = await res.json()
    cachedToken = data.access_token
    tokenExpiresAt = Date.now() + (data.expires_in * 1000)
    return cachedToken!
  } catch (error) {
    console.error('[Spotify] Auth exception:', error)
    return null
  }
}

export interface SpotifyTrackMeta {
  trackId: string | null
  albumArt: string | null
  previewUrl: string | null
  popularity: number | null
}

/** Search Spotify; returns up to 5 results and picks the one with a preview_url. */
async function searchItems(query: string, token: string, limit = 5): Promise<any[]> {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
  if (res.status === 401) {
    cachedToken = null
  }
  if (!res.ok) return []
  const data = await res.json()
  return data.tracks?.items ?? []
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

export async function searchSpotifyTrack(title: string, artist: string): Promise<SpotifyTrackMeta> {
  const empty: SpotifyTrackMeta = { trackId: null, albumArt: null, previewUrl: null, popularity: null }
  const token = await getSpotifyAccessToken()
  if (!token) return empty

  try {
    // Try strict query first, then broad fallback
    const strictItems = await searchItems(`track:${title} artist:${artist}`, token, 5)
    const broadItems  = strictItems.length === 0
      ? await searchItems(`${title} ${artist}`, token, 5)
      : []
    const items: any[] = [...strictItems, ...broadItems]

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
        const titleOnlyItems = await searchItems(title, token, 5)
        matchedItems = titleOnlyItems.filter(t => {
          const trackTitle = t.name || ''
          const trackArtists = t.artists?.map((a: any) => a.name).join(' ') || ''
          return isMatch(artist, title, trackArtists, trackTitle, true) // ignoreArtist = true
        })
      } catch (e) {
        console.warn('[Spotify searchSpotifyTrack Title-Only Fallback Exception]', e)
      }
    }

    if (matchedItems.length === 0) {
      console.warn(`[Spotify] No verified track found for: ${title} – ${artist}`)
      return empty
    }

    // Prefer a track that has a 30-sec preview
    const best = matchedItems.find((t) => t.preview_url) ?? matchedItems[0]
    const images = best.album?.images ?? []

    let previewUrl = best.preview_url ?? null
    if (!previewUrl) {
      previewUrl = await fetchiTunesPreview(best.name || title, best.artists?.[0]?.name || artist)
    }

    return {
      trackId: best.id ?? null,
      albumArt: images[0]?.url ?? images[1]?.url ?? null,
      previewUrl,
      popularity: best.popularity ?? null,
    }
  } catch (error) {
    console.error('[Spotify] Search exception:', error)
    return empty
  }
}

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export interface SpotifyAudioData {
  bpm: number
  timeSignature: string
  keySignature: string
}

export async function getSpotifyAudioData(trackId: string): Promise<SpotifyAudioData | null> {
  const token = await getSpotifyAccessToken()
  if (!token) return null
  try {
    const res = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (res.status === 401) {
      cachedToken = null
    }
    if (!res.ok) return null
    const d = await res.json()
    const key: number = typeof d.key === 'number' ? d.key : -1
    const mode: number = typeof d.mode === 'number' ? d.mode : 1
    const keyName = key >= 0 ? `${PITCH_NAMES[key]} ${mode === 1 ? 'major' : 'minor'}` : 'Unknown'
    return {
      bpm: d.tempo ? Math.round(d.tempo) : 120,
      timeSignature: d.time_signature ? `${d.time_signature}/4` : '4/4',
      keySignature: keyName,
    }
  } catch {
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

async function fetchiTunesPreview(title: string, artist: string): Promise<string | null> {
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


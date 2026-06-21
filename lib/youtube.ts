export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

export function buildYouTubeUrl(id: string) {
  return `https://www.youtube.com/watch?v=${id}`
}

export function buildYouTubeSearchUrl(song: string, artist: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${song} official`)}`
}

/**
 * Strips common YouTube video suffixes that pollute song titles when
 * passed to Spotify or AI analysis.
 * e.g. "Shape of You (Official Music Video)" → "Shape of You"
 */
export function cleanYouTubeTitle(raw: string): string {
  return raw
    .replace(/\s*[\(\[]\s*(official\s*)?(music\s*)?video[\)\]]/gi, '')
    .replace(/\s*[\(\[]\s*(official\s*)?audio[\)\]]/gi, '')
    .replace(/\s*[\(\[]\s*lyrics?\s*(video)?[\)\]]/gi, '')
    .replace(/\s*[\(\[]\s*(official\s*)?visualizer[\)\]]/gi, '')
    .replace(/\s*[\(\[]\s*hd\s*[\)\]]/gi, '')
    .replace(/\s*[\(\[]\s*4k\s*[\)\]]/gi, '')
    .replace(/\s*[\(\[]\s*live\s*(performance|session|at.+)?[\)\]]/gi, '')
    .replace(/\s*\|\s*.+$/, '')           // strip " | Channel Name" suffixes
    .replace(/\s*ft\.\s*/gi, ' feat. ')   // normalise featuring
    .trim()
}

export async function fetchYouTubeMeta(
  videoId: string,
  apiKey: string
): Promise<{ title: string; artist: string } | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
    )
    const data = await res.json()
    if (!data.items?.length) return null
    const snippet = data.items[0].snippet
    const rawTitle: string = snippet.title || ''
    let title = cleanYouTubeTitle(rawTitle)
    let artist = (snippet.channelTitle || '').replace(/ - Topic$/, '').trim()
    const dash = rawTitle.match(/^(.+?)\s[-–]\s(.+)$/)
    if (dash) { artist = dash[1].trim(); title = cleanYouTubeTitle(dash[2].trim()) }
    return { title, artist }
  } catch { return null }
}

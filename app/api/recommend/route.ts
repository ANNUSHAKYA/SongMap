import { NextRequest, NextResponse } from 'next/server'
import { recommendSongs, analyzeSong } from '@/lib/claude'
import { saveSong, getSessionSongs } from '@/lib/db'
import { buildYouTubeSearchUrl } from '@/lib/youtube'

const getNormalizeKey = (title: string, artist: string) => {
  return `${title.toLowerCase().replace(/[^a-z0-9]/g, '')}||${artist.toLowerCase().replace(/[^a-z0-9]/g, '')}`
}

export async function POST(req: NextRequest) {
  try {
    const { parentSongId, sessionId, parentAnalysis, depth } = await req.json()
    if (!parentSongId || !sessionId || !parentAnalysis)
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })

    if (depth >= 10)
      return NextResponse.json({ recommendations: [], message: 'Max depth reached.' })

    // Fetch existing songs in this session to filter out duplicates
    const existingSongs = await getSessionSongs(sessionId)
    const existingKeys = new Set(
      existingSongs.map(s => getNormalizeKey(s.analysis.title, s.analysis.artist))
    )

    // Build exclusion list for the AI curator prompt
    const excludeList = existingSongs.map(s => `"${s.analysis.title}" by "${s.analysis.artist}"`)

    const rawRecs = await recommendSongs(
      parentAnalysis.title,
      parentAnalysis.artist,
      parentAnalysis,
      excludeList
    )

    // Deduplicate recommendations at the route level (against DB items and current batch)
    const uniqueRecs: typeof rawRecs = []
    const seenNewKeys = new Set<string>()

    for (const rec of rawRecs) {
      const key = getNormalizeKey(rec.title, rec.artist)
      if (!existingKeys.has(key) && !seenNewKeys.has(key)) {
        seenNewKeys.add(key)
        uniqueRecs.push(rec)
      }
    }

    // Process exactly 5 unique recommendations
    const recs = uniqueRecs.slice(0, 5)

    const results = await Promise.all(
      recs.map(async (rec) => {
        try {
          // Fetch AI analysis (automatically enriched with Spotify metadata & iTunes fallbacks)
          const analysis = await analyzeSong(rec.title, rec.artist)
 
          const youtubeSearchUrl  = buildYouTubeSearchUrl(rec.title, rec.artist)
          analysis.youtubeUrl     = youtubeSearchUrl
 
          const songId            = await saveSong({ analysis, sessionId, parentId: parentSongId, depth })
          return { songId, analysis, reason: rec.reason, youtubeSearchUrl }
        } catch (e) {
          console.error('rec failed:', e)
          return null
        }
      })
    )

    return NextResponse.json({ recommendations: results.filter(Boolean) })
  } catch (err) {
    console.error('[recommend]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Recommendations failed.' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { analyzeSong } from '@/lib/claude'
import { createSession, saveSong, updateSession } from '@/lib/db'
import { extractYouTubeId, fetchYouTubeMeta, cleanYouTubeTitle } from '@/lib/youtube'

export async function POST(req: NextRequest) {
  try {
    const { youtubeUrl, songName, artistName } = await req.json()
    let title: string, artist: string, youtubeId: string | undefined

    if (youtubeUrl) {
      const id = extractYouTubeId(youtubeUrl)
      if (!id) return NextResponse.json({ error: 'Invalid YouTube URL.' }, { status: 400 })
      youtubeId = id
      const apiKey = process.env.YOUTUBE_API_KEY
      const meta = apiKey ? await fetchYouTubeMeta(id, apiKey) : null
      // cleanYouTubeTitle strips "(Official Music Video)" etc.
      title  = meta?.title  ? cleanYouTubeTitle(meta.title)  : (songName   || 'Unknown Song')
      artist = meta?.artist || artistName || 'Unknown Artist'
    } else if (songName && artistName) {
      title = cleanYouTubeTitle(songName.trim())
      artist = artistName.trim()
    } else {
      return NextResponse.json(
        { error: 'Provide a YouTube URL or both song name and artist name.' },
        { status: 400 }
      )
    }

    const seedInput = youtubeUrl || `${title} – ${artist}`
    const sessionId = await createSession(seedInput)
    
    // Fetch AI analysis (which automatically enriches with Spotify data & iTunes fallbacks)
    const analysis = await analyzeSong(title, artist, youtubeId)
 
    if (youtubeId)  analysis.youtubeId  = youtubeId
    if (youtubeUrl) analysis.youtubeUrl = youtubeUrl
 
    const songId = await saveSong({ analysis, sessionId, depth: 0 })
    await updateSession(sessionId, { seed_song_id: songId })
 
    return NextResponse.json({ songId, sessionId, analysis })
  } catch (err) {
    console.error('[analyze]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed.' },
      { status: 500 }
    )
  }
}

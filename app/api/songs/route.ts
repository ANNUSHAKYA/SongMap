import { NextRequest, NextResponse } from 'next/server'
import { getSessionSongs, getRecentSessions } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const sessionId = new URL(req.url).searchParams.get('sessionId')
    if (sessionId) {
      const songs = await getSessionSongs(sessionId)
      return NextResponse.json({ songs })
    }
    const sessions = await getRecentSessions(20)
    return NextResponse.json({ sessions })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed.' }, { status: 500 })
  }
}

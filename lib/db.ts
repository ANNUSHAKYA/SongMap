import { supabaseAdmin } from './supabase'
import { SongAnalysis } from './types'
import { buildYouTubeUrl, buildYouTubeSearchUrl } from './youtube'

export async function createSession(seedInput: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('sessions')
    .insert({ seed_input: seedInput, total_songs: 0 })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

export async function updateSession(id: string, patch: { seed_song_id?: string; total_songs?: number }) {
  const row: Record<string, unknown> = {}
  if (patch.seed_song_id)            row.seed_song_id = patch.seed_song_id
  if (patch.total_songs !== undefined) row.total_songs = patch.total_songs
  await supabaseAdmin.from('sessions').update(row).eq('id', id)
}

export async function saveSong(p: {
  analysis: SongAnalysis
  sessionId: string
  parentId?: string
  depth: number
}): Promise<string> {
  const ytUrl = p.analysis.youtubeId
    ? buildYouTubeUrl(p.analysis.youtubeId)
    : (p.analysis.youtubeUrl || buildYouTubeSearchUrl(p.analysis.title, p.analysis.artist))

  const { data, error } = await supabaseAdmin
    .from('songs')
    .insert({
      title:              p.analysis.title,
      artist:             p.analysis.artist,
      youtube_url:        ytUrl,
      youtube_id:         p.analysis.youtubeId || null,
      bpm:                p.analysis.bpm,
      key_signature:      p.analysis.keySignature,
      time_signature:     p.analysis.timeSignature,
      energy_level:       p.analysis.energyLevel,
      mood:               p.analysis.mood,
      genre:              p.analysis.genre,
      instruments:        p.analysis.instruments,
      total_instrument_count: p.analysis.totalInstrumentCount,
      beat_pattern:       p.analysis.beatPattern,
      analysis_text:      p.analysis.analysisText,
      album_art:          p.analysis.albumArt || null,
      preview_url:        p.analysis.previewUrl || null,
      popularity:         p.analysis.popularity || null,
      session_id:         p.sessionId,
      parent_id:          p.parentId || null,
      depth:              p.depth,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  // Increment session counter
  const { data: sess } = await supabaseAdmin
    .from('sessions').select('total_songs').eq('id', p.sessionId).single()
  if (sess) {
    await supabaseAdmin
      .from('sessions')
      .update({ total_songs: (sess.total_songs || 0) + 1 })
      .eq('id', p.sessionId)
  }

  return data.id
}

export async function getSessionSongs(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from('songs')
    .select('*')
    .eq('session_id', sessionId)
    .order('depth')
    .order('created_at')
  
  if (error) throw new Error(error.message)
  
  return (data || []).map(row => ({
    id: row.id,
    parentId: row.parent_id,
    depth: row.depth,
    analysis: {
      title: row.title,
      artist: row.artist,
      youtubeUrl: row.youtube_url,
      youtubeId: row.youtube_id,
      bpm: row.bpm,
      keySignature: row.key_signature,
      timeSignature: row.time_signature,
      energyLevel: row.energy_level,
      mood: row.mood,
      genre: row.genre || [],
      instruments: row.instruments || [],
      totalInstrumentCount: row.total_instrument_count,
      beatPattern: row.beat_pattern,
      analysisText: row.analysis_text,
      albumArt: row.album_art,
      previewUrl: row.preview_url,
      popularity: row.popularity,
    }
  }))
}

export async function getRecentSessions(limit = 10) {
  const { data } = await supabaseAdmin
    .from('sessions')
    .select('*, songs(title, artist, album_art)')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

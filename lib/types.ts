export interface InstrumentDetail {
  name: string
  count: number
  role: string   // e.g. "rhythm", "lead", "harmony"
}

export interface SongAnalysis {
  title: string
  artist: string
  youtubeUrl?: string
  youtubeId?: string
  bpm: number
  keySignature: string
  timeSignature: string
  energyLevel: 'low' | 'medium' | 'high'
  mood: string
  genre: string[]
  instruments: InstrumentDetail[]
  totalInstrumentCount: number
  beatPattern: string
  analysisText: string
  albumArt?: string
  previewUrl?: string
  popularity?: number
}

export interface RecommendedSong {
  title: string
  artist: string
  reason: string
}

export interface SongNode {
  songId: string
  sessionId: string
  analysis: SongAnalysis
  depth: number
  parentId?: string
  reason?: string
  youtubeSearchUrl?: string
  recommendations?: SongNode[]
  isExpanded: boolean
  isLoadingRecs: boolean
}

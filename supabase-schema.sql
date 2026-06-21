-- ================================================================
-- SONGMAP — Database Schema
-- Paste this entire file into Supabase SQL Editor and click Run
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Sessions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seed_input    TEXT        NOT NULL,
  seed_song_id  UUID,
  total_songs   INTEGER     DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Songs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS songs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title                 TEXT        NOT NULL,
  artist                TEXT        NOT NULL,
  youtube_url           TEXT,
  youtube_id            TEXT,

  -- Beat analysis
  bpm                   INTEGER,
  key_signature         TEXT,
  time_signature        TEXT,
  energy_level          TEXT,          -- 'low' | 'medium' | 'high'
  mood                  TEXT,
  genre                 TEXT[],

  -- Instruments stored as JSONB array:
  -- [{ "name": "kick drum", "count": 1, "role": "rhythm" }, ...]
  instruments           JSONB,
  total_instrument_count INTEGER,
  beat_pattern          TEXT,
  analysis_text         TEXT,

  -- Spotify Metadata
  album_art             TEXT,
  preview_url           TEXT,
  popularity            INTEGER,

  -- Tree metadata
  session_id   UUID REFERENCES sessions(id),
  parent_id    UUID REFERENCES songs(id),
  depth        INTEGER DEFAULT 0,

  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Add seed_song FK after songs table exists
ALTER TABLE sessions
  ADD CONSTRAINT fk_sessions_seed_song
  FOREIGN KEY (seed_song_id) REFERENCES songs(id);

-- ── Indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_songs_session  ON songs(session_id);
CREATE INDEX IF NOT EXISTS idx_songs_parent   ON songs(parent_id);
CREATE INDEX IF NOT EXISTS idx_songs_depth    ON songs(depth);
CREATE INDEX IF NOT EXISTS idx_songs_artist   ON songs(artist);
CREATE INDEX IF NOT EXISTS idx_sessions_time  ON sessions(created_at DESC);

-- ── updated_at trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER songs_updated_at
  BEFORE UPDATE ON songs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row Level Security ──────────────────────────────────────────
ALTER TABLE songs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Public can read
CREATE POLICY "public_read_songs"    ON songs    FOR SELECT USING (true);
CREATE POLICY "public_read_sessions" ON sessions FOR SELECT USING (true);

-- Service role can write (used by server-side API routes)
CREATE POLICY "service_insert_songs"    ON songs    FOR INSERT WITH CHECK (true);
CREATE POLICY "service_update_songs"    ON songs    FOR UPDATE USING (true);
CREATE POLICY "service_insert_sessions" ON sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "service_update_sessions" ON sessions FOR UPDATE USING (true);

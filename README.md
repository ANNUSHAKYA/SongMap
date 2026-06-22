# 🎵 SongMap — Rhythmic DNA Explorer & Curator

Analyse any song's beat DNA, BPM, and instrument counts — then explore up to 50 beat-matched recommendations in an interactive, auto-growing hierarchical tree. Seamlessly save your sessions to Supabase, play 30-second audio previews, and export interactive PDF reports.

**Stack:** Next.js 16 (Turbopack) · React 19 · React Flow v12 · Tailwind CSS · Gemini API (with 15-model rotation) · Spotify API · Supabase · Vercel

---

## ✨ Features

- **Vinyl Record Landing Page**: Dynamic, spinning vinyl album animation powered by Framer Motion. The needle tonearm reacts dynamically, and the record spins faster during analysis.
- **Interactive React Flow Graph**: A fully interactive tree map layout presenting parent-to-child recommendations. Edges animate dynamically with custom stroke colors aligned with active nodes.
- **Rich Song Dashboard**: Clicking a node reveals a sidebar dashboard featuring:
  - **30s Audio Player**: Playable Spotify preview clips with interactive seekbar and volume/mute controls.
  - **BPM Speedometer**: A retro circular gauge dial indicating tempo.
  - **Instrument charts**: Smooth bar charts grouping instrument arrangements by roles (Lead, Rhythm, Harmony, Texture, Vocal).
- **Auto-Grow Loop**: Tap one button to let the tree automatically expand itself. An intelligent search-and-grow algorithm expands the tree to exactly 50 songs, avoiding infinite loops by tracking attempted nodes.
- **List View & Milestone Confetti**: Once the graph reaches 50 songs, a celebratory confetti blast triggers, and the workspace switches to a beautiful tabular list. A custom toggle lets you switch between list and tree views at any point.
- **Hyperlinked PDF Exporter**: Export the 50-song list into a multi-page PDF report. Includes key signatures, BPMs, AI matching reasons, and active clickable hyperlinks to stream/search them on Spotify and YouTube.
- **Mint-Slate Theme System**: Premium, custom CSS variable-based transition system supporting Light and Dark modes.
- **Self-Healing API Resiliency**: 
  - **Gemini Model Rotation**: Automatically rotates between 15 different Gemini models in real time to avoid `429 Too Many Requests` quota issues.
  - **Deterministic fallbacks**: Generates context-aware deterministic analysis text if APIs are rate-limited.
  - **Multi-layered Recommendation Fallbacks**: Falls back to Spotify Recommendations API and a 60-song beat-matched pool to guarantee the API always returns 10 unique recommendations.

---

## 📂 Project Structure

```
songmap/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts       # Seeds session, runs Gemini/Spotify analysis
│   │   ├── recommend/route.ts     # Generates, filters, and saves recommendations
│   │   └── songs/route.ts         # Session history and list retrieval
│   ├── globals.css                # Slate-mint theme variables & global styles
│   ├── layout.tsx                 # HTML structure and theme context setup
│   └── page.tsx                   # Vinyl landing, main workspace & layouts
├── components/
│   ├── ThemeContext.tsx           # Dark/Light mode context provider
│   ├── SongInput.tsx              # Input form and "Try an Example" randomizer
│   ├── SongFlowGraph.tsx          # Custom React Flow canvas (v12)
│   ├── DashboardPanel.tsx         # Sidebar audio player, BPM dial, instrument charts
│   └── ProgressBar.tsx            # Session progress indicator
├── lib/
│   ├── geminiClient.ts            # Gemini API wrapper with 15-model quota rotation
│   ├── spotifyClient.ts           # Token-cached Spotify search and recommendations Client
│   ├── claude.ts                  # Consolidated analysis & fallback recommenders
│   ├── db.ts                      # Supabase schema helper queries and insertions
│   ├── supabase.ts                # Supabase admin client initialization
│   ├── youtube.ts                 # YouTube metadata fetcher and title cleaner
│   └── pdfGenerator.ts            # jsPDF multi-page report builder
├── proxy.ts                       # Next.js 16-compliant CORS middleware proxy
├── supabase-schema.sql            # Database tables setup schema
└── .env.local.example             # Clean environment variables template
```

---

## 🛠️ Supabase Database Schema

Run the following SQL setup queries in your **Supabase SQL Editor** to initialize the database:

### `sessions` table
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_input TEXT NOT NULL,
  seed_song_id UUID,
  total_songs INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### `songs` table
```sql
CREATE TABLE songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES songs(id) ON DELETE SET NULL,
  depth INTEGER NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  youtube_url TEXT,
  youtube_id TEXT,
  bpm INTEGER NOT NULL,
  key_signature TEXT NOT NULL,
  time_signature TEXT NOT NULL,
  energy_level TEXT NOT NULL,
  mood TEXT NOT NULL,
  genre TEXT[] DEFAULT '{}',
  instruments JSONB DEFAULT '[]',
  total_instrument_count INTEGER DEFAULT 0,
  beat_pattern TEXT,
  analysis_text TEXT,
  album_art TEXT,
  preview_url TEXT,
  popularity INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## ⚙️ Environment Variables (`.env.local`)

Copy `.env.local.example` to `.env.local` and fill in your keys:

```env
# 1. Google Gemini API — https://aistudio.google.com
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MOCK=false

# 2. Supabase Settings — Project Settings -> API
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# 3. Spotify Developer Account — https://developer.spotify.com
SPOTIFY_CLIENT_ID=YOUR_SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET=YOUR_SPOTIFY_CLIENT_SECRET

# 4. Google Cloud Platform YouTube Data API v3 (Optional)
YOUTUBE_API_KEY=YOUR_YOUTUBE_API_KEY

# 5. Remote API Routing URL (Optional - e.g. for Render backend proxies)
NEXT_PUBLIC_API_URL=
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the app.

### 3. Build for Production
Verify typescript compilation and optimized page generation:
```bash
npm run build
```

---

## 🧪 Testing Checklist
- [ ] **Vinyl Showcase**: Refresh page and confirm 3 random example pills shuffle dynamically. Click one to instantly load it in the input forms.
- [ ] **Analyze Song**: Input a song name/artist or paste a YouTube URL and click **Analyse & Explore**. Vinyl record should spin fast and load.
- [ ] **Dashboard Stats**: Click any node on the tree. The SVG BPM Needle gauge should dial to the tempo, instrument arrangement charts should load, and audio previews should play.
- [ ] **Expand Matched Songs**: Click **Expand 5 matched songs** at the bottom of the dashboard. Observe 5 child nodes appear immediately on the flow map.
- [ ] **Auto-Grow Tree**: Tap **Auto-Grow Tree to 50 Songs** and verify that it recursively branches, deduplicates existing tracks, and grows the session to 50 songs.
- [ ] **confetti & List View**: Upon reaching 50 tracks, verify a confetti blast triggers, and the UI shifts to a clean, tabular list view showing all songs.
- [ ] **PDF Exporter**: Click **Download PDF Report**. Verify it compiles a multi-page PDF where Spotify/YouTube icons represent working clickable hyperlinked search pages.

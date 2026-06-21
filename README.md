# 🎵 SongMap — Beat DNA Explorer

Analyse any song's beats, BPM, and instrument counts — then explore up to 50 beat-matched recommendations in an infinite tree. Everything is saved to Supabase.

**Stack:** Next.js 14 · TypeScript · Tailwind CSS · Anthropic Claude · Supabase · Vercel

---

## 🗺 Complete Cursor Roadmap

Follow these steps **in order** inside Cursor to build and ship this app.

---

### PHASE 1 — Project Setup in Cursor

**Step 1.1 — Open the project**
1. Download and unzip `songmap.zip`
2. Open Cursor → File → Open Folder → select the `songmap` folder

**Step 1.2 — Install dependencies**
Open the Cursor terminal (`` Ctrl+` ``) and run:
```bash
npm install
```

**Step 1.3 — Check the file tree**
You should see:
```
songmap/
├── app/
│   ├── api/analyze/route.ts
│   ├── api/recommend/route.ts
│   ├── api/songs/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ProgressBar.tsx
│   ├── SongCard.tsx
│   ├── SongInput.tsx
│   ├── SongTree.tsx
│   └── Waveform.tsx
├── lib/
│   ├── claude.ts
│   ├── db.ts
│   ├── supabase.ts
│   ├── types.ts
│   └── youtube.ts
├── supabase-schema.sql
├── vercel.json
└── .env.local.example
```

---

### PHASE 2 — Get API Keys (15 minutes)

#### A) Anthropic (required)
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up → **API Keys** → **Create Key**
3. Copy `sk-ant-…`

#### B) Supabase (required)
1. Go to [supabase.com](https://supabase.com) → **New project**
2. Wait ~2 minutes for it to spin up
3. Go to **Project Settings → API**, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`
4. Go to **SQL Editor** → paste **all** of `supabase-schema.sql` → **Run**
   - You should see "Success. No rows returned."

#### C) YouTube API (optional — recommended)
Without this, title/artist is inferred from the URL. With it, you get accurate metadata.
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create or pick a project
3. **APIs & Services → Enable APIs** → search "YouTube Data API v3" → Enable
4. **Credentials → Create Credentials → API Key**
5. Copy `AIza…`

---

### PHASE 3 — Configure Environment

**Step 3.1 — Create your `.env.local`**
In the Cursor terminal:
```bash
cp .env.local.example .env.local
```

**Step 3.2 — Fill in the values**
Open `.env.local` in Cursor and paste your keys:
```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
YOUTUBE_API_KEY=AIzaxxxxxxxxxx
```

---

### PHASE 4 — Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Test checklist:**
- [ ] Enter "Blinding Lights" / "The Weeknd" → click Analyse
- [ ] Analysis card appears with BPM, instruments, beat pattern
- [ ] Click "Show 5 beat-matched songs" → 5 cards load
- [ ] Click another card → 5 more load
- [ ] Progress bar shows count
- [ ] Check Supabase → Table Editor → songs → rows appear

---

### PHASE 5 — Deploy to Vercel

#### Option A: Vercel CLI (fastest)
```bash
npm install -g vercel
vercel
```
Follow prompts. When it asks for env vars, add all 5.

#### Option B: GitHub + Vercel Dashboard
1. Push to GitHub:
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/songmap.git
git push -u origin main
```
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import your repo
3. Expand **Environment Variables** → add all 5 keys
4. Click **Deploy**

#### After deploying
- Go to your Vercel dashboard → **Settings → Functions** → confirm 60s timeout is applied (from `vercel.json`)
- Test the live URL

---

### PHASE 6 — Cursor AI Tips for Customisation

Use Cursor's AI (Cmd+K or Cmd+L) with these prompts:

**Change the song limit:**
> "In components/SongCard.tsx, change the 50-song limit to 100"

**Add a history sidebar:**
> "Add a sidebar that shows recent sessions by fetching GET /api/songs and listing them"

**Add Spotify links:**
> "In components/SongCard.tsx, add a Spotify search link alongside the YouTube link"

**Change recommendation count:**
> "Change all references from 5 recommendations to 8 recommendations"

---

## 🗃 Database Schema

### `sessions`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Session identifier |
| seed_input | TEXT | Original query string |
| seed_song_id | UUID | First analysed song |
| total_songs | INT | Running count |
| created_at | TIMESTAMPTZ | Session start time |

### `songs`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Song identifier |
| title / artist | TEXT | Song metadata |
| youtube_url | TEXT | Full URL |
| bpm | INT | Beats per minute |
| key_signature | TEXT | e.g. "A minor" |
| time_signature | TEXT | e.g. "4/4" |
| energy_level | TEXT | low / medium / high |
| mood | TEXT | e.g. "euphoric, intense" |
| genre | TEXT[] | Array of genres |
| instruments | JSONB | `[{name, count, role}]` |
| total_instrument_count | INT | Sum of all counts |
| beat_pattern | TEXT | Rhythm description |
| analysis_text | TEXT | Full AI analysis |
| session_id | UUID | Parent session |
| parent_id | UUID | Song this was recommended from |
| depth | INT | 0=seed, 1-10=depth level |

---

## 🎨 Design System

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#4ABA94` | Buttons, accents, instrument counts |
| Accent | `#D0542D` | BPM badge, energy high, highlights |
| Background | `#FFEDB7` | Page background |
| Secondary | `#685B53` | Body text, labels |
| Dark Surface | `#2B3A39` | Headings, primary text |

Fonts: **Fraunces** (display/headings) + **Inter** (body) + **JetBrains Mono** (labels, numbers)

---

## 💰 Cost Estimate

| Service | Free Tier | Per 50-song Session |
|---------|-----------|---------------------|
| Anthropic Claude | $5 free credit | ~$0.08–0.20 |
| Supabase | 500 MB, unlimited reads | Free |
| Vercel | 100 GB bandwidth | Free |
| YouTube API | 10,000 units/day | Free |

---

## ❓ Troubleshooting

**"Analysis failed"** → Check `ANTHROPIC_API_KEY` is valid and has credits

**Songs not saving** → Confirm you ran `supabase-schema.sql` and your service role key is correct

**YouTube URL not resolving** → Add `YOUTUBE_API_KEY`; without it, use name+artist mode

**Vercel timeout** → API routes are set to 60s in `vercel.json`. Parallel Claude calls take 5–15s. If timeouts persist, upgrade to Vercel Pro (300s limit).

**Build error on Vercel** → Make sure all 5 env vars are added in Vercel's dashboard → Settings → Environment Variables

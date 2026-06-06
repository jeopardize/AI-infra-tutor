# AI Infra Tutor

> A locally-run AI Infrastructure study companion — read curated notes, ask an AI tutor, get auto-generated quizzes, simulate technical interviews, and link everything to your personal markdown notebook.

Built with **Next.js 16 + TypeScript + Tailwind CSS v4 + Claude API**. All data stays on your machine (browser localStorage + your local notes directory); no remote backend is required.

> **Note**: The in-app content (knowledge base, AI prompts, UI labels) is in **Chinese**, since the curated knowledge base targets Chinese-speaking AI Infra learners. The codebase, configuration, and this README are in English to make contribution and adaptation easier.

Who it is for:

- Engineers transitioning into AI Infrastructure or just getting started
- People preparing for AI Infra interviews who want structured Q&A practice
- Anyone with a personal markdown notebook (Obsidian / VSCode etc.) who wants to weave their notes into a guided learning path

---

## ✨ Features

| Module | Route | What it does |
|---|---|---|
| 📊 Dashboard | `/` | Topics grouped by four directions (Training / Inference / Hardware / System) with overall mastery progress |
| 📖 Learn | `/learn/[topicId]` | Read checkpoint details + an embedded streaming AI chat to ask follow-ups; surfaces your linked local notes |
| 🎯 Quiz | `/quiz` | AI generates an open question, evaluates your free-text answer, and updates a color-coded knowledge map |
| 🎙 Interview | `/interview` | Multi-turn mock interview with the AI, 4-dimension scorecard, history review, analytics, and markdown export |
| 📚 Library | `/library` | Browse, preview, edit, and create local markdown notes directly from the browser |

Design highlights:

- **Prompt caching** — every Claude call ships the full knowledge tree in the system prompt with `cache_control: ephemeral`, so repeated calls are dramatically cheaper and faster
- **Structured output** — quiz grading and interview scorecards use tool use with a strict JSON schema, no fragile regex parsing
- **Round-trip notes** — editing a note in the browser writes back to the `.md` file; you can also create new files and folders from the UI
- **Replayable interviews** — every interview session stores the full transcript and scorecard, can be exported to markdown into your notebook, and feeds aggregate analytics (frequency of weak spots, score trend)
- **No backend** — everything runs locally; the only network calls go to Anthropic's API

---

## 🚀 Quick Start

### Requirements

- Node.js **≥ 18.18** (20+ recommended)
- One of: npm / pnpm / yarn
- An [Anthropic API key](https://console.anthropic.com/)

### Install and run

```bash
git clone https://github.com/<your-username>/ai-infra-tutor.git
cd ai-infra-tutor
npm install

# Configure API key
cp .env.local.example .env.local
# Edit .env.local and put in your ANTHROPIC_API_KEY

npm run dev
# Open http://localhost:3000
```

First start may take 1–2 seconds to compile.

---

## ⚙️ Configuration

All runtime config lives in `.env.local` (git-ignored by default, so your key never leaks).

### 1. Claude API key (required)

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

Get one at <https://console.anthropic.com/>. A small initial credit is enough to try the app.

### 2. Local notes directory (optional)

The app can read your local markdown notes and link them to relevant topics for side-by-side reading. The default path is:

```
~/Documents/knowlege_library
```

> ⚠️ Heads up: the default folder name is `knowlege_library` (missing one `d`) — this is intentional, matching the author's existing folder. Rename it or override the path.

To point the app at a different folder, add this to `.env.local`:

```bash
KNOWLEDGE_LIBRARY_PATH=/Users/your-name/Documents/notes
```

There is no required structure inside the directory — the app recursively scans every `.md` file and displays them as a tree. Example layout:

```
notes/
├── inference/
│   ├── kv-cache.md
│   ├── paged-attention.md
│   └── images/
│       └── vllm-arch.png
├── training/
│   └── 5d-parallelism.md
└── interviews/
    └── ...
```

Supported behavior:

- `.md` / `.markdown` files can be **previewed, edited, and saved** in the browser; Cmd/Ctrl+S works
- Relative image paths inside notes (e.g. `![](images/x.png)`) are auto-routed through `/api/docs/asset`
- `.png/.jpg/.jpeg/.gif/.webp/.svg` can be referenced by markdown but are not previewed directly in the tree
- `.DS_Store`, `.git`, `node_modules`, `.obsidian`, etc. are auto-ignored

### 3. Interview history export directory (optional)

After finishing a mock interview, you can export the full transcript + scorecard to a markdown file. The default destination is:

```
<KNOWLEDGE_LIBRARY_PATH>/模拟面试历史/
```

You can change this any time from the `/interview` page under "Settings" — no restart required. The setting is stored in localStorage.

### 4. Model selection (optional)

Defaults to `claude-sonnet-4-6` (highest quality). To go faster or cheaper, edit `lib/claude/client.ts`:

```ts
export const DEFAULT_MODEL = "claude-sonnet-4-6";  // change to "claude-haiku-4-5"
```

Or pass `speed: "fast"` to the chat API to use the preset Haiku path.

---

## 📂 Project Structure

```
ai-infra-tutor/
├── app/
│   ├── page.tsx                       # Dashboard
│   ├── layout.tsx                     # Global layout + nav
│   ├── learn/[topicId]/page.tsx       # Learn page
│   ├── quiz/page.tsx                  # Quiz / gap analysis
│   ├── interview/page.tsx             # Mock interview + history + analytics
│   ├── library/page.tsx               # Notes library browser
│   └── api/
│       ├── chat/route.ts              # Streaming chat (learn + interview)
│       ├── quiz/generate/route.ts     # AI question generator
│       ├── quiz/evaluate/route.ts     # AI grader (tool use)
│       ├── interview/scorecard/route.ts  # AI scorecard (tool use)
│       └── docs/                      # Notes CRUD
│           ├── tree/route.ts          # Directory tree
│           ├── read/route.ts          # Read note
│           ├── write/route.ts         # Save / overwrite
│           ├── create/route.ts        # Create new .md
│           ├── mkdir/route.ts         # Create directory
│           └── asset/route.ts         # Serve images / binary
├── components/
│   ├── ChatPanel.tsx                  # Streaming chat panel
│   ├── DocDrawer.tsx                  # Note preview / edit drawer
│   ├── InterviewDetailDrawer.tsx      # Interview history detail drawer
│   ├── KnowledgeMap.tsx               # Mastery heatmap
│   ├── Markdown.tsx                   # Markdown renderer
│   ├── MasteryBadge.tsx               # Mastery dots / badges
│   └── TopicCard.tsx                  # Topic card
├── lib/
│   ├── knowledge/                     # Static knowledge tree
│   │   ├── types.ts                   # Types
│   │   ├── index.ts                   # Aggregator
│   │   ├── training.ts                # Training topics
│   │   ├── inference.ts               # Inference topics
│   │   ├── hardware.ts                # Hardware / kernels
│   │   └── system.ts                  # System engineering
│   ├── claude/
│   │   ├── client.ts                  # SDK wrapper + model selection
│   │   └── prompts.ts                 # Per-scenario system prompts
│   ├── docs/fs.ts                     # Notes FS utilities (path-safe)
│   ├── interviewExport.ts             # Session → markdown + analytics
│   └── storage.ts                     # localStorage wrapper
├── scripts/
│   └── fix-lightningcss.js            # Cross-arch native binary fix (postinstall)
├── public/
├── .env.local.example
├── LICENSE
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## 🧠 Extending the Knowledge Base

The knowledge tree is plain TypeScript. Changes hot-reload — **no restart needed**.

Add a new `Topic` in `lib/knowledge/{training,inference,hardware,system}.ts`:

```ts
{
  id: "your-topic-id",                       // unique ID
  title: "Your Topic",
  category: "inference",                     // training / inference / hardware / system
  summary: "One-line description shown on the card",
  prerequisites: ["other-topic-id"],         // suggested prerequisite topics
  checkpoints: [
    {
      id: "unique-cp-id",                    // unique ID (used by AI and progress tracking)
      name: "Checkpoint name",
      mustKnow: "Core points in markdown...",
      commonMisconceptions: ["Misconception 1", "..."],
      interviewAngles: ["Interview angle 1", "..."],
    },
  ],
  resources: [
    { title: "...", url: "https://...", kind: "paper" },
  ],
  localDocs: [                               // optional: relative paths to your local notes
    "inference/kv-cache.md",
  ],
}
```

Once saved:

1. The dashboard picks up the new topic automatically
2. The quiz checkpoint dropdown includes it
3. The knowledge map gets a new tile
4. The interview AI may ask about it (the full tree lives in the system prompt)

Adding `localDocs` links your personal notes into the Learn page — a violet "Related notes" chip appears, opening the note in a side drawer where you can also edit it.

---

## 🛠 Tech Stack

- **Framework**: Next.js 16 (App Router + Turbopack) + TypeScript 5
- **Styling**: Tailwind CSS v4 (`@theme inline`) + lucide-react icons
- **AI**: [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) ≥ 0.96
  - Prompt caching (`cache_control: ephemeral`)
  - Tool use for structured output
  - SSE streaming
- **Markdown**: react-markdown + remark-gfm
- **Storage**: browser localStorage (no database needed) + local filesystem (notes + interview exports)

---

## 🐛 Known Issues

### macOS: lightningcss / @tailwindcss/oxide native binding error

If `npm run dev` fails with something like:

```
Cannot find module '../lightningcss.darwin-x64.node'
```

This is a known Apple Silicon issue where Turbopack subprocesses can switch architecture and ask for a binary that wasn't installed. The `scripts/fix-lightningcss.js` postinstall hook auto-copies both architectures' `.node` binaries into place. If you still hit it:

```bash
# manually install the cross-arch binaries
npm install --save-dev --force lightningcss-darwin-x64 @tailwindcss/oxide-darwin-x64
node scripts/fix-lightningcss.js
rm -rf .next
npm run dev
```

Linux / Windows users typically don't hit this.

### Images in notes don't render

Make sure the image path is relative to the markdown file's directory, e.g.:

```
notes/inference/kv-cache.md          # references ![](images/kv-cache.png)
notes/inference/images/kv-cache.png  # the actual image
```

The app will resolve and route this through `/api/docs/asset?path=inference/images/kv-cache.png`.

### API cost expectations

- A single quiz round: ~2k–4k input + ~1k output tokens
- A mock interview turn: ~4k–8k input each
- A full Sonnet interview (10–15 turns): ~$0.10–$0.30
- Prompt caching cuts ~70% of the per-turn cost from the 2nd call onwards

---

## 🗺 Roadmap

- [ ] Visual knowledge base editor (add topics without touching code)
- [ ] Learning curve / answer history charts
- [ ] Full-text search across notes
- [ ] Mobile-friendly layout
- [ ] Real database option (SQLite / Postgres)
- [ ] Multi-user / cloud sync
- [ ] Dark mode toggle (currently follows OS)

PRs and issues welcome.

---

## 🤝 Contributing

```bash
# After forking and cloning
npm install
npm run build  # make sure types compile
npm run dev
# Make your changes and open a PR
```

If you're contributing a new knowledge topic, please:

- Write a `mustKnow` that explains *why* the design is the way it is, not just a textbook definition
- List 2–3 `commonMisconceptions` — the things newcomers actually trip on
- Include 3–5 `interviewAngles` — how real interviewers tend to probe the topic

---

## 🔒 Security Note

- `.env.local` is gitignored — your API key won't be pushed
- `.env.local.example` is the only env-file that ships with the repo (intentionally tracked)
- All filesystem operations go through a path-safety check that prevents access outside `KNOWLEDGE_LIBRARY_PATH`
- Note writes are restricted to `.md` / `.markdown` extensions to prevent the API from writing arbitrary file types

If you fork this repo, double-check that no real key has slipped into a tracked file:

```bash
git ls-files | xargs grep -l "sk-ant-[A-Za-z0-9_-]\{10,\}"
```

---

## 📄 License

MIT — see [LICENSE](LICENSE).

# Contributing

## Prerequisites

- Node 20+
- Firebase CLI: `npm install -g firebase-tools`
- Python 3.11 + [uv](https://docs.astral.sh/uv/) (only if working on scrapers)
- A Firebase project with Firestore enabled

## Local Development

```bash
# Frontend (http://localhost:4000)
cd frontend && npm install && npm run dev

# Cloud Functions (http://localhost:5001)
cd functions && npm install && firebase emulators:start --only functions
```

## Code Quality

Before submitting changes, run:

```bash
cd frontend
npm run lint          # ESLint
npx tsc --noEmit      # TypeScript type check
npm run build         # Full production build
```

## Branching

- `main` is the production branch (auto-deploys frontend to Netlify)
- Create feature branches from `main`: `feat/short-description`
- Bug fix branches: `fix/short-description`

## Commit Messages

Use conventional commits:

```
feat: add lead scoring breakdown to detail dialog
fix: correct reply matching for plus-addressed emails
refactor: extract outreach hooks into separate files
docs: update technical brief with current architecture
```

## Deployment

| Component        | How                                                       |
|-----------------|-----------------------------------------------------------|
| Frontend         | Push to `main` -- Netlify auto-deploys                   |
| Cloud Functions  | `firebase deploy --only functions`                        |
| Single Function  | `firebase deploy --only functions:<name>`                 |
| Scrapers         | GitHub Actions (`weekly_scrape.yml`, `weekly_followup.yml`) |

## Project Structure

See [README.md](README.md) for the full directory layout and architecture diagram.
For frontend specifics, see [frontend/README.md](frontend/README.md).

## Key Conventions

- **No Python for new features** -- use Cloud Functions (Node 20) or Next.js API routes
- **ESM everywhere** -- `"type": "module"` in functions
- **shadcn/ui** for UI components (`frontend/src/components/ui/`)
- **TanStack Query** for all data fetching in the frontend
- **Claude** for email drafts, **Gemini** for enrichment and strategy
- **Resend** for email delivery with plus-addressing for reply tracking

# Asterley Bros -- AI Lead Generation & Outreach System

## Architecture
- **Python backend (src/) is RETIRED** for API/dashboard use. Only active via GitHub Actions scrapers.
- All backend logic lives in **Firebase Cloud Functions** (`functions/index.js`, Node 20, ESM)
- Frontend: **Next.js 16 + React 19**, deployed on **Netlify**
- Database: **Firestore** (not Supabase)
- Email: **Resend** (not SendGrid)
- AI: **Claude** (email drafts in `generateDrafts`), **Gemini** (enrichment, strategy, outreach plans)

## Key Paths
- `functions/index.js` -- all 11 Cloud Functions (generateDrafts, sendApproved, processInboundEmail, etc.)
- `frontend/src/app/` -- Next.js App Router pages and API routes
- `frontend/src/hooks/` -- TanStack Query hooks wrapping Firestore + callable functions
- `frontend/src/lib/firestore-api.ts` -- client-side Firestore read/write layer
- `frontend/src/lib/types.ts` -- shared TypeScript interfaces
- `frontend/src/components/` -- React components (app-specific)
- `frontend/src/components/ui/` -- shadcn/ui primitives
- `config.yaml` -- scraper + pipeline configuration

## Commands
- `cd frontend && npm run dev` -- frontend on :4000
- `cd frontend && npm run build` -- production build
- `cd frontend && npx tsc --noEmit` -- type check
- `firebase emulators:start --only functions` -- local functions emulator
- `firebase deploy --only functions` -- deploy all functions
- `firebase deploy --only functions:<name>` -- deploy single function

## Firestore Collections
- `leads` -- venue records with enrichment, scoring, stage
- `outreach_messages` -- email drafts and sent messages
- `inbound_replies` -- matched/unmatched reply records
- `edit_feedback` -- human corrections to Claude drafts (few-shot learning)
- `users` -- Firebase Auth users with roles
- `activity_log` -- audit trail
- `webhook_events` -- idempotency records

## Conventions
- ESM throughout (`"type": "module"` in functions)
- No Python for new features -- use Cloud Functions or Next.js API routes
- shadcn/ui components in `frontend/src/components/ui/`
- Custom hooks wrap TanStack Query + Firebase `httpsCallable()`
- Resend inbound uses plus-addressing: `reply+{lead_id}@replies.asterleybros.com`
- Email drafts use Claude; enrichment/strategy use Gemini
- Daily send cap: 150 emails, optimal window Tue-Thu 10am-1pm

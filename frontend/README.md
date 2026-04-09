# Asterley Bros Frontend

Next.js 16 dashboard for managing the AI lead generation and outreach pipeline.

## Stack

- Next.js 16, React 19, TypeScript
- Tailwind CSS 4, shadcn/ui
- TanStack Query v5
- Firebase Auth + Firestore (client SDK)
- Firebase Cloud Functions (via `httpsCallable`)

## Setup

```bash
cp .env.example .env.local   # fill in your Firebase + API keys
npm install
npm run dev                   # http://localhost:4000
```

## Commands

| Command              | Description              |
|---------------------|--------------------------|
| `npm run dev`       | Dev server on port 4000  |
| `npm run build`     | Production build         |
| `npm run lint`      | ESLint                   |
| `npx tsc --noEmit`  | Type check               |

## Project Structure

```
src/
  app/                    App Router (pages + API routes)
    analytics/            Funnel chart, category breakdown, trends
    leads/                Lead table with filters, search, detail dialog
    outreach/             Message cards: review/approve/reject/edit/send
    login/                Firebase email/password auth
    settings/             Team management, ratio manager
    help/                 Getting started guide
    api/
      enrich/             POST: Gemini website analysis
      inbound/            POST: Resend inbound webhook
      outreach/send/      POST: send approved emails
      outreach-plan/      GET: Gemini outreach plan
  components/             App-specific React components
    ui/                   shadcn/ui primitives
  hooks/                  TanStack Query hooks (leads, outreach, analytics, etc.)
  lib/
    firestore-api.ts      Client-side Firestore read/write layer
    firebase.ts           Firebase client SDK init
    firebase-admin.ts     Firebase Admin SDK (server-side API routes)
    auth-context.tsx      Auth context with role checking (admin/viewer)
    types.ts              Shared TypeScript interfaces
```

## Key Patterns

- **Data fetching**: TanStack Query (`useQuery` / `useMutation`) for all reads and writes
- **Cloud Functions**: Called via `httpsCallable(functions, "functionName")` from hooks
- **Direct Firestore**: Client SDK reads in `lib/firestore-api.ts` for lead/outreach queries
- **Server-side routes**: `app/api/` routes use `firebase-admin` for privileged operations
- **Auth**: `AuthContext` wraps Firebase Auth; roles are `admin` or `viewer`
- **Styling**: Dark mode only (`class="dark"` on html), Tailwind CSS 4
- **Toasts**: Sonner for notifications

## Deployment

Hosted on Netlify. Push to `main` triggers auto-deploy.

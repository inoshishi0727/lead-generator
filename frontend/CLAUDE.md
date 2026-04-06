@AGENTS.md

# Frontend -- Next.js 16 + React 19

## Stack
Next.js 16.2, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, TanStack Query v5

## Commands
- `npm run dev` -- dev server on port 4000
- `npm run build` -- production build (Netlify)
- `npm run lint` -- ESLint
- `npx tsc --noEmit` -- type check

## Structure
- `src/app/` -- App Router (pages + API routes)
- `src/components/` -- app-specific React components
- `src/components/ui/` -- shadcn/ui primitives (badge, button, card, input, menu, select, skeleton, table)
- `src/hooks/` -- TanStack Query hooks wrapping Firestore + Cloud Functions
- `src/lib/` -- Firebase client, admin, Firestore API, types, auth context

## Pages
- `/` -- Dashboard (stats, scrape control, outreach plan, AI recommendations)
- `/leads` -- Lead table with filters, search, quick-add, detail dialog
- `/outreach` -- Message cards for review/approve/reject/edit/send with reply thread view
- `/analytics` -- Funnel chart, category breakdown, trends, reply rates
- `/login` -- Firebase email/password auth
- `/settings` -- Team management, ratio manager
- `/help` -- Getting started guide

## API Routes (server-side, use firebase-admin)
- `/api/enrich` -- POST: Gemini website analysis, writes to lead.enrichment
- `/api/outreach/send` -- POST: send approved emails via Resend
- `/api/outreach-plan` -- GET: Gemini-powered weekly outreach plan
- `/api/inbound` -- POST: Resend inbound webhook for reply matching + body fetch

## Key Hooks
- `use-leads.ts` -- fetch/filter leads from Firestore
- `use-lead-detail.ts` -- single lead data + mutations (enrich, update)
- `use-outreach.ts` -- outreach messages, approve/reject/send, reply tracking
- `use-outreach-plan.ts` -- weekly AI outreach plan
- `use-analytics.ts` -- funnel, trends, category stats
- `use-live-updates.ts` -- Firestore onSnapshot for real-time draft generation updates
- `use-scrape.ts` -- trigger/monitor scrape jobs
- `use-config.ts` / `use-ratios.ts` -- config and target ratio management

## Patterns
- TanStack Query for all data fetching (`useQuery` / `useMutation`)
- Firebase callable functions via `httpsCallable(functions, "functionName")`
- Direct Firestore reads via client SDK (`lib/firestore-api.ts`)
- Server-side routes use `firebase-admin` (`lib/firebase-admin.ts`)
- Auth context (`lib/auth-context.tsx`) wraps Firebase Auth with role checking (admin/viewer)
- Dark mode only (class="dark" on html element)
- Toast notifications via Sonner

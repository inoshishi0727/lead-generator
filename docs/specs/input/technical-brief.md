# Technical Brief: Asterley Bros AI Lead Generation System

## Architecture Overview

Three-tier system: Next.js 16 frontend on Netlify, Firebase Cloud Functions
(Node 20, ESM) for backend logic, and Firestore for persistence. Python
scrapers run via GitHub Actions on a weekly schedule.

## System Components

### 1. Frontend (`frontend/`)

- **Framework**: Next.js 16 with React 19, TypeScript, Tailwind CSS 4
- **UI**: shadcn/ui component library, dark mode only
- **Data fetching**: TanStack Query v5 with Firebase callable functions
- **Auth**: Firebase Auth (email/password) with role-based access (admin/member/viewer)
- **Hosting**: Netlify (static export, auto-deploy from `main`)
- **API routes**: Server-side routes using `firebase-admin` for enrichment,
  outbound email sending, outreach planning, and inbound webhook handling

### 2. Cloud Functions (`functions/index.js`)

Single ESM file containing all callable/HTTP functions:

| Function                | Trigger    | Purpose                                    |
|------------------------|------------|--------------------------------------------|
| `generateDrafts`       | callable   | Claude-powered email draft generation      |
| `regenerateDraft`      | callable   | Regenerate a single draft                  |
| `regenerateAllDrafts`  | callable   | Wipe and recreate all drafts               |
| `getOutreachPlan`      | callable   | Gemini weekly outreach strategy            |
| `getStrategy`          | callable   | Gemini campaign recommendations            |
| `sendApproved`         | callable   | Send approved emails via Resend            |
| `deleteUser`           | callable   | Delete user account + data                 |
| `processInboundEmail`  | HTTP POST  | Resend inbound webhook handler             |
| `logReply`             | callable   | Manually log a reply                       |
| `updateLeadOutcome`    | callable   | Set lead outcome                           |
| `assignReplyToLead`    | callable   | Link unmatched reply to a lead             |
| `assignLeads`          | callable   | **NEW**: Assign leads to a team member     |
| `unassignLeads`        | callable   | **NEW**: Remove assignment from leads      |

- **Runtime**: Node 20, ESM (`"type": "module"`)
- **AI**: Claude Sonnet for email drafts, Gemini 2.5 Flash for enrichment/strategy
- **Email**: Resend for outbound sending + inbound webhook body fetch
- **Secrets**: Firebase secret manager in production, `.env.local` locally

### 3. Database (Firestore)

| Collection           | Purpose                                          |
|---------------------|--------------------------------------------------|
| `leads`             | Venue records with enrichment, scoring, stage    |
| `outreach_messages` | Email drafts and sent messages                   |
| `inbound_replies`   | Matched/unmatched reply records                  |
| `edit_feedback`     | Human corrections to Claude drafts (few-shot)    |
| `users`             | Firebase Auth users with roles and assignment     |
| `activity_log`      | Audit trail (including assignment changes)        |
| `webhook_events`    | Idempotency records for Resend webhooks          |

Pipeline stages:
```
scraped -> needs_email -> enriched -> scored -> draft_generated ->
approved -> sent -> follow_up_1 -> follow_up_2 -> responded ->
converted | declined
```

### 4. Scrapers (`src/`, legacy Python)

- **Google Maps**: Camoufox (Firefox-based anti-detect) + Playwright async API
- **Instagram**: Camoufox + Playwright session-based scraping
- **Scheduling**: GitHub Actions cron (`weekly_scrape.yml` Mon 09:00 UTC,
  `weekly_followup.yml` Wed 10:00 UTC)
- **Output**: Writes leads directly to Firestore `leads` collection

> Note: Python code is used only for scrapers via GitHub Actions.
> All other backend logic is in Firebase Cloud Functions.

### 5. Scoring Engine

- Rule-based scoring with configurable weights from `config.yaml`
- Factors: website presence, email availability, rating threshold,
  review volume, cocktail keywords, venue independence, geography,
  Instagram activity
- Composite score normalized to 0-100

---

## Multi-User Lead Assignment — Technical Design (NEW)

### Role Model

Expand `UserRole` from `"admin" | "viewer"` to `"admin" | "member" | "viewer"`:

| Role     | Description                                              |
|----------|----------------------------------------------------------|
| `admin`  | Super admin. Full visibility, can assign leads, manage team. Has own leads. |
| `member` | Team member. Sees only assigned leads. Can approve/send for own leads. |
| `viewer` | Read-only. Sees all leads but cannot take any action.     |

### Data Model Changes

#### `users` Collection — Updated Document Schema

```typescript
interface UserDoc {
  uid: string;
  email: string;
  display_name: string;
  role: "admin" | "member" | "viewer";   // expanded from admin | viewer
  workspace_id: string;
  created_at: string;                     // ISO 8601
}
```

#### `leads` Collection — New Fields

```typescript
// Added to existing Lead interface
interface LeadAssignment {
  assigned_to: string | null;       // Firebase Auth UID of assigned member (null = unassigned / admin pool)
  assigned_to_name: string | null;  // Denormalized display name for UI rendering
  assigned_at: string | null;       // ISO 8601 timestamp of last assignment
  assigned_by: string | null;       // UID of admin who made the assignment
}
```

- `assigned_to: null` means the lead is unassigned (admin pool only)
- Admin's own leads: `assigned_to = admin_uid`
- All new leads from scrapers are created with `assigned_to: null`

#### `outreach_messages` Collection — New Fields

```typescript
// Added to existing OutreachMessage interface
interface MessageAssignment {
  assigned_to: string | null;  // Inherited from lead at draft generation time
}
```

- When `generateDrafts` creates a message, it copies the lead's `assigned_to`
- Ensures the outreach page filters correctly without joining to leads

#### `inbound_replies` Collection — New Fields

```typescript
// Added to existing InboundReply interface
interface ReplyAssignment {
  assigned_to: string | null;  // Inherited from lead when reply is matched
}
```

### Query Patterns

#### Leads Page

```typescript
// Admin: all leads (with optional member filter)
function getLeads(filters, role, uid) {
  if (role === "admin") {
    // Optional: filter by assigned_to for per-member view
    if (filters.assignedTo) {
      constraints.push(where("assigned_to", "==", filters.assignedTo));
    }
    // Otherwise: return all leads
  } else if (role === "member") {
    // Mandatory: only own leads
    constraints.push(where("assigned_to", "==", uid));
  }
  // viewer: all leads, read-only (no filter)
}
```

#### Outreach Page

```typescript
// Same pattern: member sees only their messages
if (role === "member") {
  constraints.push(where("assigned_to", "==", uid));
}
```

#### Dashboard Stats

```typescript
// Admin dashboard: aggregate stats with per-member breakdown
// Member dashboard: only own stats
```

### Cloud Functions Changes

#### New: `assignLeads` (callable, admin-only)

```javascript
// Input: { lead_ids: string[], assigned_to: string }
// 1. Verify caller is admin
// 2. Look up target user display_name
// 3. Batch update leads: assigned_to, assigned_to_name, assigned_at, assigned_by
// 4. Batch update outreach_messages for those leads: assigned_to
// 5. Batch update inbound_replies for those leads: assigned_to
// 6. Log to activity_log
```

#### New: `unassignLeads` (callable, admin-only)

```javascript
// Input: { lead_ids: string[] }
// 1. Verify caller is admin
// 2. Set assigned_to = null on leads + messages + replies
// 3. Log to activity_log
```

#### Modified: `generateDrafts`

```javascript
// Current: any authenticated user can generate for any lead
// Change: member can only generate for leads where assigned_to == caller UID
// Change: new messages inherit assigned_to from lead
```

#### Modified: `sendApproved`

```javascript
// Current: admin-only for all messages
// Change: admin can send any; member can send only own assigned messages
// Change: daily cap is shared (not per-member) — admin monitors total
```

#### Modified: `deleteUser`

```javascript
// Current: deletes Auth + Firestore user doc
// Change: also unassign all leads assigned to deleted user (set assigned_to = null)
```

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: get caller's role
    function userRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }

    match /leads/{leadId} {
      // Admin + viewer: read all. Member: read only assigned.
      allow read: if request.auth != null && (
        userRole() in ["admin", "viewer"] ||
        resource.data.assigned_to == request.auth.uid
      );
      // Admin: write all. Member: write only assigned.
      allow write: if request.auth != null && (
        userRole() == "admin" ||
        (userRole() == "member" && resource.data.assigned_to == request.auth.uid)
      );
    }

    match /outreach_messages/{msgId} {
      allow read: if request.auth != null && (
        userRole() in ["admin", "viewer"] ||
        resource.data.assigned_to == request.auth.uid
      );
      allow write: if request.auth != null && (
        userRole() == "admin" ||
        (userRole() == "member" && resource.data.assigned_to == request.auth.uid)
      );
    }

    match /inbound_replies/{replyId} {
      allow read: if request.auth != null && (
        userRole() in ["admin", "viewer"] ||
        resource.data.assigned_to == request.auth.uid
      );
    }

    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && userRole() == "admin";
    }
  }
}
```

> Note: Cloud Functions bypass security rules (they use admin SDK), so the
> rules above protect direct client SDK reads/writes only. The callable
> functions enforce ownership checks in code.

### Frontend Changes

#### Auth Context (`auth-context.tsx`)

```typescript
export type UserRole = "admin" | "member" | "viewer";  // add "member"

interface AuthState {
  // ... existing fields
  isMember: boolean;  // new convenience flag
}
```

#### Types (`types.ts`)

```typescript
interface Lead {
  // ... existing fields
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
}

interface OutreachMessage {
  // ... existing fields
  assigned_to: string | null;
}
```

#### Firestore API (`firestore-api.ts`)

- `getLeads()`: Accept `assignedTo` filter; auto-apply for member role
- `getOutreachMessages()`: Same pattern
- `getInboundReplies()`: Same pattern
- New: `assignLeads(leadIds, assignedTo)` — calls `assignLeads` callable

#### New UI Components

1. **Lead Assignment Dropdown** — on lead detail page (admin-only). Select
   from team members to assign/reassign.

2. **Bulk Assign Action** — on leads table. Checkbox select + "Assign to..."
   dropdown in table toolbar (admin-only).

3. **Team Member Filter** — on leads page, outreach page, and dashboard.
   Dropdown showing all team members (admin-only). Members see only their
   own data automatically.

4. **Assignment Badge** — on lead cards and table rows. Shows assigned
   member name with avatar/initials.

#### Modified Components

1. **TeamManager** — add "member" role option to invite form dropdown
2. **Dashboard stats** — show per-member breakdown for admin; own stats for member
3. **Outreach page** — filter messages by `assigned_to` for members
4. **Lead table** — add "Assigned To" column; filter for members

### Migration Strategy

#### Existing Data

All existing leads, messages, and replies have no `assigned_to` field.
Migration approach:

1. **No-op migration**: Treat `null`/missing `assigned_to` as "unassigned"
2. All existing data remains in the admin pool
3. Admin assigns leads to new members going forward
4. No batch backfill required

#### Rollout Steps

1. Deploy updated types + auth context (backward compatible)
2. Deploy `assignLeads` / `unassignLeads` Cloud Functions
3. Deploy updated `generateDrafts` and `sendApproved` with ownership checks
4. Deploy frontend with assignment UI + query filters
5. Deploy Firestore security rules
6. Admin invites first team member with "member" role
7. Admin assigns initial batch of leads

---

## Dependencies

### Frontend (`frontend/package.json`)
- next, react, typescript, tailwindcss, @tanstack/react-query
- firebase, firebase-admin
- shadcn/ui components, sonner (toasts)
- resend (server-side API routes)

### Cloud Functions (`functions/package.json`)
- firebase-functions, firebase-admin
- @anthropic-ai/sdk (Claude), @google/generative-ai (Gemini)
- resend

### Scrapers (`pyproject.toml`)
- camoufox, playwright, google-cloud-firestore
- pydantic, tenacity, structlog

## Security Considerations
- All secrets in `.env.local` files (not committed) or Firebase secret manager
- Firebase Auth with role-based access control (admin/member/viewer)
- Firestore security rules enforce data isolation at the database level
- Cloud Functions enforce ownership checks in callable function code
- Human approval gate before any external communication
- Rate limiting on scrapers and email sending (150/day cap, shared across team)
- Plus-addressing for inbound reply matching (`reply+{lead_id}@replies.asterleybros.com`)
- Lead assignment changes logged to `activity_log` for audit trail
- Deleting a user automatically unassigns their leads (returns to admin pool)

## Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Member sees another member's leads via direct Firestore query | High | Low | Security rules enforce `assigned_to == auth.uid` |
| Daily email cap exhausted by one member | Medium | Medium | Admin monitors shared cap; consider per-member sub-caps later |
| Stale `assigned_to_name` after user rename | Low | Low | Denormalized for perf; admin can reassign to refresh |
| Orphaned leads after member deletion | Medium | Low | `deleteUser` function unassigns all their leads automatically |
| Member generates drafts for unassigned leads | Medium | Low | `generateDrafts` checks `assigned_to == caller` for member role |

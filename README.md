# Hybrid Learning LMS Portal

Custom-built Learning Management System for **GeM Bid GEM/2026/B/7822845** — Hybrid Learning Systems, Public Works Department J&K, R&B Division Pahalgam.

Built for the deployment footprint the bid describes: **42 interactive panels + 42 OPS PCs across ~21 sites, fed by 2 broadcast studios** — a hub-and-spoke broadcast model, not a set of independent virtual classrooms.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + TanStack Query + Recharts |
| Backend | NestJS 10 + TypeScript (REST + Swagger + Socket.IO) |
| Database | **PostgreSQL 16** via Prisma ORM |
| Auth | Argon2id hashing, JWT access + rotating refresh tokens (httpOnly cookie), server-side RBAC |
| Realtime | Socket.IO gateway for the studio → classroom broadcast control channel |
| Live classes | Zoom Server-to-Server OAuth + broadcast/relay layer |
| Files | Local disk in dev, S3-compatible object storage in production |
| Deployment | Docker + nginx |

## Getting started

Requires Node.js 20+ and PostgreSQL 16 (Docker Desktop is the easiest route).

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL (needs Docker Desktop running)
#    Published on host port 55433 — 5432/5433 are often taken by a native
#    PostgreSQL install, which would silently answer instead of the container.
docker compose up -d postgres

# 3. Configure the backend
cp backend/.env.example backend/.env      # already created; edit the JWT secrets

# 4. Create the schema and seed a realistic deployment
npm run db:migrate --workspace backend    # or: npx prisma migrate deploy
npm run db:seed --workspace backend

# 5. Run both apps
npm run dev
```

- Portal — http://localhost:5173
- API — http://localhost:4000/api
- API docs (Swagger) — http://localhost:4000/api/docs

### Full container stack

```bash
docker compose --profile full up -d --build   # web on :8080, api on :4000
```

### Resetting the demo data

```bash
npm run --workspace backend db:seed          # top up
npx prisma migrate reset --force             # from backend/: drop, migrate, reseed
```

## Seeded accounts

Password for every account: `Password@123`

| Role | Sign in with |
| --- | --- |
| Super Admin | `admin@lms.gov.in` |
| Academic Admin | `academic@lms.gov.in` |
| Teacher | `teacher@lms.gov.in` |
| Content Manager | `content@lms.gov.in` |
| Student | `student@lms.gov.in` |
| Parent / Guardian | `parent@lms.gov.in` |
| Department Oversight | `oversight@pwd.jk.gov.in` |

**Classroom panel (kiosk mode):** on the sign-in screen choose *Sign in as a classroom panel*, then `kiosk-site-02-r1` / `Kiosk@2026`.

The seed creates 21 sites, 42 classroom panels + OPS PCs, 2 broadcast studios, an academic year, a batch, a published course with modules/lessons/resources, a proctored quiz, an assignment, and a studio broadcast targeting 40 classrooms.

## What the structure encodes

### Hub-and-spoke broadcast (§3B)

The bid's 2-studio-to-42-panel ratio is modelled directly rather than as generic "join meeting" links:

- `LiveSession.mode = BROADCAST` originates from a room flagged `isStudio`, and `BroadcastTarget` rows fan it out to many classrooms — **scheduled once, not joined room by room**.
- **Studio double-booking is rejected at schedule time**, as is targeting a classroom already receiving another broadcast. With only two studios, an overlap is a real conflict.
- Classroom return audio runs through a **moderated question queue** so 42 endpoints never compete on one call.
- Ending a session **auto-links the recording** to every targeted course for catch-up viewing.
- A classroom whose uplink drops is served the **fallback recording** instead of a dead stream.

### Classroom as a first-class entity (§3B.1)

`Site → Classroom → Device` with per-device heartbeats. A wall-mounted panel signs itself in with **kiosk credentials** — a device-scoped token that can open the day's session and record a room headcount, and nothing else. Attendance is therefore stored two ways at once: `INDIVIDUAL` (personal login) and `ROOM_LEVEL` (facilitator roll call), never one instead of the other.

A `DeviceSweepJob` flips panels to `OFFLINE` when their heartbeat goes stale (5 minutes), which is what drives the department's uptime figures.

### Roles (§2)

Seven roles with server-side enforcement. Every route is denied by default and opened with `@Roles(...)`; the sidebar is filtered from the same role list so no one sees a module they cannot use.

**Parent data isolation** is enforced in `UsersService.assertParentAccess` — every guardian-facing query resolves the approved link rather than trusting a `studentId` from the request.

**Department / Buyer Oversight** is strictly read-only aggregate: site-wise utilization, attendance and completion rollups, device status, with no drill-down into individual learner records.

## Feature coverage

| Spec section | Implementation |
| --- | --- |
| 5.1 Auth & accounts | Argon2id, refresh rotation with reuse detection, lockout after 5 failures, bulk import, kiosk login |
| 5.2 Academic structure | Academic years, batches/sections, site & classroom registry, enrolment with prerequisite checks |
| 5.3–5.4 Courses & content | Modules → lessons → resources, draft/review/publish/archive, deep course cloning, reusable library, downloadable offline resources |
| 5.5 Hybrid / live classes | Zoom integration, broadcast relay, target-group management, moderated Q&A, recordings, connection-loss fallback |
| 5.6 Timetable | Calendar auto-populated from sessions; studio conflict detection |
| 5.7 Assignments | Publish, submit with upload, late rules with automatic penalty, grade, return for rework, resubmission history |
| 5.8 Quiz / examination | Question bank, auto-grading with negative marking, manual review for subjective answers, shuffling, **tab-switch proctoring with auto-submit** |
| 5.9 Attendance | Individual + room-level, correction with audit trail, threshold alerts to guardians |
| 5.10 Progress | Lesson completion, resume point, cohort progress, completion-rule evaluation |
| 5.11 Certificates | Auto-issue on completion, unique number, PDF render, **public verification without login** |
| 5.12 Notifications | In-app + email + SMS fan-out with delivery status, announcements |
| 5.13 Reports | Enrolment, completion, attendance, assessment, **site utilization**, CSV export |
| 5.14 Administration | Audit logging on every privileged route, login history, device registry with heartbeat |
| 5.15 Helpdesk | Ticketing with severity-based SLA and site → academic admin → super admin escalation |
| 5.16 Resilience | Offline-downloadable resources, adaptive stream URL, degraded-mode fallback, PWA manifest |

## Project layout

```
backend/
  prisma/schema.prisma      # 30+ models — the full §9 entity list
  prisma/seed.ts            # 21 sites / 42 panels / 2 studios
  src/
    common/                 # RBAC guard, audit interceptor, error filter
    auth/                   # login, refresh rotation, kiosk login
    live/                   # broadcast scheduling, Zoom, Socket.IO gateway
    …                       # one module per functional area
frontend/
  src/lib/                  # API client with silent refresh, auth context, role nav
  src/components/           # UI kit + role-filtered app shell
  src/pages/                # dashboards and every module screen
```

## Security posture (§11)

Server-side RBAC on every protected route · Argon2id password hashing · refresh-token rotation with family revocation on reuse · account lockout · DTO validation with a whitelist · upload MIME/size validation with opaque storage keys and path-traversal guards · audit logging with credential redaction · uniform sign-in failure messages (no account enumeration) · parent data isolation · helmet + CORS allowlist.

## Before production

These are deliberately left as deployment-time configuration rather than hardcoded:

1. **Set real JWT secrets** in `backend/.env` — the defaults are placeholders.
2. **Zoom credentials** (`ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`). Without them the scheduler issues placeholder links so the flow stays testable.
3. **Email/SMS gateway** — `NotificationsService.dispatch` has the send call stubbed at the provider boundary and marks undelivered messages `FAILED` rather than silently dropping them.
4. **Object storage** — uploads currently write to local disk; swap `UploadsController` for an S3-compatible client (India region, per §11 data localization).
5. **Media relay** — the broadcast control plane and Zoom integration are complete; the actual adaptive-bitrate relay/CDN edge is an infrastructure choice (e.g. SRS, Ant Media, or Zoom's own live-streaming endpoint) wired in via `LiveSession.streamUrl`.
6. **Multi-language UI** (English/Hindi/Urdu) — the `locale` field exists on `User` and the layout is ready for it, but the translation catalogues are not written.

## Verification status

Verified end-to-end against PostgreSQL 16 with a **112-check API smoke test** covering: RBAC denial per role, all five role dashboards, device heartbeat transitions, broadcast scheduling with studio/classroom double-booking rejection, kiosk join and room-level attendance, parent data isolation, the full learn → complete → certificate → public-verify path, PDF rendering, quiz auto-grading with proctor auto-submit and attempt limits, assignment submit/grade, helpdesk escalation through all three levels, site-utilization reporting with CSV export, audit-trail integrity, and refresh-token rotation with replay rejection.

Frontend verified serving through Vite with the API proxy; every page module transforms cleanly.

Six defects were found by that test run and fixed:

1. **Kiosk room attendance crashed (500)** — a kiosk token carries a synthetic `kiosk:<roomId>` subject, not a `User` row, so attributing the mark violated a foreign key. Room marks from a panel are now stored unattributed.
2. **Certificate PDF download crashed (500)** — `pdfkit` is a CommonJS default export and was imported as a namespace.
3. **Credential hashes reached the audit log** — redaction was top-level only, so a nested classroom relation carried `kioskPasswordHash` into `AuditLog.after`. Redaction now walks the whole payload.
4. **Kiosk password hashes were returned in API responses** — `LiveSession` and classroom listings included whole `Classroom` rows. Both now use an explicit safe projection.
5. **Refresh rotation collided (409)** — two refresh tokens minted for one user within the same second were byte-identical, colliding on the `tokenHash` unique index. Tokens now carry a random `jti`.
6. **Build output landed in `dist/src/`** — the seed script was inside the compiled `include`.

---

Source reference: GeM Bid Document GEM/2026/B/7822845, HYBRID LEARNING SYSTEMS, PWD J&K R&B Division Pahalgam.

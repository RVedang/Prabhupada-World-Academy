# Application performance audit — 2026-09-01

This file records the pre-change architecture and measurements used for the
performance work. It intentionally contains no production data or credentials.

## Baseline

- Built JavaScript: 32 chunks, 3,088,156 bytes (2.95 MiB uncompressed).
- Largest generated chunks: 734,817 bytes and 610,390 bytes.
- API source query call sites: 534 `findAll` and 497 `findOne` references.
- Browser Firestore realtime listeners: 0.
- `setInterval` call sites: 11, including dashboard counts, approvals, meetings,
  profile refresh, notifications, version checks, and auth callback handling.
- Dashboard endpoint components: 143 files import the generated endpoint SDK.
- Components/pages with effects: 138.

## Bottlenecks found

1. `App.tsx` eagerly imports nearly every SPA page, including all role dashboards.
2. The generated endpoint SDK caches for 60 seconds, but every mutation clears
   every cached response instead of only related data.
3. Several dashboards poll every 10–15 seconds with `_nocache`, repeatedly
   downloading unchanged data.
4. Shared `TabRouter` keeps visited panels mounted, but does not preload the
   most-used scoped tabs. Custom admin dashboards use the same visited-only
   pattern.
5. Some dashboards explicitly disable keep-alive, causing tab remount/refetch.
6. Large report endpoints read 1,000–5,000 documents and aggregate in memory.
7. Several endpoints enrich lists with per-record `findOne` calls (N+1), notably
   meeting creators, push subscription users, residency names, and imports.
8. Firestore is server-only and rules default-deny browser access. Direct
   listeners on private collections would bypass the existing API authorization
   model and are therefore inappropriate.

## Realtime data model

Collection: `RealtimeInvalidations`

- Document IDs: `PW`, `FOLK`, `ALL`.
- Fields: `department` (string), `version` (number), `updatedAt` (server timestamp),
  `channels` (map of channel name to monotonically increasing number).
- Contains no user data, document IDs, counts, PII, roles, or business values.
- Authenticated clients may read only; all writes are server/Admin SDK only.
- Clients listen to their department document and `ALL`, then silently rerun
  only already-active permission-scoped API queries for changed channels.

## Implemented architecture

```text
authorized endpoint mutation
  -> Firebase Admin writes business document
  -> Firebase Admin increments one metadata channel
  -> two-document scoped onSnapshot listener
  -> related endpoint cache entries invalidated
  -> mounted query hook refreshes silently
  -> cached/optimistic UI stays visible
```

- Channels: users, groups, attendance, quizzes, sadhana, meetings, services,
  notifications, config, and general.
- Query responses are isolated by Firebase identity, LRU-bounded to 250 entries,
  deduplicated while in flight, and retained as stale render hints.
- Cache and stale React-query state are cleared when the authenticated identity
  changes, preventing data from one account appearing for the next account.
- Firestore metadata uses persistent multi-tab local cache. Private business
  documents remain server-only and are never downloaded for client-side hiding.
- High-use dashboard panels stay mounted after first use. RGF/RGSF group,
  attendance, and member tabs are mounted during idle time using already-scoped
  endpoint calls. Sadhana sub-tabs retain their data after the first visit.
- Large routes and FOLK/PW admin panels are lazy chunks; Sadhana sub-tab code is
  preloaded during idle time without prefetching its database data.
- Safe quiz group activation is optimistic and rolls back on write failure.
- Meeting reminders use exact one-shot timers. Meeting, profile, approval,
  badge, and MoM refreshes are event-driven rather than interval-based.

## Query/read changes

- `getMeetings`: removed creator-name N+1 reads; the existing denormalized
  `createdByName` is used. FOLK and status constraints are pushed into Firestore.
- `getMoms`: non-admin invitees query MoMs only for their visible meetings (up
  to 30 IDs); large admin catalogues retain one bounded scan.
- `getPushSubscriptionStats`: user enrichment changed from N document queries
  to parallel Firestore `in` batches of at most 30.
- `createMeeting`: facilitator candidates use four targeted role/flag queries,
  invitee details use bounded `in` batches, and the redundant creator lookup was
  removed.
- `getGuideUsers`: guide-sized scopes query 100-day Sadhana history by scoped
  user-ID batches; large super-admin scopes retain the cheaper bounded range
  scan. This requires the added `SadhanaEntries(user, entryDate)` index.
- Read endpoint calls share one generated SDK cache. Successful mutations now
  invalidate related channels instead of clearing every cached query.

## Polling removed

Database/network polling was removed from:

- PW admin and FOLK guide approval/registration badges (15 seconds)
- approvals list (10 seconds)
- meeting/MoM list (15 seconds)
- dashboard meeting reminder query (30 seconds)
- profile/role refresh (60 seconds plus navigation/focus refetches)
- custom reminder dispatcher (15 seconds)
- service-worker identity/settings synchronization (3 seconds)
- application version check (20 minutes)
- `/api/push-events` browser long-poll loop

The remaining `setInterval` updates only elapsed text on the short-lived OAuth
callback page; it performs no database or network work.

## Measurements

| Metric | Before | After |
|---|---:|---:|
| Browser Firestore listeners | 0 | 2 small metadata documents per signed-in client |
| Business-data database polling loops | 7 plus long-poll | 0 |
| Repeated profile refresh triggers | interval + focus + navigation | initial load + user-channel events |
| Meeting list requests while a tab is open for 5 minutes | about 21 per client | 1 initial request, then only actual meeting changes |
| Approval list requests while open for 5 minutes | about 31 per client | 1 initial request, then only actual changes |
| Largest built JS chunk | 734,817 bytes | 586,402 bytes (-20.2%) |
| Production build | baseline passed | passed in 8.2 seconds |

The post-change Turbopack build emits 145 smaller lazy chunks; summing every
possible role/route chunk is not an initial-download metric. The largest-chunk
comparison and route-level splitting are the comparable static measurements.
Runtime diagnostics now expose:

- `dashboard-tab:<tab>` User Timing measures and development console duration
- endpoint source (`cache`, `network`, `deduplicated`) and duration samples via
  `getEndpointPerformanceSnapshot()`
- API `Server-Timing` values for authentication, execution, and realtime publish
- development warnings for client endpoint calls at or above 500 ms and server
  endpoint execution at or above the existing slow-request threshold

An authenticated two-browser measurement is still required to state a real
P50/P95 tab latency for production data. The instrumentation is included so
those numbers are measured rather than guessed.

## Verification performed

- `npx next build`: passed; production compilation and static generation passed.
- Firebase CLI 15.28.2 Firestore dry run against `bvpw108`: rules compiled and
  the rules/index configuration validated; nothing was deployed.
- `git diff --check`: passed.
- Static polling scan: no business database/network `setInterval` remains.
- Full `tsc --noEmit` still reports the repository's broad pre-existing endpoint
  typing debt; changed-file errors introduced during this work were resolved.

## Manual two-client test

1. Deploy the application, `firestore.rules`, and `firestore.indexes.json` to a
   staging project first.
2. Sign in as two users in the same department in separate browser profiles.
3. Open Members, Groups, Attendance, Quizzes, Results, and Meetings once; switch
   away and back and inspect the `dashboard-tab:*` measures in DevTools.
4. From the authorized account, update one user/group/attendance/quiz/meeting.
   Verify the relevant second browser changes without refresh and unrelated tabs
   make no endpoint call.
5. Throttle the second browser to Slow 3G; verify old data remains visible during
   the silent refresh and no full-page loader replaces it.
6. Open a second tab for the same account and verify only the PW or FOLK metadata
   documents are listened to. Log out and sign in as a different role; verify
   previous account data is cleared and endpoint queries remain hierarchy scoped.
7. Exercise optimistic quiz activation with an allowed account and then an
   intentionally rejected request; verify immediate UI and rollback behavior.

## Remaining bounded slow operations

- First-time aggregate reports over long date ranges still require server-side
  reads and calculation. They now remain mounted/cached after use, but should be
  moved to maintained summary documents if production volumes exceed current
  bounds.
- Super-admin views intentionally cover a broader hierarchy than guide/RGF views;
  they are bounded but cannot be as cheap as group-scoped queries.
- Existing offset pagination remains on several legacy endpoints. Cursor-based
  pagination is preferable for very deep pages, but changing response contracts
  across every report in one pass would risk business behavior and was not done
  without production-volume evidence.
- Exact cross-user latency depends on Firebase region, client network, and the
  server endpoint runtime. The architecture removes fixed polling delay but does
  not make a fresh uncached aggregate independent of those factors.

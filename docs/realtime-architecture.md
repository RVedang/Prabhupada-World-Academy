# Event-driven synchronization: implementation and verification

Updated 2026-09-09. **Implemented and verified locally; production realtime not verified.** Full
application acceptance remains open for the limitations below. No production
business data was changed or migrated during this work.

Live read-only check at 09:46 UTC: Cloud Functions listing returned HTTP 403
with reason `SERVICE_DISABLED` for `cloudfunctions.googleapis.com` in `bvpw108`.
Enabling that service and deploying the worker require approval. This run did
not deploy infrastructure. The shared branch advanced to `9bef4a5` during
verification; an App Hosting rollout could not be confirmed by the CLI check,
so do not infer the hosted revision from this run's local build.

## 1. Existing problem

Next.js 16.2 / React 19 uses Firebase Authentication, server-mediated Firestore
reads through `/api/run/[endpoint]`, a custom endpoint cache and React state.
No TanStack Query, Redis or deployed application WebSocket/SSE transport existed.
Private business collections remain accessible through the Admin SDK only.

Staleness came from department-wide revisions, minute-based query-hook freshness
timers, ignored initial listener snapshots, unsubscribed stateful loaders,
process-local caches, and recursive service-worker notification long polling.
Manual Refresh remains an explicit recovery action, not the new mechanism.

## 2. Realtime architecture

Reuse native Firestore subscriptions and the existing endpoint cache:

```text
Authorized API / import / scheduled job commits business data
  -> native Firestore write trigger
  -> match private authorized query dependencies
  -> advance only matching per-user query revisions
  -> owner's shared Firestore connection receives revision
  -> invalidate exact endpoint key and revalidate through its normal API
  -> affected components update without reloading the dashboard
```

`synchronizeQueries` is a second-generation Cloud Function for top-level business
document writes. Internal metadata is nested so registry/clock maintenance does
not recursively invoke the business trigger. No competing data store or socket
server was introduced.

Authorized reactive reads capture actual Table queries and the earliest database
read timestamp. Successful responses provide opaque `X-Realtime-Token` and
`X-Realtime-Version` headers. Registration failure is logged but does not undo
successful CRUD or a successful business read.

## 3. Event model and storage

Internal events are `{table, id, before, after, version}`. Create, update and
delete derive from the before/after images. Relevant tables include Users/Guides,
SadhanaEntries/BvslPreachingEntries, BvGroups/BvGroupMembers, attendance,
Meetings/MinutesOfMeeting, service, cleanliness and reference data. Moves invalidate both
old and new scopes.

Browsers receive only `{version}` for report invalidation: **36 JSON bytes** in
the fixture, excluding document path and transport. No business row, filter,
membership list or role claim is included.

| Path | Purpose | Browser access |
| --- | --- | --- |
| `RealtimeClients/{uid}/queries/{token}` | Persistent latest revision | Owner read-only |
| `RealtimeClients/{uid}/notifications/{id}` | Minimal recipient reminder | Owner read-only |
| `RealtimeInternal/registry/realtimeSubscriptions/{token}` | Authorized query dependencies | Denied |
| `RealtimeInternal/registry/realtimeIdentities/{uid}` | Identity aliases | Denied |
| `RealtimeInternal/registry/realtimeClocks/{table}` | Read/register race recovery | Denied |
| `RealtimeInternal/registry/realtimeEvents/{eventHash}` | Idempotent deletion watermark | Denied |

Create/update versions use database timestamps with nanosecond precision.
Deletion CloudEvent time proved too coarse; an idempotent event record now
stores a database snapshot read timestamp. Retries reuse it. Collection clocks
close the read/register race. Per-query max versions tolerate duplicate and
unordered delivery, as required by the
[Firestore trigger contract](https://firebase.google.com/docs/functions/firestore-events).

## 4. Pages made reactive

The [114-file source inventory](realtime-coverage.md) lists every page/component/
context using the shared adapters and its observed reads. Main domains:

- PW/FOLK member dashboards; Guide, Super Guide, Admin, Super Admin, RGF, RGSF,
  Supervisor and Sadhana Mentor dashboards; profiles and approval/role notices.
- Daily Sadhana, history, trends, reports, scoring, leaderboards, missing Sadhana,
  progress and related summary cards.
- BV reports, preaching, stats, improvement, groups, members, session attendance,
  quizzes/results, join requests, weekly plans and one-to-one calls.
- PW Meetings/MoM, participants and reminder configuration. FOLK Meetings/MoM
  remain disabled.
- User/guide/residency administration, assignments, attendance, CRM, rent/trips,
  pipeline, archive statistics and TagMango logs/settings.
- Service calendars, allocation, availability, preferences, skills, analytics,
  leaderboards, alerts and cleanliness.

Children derived entirely from reactive parent props need no independent
listener. This is source coverage, not one live browser test per screen.
On-demand exports and intentional editing snapshots are listed separately.

## 5. Cache integration

`useEndpointQuery`, compatibility `useQuery`, `useReactiveLoader` and
`useReactiveEffect` share exact-key endpoint invalidation. Existing data remains
visible during revalidation; identical concurrent reads share one request.
Response generations and read watermarks prevent stale HTTP responses from
overwriting newer data. Cached remounts reattach without unnecessary network reads.

The LRU retains up to 250 inactive entries plus reference-counted mounted
consumers. Navigation cannot evict a visible query's subscription. Evicted
in-flight requests have distinct epochs when the same key is revisited.
Only identity/authority changes clear the whole user's cache.

One-shot batching coalesces event bursts; hidden panels defer reads. Draft guards
protect Sadhana, attendance, weekly plans, preferences, availability, cleanliness,
allocation, quizzes and settings. Save completion does not clear edits made
while that save was in flight. Filters, views and scroll containers are retained.

## 6. Authorization

Existing JWT/email verification, database roles, capabilities and endpoint-local
guards remain authoritative. Reactive reads bypass short-lived role/reference
caches so revocation is checked immediately. Dependencies are registered only
after successful authorization; browsers cannot choose a subscription scope.

Owner-only Firestore metadata rules were reviewed with the security-auditor
skill. Every business collection and private registry remains default-deny.
Real authenticated tests deny anonymous reads, cross-user reads, forged writes,
private Users/registry access and unrestricted collection-group queries.
API tests cover cross-department denial and immediate role revocation using the
same token. Historical aliases and existing membership rules are preserved.

Opaque revisions grant no business-data access: revalidation always runs the
API guards again.

## 7. Polling removed

- Minute-based intervals in `useQuery` and `useEndpointQuery`.
- Department-wide `useRealtimeRefresh` and broad mutation cache refresh.
- Recursive service-worker `/api/push-events` polling. The retired route returns
  410 without a freshness database query.
- Prefetch queue's repeating hidden/busy checks, replaced with cache completion,
  online and visibility events; the prefetch work list itself is finite.
- No full-page reload is used for routine synchronization.

Legitimate timers remain: one-shot input/event debounce, bounded retries of
failed operations, authentication elapsed-time UI, and scheduled reminders.
Server reminder schedules are business jobs, not dashboard polling. Native
Web Push still handles background/closed-browser delivery; the new recipient
inbox handles foreground notifications.

## 8. Reconnection and cleanup

One shared Firestore client uses persistent multi-tab coordination where
supported. Logical query listeners contain only known cache tokens, in batches
of at most 30, plus one recipient inbox listener. Full unchanged batches are
reused. Actual production device/socket counts have not been instrumented.

Initial/reconnect snapshots reconcile persistent revisions. Hidden views retain
dirty state. Failed reads retry at most three times with backoff, then wait for
a new event or online/visibility recovery. Listener restart attempts are bounded.
An offline/sync warning retains existing data; logout stops listeners.

Registrations and deletion metadata expire after 30 days.
`expireRealtimeQuery` removes a signal only if no newer registration replaced
it. Removed/missing server-confirmed signals cause active queries to reauthorize.
The emulator test simulates registry deletion, not the managed TTL scheduler.
TTL requires deployed field policies and is asynchronous. Only synchronization
metadata receives retention fields; no historical business data is expired.
See [Firestore TTL](https://firebase.google.com/docs/firestore/ttl).

## 9. Measured performance

Local measurements, not a production/mobile-network SLA:

| Measurement | Result |
| --- | --- |
| Native write request to authenticated listener | Cold create 2,854 ms; warm update 180 ms; delete 169 ms |
| Manual worker publish to authenticated listener | 122 ms; 1 candidate, 1 affected query |
| Browser event to rendered report, deterministic 20 ms API | 215 ms |
| Signal JSON body | 36 bytes, excluding path/transport |
| Two consumers of the same query | 1 initial HTTP request |
| 100 revisions in a burst | 1 report request |
| Duplicate/out-of-order revisions | 0 extra requests |
| Unrelated query on a scoped update | 0 requests and 0 component renders |
| Idle browser observation | 65 seconds, 0 HTTP reads |
| Sustained request failure | Initial attempt + 3 retries, then stop; online event recovers |

Actual refreshed business query counts from Server-Timing: Member history
**1**, scoped Guide report **15**, Super Guide report **4**. These exclude auth,
registration transactions and trigger work. Report formulas still execute;
this is not incremental aggregate computation.

The old source had a one-minute freshness interval; the new idle test crosses
that interval without a request. There is no production before/after billing
measurement. Large-audience load testing remains necessary before asserting net
database savings. Browser fixture latency and native CDC latency measure
different stages and must not be combined into a claimed production SLA.

## 10. Multi-user testing and validation

Passing local checks:

- Production build, TypeScript check, Functions build and whitespace check.
- Worker dependency audit: 0 vulnerabilities after overriding transitive UUID
  to patched CommonJS-compatible 11.x. The inspected transport consumers use
  v4, not the affected v3/v5/v6 buffer APIs.
  [Upstream advisory](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq).
- Query-model and listener-batch suites: 11 tests.
- Cache tests: dedupe, exact invalidation, ordering, identity isolation, denied
  reads, pinned LRU lifecycle and eviction races.
- Browser test: real hooks/cache, cached navigation, batching, isolation, drafts,
  filter races, authority reattachment, bounded retries, online recovery and
  zero idle traffic.
- Firestore integration: two authenticated sessions, owner-only rules, negative
  security checks, shared-UID watermarks, notification privacy and offline recovery.
- API integration: actual JWT/capability/local guards, invitation changes,
  department isolation and immediate role revocation.
- Native integration: no manual event publishing; create/update/delete/reminder
  delivery, deletion idempotency, expiry and renewal-vs-cleanup race.
- Five-role native Sadhana integration: **8 authenticated sessions**, covering
  Member/Guide/Super Guide and PW Member/Admin/Super Admin, unrelated Guide
  isolation and department isolation. FOLK guide fixtures include the BV
  membership required by current report authorization.
- Targeted PW report, facilitator scope, BV/member attendance and notification
  regression suites.

Test files: `tests/realtime-{query-model,listener-batches}.test.ts`,
`tests/realtime-client.browser.cjs`, and
`tests/realtime-{firestore,api,native,roles}.emulator.test.ts`.
Integration fixtures assert `demo-pwa-realtime` and localhost before writing.
No production data was used. Host emulator Node was 24; deployment targets 22.

## 11. Remaining limitations and deployment gate

1. **Production setup blocked:** the Cloud Functions API is disabled. Functions,
   rules, TTL/index policies and App Hosting need a coordinated rollout and
   validation. No production delivery or subsecond SLA is claimed;
   cold starts exceeded one second locally.
2. Anonymous session-token/registration data remains request-based. Owner-only
   metadata deliberately grants no public subscription. Public realtime needs
   a separate authorized scope design.
3. Tested Sadhana/BV/attendance/meeting paths match database predicates,
   projections and explicit final scopes. Some legacy hierarchy/reference
   helpers still read broadly and can conservatively trigger unrelated refreshes.
   They expose no business payload, but exhaustive exact-recipient acceptance
   remains open.
4. Existing scope can hide data independently of realtime. A direct FOLK Guide
   assignment without the hierarchy/BV membership required by
   `getScopedHierarchyUserIds` was insufficient in the new fixture. That
   pre-existing permission intersection was deliberately not changed.
5. Not every inventoried screen has an end-to-end UI test. Hook tests and native
   backend tests are complementary, not a full deployed two-browser journey
   through every role and screen.
6. No shared cross-server aggregate cache was added. Report recalculation and
   metadata fanout still cost reads/writes. Dependency document size, large
   audience fanout and collection-clock contention require capacity testing.
7. Abruptly closed clients retain private registrations until asynchronous TTL,
   potentially causing revision work during retention. Registration failure
   leaves CRUD usable but cannot provide a live token until a subsequent read.
8. Events track committed documents, not completion of an entire multi-write
   workflow. Intermediate committed states can appear briefly before subsequent
   events reconcile; business transactions were not changed.

### Deployment order — requires approval

1. Review/stage realtime changes separately from concurrent mobile-layout and
   meeting edits in this shared worktree.
2. Confirm `bvpw108/(default)` remains Standard, `nam5`; do not migrate it using
   the legacy location label in firebase.json.
3. With approval, enable the required Functions/Eventarc services, then deploy
   `synchronizeQueries`, `expireRealtimeQuery`, owner-only rules and
   indexes/TTL policies. Verify region, IAM and Node 22.
4. Deploy App Hosting. Upgrade old browser versions: their legacy channel and
   long-poll mechanism is retired.
5. Verify hosted-domain authenticated multiuser submit/edit/delete/reassign/revoke,
   plus mobile disconnect/resume. Inspect logs, denials, traffic and billing.
6. Mark full acceptance only after the remaining checks are resolved or explicitly
   accepted. A successful build is not a production fix.

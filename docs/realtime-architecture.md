# Event-driven synchronization audit and implementation

## Existing system (2026-09-09)

Next.js 16 / React 19, Firebase Authentication, server-mediated Firestore reads
through `/api/run/[endpoint]`, a custom endpoint cache, and React local state.
There is no TanStack Query, Redis, WebSocket server or SSE infrastructure.
Firestore already supplies the realtime transport. Private business collections
must remain inaccessible to browser SDKs. Historical Zite records remain in the
same collections, with the existing identity-alias and authorization handling.

Problems found:

- Department-wide channel revisions refresh unrelated queries.
- Both data hooks run minute-based freshness timers.
- Initial listener snapshots are ignored, losing changes during disconnection.
- Many loaders copy endpoint results into local state without a subscription.
- Notification delivery includes a recursive service-worker long-poll loop.
- Process-local server cache entries can be stale on another server instance.

## Implementation plan and acceptance checklist

- [ ] Record actual database query dependencies during authorized API execution.
- [ ] Register private server-derived query subscriptions, never browser scopes.
- [ ] Publish compact per-user query revisions after native Firestore writes.
- [ ] Match before and after records, date bounds and selected fields; preserve
      all existing calculations and role guards.
- [ ] Integrate exact revisions into the existing client cache, retaining data
      during background revalidation and protecting against stale responses.
- [ ] Remove periodic refresh and notification long polling.
- [ ] Connect all stateful data loaders, including master-data dropdowns.
- [ ] Reconcile persisted revisions on reconnect/resume and clean up listeners.
- [ ] Audit owner-only metadata rules with real authenticated emulator clients.
- [ ] Measure two-session propagation, unrelated-query isolation, ordering,
      batching, offline recovery, request counts and payload sizes.
- [ ] Typecheck/build and document deployment requirements and limitations.

## Architecture decision

Reuse Firestore listeners and the endpoint cache. Native database write triggers
provide a durable event source for API writes, imports and background jobs. A
server-private registry stores query dependencies collected only after existing
API authorization succeeds. Browsers receive opaque query revisions in their
own UID namespace, not records, recipient lists, query filters or role claims.
Normal authorized APIs still supply all displayed business data.

Subscriptions are an acceleration index, not a second business-data store.
Writes and historical records are not migrated. A listener failure cannot roll
back successful CRUD. Native push and scheduled business reminders are separate
from dashboard freshness and must continue working.

Firestore triggers are at-least-once and unordered: matching must process both
old and new scopes, and only advance each query's committed revision. See the
[official trigger contract](https://firebase.google.com/docs/functions/firestore-events)
and [listener behavior](https://firebase.google.com/docs/firestore/query-data/listen).

## Verification status

Implementation in progress. No production realtime claim or sub-second latency
claim has been verified yet. Existing mobile-layout edits belong to separate
work and must be preserved.

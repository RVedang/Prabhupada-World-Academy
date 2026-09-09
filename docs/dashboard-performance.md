# Dashboard performance — updated 9 September 2026

The six dashboard areas now preserve visited panels and filter state, share scoped API responses, refresh in the background, and prefetch likely next screens after visible work finishes. The existing report calculations and access scopes are preserved; no caching dependency was added. Two confirmed missing Firestore indexes were created and verified READY in `bvpw108/(default)`.

## Diagnosis and changes

| Area | Main API calls | Finding and change |
| --- | --- | --- |
| Sadhana Report | `getGuideDetailedReport` | 400 ms debounce on discrete selections, remounts, table replacement during refresh, individual guide/residency label reads. Uses shared SWR, retains previous data, batches reference labels, reads report and streak ranges concurrently, before dropdown labels finish. |
| BV Report | `getBvSessionMatrix`, FOLK super-guide `getSuperGuideBvStats` | Recreated report subtabs and a 300 ms delay before fetching. Preserves subtab state, caches each date/group/scope combination, refreshes without blanking the table. Once group membership is authorized, profile labels, attendance and FOLK quiz reads run concurrently. |
| Members / Users | `getGuideUsers`, guide/group/mentor lookups | Lookups blocked the directory request; every row instantiated several role selectors. Member queries start as soon as scope is known; scoped history starts before unrelated metadata finishes. Independent reads run concurrently; 50 rows render per page. Search, sorting and exports still use the complete authorized result. |
| Bhakti Vriksha | `getBvslGroups` or `getAllBvGroupsAdmin` | Facilitator, guide and membership enrichment ran in consecutive waves. Independent waves now run concurrently. Guide-scoped server cache is 30 seconds instead of 10 minutes, with write invalidation. |
| Meetings / MoM | `getMeetings`, `getMoms`, minimal invitee directory | Cards waited for the entire invitee directory. Meetings, MoM and directory now have separate query state; directory latency does not block cards. |
| Missing Sadhana | `getMissingSadhanaReport`, residency lookup | Repeated master-data reads and a blocking fetch on every selection. Uses scoped SWR, cached labels and parallel independent lookups. Scoped member/entry reads no longer wait for display options. |

`TabTransition` keyed the entire dashboard subtree by active tab. Consequently, even its existing “visited tabs” wrappers remounted on every navigation. Removing that key and adding lazy, persistent `DashboardPanel` containers fixes the underlying state loss. Identity/authorization changes still reset those panels.

Some endpoints perform identical nested reads while resolving authorization and report scope. `requestQueries.ts` deduplicates exact table/operation/filter/projection reads **inside one authorized request only**. Results are cloned for each consumer; immutable Firestore value prototypes are preserved. Writes invalidate that table's pending reads.

`guideScope.ts` now resolves residency aliases, guide assignments and display names from one fresh projected residency read. Authorization data is not placed in the shared label cache. Explicitly departmental BV groups also avoid an unnecessary user-directory scan just to infer their department.

## Cache and freshness

- Existing endpoint SDK remains the primary client cache; no React Query/SWR dependency or competing report cache was introduced.
- Keys include exact Firebase identity, authorization fingerprint, endpoint and every filter. Undefined properties normalize the same way as the JSON request body. Firebase IDs remain case sensitive.
- Reports/directories: 60-second freshness. Guide/residency/mentor lookups: 5 minutes. Client entries are bounded to 250. Stale query data can display while refreshing.
- Repeated concurrent reads share one request; mutations never share promises. An invalidated in-flight response cannot repopulate a cache entry. A failed authorization response removes the query's cached data.
- Read dependency channels explicitly connect reports to users, groups, attendance, Sadhana, quizzes, meetings and configuration. Successful mutations invalidate affected channels; cross-session updates use existing data-free realtime metadata.
- Hidden panels defer refresh. Active panels revalidate on relevant events, returning focus/visibility, and a minute freshness check. Permission changes and sign-out clear identity-specific caches and mounted state.
- Server label cache: 60 seconds, projected guide/residency display fields only. Local writes invalidate it. The 30-second group cache is keyed by server-resolved scope. TTLs bound freshness across separate server instances.
- Obsolete filter responses are ignored for the current view, while still being useful if the user later returns to that filter. Shared reads are not aborted merely because one consumer changes filters.

## Prefetch and data volume

After authentication and scope resolution, a one-second delay lets visible requests start first. The prefetch queue waits for active requests, runs one background read at a time, pauses in hidden tabs, and skips data-saving/2G connections.

It prepares department lookups, default daily Sadhana, current-week BV data and last-week missing-Sadhana data. PW additionally prepares Meetings/MoM. Full member and management reads start on navigation intent, not unconditionally at login. Pointer/focus intent also warms the corresponding lazy JavaScript module. The existing FOLK guide dashboard does not expose a Meetings tab; no permissions or navigation were added for this task.

The tested directory is moderate in size (about 325 KB). Member pagination limits **DOM rendering**, not server download size. Existing server projection, department/hierarchy filters, limits and date paging remain in effect. A future substantially larger directory needs cursor pagination and separate export/parent-picker endpoints; this change does not pretend that client pagination provides that database optimization.

## Database indexes

Read-only Firestore Query Explain returned `FAILED_PRECONDITION: no matching index found` for both queries below. Existing ascending `group` and descending `entryDate` indexes did not satisfy them.

| Collection | Fields, ascending | Verification |
| --- | --- | --- |
| `BvAttendance` | `groupId`, `attendanceDate` | READY; Query Explain selects `(groupId ASC, attendanceDate ASC, __name__ ASC)` |
| `SadhanaEntries` | `user`, `entryDate` | READY; Query Explain selects `(user ASC, entryDate ASC, __name__ ASC)` |

Only these two indexes were added, with matching definitions in `firestore.indexes.json`. No existing indexes, member documents or security rules were changed. This also restores results previously hidden when failed history/attendance reads were caught and treated as empty.

## Browser measurements

Built pre-change revision `d26491d` and the optimized application separately. Chromium exercised PW admin, PW super admin, FOLK guide and FOLK super guide. All API requests were intercepted: normal responses delayed 350 ms, meeting invitee directory delayed 1,400 ms, with 120 synthetic members. External traffic was blocked. These measure frontend navigation with controlled API latency, **not production end-to-end latency**. Values include Playwright actionability/render waiting and are single-run medians across roles.

| Flow | Before | After |
| --- | ---: | ---: |
| Initial dashboard + first Sadhana result | 2,540 ms | 1,986 ms |
| BV Report, first visit | 2,000 ms | 1,126 ms |
| Members, first visit | 2,085 ms | 1,026 ms |
| BV management, first visit | 1,702 ms | 741 ms |
| Meetings, first visit (PW roles) | 2,490 ms | 504 ms |
| Missing Sadhana, first visit | 2,111 ms | 526 ms |
| Sadhana, cached return | 1,195 ms | 113 ms |
| BV Report, cached return | 1,137 ms | 113 ms |
| Members, cached return | 630 ms | 94 ms |
| BV management, cached return | 1,234 ms | 114 ms |
| Meetings, cached return (PW roles) | 836 ms | 104 ms |
| Missing Sadhana, cached return | 675 ms | 95 ms |
| New date selection | 1,229 ms | 497 ms |
| Previously loaded date selection | 594 ms | 84 ms |

The table records the original performance pass. The final four-role browser run after the type repairs also passed: cached tab returns made zero new API calls, with a 116 ms median and a 91–269 ms range; median cached-date selection was 86 ms. Tests also checked retained member search, pagination and changing filters before an older response finishes.

## Live database-backed endpoint measurements

`scripts/profileDashboard.ts` runs existing endpoint logic with real stored user contexts and a read-only HTTPS adapter for the Table queries. It forbids writes and reports query shapes/counts, response size, timing and SHA-256 hashes without member records or tokens. It excludes browser traffic, Firebase-token verification and API route transport; the deployed application's Firestore transport can have different latency.

PW super-admin first execution, original baseline versus the final follow-up implementation:

| Endpoint | Before | After |
| --- | ---: | ---: |
| Detailed Sadhana | 4,986 ms | 1,860 ms |
| BV matrix | 3,593 ms | 2,574 ms |
| Members | 4,648 ms | 2,259 ms |
| BV groups | 7,461 ms | 3,058 ms |
| Meetings | 380 ms | 1,121 ms |
| MoM | 1,523 ms | 1,518 ms |
| Missing Sadhana | 5,713 ms | 2,522 ms |

Fresh measurements use the original `d26491d` endpoint code and the same current indexed database, date and filters. Both versions use the same instrumented REST adapter. These are individual samples with variable remote network latency, not statistical guarantees. For example, the unchanged one-query PW super-admin Meetings read was slower in this sample. The PW admin Meetings read was 381 → 341 ms. No claim is made that every cold call improved.

Additional first-execution results:

| Role | Detailed Sadhana, before → after | Members, before → after | Missing Sadhana, before → after |
| --- | ---: | ---: | ---: |
| PW admin | 8,235 → 3,220 ms | 7,072 → 3,254 ms | 6,214 → 3,276 ms |
| FOLK guide | 5,111 → 3,657 ms | 4,228 → 2,688 ms | 5,889 → 1,566 ms |
| FOLK super guide | 1,023 → 1,274 ms | 5,067 → 4,345 ms | 3,082 → 1,914 ms |

All 56 response hashes matched across four stored role contexts, seven endpoint paths and two visits. After the final BV matrix parallel-read change, all eight matrix hashes matched again: **64/64 comparisons**. This verifies sampled output equivalence; synthetic scope tests cover populated admin/mentor cases that some live accounts lack. The FOLK Meetings/MoM endpoints return empty results and are not exposed by those dashboards.

Serialization remains a few milliseconds and is not the main bottleneck. Full sanitized query traces, including rows, projections and durations, are stored under `followup` in `dashboard-performance-measurements.json`; earlier measurements remain available there for comparison.

## TypeScript repair

`npm run typecheck` now completes with **zero diagnostics**. The previous workspace had 851. The production build now runs TypeScript validation too: `typescript.ignoreBuildErrors` was removed from `next.config.ts`. No source files were excluded and strictness was not disabled.

The main cause was the endpoint factory accepting `any`, which discarded schema input and handler result types across the SDK. The factory now preserves parsed inputs, authenticated context and actual return types. Client wrappers use raw Zod input types, so server defaults remain optional for callers. The additional meeting, role and bulk-user invokers are typed as well. Compile-only contracts check that invalid requests and nonexistent response fields are rejected.

Other corrections align Base UI/React/Recharts props with the installed packages, fix stale imports and nullable results, and resolve mismatches that previously reached runtime: meeting duration edits now persist; member CRM requests actually apply their authorized member filter; service cards receive their stored duration/status and profile statistics; member exports use their own authorized, paginated history. Regression tests cover these data contracts where behavior changed.

## Validation and diagnostics

- Production build and `npm run typecheck` pass with TypeScript validation enabled. All 16 targeted test files pass, covering client cache, request isolation, report/mentor scope, attendance aliases, meeting participants/roles/duration, reminder regressions, service data contracts and security policy. Browser checks pass for all four dashboard roles.
- Browser test: `tests/admin-dashboard-performance.browser.cjs`, against the local built app. Set `BASELINE=1` only when collecting the old behavior.
- Five gated concurrency tests prove that independent report reads can begin before slow metadata/profile reads resolve. They check returned data rather than relying on fragile millisecond thresholds. Compile-only endpoint contract tests run as part of the repository typecheck.
- API `Server-Timing` separates authorization, endpoint work, summed database-read duration, read count, deduplication count, serialization and total. Concurrent-read duration is a sum and can exceed endpoint wall time.
- Development builds expose `window.__pwDashboardPerformance()` with a bounded history of cache/network/deduplicated requests and React Profiler render samples. Network samples include the server timing header.
- Sanitized measurements are in `dashboard-performance-measurements.json`.

## Remaining limits and rollout

The avoidable sequential waits identified in this follow-up are removed. A cold request still resolves current permissions and reads the requested database records. In the live REST traces, even individual small queries sometimes take 300–1,200 ms; the largest member directory still requires a projected member read plus scoped history batches. Cached navigation avoids those round trips. These results do not establish a universal sub-500 ms cold backend target. Full authenticated production-browser verification remains necessary after deploying this final code. The two indexes are live; this follow-up has not deployed the application.

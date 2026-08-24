# Firestore security analysis (working file)

Date: 2026-08-24
Target: `projects/bvpw108/databases/(default)`
Edition/type: Standard / Firestore Native

## Architecture and languages

- Next.js 16, React 19, and TypeScript.
- Firebase Authentication is initialized in the browser.
- No application source imports the Firebase Firestore client SDK.
- Browser data calls use `src/lib/app-endpoints-sdk.ts` and POST to
  `/api/run/{endpoint}` with a Firebase ID token.
- Server endpoints use the Firebase Admin SDK through
  `src/lib/app-backend-sdk.ts`. Admin SDK access is governed by IAM and bypasses
  Firestore Security Rules.

## Firestore collections used by the server

AshrayChecklist, AshrayLevels, AshrayUpgradeRequests, AttendanceEvents,
AttendanceParticipants, AttendanceRecords, AttendanceSessions,
AttendanceVolunteers, BvAttendance, BvGroupMembers, BvGroupRequests, BvGroups,
BvMemberRegistrations, BvQuizSubmissions, BvQuizzes, BvSessions,
BvslPreachingEntries, BvslWeeklyPlans, ChallengeEnrollments,
CleanlinessInspections, CleanlinessReviewRequests, CleanlinessRooms, Config,
FolkResidencies, GuideTransferRequests, Guides, JigyasaProcessedFiles,
JigyasaRegistrations, JigyasaSessionAttendance, Meetings, MinutesOfMeeting,
OneToOneMeetings, PreachingReportGoals, PushSubscriptions, RentPayments,
ResidencyTransferRequests, SadhanaEntries, SadhanaFields,
SadhanaMonthlySummaries, ServiceAllocations, ServiceAvailability,
ServicePreferences, ServiceRatings, ServiceSwaps, Services, SkillCatalog,
TagMangoSyncLog, Trips, UnavailabilityRequests, Users, and UserSkills.

`seedFromCsvAdmin` can also select a collection name from an administrator-only
CSV import mapping.

## Query and CRUD access

All normal collection queries are constructed server-side by the `Table`
abstraction. It supports equality, `in`, `not-in`, greater/less-than filters,
ordering, limits, and offsets. Create uses document `set`; update uses merge
`set`; delete uses document delete. A few server utilities use Firebase Admin
collection/document calls directly.

Because no untrusted client executes these queries, Firestore rules do not need
to allow any of them. Denying all client access does not block Firebase Admin.

## Authentication and authorization findings

- Existing rules allow every authenticated non-test-email account to read and
  write every document.
- The API router currently infers administrator privileges from email
  substrings such as `admin`, `superadmin`, and `gaurmandal`.
- A missing `authenticated` endpoint property currently behaves as public.
- Several intentionally public attendance, registration-reference, cron, and
  webhook endpoints need explicit public declarations.
- Authenticated users without a database profile must remain able to call the
  registration/profile bootstrap flow, but must receive no privileged
  capabilities.
- Pending/inactive/rejected accounts need profile/status access, but must not
  gain active-account capabilities.

## Selected data sensitivity

- `Users`, attendance participant records, registrations, push subscriptions,
  rent, meetings, and one-to-one records contain PII or sensitive community
  data.
- `Users` contains role and capability flags. These must never be writable by
  an untrusted client.
- Sadhana entries and mentor/one-to-one reports are private spiritual-progress
  data and require owner/hierarchy scoping at the API layer.

## Rules decision

Use default-deny rules for every document. There are no client create or update
rules, so per-domain client validators are intentionally unnecessary. All
schema and business validation remains mandatory in server endpoints.

## Devil's advocate attack matrix

With `allow read, write: if false`:

- Public list exploit: denied.
- Unauthorized get/create/update/delete: denied.
- Update bypass and privilege escalation: denied.
- Ownership hijacking and immutable-field modification: denied.
- Type juggling, schema pollution, and required-field omission: denied.
- Oversized strings/arrays and direct storage abuse: denied.
- Invalid state transitions and timestamp manipulation: denied.
- Mixed-content PII leak: denied.
- Orphaned subcollection access: denied by the recursive wildcard.
- Query mismatch: not applicable to clients; all queries run through Admin SDK.

Residual risk is concentrated in server endpoint authorization, input
validation, public webhook/cron authentication, IAM, and secret management.

## Implemented hardening

- Replaced the authenticated blanket Firestore rule with a recursive,
  server-only default deny policy.
- Made API access private by default; every endpoint now explicitly declares
  `authenticated: true` or `public: true`.
- Replaced email-substring authority in the central router with exact,
  database-backed active-role capabilities.
- Added capability gates to high-impact user approval, role assignment, BV,
  reporting, attendance, meeting, notification, and import endpoints.
- Required unguessable session share tokens for public attendance mutations.
- Required a server-side secret for TagMango webhooks and bounded webhook
  payloads.
- Moved cron and VAPID private values from committed configuration to App
  Hosting Secret Manager references and removed browser-side fallback secrets.

## Verification

- Firebase CLI rules dry-run against `bvpw108/(default)`: compiled with no
  warnings; no deployment performed.
- Production Next.js build: passed.
- Static security policy tests and authorization role matrix checks: passed.
- Repository-wide strict TypeScript and ESLint checks still expose a large
  pre-existing typing/lint backlog outside this security change.

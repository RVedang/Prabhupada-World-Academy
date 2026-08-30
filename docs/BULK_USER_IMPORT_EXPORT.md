# FOLK Bulk User Import and Export

## Architecture

This feature extends the existing authentication and data model. It does not introduce a separate account system or any import-only collection.

- The browser signs the Guide in with Firebase Authentication and sends the Firebase ID token to the existing `/api/run/[endpoint]` route.
- The route verifies the token with Firebase Admin and derives `users.bulk.manage` from the existing active `GUIDE` or `SUPER_GUIDE` role.
- Endpoint-local authorization additionally requires a FOLK Guide/Super Guide profile and resolves its canonical Guide record. Admin wildcard access does not grant access to this feature.
- All database reads and writes run on the authenticated Next.js server through Firebase Admin.
- Firestore browser access remains default-deny. No client Firestore permission was added.

## Data written

Each new row creates records only in the existing collections:

- `Users`: active normal `User`, `segment: FOLK`, selected FOLK residency, and the authenticated importer's canonical Guide ID.
- `BvMemberRegistrations`: the same personal, contact, spiritual-practice, and preference fields submitted by the existing Bhakti Vriksha form, with approval recorded.

Import does not create `BvGroupMembers`. Approval and group membership are separate in the existing application; a Guide can assign an approved member to a group with the normal workflow.

System-owned values cannot be supplied in CSV. Role, segment, status, guide assignment, elevated flags, approval metadata, record IDs, and timestamps are all set on the server.

## Template fields

`src/config/bulkUserCsv.ts` is shared with the FOLK Bhakti Vriksha form options. The CSV headers are the union of the visible Create Your Account fields and visible FOLK Bhakti Vriksha registration fields. Duplicated form fields such as name, phone, and Ashray level appear once.

Conditional requirements:

- `residencyJoinDate` is required when `residencyUserClaim` is `Yes`.
- `templeName` and `devoteeName` are required when `inTouchWithTemple` is `Yes`.
- `selectedFolkResidency` accepts an existing FOLK residency document ID, residency ID, or exact residency name.

## Duplicate and login behavior

Preview and import both check normalized email and full E.164 phone values against existing `Users` records and against other rows in the CSV. Import repeats all validation and duplicate checks server-side. Firestore transactions enforce email and phone checks immediately before creating the paired records.

Imported users are not pre-created with an artificial password or provider. On first Google sign-in, the API matches the verified Google email to the existing profile, stores `firebaseUid`, removes only an incomplete auth-sync duplicate if one exists, and routes the active normal user directly to the normal user dashboard.

## Export scope

- Guide: normal FOLK users directly assigned to the authenticated Guide.
- Super Guide: normal FOLK users within the existing Super Guide department-wide scope, optionally filtered by assigned Guide.

Filters include active/inactive status, creation date range, Bhakti Vriksha group, and (for Super Guides) assigned Guide. The export begins with the complete import/form schema and assignment fields, then includes every additional stored user and BV registration field using `user.*` and `bvRegistration.*` prefixes.

## Verification checklist

1. Sign in as an active FOLK Guide and open **Members / Users**.
2. Download the template, populate valid rows, and import it.
3. Confirm preview totals for new, existing, and invalid records before importing.
4. Confirm new rows appear in the Members list with the importing Guide assigned.
5. Re-import the same file and confirm all rows are reported as already existing.
6. Sign in to Google with one imported email and confirm the user dashboard opens without registration or profile-completion screens.
7. Assign one imported member to a BV group with the existing workflow, then export using that group filter.
8. Confirm a Guide export contains no users assigned to another Guide.
9. Confirm a Super Guide can filter exports by Guide and cannot import an elevated role from CSV.
10. Sign in as a normal User or a non-FOLK admin and confirm the controls are hidden and the endpoints return `403`.
11. Import a file containing duplicate email/phone values, malformed email, missing required fields, and invalid conditional values; verify the error report contains the source rows and reasons.

Automated verification:

```bash
npx tsx --test tests/bulk-user-management.test.ts
node --test tests/security-policy.test.mjs
npm run build
```


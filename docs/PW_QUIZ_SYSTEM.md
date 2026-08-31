# Prabhupada World Quiz System

## Architecture

Prabhupada World uses the existing Bhakti Vriksha quiz engine. It does not use a parallel quiz database or a second participant flow.

- Quiz content remains in `BvQuizzes`.
- Attempts and calculated results remain in `BvQuizSubmissions`.
- Reading groups remain in `BvGroups`.
- Participant eligibility remains based on `BvGroupMembers`.
- The shared management UI remains `BvslQuizPanel`.
- Participants continue to use `BvQuizSection` and `BvQuizTaker` in the existing Bhakti Vriksha tab.

The existing FOLK group-specific quiz records are supported without a mandatory migration. Newly saved records carry an explicit department.

## Data model additions

New Prabhupada World `BvQuizzes` documents use:

```text
department: "PW"
group: null
activeGroupIds: ["BvGroups document id", ...]
isActive: true | false
updatedAt: ISO timestamp
```

`isActive` is the central publish/unpublish state. `activeGroupIds` is the per-reading-group ON/OFF state. A participant can attempt a PW quiz only when both states allow it and the participant has a current membership in an activated group.

New `BvQuizSubmissions` documents additionally store:

```text
department: "PW" | "FOLK"
group: BvGroups document id
groupId: public group id
userId: public user id
```

These fields make group reports deterministic. Legacy submissions are still resolved through `BvGroupMembers` when the new fields are absent.

No new Firestore collections or composite indexes are required.

## Permission model

| Action | PW Admin / Super Admin | PW RGF | PW RGSF | Participant |
| --- | --- | --- | --- | --- |
| Create/edit/delete/publish quiz content | Yes | No | No | No |
| Activate quiz for a group | Any PW group | Assigned groups only | No | No |
| View quiz results | All PW groups | Assigned groups only | Read-only assigned hierarchy | Own result only |
| Attempt a quiz | No management bypass | As a member only | As a member only | Activated current group only |

Authorization is enforced inside the server endpoints. The UI visibility rules are only a presentation layer.

## User flows

### Admin and Super Admin

Open `Prabhupada World Admin Dashboard -> Quizzes` to create, edit, publish, unpublish, delete, export results, view all-group results, filter results by reading group, and view question-wise analysis.

### Reading Group Facilitator

Open `RGF Dashboard -> Quizzes`, choose an assigned reading group, and use the ON/OFF switch. The switch changes only that group. Quiz content controls are not rendered and the mutation endpoints reject direct RGF content-management requests.

### Participant

Open the existing `Bhakti Vriksha` tab. Published quizzes activated for the participant's current PW reading group appear in the existing quiz window. Submission returns the score immediately; answer review continues to show selected answers, correct answers, and explanations.

## Security rules

The browser still has no direct Firestore data access. `firestore.rules` remains default-deny for `BvQuizzes`, `BvQuizSubmissions`, and all other collections. Authenticated requests go through `/api/run/[endpoint]`, Firebase token verification, database-backed user context, and endpoint-local role/group checks using Firebase Admin.

This feature therefore requires no client Firestore rule grant. The existing rules were compiled with a Firebase CLI dry run and the security-policy tests verify that untrusted client operations remain denied.

## Verification

Run:

```bash
npx tsx --test tests/pw-quiz-system.test.ts
node --test tests/security-policy.test.mjs
npm run build
npx -y firebase-tools@latest deploy --only firestore:rules --project bvpw108 --dry-run
```

Manual role checks:

1. Sign in as a PW Admin and create a published quiz from the new Quizzes tab.
2. Confirm a PW RGF cannot see create/edit/delete controls and receives `403` for direct mutation calls.
3. As that RGF, turn the quiz ON for one assigned group.
4. Confirm a member of that group sees and can submit the quiz, with the score shown immediately.
5. Confirm a member of a different group does not see or load the quiz.
6. Confirm the RGF sees only the assigned group's results and analytics.
7. Confirm a PW Admin can view all-group results and filter to an individual group.
8. Turn the quiz OFF and confirm it disappears from pending participant quizzes for that group.

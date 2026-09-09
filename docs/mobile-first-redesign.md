# Mobile-first frontend redesign

Implemented across the shared dashboard shell, PW/FOLK member dashboards, admin/guide dashboards, report surfaces, and forms. Business calculations, endpoint contracts, database access, role guards, and notification behavior are unchanged. This work has not been deployed.

## 1. Mobile audit

The initial audit covered 132 staff-dashboard views across six phone sizes. Problems included cropped header titles, small icon-only navigation, filters occupying most of the first screen, dense member tables, wide date selectors, and cramped meeting/MoM forms. Follow-up tablet testing found a concrete defect: five Missing Sadhana KPI cards squeezed their text containers to zero width at 768px. The card breakpoints and spacing now preserve their labels.

Route and component review included the public/authentication pages, user dashboards, Sadhana/history/profile, guide and PW admin dashboards, RGF/RGSF/mentor dashboards, BV group/member details, services, attendance screens, report tables, and shared dialogs. Legacy routes and existing role visibility remain intact. Browser coverage below distinguishes tested flows from pages receiving shared improvements only.

## 2. Navigation

- Members get a fixed bottom bar: Sadhana, Leaderboard, Bhakti Vriksha, and Profile or More. More contains the same existing role/residency-dependent destinations.
- Admins/guides get a full-width current-section control and a labelled navigation drawer. The shared tab router provides this pattern to facilitator, supervisor, and mentor dashboards too.
- A compact account drawer contains existing role-dashboard switches, profile, and logout. Desktop sidebars/header actions remain available at wider breakpoints.
- Tab switching preserves visited report state and cached results; the animation wrapper does not remount each report.

## 3. Responsive layout

Shared controls have practical 44px touch targets, mobile inputs use 16px text to avoid automatic iOS zoom, and headings wrap. Today's score stays prominent; streak and weekly average share a row on phones. Duplicate meeting headings were removed. Dashboard gutters, KPI spacing, safe areas, dynamic viewport heights, and bounded dialogs reduce wasted space and clipping. The install banner clears the member bottom navigation. No global horizontal-overflow hiding is used to conceal layout problems.

## 4. Tables

| Content | Phone presentation | Wider screens |
| --- | --- | --- |
| Admin/guide members | Name, roles, group, score; Details exposes all remaining fields and existing actions. Ten rows per page, with pagination at both ends. | Full table; existing 50-row pagination. |
| Existing guide/RGF member and approval cards | Existing mobile cards retained. | Existing tables retained. |
| Sadhana, BV matrices, preaching analytics, 1:1 and CRM comparisons | Contained horizontal scrolling; an overflow hint appears only when columns actually overflow. Existing sticky identifiers remain. | Full comparison tables. |
| MoM editor | Each action item becomes stacked, labelled fields. | Original row layout. |

The shared `TableScrollArea` provides keyboard-focusable scroll regions and overflow hints. It also covers BV group details, mentor lists, scoring, rent/trip, cleanliness, and other comparison reports. All records, filters, and exports retain their existing data scope.

## 5. Forms

Sadhana keeps its existing fields, requirements, validation, calculation, acknowledgement, and submission handler. Its main action remains reachable in a sticky mobile footer. Registration retains validation while adding name/telephone autocomplete. Meeting fields stack, MoM rows become readable cards, calendars fit narrow screens, and dialogs stay scrollable when available height shrinks. Meeting dialogs also restore focus, contain Tab navigation, and let Escape close an active participant picker before closing the dialog.

## 6. Filters

Sadhana, BV matrix, missing-entry, and member filters move into bottom sheets. Searches remain directly visible, as do frequent Sadhana Today/Yesterday controls. Existing filter state and immediate filtering behavior are preserved; **Show results** closes the sheet. A compact summary remains beside Filters.

## 7. Framer Motion

Shared page/tab, dialog, and drawer surfaces use brief opacity/translation transitions. Tab transitions take 160ms; shared dialog entrance fades take 180ms. Public/auth entrance animations are shorter and no longer staggered by long delays. The app respects `prefers-reduced-motion` through Framer Motion and CSS. Large report rows are not individually animated.

## 8. Performance and validation

Secondary member tabs now load as separate chunks. The app uses one self-hosted Inter font source through Next.js, replacing duplicate Google CSS/font loading. No additional dependency was installed. Smaller mobile member pages reduce rendered rows without changing queries, filtering, or export scope.

| Total production JavaScript | Before | After |
| --- | ---: | ---: |
| Uncompressed bytes | 6,276,834 | 5,889,820 |
| Gzip bytes, summed per chunk | 1,872,210 | 1,792,604 |
| Chunks | 130 | 140 |

These are **all chunks**, not the initial download: raw output decreased 6.2%, gzip output 4.3%. More chunks allow secondary features to load later.

The existing desktop performance regression passed for all four staff roles. Cached report revisits needed **zero requests**, taking 58–128ms in this local test. API responses in that harness are mocked with a deliberate delay; these are not production backend timings.

A Chromium login run with 4× CPU throttling, 150ms latency and 1.6Mbps download measured zero layout shift, zero tasks over 50ms, and first contentful paint around 3.35 seconds. This is one lab run, not a guarantee for physical devices. Exact measurements are in [mobile-first-measurements.json](mobile-first-measurements.json).

Validation:

- Production build and TypeScript check pass.
- 481 viewport/page checks pass with no unwanted page overflow: 286 staff, 130 member/registration, 65 public/auth.
- Staff flows pass: navigation, member search/details/pagination, report filters, meeting save, participant-only proposer selection, and MoM save.
- PW/FOLK member flows pass: department redirects, selected destinations, residency menu visibility, BV leave-dialog cancellation, numeric Sadhana entry, reduced motion, save, and dashboard refresh.
- Existing desktop member/navigation tests, cache regressions, and 17 routing/meeting domain regressions pass.
- Full-repository ESLint remains failing on existing findings. Comparison with committed versions found no new frontend lint errors; new shared mobile components are clean.

## 9. Viewports

320×568, 360×800, 375×812, 390×844, 393×873, 412×915, 430×932; tablets 768×1024 and 820×1180; desktops 1280×720, 1440×900, 1920×1080; landscape 844×390. Meeting and Sadhana forms were also exercised at 390×420 to simulate reduced height when a keyboard opens.

## 10. Roles

Browser-tested: PW member, FOLK member, Guide, Super Guide, PW Admin, PW Super Admin. Facilitator/RGF, RGSF, supervisor, and Sadhana Mentor pages inherit shared shell/tab changes and were reviewed in source, but their separate live accounts were not exercised.

## 11. Remaining checks

Physical iOS Safari/Android Chrome, operating-system keyboards, notches, actual Google OAuth, and production data still require device/live testing. Browser tests use synthetic accounts and intercepted API responses; they do not prove live authorization or notification delivery. Existing repository-wide ESLint findings are outside this presentation-only change.

Separate realtime/backend edits appeared in the shared workspace during validation. Those files were left untouched by this frontend work; mocked browser checks do not validate them.

The implemented frontend is ready for review; it has not been pushed or deployed.

## Mobile previews

Synthetic data at 390px: [member dashboard](mobile-evidence/member-dashboard.png), [member list](mobile-evidence/members.png), [meetings](mobile-evidence/meetings.png).

## Reproduce

```bash
npm run build
npm run start -- --port 3122
DASHBOARD_TEST_ORIGIN=http://127.0.0.1:3122 node tests/mobile-dashboard.browser.cjs
DASHBOARD_TEST_ORIGIN=http://127.0.0.1:3122 node tests/mobile-member.browser.cjs
DASHBOARD_TEST_ORIGIN=http://127.0.0.1:3122 node tests/mobile-public.browser.cjs
```

The harnesses intercept business APIs and block external requests. Authenticated screenshots use the bundled logo as a fixture for the externally hosted brand image. Working logs/screenshots are in the ignored `test-results/mobile/` directory.

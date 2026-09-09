# Realtime screen coverage

Source inventory, 2026-09-09. These 114 component/page/context files use the shared reactive adapters (some already used the shared query hook). This is a source audit, not a claim that every screen was individually exercised in a live browser.

The adapters are `useEndpointQuery`, `useQuery`, `useReactiveLoader`, and `useReactiveEffect`. Children that derive their entire display from reactive parent props do not need their own listener.

| File | Observed reads |
| --- | --- |
| [components/bv/BvAdminDataTable.tsx](../src/components/bv/BvAdminDataTable.tsx) | `getBvAdminTable` |
| [components/bv/BvQuizSection.tsx](../src/components/bv/BvQuizSection.tsx) | `getMyBvQuizSubmissions` |
| [components/bv/BvQuizTaker.tsx](../src/components/bv/BvQuizTaker.tsx) | `getBvQuizDetail`, `getMyBvQuizSubmissionReview` |
| [components/bvsl/BvslBvReportPanel.tsx](../src/components/bvsl/BvslBvReportPanel.tsx) | `getBvslOwnReport` |
| [components/bvsl/BvslJoinRequestsPanel.tsx](../src/components/bvsl/BvslJoinRequestsPanel.tsx) | `getPendingBvJoinRequests` |
| [components/bvsl/BvslMembersTable.tsx](../src/components/bvsl/BvslMembersTable.tsx) | `getBvslMembers` |
| [components/bvsl/BvslOneToOneTab.tsx](../src/components/bvsl/BvslOneToOneTab.tsx) | `getBvslOneToOneData` |
| [components/bvsl/BvslQuizPanel.tsx](../src/components/bvsl/BvslQuizPanel.tsx) | `getBvQuizDetail`, `getBvQuizSubmissions`, `getBvQuizzes` |
| [components/bvsl/BvslSessionPanel.tsx](../src/components/bvsl/BvslSessionPanel.tsx) | `getAttendanceForDate` |
| [components/bvsl/BvslWeeklyPlanTab.tsx](../src/components/bvsl/BvslWeeklyPlanTab.tsx) | `getBvslBooksSummary`, `getBvslWeeklyPlan` |
| [components/bvsl/RgsfCallHistoryTab.tsx](../src/components/bvsl/RgsfCallHistoryTab.tsx) | `getBvslOneToOneData` |
| [components/cleanliness/CleanlinessCalendarTab.tsx](../src/components/cleanliness/CleanlinessCalendarTab.tsx) | `getUserCleanlinessCalendar` |
| [components/cleanliness/CleanlinessManagerDashboard.tsx](../src/components/cleanliness/CleanlinessManagerDashboard.tsx) | `getCleanlinessInspections`, `getCleanlinessRooms` |
| [components/crm/Devotee360Drawer.tsx](../src/components/crm/Devotee360Drawer.tsx) | `getOneToOneMeetings`, `getUserCrmData` |
| [components/dashboard/AttendanceTab.tsx](../src/components/dashboard/AttendanceTab.tsx) | `getMyBvQuizSubmissions`, `getUserAttendanceCalendar` |
| [components/dashboard/BvTab.tsx](../src/components/dashboard/BvTab.tsx) | `getBvAttendance`, `getUserBvStatus` |
| [components/dashboard/GuideOneToOneCard.tsx](../src/components/dashboard/GuideOneToOneCard.tsx) | `getMyGuideOneToOne` |
| [components/dashboard/RoleAcknowledgementHandler.tsx](../src/components/dashboard/RoleAcknowledgementHandler.tsx) | `getUserBvStatus` |
| [components/dashboard/SadhanaTab.tsx](../src/components/dashboard/SadhanaTab.tsx) | `getUserProgressStats` |
| [components/dashboard/jigyasaAffiliateTab.tsx](../src/components/dashboard/jigyasaAffiliateTab.tsx) | `getMyJigyasaRegistrations` |
| [components/guide/ApprovalsTab.tsx](../src/components/guide/ApprovalsTab.tsx) | `getActiveSadhanaMentors`, `getCleanlinessReviews`, `getGuideRequests`, `getGuides`, `getPendingApprovals`, `getResidenciesForGuide`, `getResidencyTransferRequests` |
| [components/guide/BulkUserManagement.tsx](../src/components/guide/BulkUserManagement.tsx) | `getBulkUserExportOptions`, `getBulkUserImportTemplate` |
| [components/guide/BvGroupManagerPanel.tsx](../src/components/guide/BvGroupManagerPanel.tsx) | `getAllBvGroupsAdmin`, `getEligibleMembersForBvGroup` |
| [components/guide/BvGroupMembersSection.tsx](../src/components/guide/BvGroupMembersSection.tsx) | `getGroupMembers` |
| [components/guide/BvImprovementTab.tsx](../src/components/guide/BvImprovementTab.tsx) | `getBvPreachingReport` |
| [components/guide/BvMissingSadhanaPanel.tsx](../src/components/guide/BvMissingSadhanaPanel.tsx) | `getBvMissingSadhana` |
| [components/guide/BvPreachingReportTab.tsx](../src/components/guide/BvPreachingReportTab.tsx) | `getBvPreachingReport` |
| [components/guide/BvReportTab.tsx](../src/components/guide/BvReportTab.tsx) | `getBvPreachingReport` |
| [components/guide/BvSadhanaMonitorPanel.tsx](../src/components/guide/BvSadhanaMonitorPanel.tsx) | `getBvGroupSadhanaMonitor` |
| [components/guide/BvSessionMatrixTab.tsx](../src/components/guide/BvSessionMatrixTab.tsx) | Shared query/parent-provided data |
| [components/guide/BvSessionReportTab.tsx](../src/components/guide/BvSessionReportTab.tsx) | `getBvSessionReport` |
| [components/guide/BvStatsPanel.tsx](../src/components/guide/BvStatsPanel.tsx) | `getBvStats`, `getGuideGroupStats` |
| [components/guide/BvslManagementTab.tsx](../src/components/guide/BvslManagementTab.tsx) | `getAllBvGroupsAdmin`, `getGuideUsers` |
| [components/guide/ChallengeDashboardTab.tsx](../src/components/guide/ChallengeDashboardTab.tsx) | `getChallengeDashboard` |
| [components/guide/CleanlinessTab.tsx](../src/components/guide/CleanlinessTab.tsx) | `getCleanlinessAnalytics`, `getCleanlinessRooms`, `getGuideUsers` |
| [components/guide/FormsTab.tsx](../src/components/guide/FormsTab.tsx) | `getFieldsForUser`, `getGuideGroups` |
| [components/guide/GroupsTab.tsx](../src/components/guide/GroupsTab.tsx) | `getGuideGroups` |
| [components/guide/GuideAttendanceTab.tsx](../src/components/guide/GuideAttendanceTab.tsx) | `getGuideAttendanceReport` |
| [components/guide/GuideBvTab.tsx](../src/components/guide/GuideBvTab.tsx) | `getGuideGroupStats` |
| [components/guide/GuideLeaderboardTab.tsx](../src/components/guide/GuideLeaderboardTab.tsx) | `getFolkSadhanaReport`, `getSadhanaLeaderboard` |
| [components/guide/ImprovementTab.tsx](../src/components/guide/ImprovementTab.tsx) | `getGuideDetailedReport` |
| [components/guide/MissingSadhanaTab.tsx](../src/components/guide/MissingSadhanaTab.tsx) | `getAllResidencies` |
| [components/guide/OneToOneTab.tsx](../src/components/guide/OneToOneTab.tsx) | `getOneToOneMeetings` |
| [components/guide/OverviewTab.tsx](../src/components/guide/OverviewTab.tsx) | `getGuideMetrics` |
| [components/guide/PipelineReportTab.tsx](../src/components/guide/PipelineReportTab.tsx) | `getPipelineReport` |
| [components/guide/RentTripsTab.tsx](../src/components/guide/RentTripsTab.tsx) | `getGuideRentTripsOverview` |
| [components/guide/ReportsTab.tsx](../src/components/guide/ReportsTab.tsx) | Shared query/parent-provided data |
| [components/guide/SadhanaContextPanel.tsx](../src/components/guide/SadhanaContextPanel.tsx) | `getOneToOneContext` |
| [components/guide/StatsOverviewPanel.tsx](../src/components/guide/StatsOverviewPanel.tsx) | `getSadhanaStats`, `getUserProgressStats` |
| [components/guide/UsersTab.tsx](../src/components/guide/UsersTab.tsx) | `getGuideUsers`, `getResidenciesForGuide` |
| [components/jigyasa/JigyasaTrackerTab.tsx](../src/components/jigyasa/JigyasaTrackerTab.tsx) | `getJigyasaTracker` |
| [components/profile/AshrayCriteriaGrid.tsx](../src/components/profile/AshrayCriteriaGrid.tsx) | `getAshrayChecklist` |
| [components/profile/GuideResidencyCard.tsx](../src/components/profile/GuideResidencyCard.tsx) | `getMyGuideOneToOne` |
| [components/services/AllocationBoardTab.tsx](../src/components/services/AllocationBoardTab.tsx) | `getAllocationBoard`, `getResidenciesForGuide`, `getResidentsForAllocation`, `getServiceRotation`, `getUnavailabilityRequests` |
| [components/services/AvailabilityOverviewTab.tsx](../src/components/services/AvailabilityOverviewTab.tsx) | `getAvailabilityOverview` |
| [components/services/GuideServicesTab.tsx](../src/components/services/GuideServicesTab.tsx) | `getResidenciesForGuide` |
| [components/services/PersonalServiceAlert.tsx](../src/components/services/PersonalServiceAlert.tsx) | `getTodayServiceBoard` |
| [components/services/ServiceAnalyticsTab.tsx](../src/components/services/ServiceAnalyticsTab.tsx) | `getServiceAnalytics` |
| [components/services/ServiceCalendarTab.tsx](../src/components/services/ServiceCalendarTab.tsx) | `getServiceCalendar` |
| [components/services/ServiceFormDialog.tsx](../src/components/services/ServiceFormDialog.tsx) | `getAvailableSkills` |
| [components/services/ServiceLeaderboardTab.tsx](../src/components/services/ServiceLeaderboardTab.tsx) | `getServiceLeaderboard` |
| [components/services/ServiceListTab.tsx](../src/components/services/ServiceListTab.tsx) | `getServices` |
| [components/services/ServiceProfileCard.tsx](../src/components/services/ServiceProfileCard.tsx) | `getServiceProfile` |
| [components/services/ServiceRatingPrompt.tsx](../src/components/services/ServiceRatingPrompt.tsx) | `getServiceRatingsForDate` |
| [components/services/TodayFolkServiceBoard.tsx](../src/components/services/TodayFolkServiceBoard.tsx) | `getTodayServiceBoard` |
| [components/services/UserAllocationBoardTab.tsx](../src/components/services/UserAllocationBoardTab.tsx) | `getAllocationBoard` |
| [components/services/UserAvailabilityTab.tsx](../src/components/services/UserAvailabilityTab.tsx) | `getMyAvailability` |
| [components/services/UserPreferencesTab.tsx](../src/components/services/UserPreferencesTab.tsx) | `getAvailableSkills`, `getServicePreferences`, `getServices`, `getUserSkills` |
| [components/services/UserServicesTab.tsx](../src/components/services/UserServicesTab.tsx) | `getWeeklySchedule` |
| [components/services/UserSkillsTab.tsx](../src/components/services/UserSkillsTab.tsx) | `getAvailableSkills`, `getUserSkills` |
| [components/super/AdminScoresReport.tsx](../src/components/super/AdminScoresReport.tsx) | `getScoresReport` |
| [components/super/ArchiveDataPanel.tsx](../src/components/super/ArchiveDataPanel.tsx) | `getArchiveStats` |
| [components/super/BvAdminManagementTab.tsx](../src/components/super/BvAdminManagementTab.tsx) | `getAllBvGroupsAdmin`, `getBvslGroups`, `getClientCachedQuery`, `getGuideUsers` |
| [components/super/CrossCenterDrilldownDialog.tsx](../src/components/super/CrossCenterDrilldownDialog.tsx) | `getCrossPreachingDrilldown` |
| [components/super/CrossCenterPreachingReport.tsx](../src/components/super/CrossCenterPreachingReport.tsx) | `getCrossPreachingReport` |
| [components/super/FolkResidencyManagement.tsx](../src/components/super/FolkResidencyManagement.tsx) | `getGuideResidencyAssignmentRequests` |
| [components/super/MeetingsAndMomTab.tsx](../src/components/super/MeetingsAndMomTab.tsx) | Shared query/parent-provided data |
| [components/super/PreachingDataReportTab.tsx](../src/components/super/PreachingDataReportTab.tsx) | `getPreachingDataReport` |
| [components/super/PreachingDrilldownDialog.tsx](../src/components/super/PreachingDrilldownDialog.tsx) | `getPreachingDrilldown` |
| [components/super/ScoresDrilldownDialog.tsx](../src/components/super/ScoresDrilldownDialog.tsx) | `getScoresDrilldown` |
| [components/super/SendRemindersPanel.tsx](../src/components/super/SendRemindersPanel.tsx) | `getPushSubscriptionStats` |
| [components/super/SuperAttendanceTab.tsx](../src/components/super/SuperAttendanceTab.tsx) | `getSuperGuideAttendanceReport` |
| [components/super/SuperBvPreachingAnalytics.tsx](../src/components/super/SuperBvPreachingAnalytics.tsx) | `getSuperBvAnalytics` |
| [components/super/SuperBvRegistrationsTab.tsx](../src/components/super/SuperBvRegistrationsTab.tsx) | `getAllBvGroupsAdmin`, `getBvslGroups`, `getClientCachedQuery`, `getPendingBvRegistrations` |
| [components/super/SuperBvReportTab.tsx](../src/components/super/SuperBvReportTab.tsx) | Shared query/parent-provided data |
| [components/super/SuperGuideBvSection.tsx](../src/components/super/SuperGuideBvSection.tsx) | Shared query/parent-provided data |
| [components/super/SuperGuidesPanel.tsx](../src/components/super/SuperGuidesPanel.tsx) | `getGuideUsers`, `getGuides` |
| [components/super/SuperHostelsPanel.tsx](../src/components/super/SuperHostelsPanel.tsx) | `getAllResidenciesWithStats`, `getGuides` |
| [components/super/SuperStatsPanel.tsx](../src/components/super/SuperStatsPanel.tsx) | `getAllResidenciesWithStats`, `getGuideUsers`, `getGuides` |
| [components/super/SuperUsersPanel.tsx](../src/components/super/SuperUsersPanel.tsx) | `getActiveSadhanaMentors`, `getAllBvGroupsAdmin`, `getBvslGroups`, `getGuideUsers`, `getGuides` |
| [components/super/TagMangoConfigTab.tsx](../src/components/super/TagMangoConfigTab.tsx) | `getTagMangoConfig`, `getTagMangoSyncLog` |
| [contexts/UserProfileContext.tsx](../src/contexts/UserProfileContext.tsx) | `getUserProfile` |
| [spa-pages/BhaktiVrikshaPage.tsx](../src/spa-pages/BhaktiVrikshaPage.tsx) | `getBvAttendance`, `getUserBvStatus` |
| [spa-pages/BvGroupDetailPage.tsx](../src/spa-pages/BvGroupDetailPage.tsx) | `getBvGroupDetail`, `getBvQuizSubmissions` |
| [spa-pages/BvMentorDashboard.tsx](../src/spa-pages/BvMentorDashboard.tsx) | `getBvMentorData` |
| [spa-pages/BvSupervisorDashboard.tsx](../src/spa-pages/BvSupervisorDashboard.tsx) | `getBvSupervisorOverview` |
| [spa-pages/BvslDashboard.tsx](../src/spa-pages/BvslDashboard.tsx) | `getBvslGroups`, `getCurrentGuide` |
| [spa-pages/DailySadhanaForm.tsx](../src/spa-pages/DailySadhanaForm.tsx) | `getAllResidencies`, `getCleanlinessForSadhana`, `getSadhanaFormData` |
| [spa-pages/FolkGuideDashboard.tsx](../src/spa-pages/FolkGuideDashboard.tsx) | `getCleanlinessReviews`, `getCurrentGuide`, `getGuideRequests`, `getPendingApprovals`, `getPendingBvRegistrations`, `getResidencyTransferRequests` |
| [spa-pages/FolkUserDashboard.tsx](../src/spa-pages/FolkUserDashboard.tsx) | `getSadhanaLeaderboard`, `getUserDashboardData` |
| [spa-pages/GuideUserDetailPage.tsx](../src/spa-pages/GuideUserDetailPage.tsx) | `getAshrayChecklist`, `getAshrayUpgradePath`, `getBvAttendance`, `getUserCrmData`, `getUserDetailForGuide`, `getUserProgressStats` |
| [spa-pages/HistoryPage.tsx](../src/spa-pages/HistoryPage.tsx) | `getUserHistory` |
| [spa-pages/PendingApprovalPage.tsx](../src/spa-pages/PendingApprovalPage.tsx) | `getGuides` |
| [spa-pages/ProfilePage.tsx](../src/spa-pages/ProfilePage.tsx) | `getAllResidencies`, `getAshrayChecklist`, `getAshrayUpgradePath`, `getBvAttendance`, `getGuideResidencyAssignments`, `getGuides`, `getUserCrmData`, `getUserMetrics`, `getUserProfile` |
| [spa-pages/PwAdminDashboard.tsx](../src/spa-pages/PwAdminDashboard.tsx) | `getCurrentGuide`, `getGuideRequests`, `getPendingApprovals`, `getPendingBvRegistrations`, `getPushSubscriptionStats` |
| [spa-pages/PwUserDashboard.tsx](../src/spa-pages/PwUserDashboard.tsx) | `getSadhanaLeaderboard`, `getUserDashboardData` |
| [spa-pages/RegistrationPage.tsx](../src/spa-pages/RegistrationPage.tsx) | `getAllResidencies`, `getGuides` |
| [spa-pages/RgfDashboard.tsx](../src/spa-pages/RgfDashboard.tsx) | `getBvslGroups` |
| [spa-pages/RgsfDashboard.tsx](../src/spa-pages/RgsfDashboard.tsx) | `getBvslGroups` |
| [spa-pages/SadhanaMentorDashboard.tsx](../src/spa-pages/SadhanaMentorDashboard.tsx) | `getMentorMembers` |
| [spa-pages/ServiceManagementPage.tsx](../src/spa-pages/ServiceManagementPage.tsx) | `getResidenciesForGuide` |
| [spa-pages/attendance/AttendanceDashboardPage.tsx](../src/spa-pages/attendance/AttendanceDashboardPage.tsx) | `getAttendanceDashboard` |
| [spa-pages/attendance/AttendanceManagePage.tsx](../src/spa-pages/attendance/AttendanceManagePage.tsx) | `getAttendanceEventsAdmin` |
| [spa-pages/attendance/PublicAttendPage.tsx](../src/spa-pages/attendance/PublicAttendPage.tsx) | `getSessionByToken`, `getUserProfile` |

## Deliberately snapshot-based interactions

- Profile/data exports and import-template downloads execute on demand; they are not open live reports.
- Copy previous-week availability loads a draft once. Subsequent events must not replace that draft.
- Open quiz editors retain their editing snapshot; quiz lists/results remain reactive.
- Pending form edits (Sadhana, attendance, weekly plans, preferences, availability, cleanliness, service allocation, scoring and integration settings) defer background application until saved or discarded.
- Anonymous registration/session-token pages cannot subscribe to owner-only authenticated metadata. Their public reads remain on-demand. Authenticated portions use reactive adapters. Public realtime authorization has not been added.
- Static Swagger/documentation reads are not database-backed live views.

Regenerate the endpoint-call inventory with `node scripts/auditRealtimeLoaders.cjs`. Its owner classification is deliberately conservative: nested callbacks and custom hooks require manual review; do not treat an import-string match as test coverage.


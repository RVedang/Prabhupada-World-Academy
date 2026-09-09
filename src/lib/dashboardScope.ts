/** Only identity/authorization changes reset mounted dashboard state. */
export function dashboardScope(profile: any, identity?: string | null): string {
  return JSON.stringify([identity, ...[
    'userId', 'email', 'segment', 'role', 'roles', 'status', 'isBvAdmin', 'isBvSuperAdmin',
    'isBvSupervisor', 'isBvMentor', 'isBvFacilitator', 'isBvsl', 'isBvSubFacilitator',
    'isSadhanaMentor', 'guideId', 'guide', 'selectedGuideId', 'selectedFolkResidency', 'folkResidencies', 'folkResidencyCustomId',
    'bvReportingAdminId', 'bvReportingSupervisorId', 'bvReportingFacilitatorId',
  ].map(field => profile?.[field])]);
}

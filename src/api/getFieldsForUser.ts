import { z } from 'zod';
import { createEndpoint, Users } from '@/lib/backend-sdk';
import { RESIDENT_FIELDS, NON_RESIDENT_FIELDS, toFormField } from '../config/sadhanaFields';

export default createEndpoint({
  description: 'Get configured sadhana fields for a user based on resident/non-resident status',
  authenticated: true,
  inputSchema: z.object({
    userId: z.string().optional(),
    forceResident: z.boolean().optional(),
    forceNonResident: z.boolean().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }: any) => {
    let isResident = false;

    if (input.forceResident) {
      isResident = true;
    } else if (input.forceNonResident) {
      isResident = false;
    } else {
      // Guides viewing a member's form must use the selected member's
      // residency status, not the guide's own status.
      const requestedUserId = input.userId || context.user!.id;
      const userRecord = await Users.findOne({ id: requestedUserId })
        || await Users.findOne({ filters: { userId: requestedUserId } });
      const residencyId = Array.isArray(userRecord?.residency)
        ? userRecord!.residency[0]
        : userRecord?.residency;
      isResident = !!(residencyId && userRecord?.residencyApproved);
    }

    const staticFields = isResident ? RESIDENT_FIELDS : NON_RESIDENT_FIELDS;

    return {
      isResident,
      templateMode: isResident ? 'RESIDENT_TEMPLATE' : 'NON_RESIDENT_TEMPLATE',
      fields: staticFields.map(f => toFormField(f)),
    };
  },
});

import { z } from 'zod';
import {
  createEndpoint, Users, BvMemberRegistrations, BvGroupMembers, BvGroupRequests,
  BvAttendance, BvQuizSubmissions, SadhanaEntries, SadhanaMonthlySummaries,
  PushSubscriptions, UserSkills, OneToOneMeetings, UnavailabilityRequests,
} from '@/lib/backend-sdk';
import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export default createEndpoint({
  description: 'Permanently delete user account so they can re-register with the same email',
  authenticated: true,
  inputSchema: z.object({
    confirm: z.boolean().optional(),
    confirmText: z.string().optional(),
    email: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }: any) => {
    if (!input.confirm && input.confirmText !== 'DELETE') return { success: false };

    const authId = String(context.user!.id || '');
    const email = String(context.user!.email || input.email || '').toLowerCase();
    const profile = await Users.findOne({ id: authId }).catch(() => null) ||
      (email ? await Users.findOne({ filters: { email } }).catch(() => null) : null);
    const identities = new Set([authId, email]);
    for (const value of [profile?.id, profile?.userId, profile?.uid, profile?.authUid, profile?.firebaseUid]) {
      if (value) identities.add(String(value).toLowerCase());
    }

    const belongsToUser = (record: any) => {
      const values = [record?.user, record?.userId, record?.userDbId, record?.owner, record?.memberId, record?.createdBy]
        .flatMap(value => Array.isArray(value) ? value : [value])
        .filter(Boolean)
        .map(value => String(value).toLowerCase());
      return values.some(value => identities.has(value)) || (email && String(record?.email || '').toLowerCase() === email);
    };

    // Remove user-owned records before deleting the profile. These collections
    // are server-only, so deleting them here also covers records created under
    // legacy Firebase UID/userId aliases.
    const ownedTables = [
      BvMemberRegistrations, BvGroupMembers, BvGroupRequests, BvAttendance,
      BvQuizSubmissions, SadhanaEntries, SadhanaMonthlySummaries,
      PushSubscriptions, UserSkills, OneToOneMeetings, UnavailabilityRequests,
    ];
    for (const table of ownedTables) {
      const { records } = await table.findAll({ limit: 5000 }).catch(() => ({ records: [] }));
      for (const record of records || []) {
        if (belongsToUser(record)) await table.delete({ id: record.id }).catch(() => undefined);
      }
    }

    // 1. Delete from Firebase Authentication if Admin SDK is initialized
    if (getApps().length > 0) {
      try {
        await getAuth().deleteUser(context.user!.id);
        console.log(`[deleteAccount] Firebase Auth user deleted successfully: ${context.user!.id}`);
      } catch (authError: any) {
        console.warn(`[deleteAccount] Firebase Auth delete failed or user not found: ${authError?.message || authError}`);
      }
    }

    // 2. Hard delete — removes the record entirely so they can re-register
    if (profile?.id) await Users.delete({ id: profile.id });
    if (authId && profile?.id !== authId) await Users.delete({ id: authId }).catch(() => undefined);
    return { success: true };
  },
});


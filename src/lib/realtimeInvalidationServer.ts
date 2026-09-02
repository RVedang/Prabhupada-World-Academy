import { getFirestoreDb } from '@/lib/app-backend-sdk';
import {
  normalizeRealtimeDepartment,
  realtimeChannelsForEndpoint,
  type RealtimeChannel,
  type RealtimeDepartment,
} from '@/lib/realtimeChannels';
import { FieldValue } from 'firebase-admin/firestore';

function field(value: unknown, name: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[name];
}

function mutationDepartment(input: unknown, contextUser: unknown): RealtimeDepartment {
  return normalizeRealtimeDepartment(field(input, 'department'))
    || normalizeRealtimeDepartment(field(input, 'segment'))
    || normalizeRealtimeDepartment(field(contextUser, 'segment'))
    || 'ALL';
}

/** Publish a data-free invalidation signal after a successful mutation.
 * Failure never rolls back the business mutation; clients retain their normal
 * stale-while-revalidate behavior if realtime transport is unavailable.
 */
export async function publishEndpointInvalidation(
  endpointName: string,
  input: unknown,
  contextUser: unknown,
): Promise<void> {
  const department = mutationDepartment(input, contextUser);
  const channels = realtimeChannelsForEndpoint(endpointName);
  await publishRealtimeInvalidation(department, channels);
}

export async function publishRealtimeInvalidation(
  department: RealtimeDepartment,
  channels: RealtimeChannel[],
): Promise<void> {
  if (channels.length === 0) return;
  const channelVersions = Object.fromEntries(channels.map(channel => [channel, FieldValue.increment(1)]));
  await getFirestoreDb()
    .collection('RealtimeInvalidations')
    .doc(department)
    .set({
      department,
      version: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
      channels: channelVersions,
    }, { merge: true });
}

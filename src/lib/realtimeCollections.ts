/** Keeping private metadata below root documents prevents the business-write
 * trigger from running in response to its own registration/clock writes. */
export const REALTIME_SUBSCRIPTIONS = 'RealtimeInternal/registry/realtimeSubscriptions';
export const REALTIME_IDENTITIES = 'RealtimeInternal/registry/realtimeIdentities';
export const REALTIME_CLOCKS = 'RealtimeInternal/registry/realtimeClocks';
export const REALTIME_EVENTS = 'RealtimeInternal/registry/realtimeEvents';

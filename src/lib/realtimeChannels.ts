export const REALTIME_CHANNELS = [
  'users',
  'groups',
  'attendance',
  'quizzes',
  'sadhana',
  'meetings',
  'services',
  'notifications',
  'config',
  'general',
] as const;

export type RealtimeChannel = (typeof REALTIME_CHANNELS)[number];
export type RealtimeDepartment = 'FOLK' | 'PW' | 'ALL';

const READ_ONLY_ENDPOINTS = new Set([
  'checkAllocationPublished',
  'checkGuideEmail',
  'checkEmailStatus',
  'openApiSpec',
  'sadhanaStatus',
  'testTagMangoConnection',
]);

const MUTATION_ENDPOINTS = new Set([
  'checkAndMarkOverdue',
  'courseCompleted10',
  'courseCompleted50',
  'courseCompleted100',
]);

const MUTATION_PREFIXES = [
  'accept', 'acknowledge', 'add', 'approve', 'archive', 'assign', 'auto',
  'backfill', 'bulk', 'conduct', 'copy', 'create', 'delete', 'fix', 'harddelete',
  'import', 'invalidate', 'join', 'leave', 'log', 'manage', 'mark', 'process',
  'publish', 'recalculate', 'register', 'reject', 'release', 'remove', 'request',
  'resolve', 'retry', 'revoke', 'save', 'seed', 'selfallocate', 'send', 'set',
  'submit', 'subscribe', 'tag', 'toggle', 'trigger', 'unsubscribe', 'update',
];

const READ_ONLY_PREFIXES = ['get', 'load', 'list', 'check', 'export', 'download', 'lookup', 'preview', 'validate'];

export function isReadOnlyEndpoint(name: string): boolean {
  const lower = name.toLowerCase();
  if (MUTATION_ENDPOINTS.has(name) || MUTATION_PREFIXES.some(prefix => lower.startsWith(prefix))) return false;
  if (READ_ONLY_ENDPOINTS.has(name)) return true;
  return READ_ONLY_PREFIXES.some(prefix => lower.startsWith(prefix)) ||
    lower.includes('stats') || lower.includes('report') || lower.includes('analytics');
}

/** Infer the smallest practical invalidation domains from an endpoint name.
 * The API remains the authorization boundary; these channels contain no data.
 */
export function realtimeChannelsForEndpoint(name: string): RealtimeChannel[] {
  const lower = name.toLowerCase();
  const channels = new Set<RealtimeChannel>();

  if (/sadhana|ashray|preach/.test(lower)) channels.add('sadhana');
  if (/quiz/.test(lower)) channels.add('quizzes');
  if (/attendance|session|availability/.test(lower)) channels.add('attendance');
  if (/meeting|mom|onetoone|one_to_one|callreport/.test(lower)) channels.add('meetings');
  if (/group|bvsl|facilitator|supervisor|registration|bhaktivriksha|\bbv/.test(lower)) channels.add('groups');
  if (/user|member|role|guide|approval|mentor|residency|profile|account/.test(lower)) channels.add('users');
  if (/service|allocation|cleanliness|rent|trip|skill|swap/.test(lower)) channels.add('services');
  if (/notification|push|reminder|subscription/.test(lower)) channels.add('notifications');
  if (/config|field|setting|tagmango/.test(lower)) channels.add('config');

  if (channels.size === 0) channels.add('general');
  return [...channels];
}

export function normalizeRealtimeDepartment(value: unknown): RealtimeDepartment | null {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s_-]+/g, '');
  if (normalized === 'FOLK') return 'FOLK';
  if (normalized === 'PW' || normalized === 'PRABHUPADAWORLD') return 'PW';
  if (normalized === 'ALL' || normalized === 'GLOBAL') return 'ALL';
  return null;
}

export const REALTIME_INVALIDATION_EVENT = 'pwa:realtime-invalidation';

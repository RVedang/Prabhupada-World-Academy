/**
 * POST /api/invalidateSadhanaFieldsCache
 *
 * Clears the in-memory Sadhana field definitions cache.
 * After calling this, the next non-resident form load will re-fetch field
 * definitions from the SadhanaFields database table (and re-populate the cache).
 *
 * The current resident form is deployment-controlled and is not overridden by
 * SadhanaFields records. Use this only after editing non-resident DB fields.
 */
import { z } from 'zod';
import { createEndpoint, AppError } from '@/lib/backend-sdk';
import { serverCacheInvalidate, serverCacheKeys } from '../lib/serverCache';
import { FIELD_CACHE_KEY_RESIDENT, FIELD_CACHE_KEY_NR } from './getSadhanaFormData';

const ALLOWED_ROLES = new Set(['Guide', 'Super Guide', 'BVSL', 'Sadhana Mentor']);

export default createEndpoint({
  description: 'Clear the non-resident Sadhana field cache so the next form load re-fetches from DB',
  authenticated: true,
  inputSchema: z.object({
    /** Pass "all" to wipe the entire server cache, not just field definitions */
    scope: z.enum(['fields', 'all']).optional(),
  }),
  outputSchema: z.object({
    success:       z.boolean(),
    message:       z.string(),
    keysCleared:   z.array(z.string()),
    remainingKeys: z.number(),
  }),
  execute: async ({ input, context }) => {
    if (!ALLOWED_ROLES.has(context.user!.role as string)) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Guide or admin role required to invalidate the cache.' });
    }

    const scope = input.scope ?? 'fields';

    if (scope === 'all') {
      const before = serverCacheKeys();
      serverCacheInvalidate(); // wipe everything
      return {
        success:       true,
        message:       `Full cache cleared. ${before.length} key(s) removed.`,
        keysCleared:   before,
        remainingKeys: 0,
      };
    }

    // Default: only clear field-definition keys
    const fieldKeys = [FIELD_CACHE_KEY_RESIDENT, FIELD_CACHE_KEY_NR];
    serverCacheInvalidate('sadhana_fields:');
    const remaining = serverCacheKeys().length;

    return {
      success:       true,
      message:       'Sadhana field cache cleared. The next non-resident form load will fetch fresh field definitions from the database.',
      keysCleared:   fieldKeys,
      remainingKeys: remaining,
    };
  },
});

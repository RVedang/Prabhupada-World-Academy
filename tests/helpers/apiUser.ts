import { buildApiUserContext, type ApiUserContext } from '../../src/lib/apiAuthorization';

/** A complete, active test identity; individual tests override roles/capabilities. */
export function apiUser(overrides: Partial<ApiUserContext> = {}): ApiUserContext {
  const id = overrides.id || 'test-user';
  const email = overrides.email || 'test@example.invalid';
  return {
    ...buildApiUserContext({ uid: id, email, emailVerified: true }, {
      id, email, role: overrides.role || 'User', ...overrides,
      status: overrides.status ?? 'Active', segment: overrides.segment ?? undefined,
    }),
    ...overrides,
  };
}

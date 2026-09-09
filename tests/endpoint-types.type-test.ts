import { z } from 'zod';
import { createEndpoint } from '../src/lib/app-backend-sdk';
import { createMeeting, getGuideUsers } from '../src/lib/app-endpoints-sdk';

// Compiled by npm run typecheck. No database/network calls run in this file.
function endpointContracts() {
  const endpoint = createEndpoint({
    description: 'Compile-time contract fixture', authenticated: true,
    inputSchema: z.object({ count: z.number().default(1) }),
    outputSchema: z.object({ total: z.number() }),
    execute: async ({ input, context }) => {
      const id: string = context.user.id;
      const count: number = input.count;
      // @ts-expect-error Parsed endpoint inputs must not degrade to any.
      const invalid: string = input.count;
      return { total: count, id, invalid };
    },
  });
  type RawInput = z.input<typeof endpoint.inputSchema>;
  const raw: RawInput = {};
  const parsed = endpoint.inputSchema.parse(raw);
  const count: number = parsed.count;
  // @ts-expect-error A meeting must include its required title/time/type.
  createMeeting({});
  // @ts-expect-error Invalid role filters must not compile.
  getGuideUsers({ status: 'unknown-status' });
  getGuideUsers({}).then(result => {
    result.users[0]?.latestScore;
    // @ts-expect-error Endpoint results must not degrade to any.
    result.nonexistentField;
  });
  return count;
}
void endpointContracts;

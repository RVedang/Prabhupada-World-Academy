import { apiUser } from '../tests/helpers/apiUser';
import getActiveSadhanaMentors from '../src/api/getActiveSadhanaMentors';

async function main() {
  try {
    const result = await getActiveSadhanaMentors.execute({
      input: { segment: 'PW' },
      context: { user: apiUser({ role: 'SUPER_ADMIN', isBvSuperAdmin: true }) }
    });
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

main();

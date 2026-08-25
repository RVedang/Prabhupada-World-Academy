import getGuides from '../src/api/getGuides';

async function main() {
  try {
    const result = await getGuides.execute({
      input: { segment: 'PW' },
      context: { user: { role: 'SUPER_ADMIN', isBvSuperAdmin: true } }
    });
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

main();

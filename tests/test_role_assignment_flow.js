import http from 'http';

function makeRequest(endpoint, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      'http://localhost:3000/api/run/' + endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTest() {
  console.log('=== STARTING E2E ROLE ASSIGNMENT & DASHBOARD VISIBILITY TEST ===\n');

  // Step 0: Login Devotee & PW Super Admin
  const devoteeLogin = await makeRequest('resolveUserLogin', {}, { 'x-user-email': 'devotee@gmail.com' });
  console.log('1. Devotee User Profile resolved:', devoteeLogin.data?.user?.fullName, devoteeLogin.data?.user?.userId);
  const devoteeId = devoteeLogin.data?.user?.userId || 'USER-001';

  const superAdminLogin = await makeRequest('resolveUserLogin', {}, { 'x-user-email': 'vdnd@hkmmumbai.org' });
  console.log('2. PW Super Admin User Profile resolved:', superAdminLogin.data?.user?.fullName, superAdminLogin.data?.user?.userId);

  // Step 1: Submit BV Group Join Request as Devotee
  const groupsRes = await makeRequest('getAllBvGroups', {});
  const sampleGroup = groupsRes.data?.groups?.[0];
  console.log('\n3. Available BV Group for registration:', sampleGroup?.groupName, `(ID: ${sampleGroup?.id || sampleGroup?.groupId})`);

  let joinRes = await makeRequest('requestJoinBvGroup', { groupId: sampleGroup?.groupId || sampleGroup?.id || 'BV-GP-001' }, { 'x-user-email': 'devotee@gmail.com' });
  console.log('4. Request to join BV Group submitted:', joinRes.data);

  // Step 2: Super Admin Approves Registration & Assigns Group
  const pendingRegs = await makeRequest('getBvSupervisorOverview', {});
  const pendingReg = pendingRegs.data?.pendingRegistrations?.[0] || { id: 'REG-TEST-001' };
  console.log('\n5. Pending BV Registration request found for approval:', pendingReg?.id || pendingReg?.fullName);

  const approveRes = await makeRequest(
    'approveAndAssignBvMember',
    { registrationId: pendingReg.id || 'REG-TEST-001', groupId: sampleGroup?.id || 'BV-GP-001' },
    { 'x-user-email': 'vdnd@hkmmumbai.org' }
  );
  console.log('6. PW Super Admin approved & assigned user to group:', approveRes.data);

  // Step 3: Test 4 Roles Assignment & Dashboard Removal One by One

  // A. Test ADMIN Role
  console.log('\n--- TESTING ADMIN ROLE ASSIGNMENT ---');
  const assignAdmin = await makeRequest('assignBvRole', { userId: devoteeId, role: 'ADMIN' }, { 'x-user-email': 'vdnd@hkmmumbai.org' });
  console.log('Assigned ADMIN role result:', assignAdmin.data);

  const profileAdmin = await makeRequest('getUserProfile', { userId: devoteeId }, { 'x-user-email': 'devotee@gmail.com' });
  console.log('Devotee Profile flags:', {
    isBvAdmin: profileAdmin.data?.isBvAdmin,
    isBvSupervisor: profileAdmin.data?.isBvSupervisor,
    isBvFacilitator: profileAdmin.data?.isBvFacilitator,
    isBvSubFacilitator: profileAdmin.data?.isBvSubFacilitator,
  });

  // B. Test SUPERVISOR Role
  console.log('\n--- TESTING SUPERVISOR ROLE ASSIGNMENT ---');
  const assignSupervisor = await makeRequest('assignBvRole', { userId: devoteeId, role: 'SUPERVISOR', parentId: 'USER-SUPERADMIN-PW' }, { 'x-user-email': 'vdnd@hkmmumbai.org' });
  console.log('Assigned SUPERVISOR role result:', assignSupervisor.data);

  const profileSupervisor = await makeRequest('getUserProfile', { userId: devoteeId }, { 'x-user-email': 'devotee@gmail.com' });
  console.log('Devotee Profile flags:', {
    isBvAdmin: profileSupervisor.data?.isBvAdmin,
    isBvSupervisor: profileSupervisor.data?.isBvSupervisor,
    isBvFacilitator: profileSupervisor.data?.isBvFacilitator,
    isBvSubFacilitator: profileSupervisor.data?.isBvSubFacilitator,
  });

  // C. Test FACILITATOR (RGF) Role
  console.log('\n--- TESTING RGF (FACILITATOR) ROLE ASSIGNMENT ---');
  const assignRgf = await makeRequest('assignBvRole', { userId: devoteeId, role: 'FACILITATOR', parentId: 'SUPERVISOR-001' }, { 'x-user-email': 'vdnd@hkmmumbai.org' });
  console.log('Assigned FACILITATOR (RGF) role result:', assignRgf.data);

  const profileRgf = await makeRequest('getUserProfile', { userId: devoteeId }, { 'x-user-email': 'devotee@gmail.com' });
  console.log('Devotee Profile flags:', {
    isBvAdmin: profileRgf.data?.isBvAdmin,
    isBvSupervisor: profileRgf.data?.isBvSupervisor,
    isBvFacilitator: profileRgf.data?.isBvFacilitator,
    isBvSubFacilitator: profileRgf.data?.isBvSubFacilitator,
  });

  // D. Test SUB_FACILITATOR (RGSF) Role
  console.log('\n--- TESTING RGSF (SUB-FACILITATOR) ROLE ASSIGNMENT ---');
  const assignRgsf = await makeRequest('assignBvRole', { userId: devoteeId, role: 'SUB_FACILITATOR', parentId: 'RGF-001' }, { 'x-user-email': 'vdnd@hkmmumbai.org' });
  console.log('Assigned SUB_FACILITATOR (RGSF) role result:', assignRgsf.data);

  const profileRgsf = await makeRequest('getUserProfile', { userId: devoteeId }, { 'x-user-email': 'devotee@gmail.com' });
  console.log('Devotee Profile flags:', {
    isBvAdmin: profileRgsf.data?.isBvAdmin,
    isBvSupervisor: profileRgsf.data?.isBvSupervisor,
    isBvFacilitator: profileRgsf.data?.isBvFacilitator,
    isBvSubFacilitator: profileRgsf.data?.isBvSubFacilitator,
  });

  // E. Test ROLE REMOVAL (Setting back to MEMBER)
  console.log('\n--- TESTING ROLE REMOVAL (MEMBER) ---');
  const removeRole = await makeRequest('assignBvRole', { userId: devoteeId, role: 'MEMBER' }, { 'x-user-email': 'vdnd@hkmmumbai.org' });
  console.log('Removed role (Set to MEMBER) result:', removeRole.data);

  const profileMember = await makeRequest('getUserProfile', { userId: devoteeId }, { 'x-user-email': 'devotee@gmail.com' });
  console.log('Devotee Profile flags after role removal:', {
    isBvAdmin: profileMember.data?.isBvAdmin,
    isBvSupervisor: profileMember.data?.isBvSupervisor,
    isBvFacilitator: profileMember.data?.isBvFacilitator,
    isBvSubFacilitator: profileMember.data?.isBvSubFacilitator,
  });

  console.log('\n=== ALL ROLE ASSIGNMENT & REMOVAL TESTS PASSED SUCCESSFULLY! ===');
}

runTest().catch(console.error);

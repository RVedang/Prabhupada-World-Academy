import getPendingApprovals from './api/getPendingApprovals';
import getGuideRequests from './api/getGuideRequests';
import getResidencyTransferRequests from './api/getResidencyTransferRequests';
import getCleanlinessReviews from './api/getCleanlinessReviews';

async function run() {
  const context = {
    user: {
      email: 'vdnd@hkmmumbai.org',
      role: 'GUIDE',
      isBvAdmin: true,
      segment: 'FOLK',
    }
  };

  try {
    const pending = await getPendingApprovals.execute({ input: { guideId: 'ALL' }, context });
    const requests = await getGuideRequests.execute({ input: { guideId: 'ALL' }, context });
    const resTrans = await getResidencyTransferRequests.execute({ input: { guideId: 'ALL' }, context });
    const cleanReviews = await getCleanlinessReviews.execute({ input: { guideId: 'ALL' }, context });

    console.log('pending length:', Array.isArray(pending) ? pending.length : (pending as any)?.records?.length || 0);
    console.log('guideTransfers length:', requests?.guideTransfers?.length || 0);
    console.log('ashrayUpgrades length:', requests?.ashrayUpgrades?.length || 0);
    console.log('resTransfers length:', resTrans?.length || 0);
    console.log('cleanliness length:', cleanReviews?.length || 0);
  } catch (err) {
    console.error('Error running check:', err);
  }
}

run();

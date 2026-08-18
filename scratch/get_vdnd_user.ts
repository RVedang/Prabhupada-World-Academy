import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'bvpw108';

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const db = getFirestore();

async function runCheck() {
  console.log('Querying all Users with status "Pending Approval"...');
  const usersRef = db.collection('Users');
  const snap = await usersRef.where('status', '==', 'Pending Approval').get();
  
  if (!snap.empty) {
    for (const doc of snap.docs) {
      console.log('Pending User:', doc.id, doc.data());
    }
  } else {
    console.log('No pending users found.');
  }
}

runCheck().catch(err => {
  console.error(err);
  process.exit(1);
});

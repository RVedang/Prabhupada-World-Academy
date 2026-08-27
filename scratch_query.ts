import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function run() {
  const projectId = 'bvpw108';
  initializeApp({
    credential: applicationDefault(),
    projectId,
  });

  const db = getFirestore();
  console.log("=== CONNECTED TO FIRESTORE ===");
  const docRef = db.collection('Users').doc('hjNlvnc0WsMqZoyQFhLgbgvT05E3');
  const doc = await docRef.get();
  if (!doc.exists) {
    console.log("No user found with doc ID hjNlvnc0WsMqZoyQFhLgbgvT05E3");
  } else {
    console.log("User ID:", doc.id);
    console.log("User Data:", JSON.stringify(doc.data(), null, 2));
  }
}

run().catch(console.error);

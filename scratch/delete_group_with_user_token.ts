import { Firestore } from '@google-cloud/firestore';
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';

async function main() {
  const config = JSON.parse(fs.readFileSync('/home/vedanarayana_das/.config/configstore/firebase-tools.json', 'utf8'));
  const token = config.tokens.refresh_token;

  const auth = new GoogleAuth({
    credentials: {
      type: 'authorized_user',
      refresh_token: token,
      client_id: '1073017772844-4861t10o2h7ss7f87m4p092i7g05a6j3.apps.googleusercontent.com',
      client_secret: '33sIhVoGQf2g40sT1oM0sW4p',
    },
    projectId: 'bvpw108',
  });

  const firestore = new Firestore({
    auth,
    projectId: 'bvpw108',
  });

  // Now we can query BvGroups directly!
  const groupsSnapshot = await firestore.collection('BvGroups').get();
  console.log(`Found ${groupsSnapshot.size} total groups in BvGroups.`);

  for (const doc of groupsSnapshot.docs) {
    const data = doc.data();
    const groupName = data.groupName || data.name || '';
    if (String(groupName).toLowerCase() === 'fguide group') {
      // Query members by checking if group matches group ID
      const membersSnapshot = await firestore.collection('BvGroupMembers')
        .where('group', '==', doc.id)
        .get();
      
      // Query attendance
      const attendanceSnapshot = await firestore.collection('BvAttendance')
        .where('group', '==', doc.id)
        .get();

      console.log(`Group ID: ${doc.id}`);
      console.log(`  Name: ${groupName}`);
      console.log(`  Members count: ${membersSnapshot.size}`);
      console.log(`  Attendance sessions count: ${attendanceSnapshot.size}`);

      if (membersSnapshot.size === 0 && attendanceSnapshot.size === 0) {
        console.log(`  -> DELETING group ${doc.id} from Firestore...`);
        await firestore.collection('BvGroups').doc(doc.id).delete();
        console.log(`  -> Deleted successfully!`);
      } else {
        console.log(`  -> Keeping this group.`);
      }
    }
  }
}

main().catch(console.error);

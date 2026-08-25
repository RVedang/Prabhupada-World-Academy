import fs from 'fs';

async function run() {
  const firebaseToolsPath = '/home/vedanarayana_das/.config/configstore/firebase-tools.json';
  if (!fs.existsSync(firebaseToolsPath)) {
    console.error("firebase-tools.json not found!");
    return;
  }
  const config = JSON.parse(fs.readFileSync(firebaseToolsPath, 'utf8'));
  const refreshToken = config.tokens?.refresh_token;
  if (!refreshToken) {
    console.error("Refresh token not found");
    return;
  }

  // Refresh access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const tokenData: any = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    console.error("Failed to refresh token:", tokenData);
    return;
  }

  // Fetch all documents in BvGroupMembers collection
  console.log("Fetching BvGroupMembers...");
  const membersUrl = 'https://firestore.googleapis.com/v1/projects/bvpw108/databases/(default)/documents/BvGroupMembers?pageSize=300';
  const res = await fetch(membersUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  const data: any = await res.json();
  if (data.documents) {
    for (const doc of data.documents) {
      const docId = doc.name.split('/').pop();
      const fields = doc.fields || {};
      const user = fields.user?.stringValue || '';
      const group = fields.group?.stringValue || '';
      if (user.includes('VEDANG') || user.includes('Q7OF5S2zGXXQ2TrkONGwJGI8cxo1')) {
        console.log(`Member Doc: ${docId}`, JSON.stringify(fields, null, 2));
      }
    }
  }
}

run().catch(console.error);

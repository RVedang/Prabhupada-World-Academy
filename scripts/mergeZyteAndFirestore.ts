import fs from 'fs';
import path from 'path';

// Helper to parse standard CSV with quoted fields
function parseCSV(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      cur += c;
    } else if (c === '\n' && !inQuotes) {
      lines.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim()) lines.push(cur);
  if (lines.length < 2) return [];

  function splitLine(line: string): string[] {
    const fields: string[] = [];
    let field = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (q && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          q = !q;
        }
      } else if (char === ',' && !q) {
        fields.push(field.trim());
        field = '';
      } else {
        field += char;
      }
    }
    fields.push(field.trim());
    return fields;
  }

  const headers = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] !== undefined ? vals[idx] : '';
    });
    return row;
  });
}

// Convert CSV header name to camelCase object field key
function toCamelCase(header: string): string {
  return header
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      if (index === 0) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');
}

// Normalize phone numbers to last 10 digits
function normalizePhone(phone: any): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  return digits.slice(-10);
}

// Normalize email addresses
function normalizeEmail(email: any): string {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

// Deserialize Firestore REST field types to JS types
function fromFirestoreFields(fields: any): Record<string, any> {
  const obj: Record<string, any> = {};
  if (!fields) return obj;
  for (const [k, v] of Object.entries(fields)) {
    const valObj = v as any;
    if (valObj.stringValue !== undefined) {
      obj[k] = valObj.stringValue;
    } else if (valObj.booleanValue !== undefined) {
      obj[k] = valObj.booleanValue;
    } else if (valObj.integerValue !== undefined) {
      obj[k] = parseInt(valObj.integerValue, 10);
    } else if (valObj.doubleValue !== undefined) {
      obj[k] = parseFloat(valObj.doubleValue);
    } else if (valObj.nullValue !== undefined) {
      obj[k] = null;
    } else if (valObj.arrayValue !== undefined) {
      obj[k] = (valObj.arrayValue.values || []).map((el: any) => {
        if (el.stringValue !== undefined) return el.stringValue;
        if (el.integerValue !== undefined) return parseInt(el.integerValue, 10);
        return el;
      });
    } else {
      obj[k] = valObj;
    }
  }
  return obj;
}

// Serialize JS types to Firestore REST fields
function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!k || k === '_rawCsv' || k === 'id') continue;
    if (v === null || v === undefined || v === '') {
      fields[k] = { nullValue: null };
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v };
    } else if (typeof v === 'number') {
      if (Number.isInteger(v)) {
        fields[k] = { integerValue: String(v) };
      } else {
        fields[k] = { doubleValue: v };
      }
    } else if (Array.isArray(v)) {
      fields[k] = {
        arrayValue: {
          values: v.map(el => {
            if (typeof el === 'number') return { integerValue: String(el) };
            return { stringValue: String(el) };
          })
        }
      };
    } else {
      fields[k] = { stringValue: String(v) };
    }
  }
  return fields;
}

// Map CSV filename to Firestore collection name
const CSV_COLLECTION_MAP: Record<string, string> = {
  'Users': 'Users',
  'Guides': 'Guides',
  'Folk Residencies': 'FolkResidencies',
  'Cleanliness Inspections': 'CleanlinessInspections',
  'Cleanliness Rooms': 'CleanlinessRooms',
  'Services': 'Services',
  'Service Allocations': 'ServiceAllocations',
  'Service Availability': 'ServiceAvailability',
  'Service Swaps': 'ServiceSwaps',
  'ServicePreferences': 'ServicePreferences',
  'ServiceRatings': 'ServiceRatings',
  'BV Groups': 'BvGroups',
  'BV Group Members': 'BvGroupMembers',
  'BV Group Requests': 'BvGroupRequests',
  'BV Sessions': 'BvSessions',
  'BV Attendance': 'BvAttendance',
  'BVSL Preaching Entries': 'BvslPreachingEntries',
  'BVSL Weekly Plans': 'BvslWeeklyPlans',
  'BvQuizzes': 'BvQuizzes',
  'BvQuizSubmissions': 'BvQuizSubmissions',
  'AshrayLevels': 'AshrayLevels',
  'Ashray Checklist': 'AshrayChecklist',
  'AshrayUpgradeRequests': 'AshrayUpgradeRequests',
  'Config': 'Config',
  'Jigyasa Registrations': 'JigyasaRegistrations',
  'Jigyasa Session Attendance': 'JigyasaSessionAttendance',
  'Jigyasa Processed Files': 'JigyasaProcessedFiles',
  'Sadhana Entries': 'SadhanaEntries',
  'Sadhana Fields': 'SadhanaFields',
  'Sadhana Monthly Summaries': 'SadhanaMonthlySummaries',
  'One To One Meetings': 'OneToOneMeetings',
  'Preaching Report Goals': 'PreachingReportGoals',
  'Rent Payments': 'RentPayments',
  'Trips': 'Trips',
  'Unavailability Requests': 'UnavailabilityRequests',
  'TagMango Sync Log': 'TagMangoSyncLog',
  'Push Subscriptions': 'PushSubscriptions',
  'Guide Transfer Requests': 'GuideTransferRequests',
  'Residency Transfer Requests': 'ResidencyTransferRequests',
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, options: any, maxRetries = 4): Promise<Response> {
  let attempt = 1;
  while (true) {
    try {
      const res = await fetch(url, options);
      if (res.ok || attempt >= maxRetries) {
        return res;
      }
      const text = await res.text();
      console.warn(`  ⚠️ Attempt ${attempt} failed with status ${res.status}: ${text.slice(0, 100)}. Retrying in ${attempt * 1000}ms...`);
    } catch (e: any) {
      if (attempt >= maxRetries) throw e;
      console.warn(`  ⚠️ Attempt ${attempt} network error: ${e?.message || e}. Retrying in ${attempt * 1000}ms...`);
    }
    await delay(attempt * 1000);
    attempt++;
  }
}

async function fetchCollectionRest(collectionName: string, accessToken: string): Promise<any[]> {
  const documents: any[] = [];
  let pageToken = '';

  while (true) {
    let url = `https://firestore.googleapis.com/v1/projects/bvpw108/databases/(default)/documents/${collectionName}?pageSize=300`;
    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      }
    });

    if (!res.ok) {
      if (res.status === 404) {
        break; // Collection does not exist yet in DB
      }
      const errText = await res.text();
      throw new Error(`Failed to list collection ${collectionName}: ${res.status} ${errText}`);
    }

    const data = await res.json() as any;
    if (data.documents && Array.isArray(data.documents)) {
      for (const doc of data.documents) {
        const docId = decodeURIComponent(doc.name.split('/').pop() || '');
        const docFields = fromFirestoreFields(doc.fields);
        documents.push({ id: docId, ...docFields });
      }
    }

    if (data.nextPageToken) {
      pageToken = data.nextPageToken;
    } else {
      break;
    }
  }

  return documents;
}

async function main() {
  const commitMode = process.argv.includes('--commit') || process.env.COMMIT === 'true';
  console.log(`🚀 Initializing Database Merge Script (Mode: ${commitMode ? 'COMMIT' : 'DRY-RUN'})...`);

  // Load Firebase Tools access token
  const configPath = '/home/vedanarayana_das/.config/configstore/firebase-tools.json';
  let accessToken = '';
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      accessToken = cfg?.tokens?.access_token || '';
    } catch {}
  }

  if (!accessToken) {
    console.error('❌ Access token missing from firebase-tools.json. Please run firebase login first.');
    process.exit(1);
  }

  console.log('🔑 Authenticating via Firebase CLI credentials...');

  const backupDir = path.resolve(process.cwd(), 'docs/zite-backups');
  if (!fs.existsSync(backupDir)) {
    console.error('❌ Zyte backups directory not found at:', backupDir);
    process.exit(1);
  }

  // Create Firestore backup directory for pre-migration safety rollback
  const firestoreBackupDir = path.resolve(process.cwd(), 'docs/firestore-backups');
  if (!fs.existsSync(firestoreBackupDir)) {
    fs.mkdirSync(firestoreBackupDir, { recursive: true });
  }

  const csvFiles = fs.readdirSync(backupDir).filter(f => f.endsWith('.csv') && !f.includes(':Zone.Identifier'));
  console.log(`📂 Found ${csvFiles.length} CSV files to process.\n`);

  let totalZyteRecords = 0;
  let totalFirestoreRecords = 0;
  let totalUniqueAfterMerge = 0;
  let totalImported = 0;
  let totalMerged = 0;
  let totalExactDuplicates = 0;
  let totalAmbiguous = 0;
  let totalFailed = 0;

  const ambiguousConflictsList: Array<{ collection: string; csvRow: any; dbRow: any; reason: string }> = [];

  for (const filename of csvFiles) {
    const baseName = filename.split(' - Grid view')[0].trim();
    const collectionName = CSV_COLLECTION_MAP[baseName] || baseName.replace(/[^a-zA-Z0-9]/g, '');
    const filePath = path.join(backupDir, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    const zyteRows = parseCSV(content);

    if (zyteRows.length === 0) continue;

    console.log(`\n------------------------------------------------------------`);
    console.log(`📦 Collection: ${collectionName}`);
    console.log(`   - Zyte CSV records count: ${zyteRows.length}`);

    // 1. Fetch and backup existing Firestore collection
    let existingDocs: any[] = [];
    try {
      existingDocs = await fetchCollectionRest(collectionName, accessToken);
    } catch (e: any) {
      console.warn(`   ⚠️ Firestore fetch warning for ${collectionName}:`, e?.message || e);
    }

    console.log(`   - Existing Firestore records count: ${existingDocs.length}`);
    totalZyteRecords += zyteRows.length;
    totalFirestoreRecords += existingDocs.length;

    // Save existing data local backup
    fs.writeFileSync(
      path.join(firestoreBackupDir, `${collectionName}.json`),
      JSON.stringify(existingDocs, null, 2),
      'utf8'
    );

    // Map existing Firestore docs by various identifiers
    const existingMapById = new Map<string, any>();
    const existingMapByEmail = new Map<string, any>();
    const existingMapByPhone = new Map<string, any>();

    for (const doc of existingDocs) {
      if (doc.id) existingMapById.set(String(doc.id).trim(), doc);
      if (doc.userId) existingMapById.set(String(doc.userId).trim(), doc);

      if (collectionName === 'Users') {
        const email = normalizeEmail(doc.email);
        if (email) existingMapByEmail.set(email, doc);
        const phone = normalizePhone(doc.phone);
        if (phone) existingMapByPhone.set(phone, doc);
      }
    }

    const toWrite: Array<{ id: string; data: any }> = [];
    let localImportCount = 0;
    let localMergeCount = 0;
    let localDuplicateCount = 0;
    let localAmbiguousCount = 0;

    for (const zyteRow of zyteRows) {
      // Align fields to camelCase and correct data types
      const alignedData: Record<string, any> = {};
      for (const [header, val] of Object.entries(zyteRow)) {
        if (!header) continue;
        const key = toCamelCase(header);
        let value: any = val;
        if (val === 'true') value = true;
        else if (val === 'false') value = false;
        else if (val.trim() === '') value = null;
        alignedData[key] = value;
      }

      const zyteId = String(zyteRow['ID'] || zyteRow['User ID'] || zyteRow['Email'] || alignedData.id || alignedData.userId).trim();
      const zyteEmail = normalizeEmail(alignedData.email);
      const zytePhone = normalizePhone(alignedData.phone);

      // Attempt matching using Duplicate Detection Priority
      let matchedDoc: any = null;
      let matchReason = '';

      if (existingMapById.has(zyteId)) {
        matchedDoc = existingMapById.get(zyteId);
        matchReason = 'id';
      } else if (collectionName === 'Users') {
        if (zyteEmail && existingMapByEmail.has(zyteEmail)) {
          matchedDoc = existingMapByEmail.get(zyteEmail);
          matchReason = 'email';
        } else if (zytePhone && existingMapByPhone.has(zytePhone)) {
          matchedDoc = existingMapByPhone.get(zytePhone);
          matchReason = 'phone';
        }
      }

      if (!matchedDoc) {
        // Safe to import as a new document
        toWrite.push({ id: zyteId, data: alignedData });
        localImportCount++;
        totalImported++;
      } else {
        // Ambiguity Guard check: same phone/email but completely different name/info
        if (collectionName === 'Users') {
          const zyteNameLower = String(alignedData.fullName || '').toLowerCase().trim();
          const dbNameLower = String(matchedDoc.fullName || '').toLowerCase().trim();

          if (zyteNameLower && dbNameLower && zyteNameLower !== dbNameLower && !dbNameLower.includes(zyteNameLower) && !zyteNameLower.includes(dbNameLower)) {
            localAmbiguousCount++;
            totalAmbiguous++;
            ambiguousConflictsList.push({
              collection: collectionName,
              csvRow: alignedData,
              dbRow: matchedDoc,
              reason: `Ambiguous user match on ${matchReason} (Name Mismatch: CSV "${alignedData.fullName}" vs Firestore "${matchedDoc.fullName}")`
            });
            continue;
          }
        }

        // Determine if duplicate is identical or requires merge
        let needsMerge = false;
        const mergedData = { ...matchedDoc };

        for (const [key, value] of Object.entries(alignedData)) {
          if (value !== undefined && value !== null && value !== '') {
            if (mergedData[key] === undefined || mergedData[key] === null || mergedData[key] === '') {
              mergedData[key] = value;
              needsMerge = true;
            } else if (String(mergedData[key]) !== String(value)) {
              // Conflict resolution: prefer newer production values based on update timestamps
              const csvUpdate = alignedData.updatedAt ? new Date(alignedData.updatedAt).getTime() : 0;
              const dbUpdate = matchedDoc.updatedAt ? new Date(matchedDoc.updatedAt).getTime() : 0;

              if (csvUpdate > dbUpdate) {
                mergedData[key] = value;
                needsMerge = true;
              }
            }
          }
        }

        // Handle earliest createdAt timestamp
        const csvCreated = alignedData.createdAt ? new Date(alignedData.createdAt).getTime() : Infinity;
        const dbCreated = matchedDoc.createdAt ? new Date(matchedDoc.createdAt).getTime() : Infinity;
        if (csvCreated < dbCreated && alignedData.createdAt) {
          mergedData.createdAt = alignedData.createdAt;
          needsMerge = true;
        }

        if (needsMerge) {
          toWrite.push({ id: matchedDoc.id || zyteId, data: mergedData });
          localMergeCount++;
          totalMerged++;
        } else {
          localDuplicateCount++;
          totalExactDuplicates++;
        }
      }
    }

    totalUniqueAfterMerge += (existingDocs.length + localImportCount);

    console.log(`   - New records to import (creations): ${localImportCount}`);
    console.log(`   - Existing records merged (updates): ${localMergeCount}`);
    console.log(`   - Exact duplicates (no write needed): ${localDuplicateCount}`);
    console.log(`   - Ambiguous matches skipped (conflict): ${localAmbiguousCount}`);

    // Commit changes to Firestore using concurrent REST PATCH calls
    if (commitMode && toWrite.length > 0) {
      console.log(`   ⏳ Committing ${toWrite.length} writes to Firestore via REST API...`);
      const concurrency = 8;
      let count = 0;

      for (let i = 0; i < toWrite.length; i += concurrency) {
        const chunk = toWrite.slice(i, i + concurrency);
        await Promise.all(
          chunk.map(async (item) => {
            const safeDocId = encodeURIComponent(String(item.id).trim().replace(/\//g, '_'));
            const url = `https://firestore.googleapis.com/v1/projects/bvpw108/databases/(default)/documents/${collectionName}/${safeDocId}`;
            const payload = { fields: toFirestoreFields(item.data) };

            try {
              const res = await fetchWithRetry(url, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(payload),
              });
              if (res.ok) {
                count++;
              } else {
                const errText = await res.text();
                console.error(`   ❌ REST write failed for ${collectionName}/${safeDocId}: ${res.status} ${errText.slice(0, 100)}`);
                totalFailed++;
              }
            } catch (err: any) {
              console.error(`   ❌ REST write error for ${collectionName}/${safeDocId}:`, err?.message || err);
              totalFailed++;
            }
          })
        );
      }
      console.log(`   ✅ Firestore commit complete. Successfully wrote ${count} records.`);
    }
  }

  // ─── FINAL DATA RECONCILIATION REPORT ──────────────────────────────────────────
  console.log(`\n============================================================`);
  console.log(`📊 FINAL RECONCILIATION SUMMARY`);
  console.log(`============================================================`);
  console.log(`- Total records in latest Zyte CSVs : ${totalZyteRecords}`);
  console.log(`- Total records previously in DB    : ${totalFirestoreRecords}`);
  console.log(`- Total unique records after merge  : ${totalUniqueAfterMerge}`);
  console.log(`- Number of new records imported   : ${totalImported}`);
  console.log(`- Number of existing records merged: ${totalMerged}`);
  console.log(`- Number of exact duplicates        : ${totalExactDuplicates}`);
  console.log(`- Number of ambiguous matches       : ${totalAmbiguous}`);
  console.log(`- Number of failed writes           : ${totalFailed}`);
  console.log(`============================================================`);

  if (ambiguousConflictsList.length > 0) {
    console.log(`\n⚠️ AMBIGUOUS / CONFLICTING RECORDS ENCOUNTERED (${totalAmbiguous}):`);
    for (const conf of ambiguousConflictsList) {
      console.log(`  [Collection: ${conf.collection}] ${conf.reason}`);
      console.log(`    CSV Row: ${JSON.stringify(conf.csvRow)}`);
      console.log(`    DB Row:  ${JSON.stringify(conf.dbRow)}\n`);
    }

    // Save report to file
    fs.writeFileSync(
      path.resolve(process.cwd(), 'docs/migration-conflicts.json'),
      JSON.stringify(ambiguousConflictsList, null, 2),
      'utf8'
    );
    console.log(`📄 Detailed conflict report saved to docs/migration-conflicts.json`);
  }

  console.log(`\n🎉 Reconciliation completed! Pre-migration local backups stored inside docs/firestore-backups/`);
}

main().catch(err => {
  console.error('Fatal migration merge error:', err);
  process.exit(1);
});

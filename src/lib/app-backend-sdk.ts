import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { requestQuery, invalidateRequestTable } from './requestQueries';
import { serverCacheInvalidate } from './serverCache';
import type { z } from 'zod';
import type { ApiCapability, ApiUserContext } from './apiAuthorization';

function invalidateTableReads(table: string) {
  invalidateRequestTable(table);
  if (table === 'Guides' || table === 'FolkResidencies') serverCacheInvalidate('reportReference:');
  if (table === 'Users' || table === 'Guides') serverCacheInvalidate('ref:guides');
  if (['Users', 'Guides', 'BvGroups', 'BvGroupMembers', 'BvAttendance'].includes(table)) serverCacheInvalidate('allBvGroupsAdmin:');
}

// ══════════════════════════════════════════════════════════════════════════════
// app-backend-sdk.ts — Server-side Firebase Firestore Integration Layer.
// Provides data models, ORM operations, and email services.
// ══════════════════════════════════════════════════════════════════════════════

let firestoreDb: any = null;
let _hasValidCredentials = false;

export function getFirestoreDb(): any {
  if (!_hasValidCredentials) return null;
  return firestoreDb;
}

function initFirestoreOnStartup() {
  try {
    const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
    let hasKey = false;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'bvpw108';

    if (fs.existsSync(serviceAccountPath)) {
      try {
        const sa = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        if (sa.private_key && sa.private_key.includes('BEGIN') && !sa.private_key.includes('dummy')) {
          if (getApps().length === 0) {
            initializeApp({ credential: cert(sa), projectId: sa.project_id || projectId });
          }
          hasKey = true;
        }
      } catch (e) {}
    }

    if (!hasKey && process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        if (sa.private_key && sa.private_key.includes('BEGIN') && !sa.private_key.includes('dummy')) {
          if (getApps().length === 0) {
            initializeApp({ credential: cert(sa), projectId: sa.project_id || projectId });
          }
          hasKey = true;
        }
      } catch (e) {}
    }

    if (hasKey || (typeof process !== 'undefined' && !!process.env?.FIRESTORE_EMULATOR_HOST)) {
      _hasValidCredentials = true;
      if (getApps().length === 0) {
        initializeApp({ projectId });
      }
      firestoreDb = getFirestore();
      try {
        firestoreDb.settings({ ignoreUndefinedProperties: true });
      } catch (e) {}
    } else {
      // Fallback: try Application Default Credentials (ADC) only in production.
      // Firebase App Hosting automatically injects ADC at runtime so the
      // server can connect to Firestore without a service account key file.
      if (process.env.NODE_ENV === 'production') {
        try {
          if (getApps().length === 0) {
            initializeApp({ credential: applicationDefault(), projectId });
          }
          firestoreDb = getFirestore();
          firestoreDb.settings({ ignoreUndefinedProperties: true });
          _hasValidCredentials = true;
          console.log('[Firebase Admin] Initialized using Application Default Credentials (App Hosting ADC).');
        } catch (adcError: any) {
          _hasValidCredentials = false;
          firestoreDb = null;
          console.error('❌ CRITICAL ERROR: Firebase Service Account credentials not found or invalid in production environment!', adcError?.message);
        }
      } else {
        _hasValidCredentials = false;
        firestoreDb = null;
      }
    }

  } catch (e: any) {
    _hasValidCredentials = false;
    firestoreDb = null;
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ CRITICAL ERROR: Firebase initialization failed in production environment:', e);
    }
  }
}

initFirestoreOnStartup();

interface EndpointDefinition<Input extends z.ZodType, Output extends z.ZodType, Result, Public extends boolean> {
  description: string;
  authenticated?: boolean;
  public?: Public;
  publicSecretEnv?: string;
  maxBodyBytes?: number;
  webhook?: Record<string, unknown>;
  requiredCapabilities?: ApiCapability | ApiCapability[];
  inputSchema: Input;
  outputSchema: Output;
  execute(args: { input: z.output<Input>; context: { user: Public extends true ? ApiUserContext | null : ApiUserContext } }): Promise<Result>;
}

/** Preserve the parsed input and actual handler result throughout the client SDK. */
export function createEndpoint<Input extends z.ZodType, Output extends z.ZodType, Result, Public extends boolean = false>(
  config: EndpointDefinition<Input, Output, Result, Public>,
) {
  return config;
}

export class AppError extends Error {
  code: string;
  constructor({ code, message }: { code: string; message: string }) {
    super(message);
    this.code = code;
    this.name = 'AppError';
  }
}

function applyFilters(ref: any, filters: any) {
  let q = ref;
  for (const col of Object.keys(filters)) {
    const val = filters[col];
    if (val === undefined) continue;

    const dbField = col === 'id' ? FieldPath.documentId() : col;

    if (val === null) {
      q = q.where(dbField, '==', null);
    } else if (typeof val === 'object' && !Array.isArray(val)) {
      const keys = Object.keys(val);
      for (const op of keys) {
        const opVal = val[op];
        if (op === 'in') {
          if (Array.isArray(opVal) && opVal.length > 0) {
            q = q.where(dbField, 'in', opVal.slice(0, 30));
          } else {
            q = q.where(dbField, '==', '__EMPTY_QUERY_RESULT__');
          }
        } else if (op === 'notIn' || op === 'not_in') {
          if (Array.isArray(opVal) && opVal.length > 0) {
            q = q.where(dbField, 'not-in', opVal.slice(0, 30));
          }
        } else if (op === 'gte') {
          q = q.where(dbField, '>=', opVal);
        } else if (op === 'lte') {
          q = q.where(dbField, '<=', opVal);
        } else if (op === 'gt') {
          q = q.where(dbField, '>', opVal);
        } else if (op === 'lt') {
          q = q.where(dbField, '<', opVal);
        } else if (op === 'neq' || op === 'ne') {
          q = q.where(dbField, '!=', opVal);
        }
      }
    } else {
      q = q.where(dbField, '==', val);
    }
  }
  return q;
}

/**
 * Apply a Firestore projection when callers request a field subset.
 *
 * Every record already receives its document ID from `doc.id`, so selecting a
 * stored `id` field is unnecessary.  Firestore projections substantially cut
 * response size for collections such as SadhanaEntries, whose documents also
 * contain large JSON payloads that most dashboard queries never use.
 */
function applyFieldSelection(ref: any, fields: unknown): any {
  if (!Array.isArray(fields)) return ref;
  const selected = [...new Set(
    fields.filter((field): field is string => typeof field === 'string' && field.length > 0 && field !== 'id')
  )];
  // `select()` with no field arguments is valid and returns document IDs only.
  return ref.select(...selected);
}

function parseCSVText(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { inQuotes = !inQuotes; cur += c; }
    else if (c === '\n' && !inQuotes) { lines.push(cur); cur = ''; }
    else { cur += c; }
  }
  if (cur.trim()) lines.push(cur);
  if (lines.length < 2) return [];

  function splitLine(line: string) {
    const fields: string[] = [];
    let field = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (q && line[i + 1] === '"') { field += '"'; i++; }
        else { q = !q; }
      } else if (char === ',' && !q) {
        fields.push(field.trim());
        field = '';
      } else { field += char; }
    }
    fields.push(field.trim());
    return fields;
  }

  const headers = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] !== undefined ? vals[idx] : ''; });
    return row;
  });
}

function loadCsvTableData(tableName: string): any[] {
  try {
    let dir = path.resolve(process.cwd(), 'docs/app-backups');
    if (!fs.existsSync(dir)) {
      dir = path.resolve(process.cwd(), 'docs/zite-backups');
    }
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv') && !f.includes(':Zone.Identifier'));
    const match = files.find(f => {
      const name = f.split(' - Grid view')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const target = tableName.toLowerCase().replace(/[^a-z0-9]/g, '');
      return name === target || name.replace(/s$/, '') === target.replace(/s$/, '');
    });
    if (!match) return [];
    const content = fs.readFileSync(path.join(dir, match), 'utf8');
    const rawRows = parseCSVText(content);

    return rawRows.map(r => {
      const obj: Record<string, any> = { _raw: r };
      for (const [k, v] of Object.entries(r)) {
        if (!k) continue;
        const camelKey = k
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .trim()
          .split(/\s+/)
          .map((w, idx) => idx === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join('');

        let val: any = v;
        if (v === 'true') val = true;
        else if (v === 'false') val = false;
        else if (v.trim() === '') val = null;

        obj[camelKey] = val;
      }

      // Ensure standard entity fields
      if (r['ID']) obj.id = r['ID'];
      if (r['User ID']) obj.userId = r['User ID'];
      if (r['Full Name']) obj.fullName = r['Full Name'];
      if (r['Email']) obj.email = r['Email'];
      if (r['Phone']) obj.phone = r['Phone'];
      if (r['Role']) obj.role = r['Role'];
      if (r['Status']) obj.status = r['Status'];
      if (r['Guide ID']) obj.guideId = r['Guide ID'];
      if (r['Guide']) obj.guideName = r['Guide'];
      if (r['Residency']) obj.residencyName = r['Residency'];
      if (r['Ashray Level']) obj.ashrayLevel = r['Ashray Level'];
      if (r['Abbreviation']) obj.abbr = r['Abbreviation'];
      if (r['Is Active'] !== undefined) obj.isActive = r['Is Active'] === 'true';

      return obj;
    });
  } catch (e) {
    return [];
  }
}

const mockStore: Record<string, Map<string, any>> = {};

function getMockTable(tableName: string): Map<string, any> {
  if (!mockStore[tableName]) {
    mockStore[tableName] = new Map<string, any>();

    // Safeguard: Prevent mock data from leaking in production
    if (process.env.NODE_ENV === 'production') {
      console.warn(`[App SDK] Warning: Firebase credentials not found in production. Mock data for table '${tableName}' is disabled for security.`);
      return mockStore[tableName];
    }

    const csvRecords = loadCsvTableData(tableName);
    csvRecords.forEach(rec => {
      const docId = rec.id || rec.userId || rec.email || rec.guideId || String(mockStore[tableName].size + 1);
      mockStore[tableName].set(docId, rec);
      if (rec.id) mockStore[tableName].set(rec.id, rec);
      if (rec.userId) mockStore[tableName].set(rec.userId, rec);
      if (rec.email) mockStore[tableName].set(rec.email.toLowerCase(), rec);
    });

    // Development fixtures must be created explicitly by tests or loaded from
    // CSV backups. Runtime demo identities can make an unregistered email look
    // like a real user, so they are intentionally not seeded here.
  }
  return mockStore[tableName];
}

function hasWorkingFirestore(): boolean {
  if (typeof process !== 'undefined' && process.env?.FIRESTORE_EMULATOR_HOST) return true;
  return _hasValidCredentials;
}

function ensureFirestoreInProduction() {
  if (process.env.NODE_ENV === 'production' && !hasWorkingFirestore()) {
    throw new Error('Database Connection Error: Real Cloud Firestore is not configured. Please verify your Firebase Service Account credentials.');
  }
}

export class Table {
  tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  private matchMock(item: any, filters: any): boolean {
    if (!filters) return true;
    for (const key of Object.keys(filters)) {
      const val = filters[key];
      if (val === undefined) continue;
      if (val === null) {
        if (item[key] !== null && item[key] !== undefined) return false;
      } else if (typeof val === 'object' && !Array.isArray(val)) {
        if (val.in && Array.isArray(val.in)) {
          if (!val.in.includes(item[key])) return false;
        }
      } else {
        if (key === 'guide' || key === 'guideId' || key === 'selectedGuideId') {
          const itemVal = String(item.guide || item.guideName || item.selectedGuideId || '').toLowerCase();
          const filterVal = String(val).toLowerCase();
          if (itemVal && filterVal && itemVal !== filterVal && !itemVal.includes(filterVal) && !filterVal.includes(itemVal)) {
            return false;
          }
        } else {
          if (String(item[key] || '').toLowerCase() !== String(val || '').toLowerCase()) {
            return false;
          }
        }
      }
    }
    return true;
  }

  async findOne(query: any): Promise<any> {
    return requestQuery(this.tableName, 'findOne', query, () => this.findOneUncached(query));
  }

  private async findOneUncached(query: any): Promise<any> {
    ensureFirestoreInProduction();
    if (hasWorkingFirestore()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          if (query.id) {
            if (Array.isArray(query.fields) && query.fields.length > 0) {
              let q = db.collection(this.tableName)
                .where(FieldPath.documentId(), '==', query.id);
              q = applyFieldSelection(q, query.fields);
              const snapshot = await q.limit(1).get();
              if (!snapshot.empty) {
                return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
              }
            } else {
              const doc = await db.collection(this.tableName).doc(query.id).get();
              if (doc.exists) return { id: doc.id, ...doc.data() };
            }
          } else if (query.filters) {
            let q = db.collection(this.tableName);
            q = applyFilters(q, query.filters);
            q = applyFieldSelection(q, query.fields);
            const snapshot = await q.limit(1).get();
            if (!snapshot.empty) {
              return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            }
          }
        }
      } catch (e: any) {
        console.warn(`[Table ${this.tableName}] Firestore query error (${e?.message || e}), using local memory store.`);
      }
    }

    const store = getMockTable(this.tableName);
    if (query.id) {
      return store.get(query.id);
    }
    if (query.filters) {
      for (const item of Array.from(store.values())) {
        if (this.matchMock(item, query.filters)) return item;
      }
    }
    return undefined;
  }

  async findAll(query: any = {}): Promise<{ records: any[]; hasMore: boolean }> {
    return requestQuery(this.tableName, 'findAll', query, () => this.findAllUncached(query));
  }

  private async findAllUncached(query: any = {}): Promise<{ records: any[]; hasMore: boolean }> {
    ensureFirestoreInProduction();
    if (hasWorkingFirestore()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          let q = db.collection(this.tableName);

          if (query.id) {
            q = q.where(FieldPath.documentId(), '==', query.id);
          } else if (query.filters) {
            q = applyFilters(q, query.filters);
          }

          if (query.sorts && Array.isArray(query.sorts) && query.sorts.length > 0) {
            query.sorts.forEach((s: any) => {
              q = q.orderBy(s.field, s.dir.toLowerCase() as 'asc' | 'desc');
            });
          }

          q = applyFieldSelection(q, query.fields);

          const limit = query.limit ? Number(query.limit) : null;
          const offset = query.offset ? Number(query.offset) : null;

          if (limit !== null) {
            q = q.limit(limit + 1);
          }

          if (offset !== null) {
            q = q.offset(offset);
          }

          const snapshot = await q.get();
          const records = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

          let hasMore = false;
          if (limit !== null && records.length > limit) {
            hasMore = true;
            records.pop();
          }

          return {
            records,
            hasMore,
          };
        }
      } catch (e: any) {
        console.warn(`[Table ${this.tableName}] Firestore findAll error (${e?.message || e}), using local memory store.`);
      }
    }

    const store = getMockTable(this.tableName);
    let records = Array.from(new Set(store.values()));

    if (query.id) {
      records = records.filter(r => r.id === query.id || r.userId === query.id || (r.email || '').toLowerCase() === String(query.id).toLowerCase());
    } else if (query.filters) {
      records = records.filter(r => this.matchMock(r, query.filters));
    }

    const limit = query.limit ? Number(query.limit) : records.length;
    return { records: records.slice(0, limit), hasMore: false };
  }

  async create({ record }: { record: any }): Promise<any> {
    invalidateTableReads(this.tableName);
    try { return await this.createUncached({ record }); }
    finally { invalidateTableReads(this.tableName); }
  }

  private async createUncached({ record }: { record: any }): Promise<any> {
    ensureFirestoreInProduction();
    const id = record.id || `rec_${Math.random().toString(36).substring(2, 15)}`;
    const fullRecord = { ...record, id };

    const db = getFirestoreDb();
    if (db && hasWorkingFirestore()) {
      try {
        await db.collection(this.tableName).doc(id).set(fullRecord);
      } catch (e: any) {
        // A production write must never silently fall back to process memory:
        // it is discarded on the next request while the caller sees success.
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`Database write failed for ${this.tableName}: ${e?.message || e}`);
        }
        console.warn(`[Table ${this.tableName}] Firestore create error (${e?.message || e}), saved to local memory store.`);
      }
    }

    const store = getMockTable(this.tableName);
    store.set(id, fullRecord);
    if (fullRecord.userId) store.set(fullRecord.userId, fullRecord);
    if (fullRecord.email) store.set(fullRecord.email.toLowerCase(), fullRecord);
    return fullRecord;
  }

  async update({ id, record }: { id: string; record: any }): Promise<any> {
    invalidateTableReads(this.tableName);
    try { return await this.updateUncached({ id, record }); }
    finally { invalidateTableReads(this.tableName); }
  }

  private async updateUncached({ id, record }: { id: string; record: any }): Promise<any> {
    ensureFirestoreInProduction();
    const data: any = {};
    for (const key of Object.keys(record)) {
      if (record[key] !== undefined) {
        data[key] = record[key];
      }
    }

    const db = getFirestoreDb();
    if (db && hasWorkingFirestore()) {
      try {
        await db.collection(this.tableName).doc(id).set(data, { merge: true });
      } catch (e: any) {
        // See create(): production callers need a real failure, not a false
        // success backed only by temporary server memory.
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`Database update failed for ${this.tableName}: ${e?.message || e}`);
        }
        console.warn(`[Table ${this.tableName}] Firestore update error (${e?.message || e}), updated local memory store.`);
      }
    }

    const store = getMockTable(this.tableName);
    let existing = store.get(id);
    if (!existing && id) {
      existing = Array.from(store.values()).find((r: any) =>
        r.id === id || r.userId === id || (r.email || '').toLowerCase() === String(id).toLowerCase()
      );
    }
    if (!existing) {
      existing = { id };
    }

    Object.assign(existing, data);

    if (existing.id) store.set(existing.id, existing);
    if (existing.userId) store.set(existing.userId, existing);
    if (existing.email) store.set(existing.email.toLowerCase(), existing);

    return existing;
  }

  async delete({ id }: { id: string }): Promise<any> {
    invalidateTableReads(this.tableName);
    try { return await this.deleteUncached({ id }); }
    finally { invalidateTableReads(this.tableName); }
  }

  private async deleteUncached({ id }: { id: string }): Promise<any> {
    ensureFirestoreInProduction();
    let record: any = null;
    const db = getFirestoreDb();
    if (db && hasWorkingFirestore()) {
      try {
        record = await this.findOne({ id });
        if (record) {
          await db.collection(this.tableName).doc(id).delete();
        }
      } catch (e: any) {
        console.warn(`[Table ${this.tableName}] Firestore delete error (${e?.message || e}), removed from local memory store.`);
      }
    }

    const store = getMockTable(this.tableName);
    const existing = store.get(id) || Array.from(store.values()).find((r: any) =>
      r.id === id || r.userId === id || (r.email || '').toLowerCase() === String(id).toLowerCase()
    );
    if (existing) {
      for (const [key, val] of store.entries()) {
        if (val === existing) {
          store.delete(key);
        }
      }
    } else {
      store.delete(id);
    }
    return existing || record;
  }

  async bulkCreate({ records, matchOn }: { records: any[]; matchOn?: string[] }): Promise<{ records: any[] }> {
    const results: any[] = [];
    for (const r of records) {
      const res = await this.create({ record: r });
      results.push(res);
    }
    return { records: results };
  }
}

// ─── EMAIL CLIENT MOCK ────────────────────────────────────────────────────────
export const Email = {
  send: async (params: { to: string; subject: string; body: any[] }) => {
    console.log(`[Email Mock] Sending to: ${params.to}`);
    console.log(`[Email Mock] Subject: ${params.subject}`);
    console.log(`[Email Mock] Body:`, JSON.stringify(params.body, null, 2));
    // In production, configure nodemailer/SMTP here.
    return { success: true };
  }
};

// ─── INSTANTIATE & EXPORT ALL TABLES ──────────────────────────────────────────
export const AshrayChecklist = new Table('AshrayChecklist');
export const AshrayLevels = new Table('AshrayLevels');
export const AshrayUpgradeRequests = new Table('AshrayUpgradeRequests');
export const AttendanceEvents = new Table('AttendanceEvents');
export const AttendanceParticipants = new Table('AttendanceParticipants');
export const AttendanceRecords = new Table('AttendanceRecords');
export const AttendanceSessions = new Table('AttendanceSessions');
export const AttendanceVolunteers = new Table('AttendanceVolunteers');
export const BvAttendance = new Table('BvAttendance');
export const BvGroupMembers = new Table('BvGroupMembers');
export const BvGroupRequests = new Table('BvGroupRequests');
export const BvGroups = new Table('BvGroups');
export const BvMemberRegistrations = new Table('BvMemberRegistrations');
export const BvQuizSubmissions = new Table('BvQuizSubmissions');
export const BvQuizzes = new Table('BvQuizzes');
export const BvSessions = new Table('BvSessions');
export const BvslPreachingEntries = new Table('BvslPreachingEntries');
export const BvslWeeklyPlans = new Table('BvslWeeklyPlans');
export const ChallengeEnrollments = new Table('ChallengeEnrollments');
export const CleanlinessInspections = new Table('CleanlinessInspections');
export const CleanlinessReviewRequests = new Table('CleanlinessReviewRequests');
export const CleanlinessRooms = new Table('CleanlinessRooms');
export const Config = new Table('Config');
export const FolkResidencies = new Table('FolkResidencies');
export const GuideTransferRequests = new Table('GuideTransferRequests');
export const GuideResidencyAssignmentRequests = new Table('GuideResidencyAssignmentRequests');
export const Guides = new Table('Guides');
export const JigyasaProcessedFiles = new Table('JigyasaProcessedFiles');
export const JigyasaRegistrations = new Table('JigyasaRegistrations');
export const JigyasaSessionAttendance = new Table('JigyasaSessionAttendance');

export const OneToOneMeetings = new Table('OneToOneMeetings');
export const PreachingReportGoals = new Table('PreachingReportGoals');
export const PushSubscriptions = new Table('PushSubscriptions');
export const RentPayments = new Table('RentPayments');
export const ResidencyTransferRequests = new Table('ResidencyTransferRequests');
export const SadhanaEntries = new Table('SadhanaEntries');
export const SadhanaFields = new Table('SadhanaFields');
export const SadhanaFieldsTable = SadhanaFields;
export const SadhanaMonthlySummaries = new Table('SadhanaMonthlySummaries');
export const ServiceAllocations = new Table('ServiceAllocations');
export const ServiceAvailability = new Table('ServiceAvailability');
export const ServicePreferences = new Table('ServicePreferences');
export const ServiceRatings = new Table('ServiceRatings');
export const ServiceSwaps = new Table('ServiceSwaps');
export const Services = new Table('Services');
export const SkillCatalog = new Table('SkillCatalog');
export const TagMangoSyncLog = new Table('TagMangoSyncLog');
export const Trips = new Table('Trips');
export const UnavailabilityRequests = new Table('UnavailabilityRequests');
export const UserSkills = new Table('UserSkills');
export const Meetings = new Table('Meetings');
export const MinutesOfMeeting = new Table('MinutesOfMeeting');
export const Users = new Table('Users');

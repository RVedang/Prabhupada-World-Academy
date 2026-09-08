/** Read-only dashboard benchmark. Uses the signed-in Firebase CLI identity.
 * Run: NODE_ENV=production npx tsx scripts/profileDashboard.ts
 * Reports counts, query shapes and hashes; never prints member records or tokens.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

async function main() {
  const config = JSON.parse(readFileSync(join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'configstore/firebase-tools.json'), 'utf8'));
  const accessToken = config.tokens?.access_token;
  if (!accessToken) throw new Error('Sign in with Firebase CLI before running this read-only benchmark.');
  const db = await import('../src/lib/app-backend-sdk');
  // HTTPS runs in developer environments that cannot reach Firestore over
  // gRPC. Preserve the production Table query semantics, including projections.
  const root = 'projects/bvpw108/databases/(default)/documents';
  const decode = (v: any): any => v.nullValue !== undefined ? null : v.arrayValue ? (v.arrayValue.values || []).map(decode) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)])) : v.integerValue !== undefined ? Number(v.integerValue) : v.doubleValue ?? v.booleanValue ?? v.stringValue ?? v.timestampValue ?? v.referenceValue;
  const encode = (v: any, field: string): any => Array.isArray(v) ? { arrayValue: { values: v.map(x => encode(x, field)) } } : v === null ? { nullValue: null } : field === 'id' ? { referenceValue: `${root}/${currentTable}/${v}` } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v };
  let currentTable = '';
  const { requestQuery, withRequestQueries } = await import('../src/lib/requestQueries');
  let traces: any[] = [];
  const read = async function (this: any, query: any = {}) {
    const started = performance.now();
    const filters: any[] = [];
    currentTable = this.tableName;
    const add = (field: string, op: string, value: any) => filters.push({ fieldFilter: { field: { fieldPath: field === 'id' ? '__name__' : field }, op, value: encode(value, field) } });
    const ops: Record<string, string> = { in: 'IN', gte: 'GREATER_THAN_OR_EQUAL', lte: 'LESS_THAN_OR_EQUAL', gt: 'GREATER_THAN', lt: 'LESS_THAN', neq: 'NOT_EQUAL', ne: 'NOT_EQUAL' };
    for (const [field, value] of Object.entries(query.id ? { id: query.id } : query.filters || {})) {
      if (value === undefined) continue;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [op, v] of Object.entries(value)) if (ops[op]) {
          if (op === 'in' && !(v as any[]).length) add(field, 'EQUAL', '__EMPTY_QUERY_RESULT__');
          else add(field, ops[op], op === 'in' ? (v as any[]).slice(0, 30) : v);
        }
      } else add(field, 'EQUAL', value);
    }
    const structuredQuery: any = { from: [{ collectionId: this.tableName }] };
    if (filters.length) structuredQuery.where = filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } };
    if (query.fields) structuredQuery.select = { fields: query.fields.filter((f: string) => f !== 'id').map((fieldPath: string) => ({ fieldPath })) };
    if (query.sorts?.length) structuredQuery.orderBy = query.sorts.map((s: any) => ({ field: { fieldPath: s.field }, direction: s.dir.toUpperCase() === 'DESC' ? 'DESCENDING' : 'ASCENDING' }));
    if (query.limit) structuredQuery.limit = Number(query.limit) + 1;
    if (query.offset) structuredQuery.offset = query.offset;
    const response = await fetch(`https://firestore.googleapis.com/v1/${root}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery }), signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      traces.push({ table: this.tableName, filters: Object.keys(query.filters || {}), failed: response.status, ms: Math.round(performance.now() - started) });
      throw new Error(`Firestore ${response.status}: ${(await response.text()).slice(0, 1200)}`);
    }
    const rows = await response.json();
    const records = rows.filter((r: any) => r.document).map((r: any) => ({ id: r.document.name.split('/').pop(), ...Object.fromEntries(Object.entries(r.document.fields || {}).map(([k, v]) => [k, decode(v)])) }));
    traces.push({ table: this.tableName, filters: Object.keys(query.filters || {}), fields: query.fields?.length || 0, rows: records.length, ms: Math.round(performance.now() - started) });
    return { records: query.limit ? records.slice(0, query.limit) : records, hasMore: !!query.limit && records.length > query.limit };
  };
  db.Table.prototype.findAll = async function (query: any = {}) {
    return requestQuery(this.tableName, 'findAll', query, () => read.call(this, query));
  };
  db.Table.prototype.findOne = async function (query: any) {
    return requestQuery(this.tableName, 'findOne', query, async () => (await read.call(this, { ...query, limit: 1 })).records[0]);
  };
  for (const operation of ['create', 'update', 'delete', 'bulkCreate'] as const) db.Table.prototype[operation] = async () => { throw new Error('Benchmark forbids database writes'); };
  const { buildApiUserContext } = await import('../src/lib/apiAuthorization');
  const { serverCacheInvalidate } = await import('../src/lib/serverCache');
  const candidates = (await db.Users.findAll({ filters: { status: 'Active' }, limit: 2000 })).records;
  const subjects = [
    { label: 'PW super admin', user: candidates.find(u => u.segment === 'PW' && (u.isBvSuperAdmin || u.role === 'SUPER_ADMIN')) },
    { label: 'PW admin', user: candidates.find(u => u.segment === 'PW' && !u.isBvSuperAdmin && ['ADMIN', 'PW_ADMIN'].includes(u.role)) },
    { label: 'FOLK guide', user: candidates.find(u => u.segment === 'FOLK' && ['GUIDE', 'Guide'].includes(u.role)) },
  ];
  const day = new Date(Date.now() + 5.5 * 3600000 - 86400000).toISOString().slice(0, 10);
  const weekStart = '2026-08-31', weekEnd = '2026-09-06';
  for (const { label, user } of subjects) {
    if (!user || (process.env.PERF_SUBJECT && !label.includes(process.env.PERF_SUBJECT))) continue;
    const context = { user: buildApiUserContext({ uid: user.firebaseUid || user.id, email: user.email, emailVerified: true }, user) };
    const segment = user.segment;
    const all = context.user?.capabilities.includes('*') || context.user?.role === 'SUPER_GUIDE';
    const scope = all ? 'ALL' : user.userId || user.id;
    const cases: Array<[string, Record<string, unknown>]> = [
      ['getGuideDetailedReport', { guideId: scope, date: day, reportType: 'daily', segment }],
      ['getBvSessionMatrix', { guideId: scope, startDate: weekStart, endDate: weekEnd, segment }],
      ['getGuideUsers', { guideId: 'ALL', statusFilter: 'all' }],
      [all ? 'getBvslGroups' : 'getAllBvGroupsAdmin', all ? { bvslId: 'ALL' } : { guideId: scope }],
      ['getMeetings', { department: segment }],
      ['getMoms', { department: segment }],
      ['getMissingSadhanaReport', { startDate: weekStart, endDate: weekEnd, segment }],
    ];
    for (const [name, input] of cases) {
      if (process.env.PERF_ENDPOINT && name !== process.env.PERF_ENDPOINT) continue;
      const endpoint = (await import(`../src/api/${name}`)).default;
      for (let visit = 1; visit <= 2; visit++) {
        if (visit === 1) serverCacheInvalidate();
        traces = [];
        const start = performance.now();
        try {
          const { result: output, metrics } = await withRequestQueries(() => endpoint.execute({ input, context }));
          const elapsed = performance.now() - start;
          const serializeAt = performance.now();
          const json = JSON.stringify(output);
          console.log(JSON.stringify({ subject: label, endpoint: name, visit, endpointMs: Math.round(elapsed), serializeMs: +(performance.now() - serializeAt).toFixed(2), bytes: Buffer.byteLength(json), hash: createHash('sha256').update(json).digest('hex'), queries: traces.length, rows: traces.reduce((n, q) => n + (q.rows || 0), 0), deduplicated: metrics.deduplicated, slowQueries: traces }));
        } catch (error) {
          console.log(JSON.stringify({ subject: label, endpoint: name, visit, error: error instanceof Error ? error.message : String(error) }));
        }
      }
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

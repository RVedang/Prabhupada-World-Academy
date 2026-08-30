import { ASHRAY_LEVELS } from '@/types/enums';

/**
 * CSV fields are the union of the FOLK "Create Your Account" form and the
 * FOLK branch of BvRegistrationModal. System-owned values (guide, role,
 * status and segment) are intentionally absent and are derived on the server.
 */
export const BULK_USER_CSV_FIELDS = [
  { key: 'email', label: 'Email', required: true },
  { key: 'fullName', label: 'Full Name', required: true },
  { key: 'phoneCountryCode', label: 'Phone Country Code', required: true },
  { key: 'phone', label: 'Phone Number', required: true },
  { key: 'selectedFolkResidency', label: 'FOLK Center ID or Name', required: true },
  { key: 'residencyUserClaim', label: 'Is FOLK Resident (Yes/No)', required: true },
  { key: 'residencyJoinDate', label: 'Residency Join Date (YYYY-MM-DD)', required: false },
  { key: 'ashrayLevel', label: 'Ashray Level', required: true },
  { key: 'whatsappCountryCode', label: 'WhatsApp Country Code', required: true },
  { key: 'whatsappNumber', label: 'WhatsApp Number', required: true },
  { key: 'address', label: 'Full Residential Address', required: true },
  { key: 'occupation', label: 'Occupation', required: true },
  { key: 'companyName', label: 'Company / Institution Name', required: true },
  { key: 'dob', label: 'Date of Birth (DD/MM/YYYY)', required: true },
  { key: 'gender', label: 'Gender', required: true },
  { key: 'dailyChantingRounds', label: 'Daily Chanting Rounds', required: true },
  { key: 'weeklyReadingHours', label: 'Weekly Reading (Minutes)', required: true },
  { key: 'weeklyHearingHours', label: 'Weekly Hearing (Minutes)', required: true },
  { key: 'inTouchWithTemple', label: 'In Touch With Temple (Yes/No)', required: true },
  { key: 'templeName', label: 'Temple Name', required: false },
  { key: 'devoteeName', label: 'Devotee Name', required: false },
  { key: 'timePreference', label: 'Reading Group Time Preference', required: true },
] as const;

export type BulkUserCsvField = (typeof BULK_USER_CSV_FIELDS)[number]['key'];
export type BulkUserCsvRow = Record<BulkUserCsvField, string>;

export const BULK_USER_CSV_HEADERS = BULK_USER_CSV_FIELDS.map(field => field.key);
export const BULK_USER_REQUIRED_HEADERS = BULK_USER_CSV_FIELDS.filter(field => field.required).map(field => field.key);
export const BULK_USER_MAX_RECORDS = 1000;
export const BULK_USER_MAX_FILE_BYTES = 5 * 1024 * 1024;

export const BULK_USER_ASHRAY_LEVELS = ['None', ...ASHRAY_LEVELS] as const;
export const BULK_USER_GENDERS = ['Male', 'Female', 'Other'] as const;
export const BULK_USER_COUNTRY_CODES = [
  '+91', '+1', '+44', '+971', '+65', '+61', '+60', '+94', '+977', '+880',
  '+49', '+33', '+81', '+86', '+7', '+55', '+27', '+64',
] as const;
export const BULK_USER_TIME_PREFERENCES = [
  '7:45 PM – 8:15 PM (Everyday)',
  '1:00 PM – 1:30 PM (Monday to Friday)',
  '8:30 PM – 9:00 PM (Monday to Friday)',
  '11:00 AM – 12:00 PM (Saturday & Sunday only)',
] as const;

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/** RFC 4180-compatible parser with quoted commas, newlines and escaped quotes. */
export function parseCsv(text: string): ParsedCsv {
  const source = text.replace(/^\uFEFF/, '');
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(value => value !== '')) matrix.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted value.');
  row.push(cell.trim());
  if (row.some(value => value !== '')) matrix.push(row);
  if (matrix.length === 0) throw new Error('CSV is empty.');

  const headers = matrix[0].map(header => header.trim());
  if (headers.some(header => !header)) throw new Error('CSV contains a blank column header.');
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicates.length) throw new Error(`CSV contains duplicate headers: ${[...new Set(duplicates)].join(', ')}`);

  const rows = matrix.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`Row ${index + 2} has ${values.length} columns; expected ${headers.length}.`);
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column] || '']));
  });
  if (rows.length === 0) throw new Error('CSV contains headers but no user records.');
  if (rows.length > BULK_USER_MAX_RECORDS) throw new Error(`A maximum of ${BULK_USER_MAX_RECORDS} users can be imported at once.`);
  return { headers, rows };
}

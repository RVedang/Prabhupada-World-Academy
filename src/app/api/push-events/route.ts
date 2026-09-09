import { NextResponse } from 'next/server';

/** Compatibility tombstone for old service workers. No identity lookup,
 * broadcast data, long-lived request or database polling is performed. */
export async function GET() {
  return NextResponse.json({ type: 'REALTIME_REQUIRED' }, {
    status: 410, headers: { 'Cache-Control': 'no-store' },
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { Users } from '@/lib/app-backend-sdk';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { timingSafeEqual } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  buildApiUserContext,
  hasApiCapabilities,
  type ApiCapability,
  type ApiDatabaseUser,
  type ApiUserContext,
} from '@/lib/apiAuthorization';

interface EndpointSchema {
  safeParse(input: unknown):
    | { success: true; data: unknown }
    | { success: false; error: { errors: unknown } };
}

interface EndpointConfig {
  public?: boolean;
  publicSecretEnv?: string;
  requiredCapabilities?: ApiCapability | ApiCapability[];
  maxBodyBytes?: number;
  inputSchema?: EndpointSchema;
  execute(args: { input: unknown; context: { user: ApiUserContext | null } }): Promise<unknown> | unknown;
}

function errorDetails(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
    return { message: error.message, code };
  }
  return { message: 'Internal Server Error' };
}

// Initialize Firebase Admin safely
const apps = getApps();
if (apps.length === 0) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'bvpw108';
  const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
  let initialized = false;

  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      if (serviceAccount.private_key && serviceAccount.private_key.includes('BEGIN') && !serviceAccount.private_key.includes('dummy')) {
        initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id || projectId
        });
        initialized = true;
      }
    } catch {
      console.warn('[Firebase Admin Route] Failed to initialize using local file, using project ID fallback.');
    }
  }
  
  if (!initialized && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (serviceAccount.private_key && serviceAccount.private_key.includes('BEGIN') && !serviceAccount.private_key.includes('dummy')) {
        initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id || projectId
        });
        initialized = true;
      }
    } catch {
      console.warn('[Firebase Admin Route] Failed to initialize using env var, using project ID fallback.');
    }
  }

  if (!initialized && getApps().length === 0) {
    try {
      initializeApp({ projectId });
    } catch (e) {
      console.error('[Firebase Admin Route] Fallback initializeApp failed:', e);
    }
  }
}

async function verifyToken(token: string): Promise<{ email: string; uid: string; emailVerified: boolean }> {
  // Support Mock auth token for local offline development
  if (token.startsWith('mock_token_for_')) {
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_USE_AUTH_EMULATOR !== 'true') {
      throw new Error('Unauthorized: Mock tokens are forbidden in production.');
    }
    const email = token.replace('mock_token_for_', '');
    if (!email) throw new Error('Unauthorized: Mock token has no email.');
    return { email, uid: email, emailVerified: true };
  }

  // When using the Firebase Auth emulator locally, tokens are NOT signed with
  // Google's real private keys (no 'kid' claim), so verifyIdToken() fails.
  // Instead, decode the JWT payload directly — this is safe since we trust the
  // local emulator environment.
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    const parts = token.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        const email = payload.email || payload.firebase?.identities?.email?.[0] || null;
        const uid = payload.sub || payload.user_id || payload.uid;
        if (uid && email) return { email, uid, emailVerified: payload.email_verified !== false };
      } catch {}
    }
  }

  // If Firebase Admin is initialized, verify the ID Token (production path)
  const activeApps = getApps();
  if (activeApps.length > 0) {
    const decoded = await getAuth().verifyIdToken(token);
    if (!decoded.email) throw new Error('Unauthorized: An email address is required.');
    return {
      email: decoded.email,
      uid: decoded.uid,
      emailVerified: decoded.email_verified === true,
    };
  }

  // Fallback JWT payload decoder for local testing without Admin credentials
  if (process.env.NODE_ENV === 'development') {
    const parts = token.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        const email = payload.email || null;
        const uid = payload.sub || payload.user_id;
        if (email && uid) return { email, uid, emailVerified: payload.email_verified !== false };
      } catch {}
    }
  }

  throw new Error('Authentication verification not configured. Check process.env.FIREBASE_SERVICE_ACCOUNT.');
}

function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function verifyPublicEndpointSecret(req: NextRequest, endpointConfig: EndpointConfig): boolean {
  const secretEnv = endpointConfig.publicSecretEnv;
  if (!secretEnv) return true;

  const expected = process.env[secretEnv] || '';
  if (!expected) return false;

  const provided =
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-api-secret') ||
    '';

  return !!provided && secretsMatch(provided, expected);
}

// Sliding window in-memory rate limiter per key (max 60 requests per minute for IPs, 180 for authenticated keys)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(key: string, limit: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= limit) {
    return true;
  }

  entry.count++;
  return false;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ endpoint: string }> }
) {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const rateLimitKey = token ? `token:${token.slice(-30)}` : `ip:${req.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1'}`;
  const limit = token ? 180 : 60;

  if (process.env.NODE_ENV !== 'development' && isRateLimited(rateLimitKey, limit)) {
    return NextResponse.json(
      { message: 'Too many requests. Please slow down and try again.' },
      { status: 429 }
    );
  }

  const { endpoint } = await params;

  // Prevent path traversal and importing anything outside the endpoint module namespace.
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(endpoint)) {
    return NextResponse.json({ message: 'Invalid endpoint' }, { status: 404 });
  }

  try {
    // 1. Dynamic import of the requested endpoint file
    let endpointConfig: EndpointConfig;
    try {
      endpointConfig = (await import(`@/api/${endpoint}`)).default as EndpointConfig;
    } catch (error: unknown) {
      console.error(`[API Router] Endpoint not found: ${endpoint}`, error);
      return NextResponse.json(
        { message: `Endpoint ${endpoint} not found or failed to load.` },
        { status: 404 }
      );
    }

    const contentLength = Number(req.headers.get('content-length') || 0);
    const maxBodyBytes = endpointConfig.maxBodyBytes || 1_000_000;
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      return NextResponse.json({ message: 'Request body is too large' }, { status: 413 });
    }

    // Public access must be explicitly declared. Missing configuration is private.
    const isPublicEndpoint = endpointConfig.public === true;

    if (isPublicEndpoint && !verifyPublicEndpointSecret(req, endpointConfig)) {
      return NextResponse.json(
        { message: 'Public endpoint authentication failed' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    let body = {};
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json().catch(() => ({}));
    }

    // 3. Setup context
    const context: { user: ApiUserContext | null } = { user: null };

    if (token) {
      try {
        const decodedUser = await verifyToken(token);
        if (!decodedUser.emailVerified) {
          return NextResponse.json({ message: 'A verified email is required' }, { status: 403 });
        }

        const emailLower = decodedUser.email.toLowerCase();
        const uidRecord = await Users.findOne({ id: decodedUser.uid }).catch(() => null);
        const uidRecordIsProfile = !!(uidRecord?.userId && uidRecord?.status);
        let dbUser: ApiDatabaseUser | null = uidRecordIsProfile ? uidRecord : null;

        if (!dbUser) {
          dbUser = await Users.findOne({ filters: { firebaseUid: decodedUser.uid } }).catch(() => null);
        }
        if (!dbUser) {
          const [exactEmailMatches, lowerEmailMatches] = await Promise.all([
            Users.findAll({ filters: { email: decodedUser.email }, limit: 10 }).catch(() => ({ records: [] })),
            Users.findAll({ filters: { email: emailLower }, limit: 10 }).catch(() => ({ records: [] })),
          ]);
          const emailCandidates = [...(exactEmailMatches.records || []), ...(lowerEmailMatches.records || [])]
            .filter((record, index, records) => records.findIndex(item => item.id === record.id) === index);
          dbUser = emailCandidates.find(record => record.userId && record.status) || emailCandidates[0] || uidRecord || null;
        }

        // Bulk-created profiles exist before the member's first Google login.
        // Link the verified Firebase UID to the email-matched profile so every
        // later request resolves directly, while preserving the existing user
        // document ID referenced by assignments and BV records.
        if (dbUser?.id && dbUser.id !== decodedUser.uid && (dbUser as any).firebaseUid !== decodedUser.uid) {
          await Users.update({
            id: dbUser.id,
            record: { firebaseUid: decodedUser.uid, authLinkedAt: new Date().toISOString() },
          });
          (dbUser as any).firebaseUid = decodedUser.uid;

          // Authentication sync may have created a bare UID document before
          // this first API request. Once its verified email is linked to the
          // complete imported profile, remove only that incomplete duplicate.
          if (uidRecord?.id === decodedUser.uid && !uidRecordIsProfile && uidRecord.id !== dbUser.id) {
            await Users.delete({ id: uidRecord.id }).catch(() => undefined);
          }
        }

        context.user = buildApiUserContext(decodedUser, dbUser);
      } catch (authError: unknown) {
        const authFailure = errorDetails(authError);
        console.error('[API Router] Authentication error:', authError);
        // Never fail open when a caller presents an invalid token, even for a public endpoint.
        return NextResponse.json(
          { message: authFailure.message || 'Unauthorized' },
          { status: 401 }
        );
      }
    } else if (!isPublicEndpoint) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }

    const requiredCapabilities = endpointConfig.requiredCapabilities as ApiCapability | ApiCapability[] | undefined;
    if (!hasApiCapabilities(context.user, requiredCapabilities)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // 4. Input validation using Zod schema defined in endpoint
    let validatedInput: unknown = body;
    if (endpointConfig.inputSchema) {
      const parseResult = endpointConfig.inputSchema.safeParse(body);
      if (!parseResult.success) {
        return NextResponse.json(
          { message: 'Validation failed', errors: parseResult.error.errors },
          { status: 400 }
        );
      }
      validatedInput = parseResult.data;
    }

    // 5. Execute endpoint handler
    const output = await endpointConfig.execute({ input: validatedInput, context });

    // 6. Return response
    return NextResponse.json(output);

  } catch (error: unknown) {
    const failure = errorDetails(error);
    console.error(`[API Router] Error running ${endpoint}:`, error);
    
    // Check if it is a AppError or contains code property
    const statusByCode: Record<string, number> = {
      BAD_REQUEST: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      TOO_MANY_REQUESTS: 429,
    };
    const status = (failure.code && statusByCode[failure.code]) || 500;
    return NextResponse.json(
      { message: failure.message, code: failure.code || 'INTERNAL_ERROR' },
      { status }
    );
  }
}

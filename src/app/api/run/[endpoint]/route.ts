import { NextRequest, NextResponse } from 'next/server';
import { Users } from '@/lib/app-backend-sdk';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

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
    } catch (e) {
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
    } catch (e) {
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

async function verifyToken(token: string): Promise<{ email: string | null; uid: string }> {
  // Support Mock auth token for local offline development
  if (token.startsWith('mock_token_for_')) {
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_USE_AUTH_EMULATOR !== 'true') {
      throw new Error('Unauthorized: Mock tokens are forbidden in production.');
    }
    const email = token.replace('mock_token_for_', '');
    return { email, uid: email };
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
        if (uid) return { email, uid };
      } catch {}
    }
  }

  // If Firebase Admin is initialized, verify the ID Token (production path)
  const activeApps = getApps();
  if (activeApps.length > 0) {
    const decoded = await getAuth().verifyIdToken(token);
    return { email: decoded.email || null, uid: decoded.uid };
  }

  // Fallback JWT payload decoder for local testing without Admin credentials
  if (process.env.NODE_ENV === 'development') {
    const parts = token.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        return { email: payload.email || null, uid: payload.sub || payload.user_id };
      } catch {}
    }
  }

  throw new Error('Authentication verification not configured. Check process.env.FIREBASE_SERVICE_ACCOUNT.');
}

// Sliding window in-memory rate limiter per IP (max 60 requests per minute)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }

  entry.count++;
  return false;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ endpoint: string }> }
) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';
  if (process.env.NODE_ENV !== 'development' && isRateLimited(clientIp)) {
    return NextResponse.json(
      { message: 'Too many requests. Please slow down and try again.' },
      { status: 429 }
    );
  }

  const { endpoint } = await params;

  try {
    // 1. Dynamic import of the requested endpoint file
    let endpointConfig;
    try {
      endpointConfig = (await import(`@/api/${endpoint}`)).default;
    } catch (e: any) {
      console.error(`[API Router] Endpoint not found: ${endpoint}`, e);
      return NextResponse.json(
        { message: `Endpoint ${endpoint} not found or failed to load.` },
        { status: 404 }
      );
    }

    // 2. Parse request body
    let body = {};
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json().catch(() => ({}));
    }

    // 3. Setup context
    let context: any = { user: null };

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (token) {
      try {
        const decodedUser = await verifyToken(token);
        
        let dbUser = null;
        if (decodedUser.email) {
          const emailLower = decodedUser.email.toLowerCase();
          dbUser = await Users.findOne({ filters: { email: decodedUser.email } }).catch(() => null) ||
                   await Users.findOne({ filters: { email: emailLower } }).catch(() => null);
        }

        const emailLower = (decodedUser.email || '').toLowerCase();
        const isKnownSuperAdmin = !!(
          emailLower === 'srilaprabhupadaworld@gmail.com' ||
          emailLower === 'vdnd@hkmmumbai.org' ||
          emailLower.includes('gaurmandal') ||
          emailLower.includes('superadmin')
        );
        const isKnownAdmin = !!(
          isKnownSuperAdmin ||
          emailLower === 'admin@prabhupadaworld.org' ||
          emailLower === 'folkadmin@folk.org' ||
          emailLower.includes('admin')
        );

        if (dbUser) {
          const dbRole = (dbUser.role || '').toUpperCase();
          const isSuperAdmin = !!(
            isKnownSuperAdmin ||
            dbUser.isBvSuperAdmin ||
            dbRole.includes('SUPER')
          );
          const isAdmin = !!(
            isKnownAdmin ||
            isSuperAdmin ||
            dbUser.isBvAdmin ||
            dbRole.includes('ADMIN') ||
            dbRole.includes('GUIDE')
          );

          context.user = {
            id: dbUser.id,
            email: dbUser.email || decodedUser.email,
            role: dbUser.role || (isSuperAdmin ? 'Super Admin' : (isAdmin ? 'Admin' : 'User')),
            isBvAdmin: isAdmin,
            isBvSuperAdmin: isSuperAdmin,
            isBvSupervisor: !!dbUser.isBvSupervisor,
            isBvMentor: !!dbUser.isBvMentor,
            isBvFacilitator: !!dbUser.isBvFacilitator,
            isBvSubFacilitator: !!dbUser.isBvSubFacilitator,
            isBvsl: !!dbUser.isBvsl,
            segment: dbUser.segment || null,
            userId: dbUser.userId || dbUser.id,
          };
        } else {
          let userRole = isKnownSuperAdmin ? 'Super Admin' : (isKnownAdmin ? 'Admin' : 'User');
          try {
            const { records } = await Users.findAll({ limit: 1 });
            if (records.length === 0) {
              userRole = 'Super Guide';
            }
          } catch (e) {}

          context.user = {
            id: decodedUser.uid,
            email: decodedUser.email,
            role: userRole,
            isBvAdmin: isKnownAdmin || isKnownSuperAdmin || userRole === 'Super Guide',
            isBvSuperAdmin: isKnownSuperAdmin || userRole === 'Super Guide',
            isBvSupervisor: false,
            isBvMentor: false,
            isBvFacilitator: false,
            isBvSubFacilitator: false,
            isBvsl: false,
            segment: null,
            userId: decodedUser.uid,
          };
        }
      } catch (authError: any) {
        console.error('[API Router] Authentication error:', authError);
        if (endpointConfig.authenticated) {
          return NextResponse.json(
            { message: authError.message || 'Unauthorized' },
            { status: 401 }
          );
        }
      }
    } else if (endpointConfig.authenticated) {
      return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
    }

    // 4. Input validation using Zod schema defined in endpoint
    let validatedInput = body;
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

  } catch (error: any) {
    console.error(`[API Router] Error running ${endpoint}:`, error);
    
    // Check if it is a AppError or contains code property
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 500;
    return NextResponse.json(
      { message: error.message || 'Internal Server Error', code: error.code || 'INTERNAL_ERROR' },
      { status }
    );
  }
}

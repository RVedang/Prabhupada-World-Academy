import { firebaseApp } from './app-auth-sdk';

let connection: Promise<{ firestore: typeof import('firebase/firestore'); db: import('firebase/firestore').Firestore }> | undefined;

/** One Firestore instance and SDK-managed shared multi-tab transport. */
export function getRealtimeFirestore() {
  if (!connection) connection = (async () => {
    const firestore = await import('firebase/firestore');
    if (!firebaseApp) throw new Error('Firebase is not configured');
    let db;
    try {
      db = firestore.initializeFirestore(firebaseApp, {
        localCache: firestore.persistentLocalCache({ tabManager: firestore.persistentMultipleTabManager() }),
      });
      if (process.env.NEXT_PUBLIC_USE_AUTH_EMULATOR === 'true') {
        firestore.connectFirestoreEmulator(db, '127.0.0.1', 8080);
      }
    } catch {
      db = firestore.getFirestore(firebaseApp);
    }
    return { firestore, db };
  })().catch(error => { connection = undefined; throw error; });
  return connection;
}

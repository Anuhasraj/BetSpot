import { initializeApp } from 'firebase/app';
import { Analytics, getAnalytics, isSupported } from 'firebase/analytics';
import { Auth, getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, Firestore, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId || '(default)';

export const app = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore =
  FIRESTORE_DATABASE_ID === '(default)'
    ? getFirestore(app)
    : getFirestore(app, FIRESTORE_DATABASE_ID);
export let analytics: Analytics | null = null;
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  void isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {});
}
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface FirestoreConnectionResult {
  ok: boolean;
  offline: boolean;
  checkedAt: number;
  message?: string;
}

let lastConnectionCheck: FirestoreConnectionResult | null = null;

export function getLastConnectionCheck(): FirestoreConnectionResult | null {
  return lastConnectionCheck;
}

export async function testConnection(): Promise<FirestoreConnectionResult> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    lastConnectionCheck = {
      ok: true,
      offline: false,
      checkedAt: Date.now(),
    };
    return lastConnectionCheck;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const offline = msg.includes('the client is offline');
    if (offline) {
      console.error('Please check your Firebase configuration.');
    }
    lastConnectionCheck = {
      ok: !offline,
      offline,
      checkedAt: Date.now(),
      message: msg,
    };
    return lastConnectionCheck;
  }
}

if (typeof window !== 'undefined') {
  void testConnection();
}

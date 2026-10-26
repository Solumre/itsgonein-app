import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const projectId = process.env.FIREBASE_PROJECT_ID || 'itgonein';
const emulated = !!process.env.FIRESTORE_EMULATOR_HOST;

// Production: FIREBASE_SERVICE_ACCOUNT holds the service account JSON (Render env var).
let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
else if (!emulated) credential = applicationDefault();

initializeApp({ projectId, ...(credential && { credential }) });

export const db = getFirestore();
export const auth = getAuth();
export { FieldValue, Timestamp };

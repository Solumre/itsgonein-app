import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// Firebase web config is public by design; access is controlled by firestore.rules.
const config = {
  apiKey: 'AIzaSyDCgBUGV4WWYMPVCelPFvfo3UyH5KrgWE4',
  authDomain: 'itgonein.firebaseapp.com',
  projectId: 'itgonein',
  storageBucket: 'itgonein.firebasestorage.app',
  messagingSenderId: '869060537900',
  appId: '1:869060537900:web:ed227fcbe2d64a6286ab89',
};

export const emulated = import.meta.env.VITE_USE_EMULATORS === '1';
const app = initializeApp(emulated ? { ...config, projectId: 'demo-itgonein' } : config);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

if (emulated) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

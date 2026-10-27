import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signInWithCredential, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider, emulated } from './firebase';
import { applyTheme, savedTheme } from './clubs';

// Only shows the Admin link; the server checks admin rights itself.
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || 'tm@solumre.com').toLowerCase().split(',').map((e) => e.trim());

const Session = createContext(null);
export const useSession = () => useContext(Session);

export async function signIn() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, googleProvider);
    } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      throw e;
    }
  }
}
export const logOut = () => signOut(auth);

// Local testing against the emulators: sign in as anyone without a Google popup.
if (emulated && typeof window !== 'undefined') {
  window.__devSignIn = (email) => signInWithCredential(auth,
    GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
}

export function SessionProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading
  // Snapshots tagged with the uid they belong to, so a stale one never shows for a new user.
  const [profileSnap, setProfileSnap] = useState({ uid: null });
  const [privSnap, setPrivSnap] = useState({ uid: null });
  const [themePref, setThemePref] = useState(() => savedTheme().pref || 'dark');
  const [previewClub, setPreviewClub] = useState(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user) return undefined;
    const { uid } = user;
    const offA = onSnapshot(doc(db, 'users', uid),
      (s) => setProfileSnap({ uid, data: s.exists() ? { id: s.id, ...s.data() } : null }),
      () => setProfileSnap({ uid, data: null }));
    const offB = onSnapshot(doc(db, 'private', uid),
      (s) => setPrivSnap({ uid, data: s.exists() ? s.data() : null }),
      () => setPrivSnap({ uid, data: null }));
    return () => { offA(); offB(); };
  }, [user]);

  const profile = !user ? (user === null ? null : undefined) : profileSnap.uid === user.uid ? profileSnap.data : undefined;
  const priv = !user ? (user === null ? null : undefined) : privSnap.uid === user.uid ? privSnap.data : undefined;

  const club = previewClub || profile?.club || (profile === undefined ? savedTheme().club : null) || null;
  useEffect(() => { applyTheme(club, themePref); }, [club, themePref]);
  useEffect(() => {
    if (themePref !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => applyTheme(club, 'system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [club, themePref]);

  const value = useMemo(() => {
    const loading = user === undefined || (user && (profile === undefined || priv === undefined));
    const consent = priv?.consent;
    return {
      user, profile, priv, loading,
      needsProfile: !!user && profile === null,
      canSocial: consent === 'not_needed' || consent === 'approved',
      isAdmin: !!user?.email && user.emailVerified && ADMIN_EMAILS.includes(user.email.toLowerCase()),
      themePref, setThemePref, setPreviewClub,
    };
  }, [user, profile, priv, themePref]);

  return <Session.Provider value={value}>{children}</Session.Provider>;
}

// Kick-off reminders via Firebase Cloud Messaging (web push).
import { getMessaging, getToken, deleteToken, isSupported, onMessage } from 'firebase/messaging';
import { app, emulated } from './firebase';
import { api } from './api';

const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY;

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// 'ok' | 'ios-install' (iPhone: only works once added to the Home Screen) | 'denied' | 'unsupported'
export async function pushStatus() {
  if (emulated || !VAPID_KEY || !('serviceWorker' in navigator)) return 'unsupported';
  if (isIOS() && !isInstalled()) return 'ios-install';
  if (!(await isSupported().catch(() => false))) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

export const permissionGranted = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';

async function deviceToken() {
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  return getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
}

export async function enableReminders() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. You can allow them in your browser or phone settings.');
  const token = await deviceToken();
  await api('/api/me/reminders', { method: 'POST', body: { on: true, token } });
}

export async function disableReminders() {
  let token = null;
  if (permissionGranted() && (await pushStatus()) === 'ok') {
    try {
      token = await deviceToken();
      await deleteToken(getMessaging(app));
    } catch { /* already gone */ }
  }
  await api('/api/me/reminders', { method: 'POST', body: { on: false, token } });
}

// While the app is open, show reminders as an in-app toast instead.
export async function listenInApp(show) {
  if ((await pushStatus()) !== 'ok' || !permissionGranted()) return () => {};
  return onMessage(getMessaging(app), (msg) => show(`${msg.notification?.title || ''} ${msg.notification?.body || ''}`.trim()));
}

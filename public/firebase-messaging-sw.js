/* Shows kick-off reminders when the app isn't open. Must live at the site root. */
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDCgBUGV4WWYMPVCelPFvfo3UyH5KrgWE4',
  authDomain: 'itgonein.firebaseapp.com',
  projectId: 'itgonein',
  storageBucket: 'itgonein.firebasestorage.app',
  messagingSenderId: '869060537900',
  appId: '1:869060537900:web:ed227fcbe2d64a6286ab89',
});

// Messages carry a `notification`, so Firebase displays them and opens the link on tap.
firebase.messaging();

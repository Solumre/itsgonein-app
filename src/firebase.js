import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDCgBUGV4WWYMPVCelPFvfo3UyH5KrgWE4",
  authDomain: "itgonein.firebaseapp.com",
  projectId: "itgonein",
  storageBucket: "itgonein.firebasestorage.app",
  messagingSenderId: "869060537900",
  appId: "1:869060537900:web:ed227fcbe2d64a6286ab89",
  measurementId: "G-NTB13JDT18"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
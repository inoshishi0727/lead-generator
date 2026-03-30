import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyC_5PI1todAdyCfswIanrELIMDU2kqFaMQ",
  authDomain: "asterley-bros-b29c0.firebaseapp.com",
  projectId: "asterley-bros-b29c0",
  storageBucket: "asterley-bros-b29c0.firebasestorage.app",
  messagingSenderId: "963258714410",
  appId: "1:963258714410:web:62b8cc341496f83c6f3653",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);

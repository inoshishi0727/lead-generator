import { initializeApp, getApps } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// In emulator mode we use a separate project id so demo data never
// risks colliding with prod credentials cached in the browser, and so
// the seed script (which writes with "demo-asterley") and the frontend
// land in the same logical emulator namespace.
const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

const firebaseConfig = {
  apiKey: "AIzaSyC_5PI1todAdyCfswIanrELIMDU2kqFaMQ",
  authDomain: "asterley-bros-b29c0.firebaseapp.com",
  projectId: USE_EMULATORS ? "demo-asterley" : "asterley-bros-b29c0",
  storageBucket: "asterley-bros-b29c0.firebasestorage.app",
  messagingSenderId: "963258714410",
  appId: "1:963258714410:web:62b8cc341496f83c6f3653",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);

// Demo / emulator mode. Set NEXT_PUBLIC_USE_EMULATORS=true in .env.local
// before `npm run dev`. Firebase ports must match firebase.json (firestore
// 8080, functions 5001, auth 9099). singleProjectMode in firebase.json means
// project id ("demo-asterley") doesn't matter at runtime.
if (USE_EMULATORS) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}

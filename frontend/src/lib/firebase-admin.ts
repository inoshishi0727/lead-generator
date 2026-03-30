import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  return initializeApp({
    projectId: "asterley-bros-b29c0",
  });
}

const adminApp = getAdminApp();
export const adminDb = getFirestore(adminApp);

import { initializeApp, getApps, cert, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "asterley-bros-b29c0";

function parseServiceAccount(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const json = trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8");
  return JSON.parse(json);
}

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const keyRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (keyRaw) {
    const serviceAccount = parseServiceAccount(keyRaw);
    return initializeApp({
      credential: cert(serviceAccount as Parameters<typeof cert>[0]),
      projectId: PROJECT_ID,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  });
}

const adminApp = getAdminApp();
export const adminDb = getFirestore(adminApp);

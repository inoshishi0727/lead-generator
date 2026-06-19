// Read-only user inspection. No writes, no password access (Firebase stores
// only scrypt hashes — not retrievable). Usage:
//   node diag-read-user.mjs <email-or-uid>
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node diag-read-user.mjs <email-or-uid>");
    process.exit(1);
  }

  // Resolve auth record (email contains "@", otherwise treat as uid)
  const record = arg.includes("@")
    ? await auth.getUserByEmail(arg)
    : await auth.getUser(arg);

  console.log("=== Auth record ===");
  console.log(JSON.stringify({
    uid: record.uid,
    email: record.email,
    emailVerified: record.emailVerified,
    displayName: record.displayName,
    disabled: record.disabled,
    createdAt: record.metadata.creationTime,
    lastSignIn: record.metadata.lastSignInTime,
    providers: record.providerData.map((p) => p.providerId),
    customClaims: record.customClaims || null,
  }, null, 2));

  // Firestore user profile doc (keyed by uid per `users` collection)
  const userDoc = await db.collection("users").doc(record.uid).get();
  console.log("\n=== Firestore users/" + record.uid + " ===");
  console.log(userDoc.exists ? JSON.stringify(userDoc.data(), null, 2) : "(no doc)");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

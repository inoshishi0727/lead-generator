// Mint a Firebase custom token for support impersonation. NOT a password —
// a short-lived (~1h) sign-in token. Use with signInWithCustomToken() client-side.
// Usage: node diag-mint-token.mjs <email-or-uid>
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const auth = getAuth(app);

async function main() {
  const arg = process.argv[2];
  if (!arg) { console.error("Usage: node diag-mint-token.mjs <email-or-uid>"); process.exit(1); }

  const record = arg.includes("@") ? await auth.getUserByEmail(arg) : await auth.getUser(arg);
  const token = await auth.createCustomToken(record.uid);

  console.log(`uid:   ${record.uid}`);
  console.log(`email: ${record.email}`);
  console.log(`token: ${token}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

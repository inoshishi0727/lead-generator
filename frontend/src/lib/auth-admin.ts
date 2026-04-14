/**
 * Client-side user management using Firebase Auth + Firestore directly.
 * No backend needed.
 */
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  getAuth,
  signOut,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { initializeApp, deleteApp } from "firebase/app";
import {
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./firebase";

export interface InviteResult {
  uid: string;
  email: string;
  tempPassword: string;
}

/**
 * Invite a new user: create their Firebase Auth account + Firestore profile.
 *
 * We create a secondary Firebase app instance to avoid signing out the current admin.
 * Then we create the user, save their profile to Firestore, and clean up.
 */
export async function inviteUser(
  email: string,
  displayName: string,
  role: "admin" | "member" | "viewer",
  workspaceId: string
): Promise<InviteResult> {
  // Generate a temp password
  const tempPassword = generateTempPassword();

  // Create a secondary Firebase app so we don't sign out the current user
  const secondaryApp = initializeApp(
    {
      apiKey: "AIzaSyC_5PI1todAdyCfswIanrELIMDU2kqFaMQ",
      authDomain: "asterley-bros-b29c0.firebaseapp.com",
      projectId: "asterley-bros-b29c0",
    },
    "secondary-" + Date.now()
  );
  const secondaryAuth = getAuth(secondaryApp);

  try {
    // Create the user in Firebase Auth via the secondary app
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      tempPassword
    );
    const uid = cred.user.uid;

    // Sign out from secondary immediately
    await signOut(secondaryAuth);

    // Create Firestore user profile (using the main app's Firestore)
    await setDoc(doc(db, "users", uid), {
      uid,
      email,
      display_name: displayName || email.split("@")[0],
      role,
      workspace_id: workspaceId,
      created_at: new Date().toISOString(),
    });

    // Send password reset email so they set their own password
    await sendPasswordResetEmail(auth, email);

    // Clean up secondary app
    await deleteApp(secondaryApp);

    return { uid, email, tempPassword };
  } catch (error) {
    // Clean up on failure
    try {
      await deleteApp(secondaryApp);
    } catch {}
    throw error;
  }
}

export async function getTeamMembers(
  workspaceId: string
): Promise<
  { uid: string; email: string; display_name: string; role: string }[]
> {
  if (!workspaceId) return [];

  const q = query(
    collection(db, "users"),
    where("workspace_id", "==", workspaceId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: data.uid || d.id,
      email: data.email || "",
      display_name: data.display_name || "",
      role: data.role || "viewer",
    };
  });
}

export async function removeTeamMember(uid: string): Promise<void> {
  // Call Cloud Function to delete both Auth user and Firestore profile
  const fn = httpsCallable<{ uid: string }, { status: string }>(functions, "deleteUser");
  await fn({ uid });
}

function generateTempPassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  let password = "";
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

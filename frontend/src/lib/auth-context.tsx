"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export type UserRole = "admin" | "viewer";

interface AuthState {
  user: User | null;
  role: UserRole | null;
  workspaceId: string | null;
  displayName: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  workspaceId: null,
  displayName: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  isAdmin: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Fetch user profile from Firestore
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setRole(data.role as UserRole);
            setWorkspaceId(data.workspace_id ?? null);
            setDisplayName(data.display_name ?? firebaseUser.email);
          } else {
            // User exists in Auth but no Firestore profile yet
            setRole("viewer");
            setWorkspaceId(null);
            setDisplayName(firebaseUser.email);
          }
        } catch {
          setRole("viewer");
          setDisplayName(firebaseUser.email);
        }
      } else {
        setUser(null);
        setRole(null);
        setWorkspaceId(null);
        setDisplayName(null);
        if (pathname !== "/login") {
          router.replace("/login");
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [pathname, router]);

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
    router.replace("/");
  }

  async function signOut() {
    await fbSignOut(auth);
    router.replace("/login");
  }

  const isAdmin = role === "admin";

  return (
    <AuthContext.Provider
      value={{ user, role, workspaceId, displayName, loading, signIn, signOut, isAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

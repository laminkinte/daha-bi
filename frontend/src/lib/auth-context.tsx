"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api, setToken, type User } from "./api";

/** Sign-up choice: a personal account, or an organization account named after the company. */
export type AccountChoice = { type: "personal" | "organization"; organizationName?: string };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, next?: string | null) => Promise<void>;
  register: (name: string, email: string, password: string, referralCode?: string, next?: string | null, account?: AccountChoice) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Only same-site paths ("/share/abc"), never "//evil.com" or absolute URLs — no open redirects. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboards";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = window.localStorage.getItem("daha_bi_token");
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .get<User>("/user")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string, next?: string | null) {
    const res = await api.post<{ user: User; token: string }>("/login", {
      email,
      password,
    });
    setToken(res.token);
    setUser(res.user);
    router.push(safeNext(next));
  }

  async function register(name: string, email: string, password: string, referralCode?: string, next?: string | null, account?: AccountChoice) {
    const res = await api.post<{ user: User; token: string }>("/register", {
      name,
      email,
      password,
      referral_code: referralCode || undefined,
      account_type: account?.type,
      organization_name: account?.type === "organization" ? account.organizationName : undefined,
    });
    setToken(res.token);
    setUser(res.user);
    router.push(safeNext(next));
  }

  async function logout() {
    try {
      await api.post("/logout");
    } catch {
      // token already invalid; proceed to clear local state regardless
    }
    setToken(null);
    setUser(null);
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

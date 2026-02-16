"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Role, UserSession } from "@/lib/types";
import { clearSession, getSession, setSession, updateRole } from "@/lib/session";
import { apiFetch } from "@/lib/api";

type AuthCtx = {
  session: UserSession | null;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setRole: (role: Role) => void;
};

const Ctx = createContext<AuthCtx | null>(null);

const mapRole = (r: string) => {
  if (r === "admin") return "Admin" as const;
  if (r === "program_manager") return "Program Manager" as const;
  if (r === "advisor") return "Advisor" as const;
  if (r === "donor") return "Donor" as const;
  return null;
};

const pickPrimaryRole = (roles: Role[]) => {
  if (roles.includes("Admin")) return "Admin";
  if (roles.includes("Program Manager")) return "Program Manager";
  if (roles.includes("Advisor")) return "Advisor";
  if (roles.includes("Donor")) return "Donor";
  return roles[0] ?? "Donor";
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionState, setSessionState] = useState<UserSession | null>(null);
  const [isReady, setReady] = useState(false);

  useEffect(() => {
    setSessionState(getSession());
    setReady(true);
  }, []);

  const login = async (email: string, password: string) => {
    // 1) login -> token
    const tok = await apiFetch<{ access_token: string; token_type: string }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
      false
    );

    // 2) me -> user info + roles (use token directly)
    const me = await apiFetch<{ user_id: string; email: string; full_name: string | null; roles: string[] }>(
      "/auth/me",
      { method: "GET", headers: { Authorization: `Bearer ${tok.access_token}` } },
      false
    );

    const mapped = me.roles.map(mapRole).filter(Boolean) as Role[];
    const primary = pickPrimaryRole(mapped);

    const s: UserSession = {
      user_id: me.user_id,
      email: me.email,
      name: me.full_name ?? me.email.split("@")[0],
      role: primary,
      roles: mapped,
      access_token: tok.access_token,
    };

    setSession(s);
    setSessionState(s);
  };

  const logout = () => {
    clearSession();
    setSessionState(null);
  };

  const setRoleFn = (role: Role) => {
    updateRole(role);
    setSessionState(getSession());
  };

  const value = useMemo<AuthCtx>(
    () => ({ session: sessionState, isReady, login, logout, setRole: setRoleFn }),
    [sessionState, isReady]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

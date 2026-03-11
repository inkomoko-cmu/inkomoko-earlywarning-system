"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Role, UserSession } from "@/lib/types";
import { clearSession, getSession, setSession, updateRole } from "@/lib/session";
import { apiFetch, BASE } from "@/lib/api";

type AuthCtx = {
  session: UserSession | null;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginMongo: (email: string, password: string) => Promise<void>;
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
    // Restore session from localStorage on mount
    const s = getSession();
    console.log("Session on mount:", s); // Add this debug line
    setSessionState(s);
    setReady(true);

    // When any apiFetch receives a 401, it dispatches "auth:unauthorized".
    // We handle it here so we clear BOTH localStorage and React state cleanly,
    // which causes RequireAuth to redirect via the Next.js router — no hard
    // page reload and no login/home bounce loop.
    const handleUnauthorized = () => {
      clearSession();
      setSessionState(null);
    };
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
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

  const loginMongo = async (email: string, password: string) => {
    const response = await fetch(`${BASE}/mongo/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        username: email,
        password: password,
      }),
    });

    if (!response.ok) {
      throw new Error("Invalid credentials");
    }

    const tok = await response.json();

    const meResponse = await fetch(`${BASE}/mongo/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
      },
    });

    if (!meResponse.ok) {
      throw new Error("Failed to fetch user info");
    }

    const me = await meResponse.json();

    // Handle both single role and multiple roles from MongoDB
    const rawRoles: string[] = Array.isArray(me.roles)
      ? me.roles
      : me.role
        ? [me.role]
        : ["Donor"];

    const ROLE_MAP: Record<string, Role> = {
      admin: "Admin",
      program_manager: "Program Manager",
      advisor: "Advisor",
      donor: "Donor",
    };

    const mapped = rawRoles.map(
      (r) => ROLE_MAP[r.toLowerCase()] ?? (r as Role)
    );

    const primary = pickPrimaryRole(mapped);

    const s: UserSession = {
      user_id: me.id || email,
      email: me.email,
      name: me.username ?? me.email.split("@")[0],
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
    () => ({ session: sessionState, isReady, login, loginMongo, logout, setRole: setRoleFn }),
    [sessionState, isReady]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

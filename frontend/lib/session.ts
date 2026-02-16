import { Role, UserSession } from "./types";

const KEY = "inkomoko.session.v1";

export function getSession(): UserSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserSession;
  } catch {
    return null;
  }
}

export function setSession(session: UserSession) {
  window.localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(KEY);
}

export function updateRole(role: Role) {
  const s = getSession();
  if (!s) return;
  setSession({ ...s, role });
}

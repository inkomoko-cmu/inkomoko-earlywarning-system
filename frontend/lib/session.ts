import { Role, UserSession } from "./types";

const KEY = "inkomoko.session.v1";

export function setSession(session: UserSession): void {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function getSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserSession;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

export function updateRole(role: Role) {
  const s = getSession();
  if (!s) return;
  setSession({ ...s, role });
}

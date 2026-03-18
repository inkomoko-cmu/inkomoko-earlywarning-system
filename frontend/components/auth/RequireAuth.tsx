"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import type { Role } from "@/lib/types";

function homeForRole(role: Role) {
  switch (role) {
    case "Admin":
      return "/audit";
    case "Program Manager":
      return "/portfolio";
    case "Advisor":
      return "/advisory";
    case "Donor":
      return "/reports";
    default:
      return "/portfolio";
  }
}

function allowedPrefixes(role: Role): string[] {
  // ✅ Always allow "/" (Overview) and "/login"
  const base = ["/", "/login"];

  switch (role) {
    case "Admin":
      return [
        ...base,
        "/portfolio",
        "/profiles",
        "/advisory",
        "/reports",
        "/scenarios",
        "/models",
        "/audit",
        "/data-quality",
        "/settings",
        "/docs",
      ];
    case "Program Manager":
      return [...base, "/portfolio", "/profiles", "/scenarios", "/models", "/reports", "/settings"];
    case "Advisor":
      return [...base, "/advisory", "/portfolio", "/profiles", "/reports", "/settings"];
    case "Donor":
      return [...base, "/reports"]; // donor minimal + overview
    default:
      return base;
  }
}

function isAllowedPath(pathname: string, role: Role) {
  const allowed = allowedPrefixes(role);
  return allowed.some((p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/")));
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, isReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "/";

  useEffect(() => {
    if (!isReady) return;

    const isAuthRoute = pathname.startsWith("/login");

    // Not logged in -> force login (except on login route)
    if (!session) {
      if (!isAuthRoute) router.replace("/login");
      return;
    }

    // Logged in -> if on login page, go to role home
    if (isAuthRoute) {
      router.replace(homeForRole(session.role));
      return;
    }

    // Logged in -> restrict access by role
    if (!isAllowedPath(pathname, session.role)) {
      router.replace(homeForRole(session.role));
    }
  }, [session, isReady, router, pathname]);

  if (!isReady) return null;

  // Allow rendering login page without session
  if (!session && pathname.startsWith("/login")) return <>{children}</>;

  if (!session) return null;
  return <>{children}</>;
}

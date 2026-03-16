"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import type { Role } from "@/lib/types";

type Props = {
  allow: Role[];
  children: React.ReactNode;
  redirectTo?: string;
};

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

export function RequireRole({ allow, children, redirectTo }: Props) {
  const { session, isReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "/";

  useEffect(() => {
    if (!isReady) return;

    if (!session) {
      router.replace("/login");
      return;
    }

    if (!allow.includes(session.role)) {
      router.replace(redirectTo ?? homeForRole(session.role));
    }
  }, [allow, isReady, session, router, pathname, redirectTo]);

  if (!isReady) return null;
  if (!session) return null;
  if (!allow.includes(session.role)) return null;

  return <>{children}</>;
}

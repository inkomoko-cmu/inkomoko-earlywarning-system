"use client";

import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import { Role } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { useState } from "react";

const ROLES: Role[] = ["Admin", "Program Manager", "Advisor", "Donor"];

export function Topbar() {
  const { session, logout, setRole } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-inkomoko-border bg-white/90 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/inkomoko-logo.png"
            alt="Inkomoko"
            width={120}
            height={34}
            className="h-7 w-auto"
            priority
          />
          <Badge tone="blue" className="hidden md:inline-flex">
            <ShieldCheck size={14} /> Governance Enabled
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <div className="text-sm font-semibold leading-tight">{session?.name ?? "—"}</div>
            <div className="text-xs text-inkomoko-muted leading-tight">{session?.email ?? ""}</div>
          </div>

          <div className="relative">
            <Button variant="secondary" className="gap-2" onClick={() => setOpen((v) => !v)}>
              <span className="text-sm font-semibold">{session?.role ?? "Role"}</span>
              <ChevronDown size={16} />
            </Button>

            {open && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-inkomoko-border bg-white shadow-card overflow-hidden">
                <div className="px-4 py-3 text-xs text-inkomoko-muted border-b border-inkomoko-border">
                  Switch role (applies instantly)
                </div>
                {ROLES.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setRole(r);
                      setOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-inkomoko-bg"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button variant="ghost" className="gap-2" onClick={logout} aria-label="Logout">
            <LogOut size={16} />
            <span className="hidden md:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

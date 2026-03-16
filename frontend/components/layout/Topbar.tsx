"use client";

import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import { Role } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ChevronDown, LogOut, ShieldCheck, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";

const ROLES: Role[] = ["Admin", "Program Manager", "Advisor", "Donor"];

const ROLE_COLORS: Record<Role, string> = {
  Admin: "bg-purple-100 text-purple-700 border-purple-200",
  "Program Manager": "bg-blue-100 text-blue-700 border-blue-200",
  Advisor: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Donor: "bg-amber-100 text-amber-700 border-amber-200",
};

export function Topbar() {
  const { session, logout, setRole } = useAuth();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const roleColor = ROLE_COLORS[session?.role as Role] ?? "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <header className="sticky top-0 z-30 border-b border-inkomoko-border bg-white/95 backdrop-blur shadow-sm">
      <div className="flex items-center justify-between px-6 py-3">

        {/* Left: Logo + Badge */}
        <div className="flex items-center gap-3">
          <Image
            src="/brand/inkomoko-logo.png"
            alt="Inkomoko"
            width={120}
            height={34}
            className="h-7 w-auto"
            priority
          />
          <div className="hidden md:block w-px h-5 bg-inkomoko-border" />
          <Badge tone="blue" className="hidden md:inline-flex items-center gap-1">
            <ShieldCheck size={13} /> Governance Enabled
          </Badge>
        </div>

        {/* Right: User info + Role switcher + Logout */}
        <div className="flex items-center gap-3">

          {/* User Avatar + Info */}
          <div className="hidden sm:flex items-center gap-3 px-3 py-2 rounded-xl bg-inkomoko-bg border border-inkomoko-border">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-inkomoko-blue text-white text-xs font-bold shrink-0">
              {session?.name?.[0]?.toUpperCase() ?? <User size={14} />}
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold leading-tight text-inkomoko-text">
                {session?.name ?? "—"}
              </div>
              <div className="text-xs text-inkomoko-muted leading-tight">
                {session?.email ?? ""}
              </div>
            </div>
          </div>

          {/* Role Switcher - Admin only */}
          {session?.roles?.includes("Admin") && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setOpen((v) => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all hover:opacity-80 ${roleColor}`}
              >
                {session?.role ?? "Role"}
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                />
              </button>

              {open && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-inkomoko-border bg-white shadow-lg overflow-hidden z-50">
                  <div className="px-4 py-3 text-xs text-inkomoko-muted border-b border-inkomoko-border bg-inkomoko-bg">
                    Switch role (applies instantly)
                  </div>
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        setRole(r);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-inkomoko-bg flex items-center justify-between ${
                        session?.role === r ? "font-semibold text-inkomoko-blue" : "text-inkomoko-text"
                      }`}
                    >
                      <span>{r}</span>
                      {session?.role === r && (
                        <span className="w-2 h-2 rounded-full bg-inkomoko-blue" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Show static role badge for non-admin users */}
          {!session?.roles?.includes("Admin") && (
            <div className={`px-3 py-2 rounded-xl border text-xs font-semibold ${roleColor}`}>
              {session?.role ?? "Role"}
            </div>
          )}

          {/* Divider */}
          <div className="w-px h-5 bg-inkomoko-border" />

          {/* Logout */}
          <Button
            variant="ghost"
            className="gap-2 text-inkomoko-muted hover:text-red-600 hover:bg-red-50 transition-colors"
            onClick={logout}
            aria-label="Logout"
          >
            <LogOut size={16} />
            <span className="hidden md:inline text-sm">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
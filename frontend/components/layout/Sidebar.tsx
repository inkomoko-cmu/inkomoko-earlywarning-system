"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui";
import {
  BarChart3,
  BookOpen,
  Building2,
  BrainCircuit,
  FileText,
  Gauge,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Role } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  icon: any;
};

const ALL_NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", icon: BarChart3 },
  { href: "/profiles", label: "Enterprise Profiles", icon: Building2 },
  { href: "/scenarios", label: "Scenarios", icon: Gauge },
  { href: "/advisory", label: "Advisory", icon: Sparkles },
  { href: "/models", label: "Model Cards", icon: BrainCircuit },
  { href: "/data-quality", label: "Data Quality", icon: ShieldCheck },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/docs", label: "Documentation", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Wrench },
];

function navForRole(role: Role | null | undefined): NavItem[] {
  // Not logged in (shouldn't happen inside (app) anyway)
  if (!role) return [{ href: "/", label: "Overview", icon: LayoutDashboard }];

  if (role === "Admin") return ALL_NAV;

  if (role === "Program Manager") {
    const allowed = new Set(["/", "/portfolio", "/profiles", "/scenarios", "/models", "/reports"]);
    return ALL_NAV.filter((x) => allowed.has(x.href));
  }

  if (role === "Advisor") {
    const allowed = new Set(["/", "/advisory", "/portfolio", "/profiles", "/reports"]);
    return ALL_NAV.filter((x) => allowed.has(x.href));
  }

  // Donor
  const allowed = new Set(["/", "/reports"]);
  return ALL_NAV.filter((x) => allowed.has(x.href));
}

export function Sidebar() {
  const pathname = usePathname() || "/";
  const { session } = useAuth();

  const nav = navForRole(session?.role);

  return (
    <aside className="w-[280px] shrink-0 border-r border-inkomoko-border bg-white">
      <div className="p-5 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-inkomoko-blue flex items-center justify-center shadow-soft">
          <span className="text-white font-bold">iN</span>
        </div>
        <div className="leading-tight">
          <div className="font-semibold">Impact & Early Warning</div>
          <div className="text-xs text-inkomoko-muted">Inkomoko Intelligence Suite</div>
        </div>
      </div>

      <nav className="px-3 pb-5">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active ? "bg-inkomoko-blue text-white shadow-soft" : "text-inkomoko-text hover:bg-inkomoko-bg"
              )}
            >
              <Icon size={18} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-5 pb-6">
        <div className="rounded-2xl border border-inkomoko-border bg-inkomoko-bg p-4">
          <div className="text-sm font-semibold">Governance-first</div>
          <p className="text-xs text-inkomoko-muted mt-1">
            Role-based masking, audit trails, and data quality contracts are enforced across the platform.
          </p>
        </div>
      </div>
    </aside>
  );
}

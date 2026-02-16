"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  // ✅ hooks MUST be inside the component
  const { session, setRole } = useAuth();

  return (
    <div className="min-h-screen flex">
      <Sidebar />

      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 h-[60px] border-b border-inkomoko-border bg-white">
          <Topbar />

          {/* ✅ Admin role switcher */}
          {session?.roles?.includes("Admin") && (
            <div className="flex items-center gap-2">
              <div className="text-xs text-inkomoko-muted">View as</div>
              <select
                className="rounded-xl border border-inkomoko-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-inkomoko-orange/25"
                value={session.role}
                onChange={(e) => setRole(e.target.value as any)}
              >
                {(["Admin", "Program Manager", "Advisor", "Donor"] as const).map(
                  (r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  )
                )}
              </select>
            </div>
          )}
        </div>

        {/* Page content */}
        <main className="px-6 py-6 bg-inkomoko-bg min-h-[calc(100vh-60px)]">
          {children}
        </main>
      </div>
    </div>
  );
}

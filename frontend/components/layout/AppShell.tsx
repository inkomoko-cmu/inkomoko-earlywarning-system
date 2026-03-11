"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, setRole } = useAuth();

  return (
    <div className="min-h-screen flex">
      <Sidebar />

      <div className="flex-1 min-w-0">
        <Topbar />

        {/* Page content */}
        <main className="px-6 py-6 bg-inkomoko-bg min-h-[calc(100vh-60px)]">
          {children}
        </main>
      </div>
    </div>
  );
}

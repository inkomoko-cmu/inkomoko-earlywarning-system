"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Role } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ShieldCheck, Sparkles, TrendingUp, Eye, EyeOff } from "lucide-react";
import { ErrorCard } from "@/components/ui/ErrorCard";

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

export default function LoginPage() {
  const { login, session, isReady } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("admin@admin.com");
  const [password, setPassword] = useState("admin");
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // ✅ Redirect if already logged in (or right after successful login)
  useEffect(() => {
    if (!isReady) return;
    if (session) router.replace(homeForRole(session.role));
  }, [session, isReady, router]);

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div className="bg-white flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/inkomoko-logo.png"
              alt="Inkomoko"
              width={150}
              height={40}
              className="h-8 w-auto"
              priority
            />
            <Badge tone="orange" className="ml-auto hidden sm:inline-flex">
              <Sparkles size={14} /> Intelligence Suite
            </Badge>
          </div>

          <h1 className="mt-10 text-3xl font-semibold tracking-tight text-inkomoko-blue">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-inkomoko-muted">
            Sign in to access impact measurement, early warning forecasts, scenario stress testing,
            and advisory insights.
          </p>

          <div className="mt-8 space-y-4">
            <label className="block">
              <div className="text-sm font-medium text-inkomoko-text">Email</div>
              <input
                className="mt-2 w-full rounded-xl border border-inkomoko-border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-inkomoko-orange/25"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="name@organization.org"
                autoComplete="username"
              />
            </label>

            <label className="block">
              <div className="text-sm font-medium text-inkomoko-text">Password</div>
              <div className="relative mt-2">
                <input
                  className="w-full rounded-xl border border-inkomoko-border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-inkomoko-orange/25 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-inkomoko-muted hover:text-inkomoko-text transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-inkomoko-muted">
                <input type="checkbox" className="rounded border-inkomoko-border" defaultChecked />
                Remember for 30 days
              </label>
              <button className="text-sm font-medium text-inkomoko-blueSoft hover:underline">
                Forgot password
              </button>
            </div>

            {error && (
              <ErrorCard
                title="Login failed"
                message={error}
                variant="error"
                onDismiss={() => setError(null)}
                onRetry={async () => {
                  try {
                    setError(null);
                    setIsLoggingIn(true);
                    await login(email, password);
                  } catch (e: any) {
                    setError(e?.message ?? "Login failed");
                  } finally {
                    setIsLoggingIn(false);
                  }
                }}
              />
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={isLoggingIn}
              onClick={async () => {
                try {
                  setError(null);
                  setIsLoggingIn(true);
                  await login(email, password);
                } catch (e: any) {
                  setError(e?.message ?? "Login failed");
                } finally {
                  setIsLoggingIn(false);
                }
              }}
            >
              {isLoggingIn ? "Signing in..." : "Sign in"}
            </Button>

            {/* Debug Mode Notice */}
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
              <div className="text-xs font-semibold text-blue-800">🔧 Debug Mode Active</div>
              <div className="text-xs text-blue-600 mt-1">
                Use <span className="font-mono font-semibold">admin@admin.com</span> / <span className="font-mono font-semibold">admin</span> for quick access
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-inkomoko-border bg-inkomoko-bg p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-inkomoko-blue">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold">Secure access</div>
                  <div className="text-xs text-inkomoko-muted mt-1">
                    Access is governed by role-based policies, audit trails, and traceable reporting
                    across countries and programs.
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-3">
                <div className="mt-0.5 text-inkomoko-orange">
                  <TrendingUp size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold">Decision-ready insights</div>
                  <div className="text-xs text-inkomoko-muted mt-1">
                    Forecasts and narratives are framed for action—prioritizing interventions and
                    safeguarding livelihoods.
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-inkomoko-muted mt-6">
              By signing in, you agree to organizational data governance policies and responsible AI
              usage guidelines.
            </p>
          </div>
        </div>
      </div>

      <div className="relative hidden lg:block">
        <Image
          src="/brand/hero.png"
          alt="Inkomoko field context"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-inkomoko-blue/80 via-inkomoko-blue/30 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10">
          <div className="rounded-2xl bg-white/10 backdrop-blur border border-white/20 p-6 text-white shadow-soft">
            <div className="text-xs uppercase tracking-wider text-white/80">
              Operational readiness
            </div>
            <div className="mt-2 text-2xl font-semibold leading-tight">
              Early warning signals, scenario stress tests, and advisory pathways—aligned to
              governance and donor transparency.
            </div>
            <div className="mt-3 text-sm text-white/85">
              Monitor portfolio health across programs and countries, with explainable forecasts and
              exportable reporting.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { InsightPanel } from "@/components/ui/InsightPanel";
import { RequireRole } from "@/components/auth/RequireRole";
import { apiFetch } from "@/lib/api";
import { type AiInsight, clampConfidence } from "@/lib/insights";
import { useLiveAiInsights } from "@/lib/useLiveAiInsights";
import { Activity, Bell, Bot, Clock3, Database, Settings2, ShieldAlert, Sparkles, UserPlus, Users, RotateCcw, Save } from "lucide-react";

type RiskTier = {
  score_min: number;
  score_max: number;
  arrears_days: number;
  revenue_decline_pct: number;
  jobs_lost_pct: number;
};

type SettingsPayload = {
  risk_thresholds: {
    low: RiskTier;
    medium: RiskTier;
    high: RiskTier;
    high_if_any_triggered: boolean;
  };
  prediction_horizons: {
    one_month: { enabled: boolean; confidence_interval: number; min_confidence_pct: number };
    two_month: { enabled: boolean; confidence_interval: number; min_confidence_pct: number };
    three_month: { enabled: boolean; confidence_interval: number; min_confidence_pct: number };
    recompute_frequency: string;
  };
  retraining: {
    enabled: boolean;
    frequency: string;
    run_time_utc: string;
    training_window_months: number;
    auto_deploy: boolean;
    min_improvement_pct: number;
  };
  cron_jobs: {
    loan_import: { enabled: boolean; frequency: string; run_time_utc: string; max_retries: number };
    impact_import: { enabled: boolean; frequency: string; run_time_utc: string; max_retries: number };
    retraining_job: { enabled: boolean; frequency: string; run_time_utc: string; max_retries: number };
  };
  alert_rules: {
    high_risk_enabled: boolean;
    high_risk_threshold_count: number;
    par30_enabled: boolean;
    par30_threshold_pct: number;
    import_failure_enabled: boolean;
    delivery_channel: string;
    recipient_email: string | null;
  };
  updated_at?: string | null;
};

type UserItem = {
  user_id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  roles: string[];
};

type NewUserForm = {
  email: string;
  full_name: string;
  password: string;
  role: "admin" | "program_manager" | "advisor" | "donor";
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  program_manager: "Program Manager",
  advisor: "Advisor",
  donor: "Donor",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [draft, setDraft] = useState<SettingsPayload | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"risk" | "horizons" | "retraining" | "cron" | "alerts" | "users" | "snapshot">("risk");

  const [newUser, setNewUser] = useState<NewUserForm>({
    email: "",
    full_name: "",
    password: "",
    role: "advisor",
  });
  const [creatingUser, setCreatingUser] = useState(false);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const [settingsRes, usersRes] = await Promise.all([
        apiFetch<SettingsPayload>("/settings", { method: "GET" }, true),
        apiFetch<UserItem[]>("/users", { method: "GET" }, true),
      ]);
      setSettings(settingsRes);
      setDraft(settingsRes);
      setUsers(usersRes);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    return JSON.stringify(settings) !== JSON.stringify(draft);
  }, [settings, draft]);

  const enabledHorizons = draft
    ? (["one_month", "two_month", "three_month"] as const).filter((k) => draft.prediction_horizons[k].enabled).length
    : 0;
  const enabledCronJobs = draft
    ? (["loan_import", "impact_import", "retraining_job"] as const).filter((k) => draft.cron_jobs[k].enabled).length
    : 0;
  const activeUsers = users.filter((u) => u.is_active).length;
  const adminUsers = users.filter((u) => u.roles.includes("admin")).length;

  const updateRiskTier = (tier: "low" | "medium" | "high", key: keyof RiskTier, value: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        risk_thresholds: {
          ...prev.risk_thresholds,
          [tier]: {
            ...prev.risk_thresholds[tier],
            [key]: value,
          },
        },
      };
    });
  };

  const updateHorizon = (
    horizon: "one_month" | "two_month" | "three_month",
    key: "enabled" | "confidence_interval" | "min_confidence_pct",
    value: boolean | number
  ) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        prediction_horizons: {
          ...prev.prediction_horizons,
          [horizon]: {
            ...prev.prediction_horizons[horizon],
            [key]: value,
          },
        },
      };
    });
  };

  const updateCron = (
    job: "loan_import" | "impact_import" | "retraining_job",
    key: "enabled" | "frequency" | "run_time_utc" | "max_retries",
    value: string | boolean | number
  ) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        cron_jobs: {
          ...prev.cron_jobs,
          [job]: {
            ...prev.cron_jobs[job],
            [key]: value,
          },
        },
      };
    });
  };

  const saveSettings = async () => {
    if (!draft) return;
    try {
      setSaving(true);
      setError(null);
      const saved = await apiFetch<SettingsPayload>(
        "/settings",
        { method: "PUT", body: JSON.stringify(draft) },
        true
      );
      setSettings(saved);
      setDraft(saved);
      setSuccess("Settings saved successfully.");
      setTimeout(() => setSuccess(null), 2500);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    try {
      setSaving(true);
      setError(null);
      const reset = await apiFetch<SettingsPayload>("/settings/reset", { method: "POST" }, true);
      setSettings(reset);
      setDraft(reset);
      setSuccess("Settings reset to defaults.");
      setTimeout(() => setSuccess(null), 2500);
    } catch (e: any) {
      setError(e?.message ?? "Failed to reset defaults.");
    } finally {
      setSaving(false);
    }
  };

  const createUser = async () => {
    if (!newUser.email || !newUser.password) {
      setError("Email and password are required to create an account.");
      return;
    }

    try {
      setCreatingUser(true);
      setError(null);
      await apiFetch(
        "/users",
        {
          method: "POST",
          body: JSON.stringify({
            email: newUser.email,
            full_name: newUser.full_name || null,
            password: newUser.password,
            roles: [newUser.role],
          }),
        },
        true
      );
      setNewUser({ email: "", full_name: "", password: "", role: "advisor" });
      const usersRes = await apiFetch<UserItem[]>("/users", { method: "GET" }, true);
      setUsers(usersRes);
      setSuccess("User account created.");
      setTimeout(() => setSuccess(null), 2500);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create user.");
    } finally {
      setCreatingUser(false);
    }
  };

  const toggleUserStatus = async (user: UserItem) => {
    try {
      setError(null);
      const updated = await apiFetch<UserItem>(
        `/users/${user.user_id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_active: !user.is_active }),
        },
        true
      );
      setUsers((prev) => prev.map((u) => (u.user_id === updated.user_id ? updated : u)));
    } catch (e: any) {
      setError(e?.message ?? "Failed to update account status.");
    }
  };

  const tabs = [
    { id: "risk" as const, label: "Risk Thresholds", icon: <ShieldAlert size={16} /> },
    { id: "horizons" as const, label: "Prediction Horizons", icon: <Activity size={16} /> },
    { id: "retraining" as const, label: "Retraining", icon: <Bot size={16} /> },
    { id: "cron" as const, label: "Cron Jobs", icon: <Clock3 size={16} /> },
    { id: "alerts" as const, label: "Alert Rules", icon: <Bell size={16} /> },
    { id: "users" as const, label: "Users", icon: <UserPlus size={16} /> },
    { id: "snapshot" as const, label: "Snapshot", icon: <Database size={16} /> },
  ];

  const aiInsights = useMemo<AiInsight[]>(() => {
    if (!draft) return [];
    const governanceCoverage = (enabledHorizons / 3 + enabledCronJobs / 3) / 2;
    return [
      {
        id: "settings-governance",
        title: "Configuration governance",
        narrative: `${dirty ? "There are pending configuration edits" : "All configuration edits are synchronized"} across risk, horizon, retraining, and alert controls.`,
        confidence: clampConfidence(60 + governanceCoverage * 25),
        tone: dirty ? "warning" : "success",
        evidence: [
          `Enabled horizons: ${enabledHorizons}/3`,
          `Enabled cron jobs: ${enabledCronJobs}/3`,
        ],
        actions: [dirty ? "Save changes to lock a single approved control baseline." : "Continue periodic control review to maintain model discipline."],
      },
      {
        id: "settings-access",
        title: "Access resilience",
        narrative: `${activeUsers} active users are provisioned with ${adminUsers} admin account(s), balancing operational coverage and privileged access.`,
        confidence: clampConfidence(65),
        tone: adminUsers <= 1 ? "warning" : "neutral",
        actions: [adminUsers <= 1 ? "Maintain at least two active admins for continuity." : "Review privileged accounts monthly for least-privilege alignment."],
      },
      {
        id: "settings-ops",
        title: "Operational readiness",
        narrative: `Alert delivery is configured for ${draft.alert_rules.delivery_channel.replace("_", " ")}, with retraining ${draft.retraining.enabled ? "enabled" : "disabled"} on a ${draft.retraining.frequency} cadence.`,
        confidence: clampConfidence(draft.retraining.enabled ? 76 : 62),
        tone: draft.retraining.enabled ? "neutral" : "warning",
        actions: ["Align retraining cadence with data import frequency to reduce prediction drift."],
      },
    ];
  }, [
    activeUsers,
    adminUsers,
    dirty,
    draft?.alert_rules.delivery_channel,
    draft?.retraining.enabled,
    draft?.retraining.frequency,
    enabledCronJobs,
    enabledHorizons,
  ]);

  const aiContext = useMemo(
    () => ({
      settings: draft,
      users,
      summary: {
        enabledHorizons,
        enabledCronJobs,
        activeUsers,
        adminUsers,
        dirty,
      },
      activeTab,
    }),
    [draft, users, enabledHorizons, enabledCronJobs, activeUsers, adminUsers, dirty, activeTab]
  );

  const liveAi = useLiveAiInsights({
    scopeType: "settings",
    context: aiContext,
    fallbackInsights: aiInsights,
  });

  if (loading || !draft) {
    return (
      <RequireRole allow={["Admin"]}>
        <div className="space-y-5">
          <div className="h-36 rounded-3xl bg-gradient-to-br from-inkomoko-blue to-inkomoko-blueSoft animate-pulse" />
          <div className="h-40 rounded-2xl border border-inkomoko-border bg-white animate-pulse" />
          <div className="h-40 rounded-2xl border border-inkomoko-border bg-white animate-pulse" />
        </div>
      </RequireRole>
    );
  }

  return (
    <RequireRole allow={["Admin"]}>
      <div className="space-y-5">
        {/* Hero Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-inkomoko-blue via-inkomoko-blueSoft to-[#0d4f87] p-6 text-white shadow-card">
          <div className="pointer-events-none absolute -right-14 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute bottom-0 right-28 h-24 w-24 rounded-full bg-white/10" />
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
                <Sparkles size={14} />
                Admin Configuration Console
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Early Warning Settings</h1>
              <p className="text-sm text-blue-100">
                Tune the behavior of risk scoring, forecast confidence, retraining cadence, alerts, and access control from one coordinated control plane.
              </p>
            </div>
          </div>
          <div className="relative z-10 mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatPill label="Enabled Horizons" value={`${enabledHorizons}/3`} icon={<Activity size={14} />} />
            <StatPill label="Active Cron Jobs" value={`${enabledCronJobs}/3`} icon={<Clock3 size={14} />} />
            <StatPill label="Active Users" value={String(activeUsers)} icon={<Users size={14} />} />
            <StatPill label="Admin Users" value={String(adminUsers)} icon={<Settings2 size={14} />} />
          </div>
        </div>

        {error && <ErrorCard title="Settings error" message={error} variant="error" onDismiss={() => setError(null)} />}
        {success && <ErrorCard title="Success" message={success} variant="info" onDismiss={() => setSuccess(null)} />}

        <InsightPanel
          title="AI Insights"
          subtitle="Narrative interpretation of governance posture and operational configuration."
          status={liveAi.status}
          lastUpdated={liveAi.lastUpdated}
          insights={liveAi.insights}
        />

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 rounded-2xl border border-inkomoko-border bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={dirty ? "warning" : "success"}>{dirty ? "Unsaved changes" : "All changes saved"}</Badge>
            <Badge tone="blue">Last update: {draft.updated_at ? new Date(draft.updated_at).toLocaleString() : "Never"}</Badge>
            <Badge tone="orange">Phase 1 MVP</Badge>
          </div>
          
          <div className="flex gap-3 w-full md:w-auto">
            {/* Save Changes Button */}
            <button
              onClick={saveSettings}
              disabled={saving || !dirty}
              title={!dirty ? "All changes saved" : "Save your edits"}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap ${
                saving || !dirty
                  ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                  : "bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg hover:scale-105 border border-green-400/30 cursor-pointer"
              }`}
            >
              <Save size={16} />
              <span>{saving ? "Saving..." : "Save"}</span>
            </button>

            {/* Reset Button */}
            <button
              onClick={resetDefaults}
              disabled={saving}
              title="Restore to defaults"
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap ${
                saving
                  ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                  : "bg-gradient-to-r from-orange-500 to-amber-600 text-white hover:shadow-lg hover:scale-105 border border-orange-400/30 cursor-pointer"
              }`}
            >
              <RotateCcw size={16} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Tab Menu */}
        <div className="overflow-x-auto rounded-2xl border border-inkomoko-border bg-white shadow-card">
          <div className="flex gap-0.5 p-2 min-w-max md:min-w-full md:flex-wrap md:gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-inkomoko-blue text-white shadow-md"
                    : "bg-transparent text-inkomoko-muted hover:bg-inkomoko-bg/50 border border-transparent"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div>
          {/* Risk Thresholds Tab */}
          {activeTab === "risk" && (
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldAlert size={18} /> Risk Tier Thresholds</CardTitle>
                <CardDescription>Define the minimum trigger levels used by the early warning engine.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(["low", "medium", "high"] as const).map((tier) => (
                  <div key={tier} className="rounded-xl border border-inkomoko-border bg-inkomoko-bg/35 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold capitalize">{tier} risk</span>
                      <Badge tone={tier === "high" ? "danger" : tier === "medium" ? "warning" : "success"}>
                        score {draft.risk_thresholds[tier].score_min}-{draft.risk_thresholds[tier].score_max}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <InputNumber label="Arrears days" value={draft.risk_thresholds[tier].arrears_days} onChange={(v) => updateRiskTier(tier, "arrears_days", v)} />
                      <InputNumber label="Revenue decline %" value={draft.risk_thresholds[tier].revenue_decline_pct} onChange={(v) => updateRiskTier(tier, "revenue_decline_pct", v)} />
                      <InputNumber label="Jobs lost %" value={draft.risk_thresholds[tier].jobs_lost_pct} onChange={(v) => updateRiskTier(tier, "jobs_lost_pct", v)} />
                      <InputNumber label="Score min" value={draft.risk_thresholds[tier].score_min} onChange={(v) => updateRiskTier(tier, "score_min", v)} />
                      <InputNumber label="Score max" value={draft.risk_thresholds[tier].score_max} onChange={(v) => updateRiskTier(tier, "score_max", v)} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Prediction Horizons Tab */}
          {activeTab === "horizons" && (
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Activity size={18} /> Prediction Horizons</CardTitle>
                <CardDescription>Control confidence rules for 1m, 2m, and 3m forecasts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {([
                  ["one_month", "1 month"],
                  ["two_month", "2 months"],
                  ["three_month", "3 months"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="rounded-xl border border-inkomoko-border bg-inkomoko-bg/35 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold">{label}</p>
                      <label className="text-xs flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-inkomoko-border text-inkomoko-blue focus:ring-inkomoko-blue/30"
                          checked={draft.prediction_horizons[key].enabled}
                          onChange={(e) => updateHorizon(key, "enabled", e.target.checked)}
                        />
                        enabled
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <InputNumber
                        label="Confidence interval"
                        value={draft.prediction_horizons[key].confidence_interval}
                        onChange={(v) => updateHorizon(key, "confidence_interval", v)}
                      />
                      <InputNumber
                        label="Min confidence %"
                        value={draft.prediction_horizons[key].min_confidence_pct}
                        onChange={(v) => updateHorizon(key, "min_confidence_pct", v)}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Retraining Tab */}
          {activeTab === "retraining" && (
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bot size={18} /> Retraining Configuration</CardTitle>
                <CardDescription>Schedule model refresh and deployment policy.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <label className="col-span-2 flex items-center gap-2 p-3 rounded-lg border border-inkomoko-border bg-inkomoko-bg/25">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-inkomoko-border text-inkomoko-blue focus:ring-inkomoko-blue/30"
                    checked={draft.retraining.enabled}
                    onChange={(e) => setDraft((prev) => prev ? { ...prev, retraining: { ...prev.retraining, enabled: e.target.checked } } : prev)}
                  />
                  Enable retraining
                </label>
                <SelectField
                  label="Frequency"
                  value={draft.retraining.frequency}
                  options={["weekly", "monthly", "quarterly"]}
                  onChange={(v) => setDraft((prev) => prev ? { ...prev, retraining: { ...prev.retraining, frequency: v } } : prev)}
                />
                <TextField
                  label="Run time UTC"
                  value={draft.retraining.run_time_utc}
                  onChange={(v) => setDraft((prev) => prev ? { ...prev, retraining: { ...prev.retraining, run_time_utc: v } } : prev)}
                />
                <InputNumber
                  label="Training window (months)"
                  value={draft.retraining.training_window_months}
                  onChange={(v) => setDraft((prev) => prev ? { ...prev, retraining: { ...prev.retraining, training_window_months: v } } : prev)}
                />
                <InputNumber
                  label="Min improvement %"
                  value={draft.retraining.min_improvement_pct}
                  onChange={(v) => setDraft((prev) => prev ? { ...prev, retraining: { ...prev.retraining, min_improvement_pct: v } } : prev)}
                />
                <label className="col-span-2 flex items-center gap-2 p-3 rounded-lg border border-inkomoko-border bg-inkomoko-bg/25">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-inkomoko-border text-inkomoko-blue focus:ring-inkomoko-blue/30"
                    checked={draft.retraining.auto_deploy}
                    onChange={(e) => setDraft((prev) => prev ? { ...prev, retraining: { ...prev.retraining, auto_deploy: e.target.checked } } : prev)}
                  />
                  Auto-deploy improved model version
                </label>
              </CardContent>
            </Card>
          )}

          {/* Cron Jobs Tab */}
          {activeTab === "cron" && (
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Clock3 size={18} /> Cron Job Settings</CardTitle>
                <CardDescription>Data and retraining automation schedules.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {([
                  ["loan_import", "Loan import"],
                  ["impact_import", "Impact import"],
                  ["retraining_job", "Retraining job"],
                ] as const).map(([job, label]) => (
                  <div key={job} className="rounded-xl border border-inkomoko-border bg-inkomoko-bg/35 p-4 text-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="font-semibold">{label}</p>
                      <label className="text-xs flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-inkomoko-border text-inkomoko-blue focus:ring-inkomoko-blue/30"
                          checked={draft.cron_jobs[job].enabled}
                          onChange={(e) => updateCron(job, "enabled", e.target.checked)}
                        />
                        enabled
                      </label>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <SelectField
                        label="Frequency"
                        value={draft.cron_jobs[job].frequency}
                        options={["daily", "weekly", "monthly"]}
                        onChange={(v) => updateCron(job, "frequency", v)}
                      />
                      <TextField
                        label="Run time UTC"
                        value={draft.cron_jobs[job].run_time_utc}
                        onChange={(v) => updateCron(job, "run_time_utc", v)}
                      />
                      <InputNumber
                        label="Max retries"
                        value={draft.cron_jobs[job].max_retries}
                        onChange={(v) => updateCron(job, "max_retries", v)}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Alert Rules Tab */}
          {activeTab === "alerts" && (
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bell size={18} /> Alert Rules</CardTitle>
                <CardDescription>Configure delivery and trigger levels for early warning notifications.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <label className="col-span-2 flex items-center gap-2 p-3 rounded-lg border border-inkomoko-border bg-inkomoko-bg/25">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-inkomoko-border text-inkomoko-blue focus:ring-inkomoko-blue/30"
                    checked={draft.alert_rules.high_risk_enabled}
                    onChange={(e) => setDraft((prev) => prev ? { ...prev, alert_rules: { ...prev.alert_rules, high_risk_enabled: e.target.checked } } : prev)}
                  />
                  Alert on high-risk clients
                </label>
                <InputNumber
                  label="High-risk count threshold"
                  value={draft.alert_rules.high_risk_threshold_count}
                  onChange={(v) => setDraft((prev) => prev ? { ...prev, alert_rules: { ...prev.alert_rules, high_risk_threshold_count: v } } : prev)}
                />
                <InputNumber
                  label="PAR30 threshold %"
                  value={draft.alert_rules.par30_threshold_pct}
                  onChange={(v) => setDraft((prev) => prev ? { ...prev, alert_rules: { ...prev.alert_rules, par30_threshold_pct: v } } : prev)}
                />
                <SelectField
                  label="Delivery"
                  value={draft.alert_rules.delivery_channel}
                  options={["in_app", "email", "both"]}
                  onChange={(v) => setDraft((prev) => prev ? { ...prev, alert_rules: { ...prev.alert_rules, delivery_channel: v } } : prev)}
                />
                <TextField
                  label="Recipient email"
                  value={draft.alert_rules.recipient_email ?? ""}
                  onChange={(v) => setDraft((prev) => prev ? { ...prev, alert_rules: { ...prev.alert_rules, recipient_email: v || null } } : prev)}
                />
                <label className="col-span-2 flex items-center gap-2 p-3 rounded-lg border border-inkomoko-border bg-inkomoko-bg/25">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-inkomoko-border text-inkomoko-blue focus:ring-inkomoko-blue/30"
                    checked={draft.alert_rules.import_failure_enabled}
                    onChange={(e) => setDraft((prev) => prev ? { ...prev, alert_rules: { ...prev.alert_rules, import_failure_enabled: e.target.checked } } : prev)}
                  />
                  Alert on import failures
                </label>
              </CardContent>
            </Card>
          )}

          {/* Account Management Tab */}
          {activeTab === "users" && (
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><UserPlus size={18} /> Account Management</CardTitle>
                <CardDescription>Create users and toggle account activation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-xl border border-inkomoko-border bg-inkomoko-bg/20 p-4">
                  <h3 className="mb-4 text-sm font-semibold">Create new account</h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <TextField
                      label="Email"
                      value={newUser.email}
                      onChange={(v) => setNewUser((prev) => ({ ...prev, email: v }))}
                    />
                    <TextField
                      label="Full name"
                      value={newUser.full_name}
                      onChange={(v) => setNewUser((prev) => ({ ...prev, full_name: v }))}
                    />
                    <TextField
                      label="Password"
                      value={newUser.password}
                      onChange={(v) => setNewUser((prev) => ({ ...prev, password: v }))}
                      type="password"
                    />
                    <SelectField
                      label="Role"
                      value={newUser.role}
                      options={["admin", "program_manager", "advisor", "donor"]}
                      onChange={(v) => setNewUser((prev) => ({ ...prev, role: v as NewUserForm["role"] }))}
                    />
                  </div>
                  <Button onClick={createUser} disabled={creatingUser}>
                    {creatingUser ? "Creating..." : "Create account"}
                  </Button>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Manage accounts</h3>
                  <div className="rounded-xl border border-inkomoko-border overflow-hidden bg-white">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-inkomoko-bg border-b border-inkomoko-border text-left text-inkomoko-muted uppercase text-[11px] tracking-wide">
                          <th className="px-4 py-3">User</th>
                          <th className="px-4 py-3">Roles</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.user_id} className="border-t border-inkomoko-border hover:bg-inkomoko-bg/40 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium">{u.full_name || "(No name)"}</div>
                              <div className="text-xs text-inkomoko-muted">{u.email}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {u.roles.map((r) => (
                                  <Badge key={r} tone="blue">{ROLE_LABELS[r] ?? r}</Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge tone={u.is_active ? "success" : "danger"}>{u.is_active ? "Active" : "Inactive"}</Badge>
                            </td>
                            <td className="px-4 py-3">
                              <Button size="sm" variant="secondary" onClick={() => toggleUserStatus(u)}>
                                {u.is_active ? "Deactivate" : "Activate"}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Configuration Snapshot Tab */}
          {activeTab === "snapshot" && (
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Database size={18} /> MVP Configuration Snapshot</CardTitle>
                <CardDescription>Current JSON payload persisted in PostgreSQL.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-96 overflow-auto rounded-xl bg-[#0b1324] p-5 text-xs text-blue-100 border border-inkomoko-border font-mono">
                  {JSON.stringify(draft, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </RequireRole>
  );
}

function StatPill({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-blue-100">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function InputNumber({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-inkomoko-muted">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-inkomoko-border bg-white px-3 py-2 text-sm transition focus:border-inkomoko-blue focus:outline-none focus:ring-2 focus:ring-inkomoko-blue/20"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-inkomoko-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-inkomoko-border bg-white px-3 py-2 text-sm transition focus:border-inkomoko-blue focus:outline-none focus:ring-2 focus:ring-inkomoko-blue/20"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-inkomoko-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-inkomoko-border bg-white px-3 py-2 text-sm transition focus:border-inkomoko-blue focus:outline-none focus:ring-2 focus:ring-inkomoko-blue/20"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

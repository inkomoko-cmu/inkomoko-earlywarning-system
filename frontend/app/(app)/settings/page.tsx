"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { InsightPanel } from "@/components/ui/InsightPanel";
import { RequireRole } from "@/components/auth/RequireRole";
import { apiFetch } from "@/lib/api";
import { type AiInsight, clampConfidence } from "@/lib/insights";
import { useLiveAiInsights } from "@/lib/useLiveAiInsights";
import { Activity, Bell, Bot, Clock3, Database, Download, Play, Settings2, ShieldAlert, Sparkles, Upload, UserPlus, Users, RotateCcw, Save } from "lucide-react";
import { BASE } from "@/lib/api";
import { getSession } from "@/lib/session";

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
  const [activeTab, setActiveTab] = useState<"risk" | "horizons" | "training" | "cron" | "alerts" | "users" | "upload" | "snapshot">("risk");

  /* ── Training trigger state ── */
  const [training, setTraining] = useState(false);
  const [trainResult, setTrainResult] = useState<{ status: string; message: string; models_trained?: number } | null>(null);

  /* ── Upload state ── */
  const [uploadingDataset, setUploadingDataset] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<Record<string, any> | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[] | null>(null);

  /* ── Preview state ── */
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewData, setPreviewData] = useState<{ columns: string[]; rows: Record<string, string>[]; total: number; errors: string[] } | null>(null);
  const [previewDatasetType, setPreviewDatasetType] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);

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

  /* ── Upload handler (uses raw fetch — apiFetch hardcodes Content-Type:json) ── */
  const uploadFile = async (datasetType: string, file: File) => {
    setUploadingDataset(datasetType);
    setUploadResult(null);
    setUploadErrors(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getSession()?.access_token;
      const res = await fetch(`${BASE}/upload/${datasetType}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        const errs = data?.detail?.validation_errors ?? [data?.detail ?? "Upload failed"];
        setUploadErrors(Array.isArray(errs) ? errs.map(String) : [String(errs)]);
      } else {
        setUploadResult(data);
        setSuccess(`Uploaded ${data.rows_uploaded ?? data.users_created ?? 0} records successfully.`);
        setTimeout(() => setSuccess(null), 4000);
        if (datasetType === "users") {
          const usersRes = await apiFetch<UserItem[]>("/users", { method: "GET" }, true);
          setUsers(usersRes);
        }
      }
    } catch (e: any) {
      setUploadErrors([e?.message ?? "Upload failed"]);
    } finally {
      setUploadingDataset(null);
    }
  };

  /* ── Preview handler — validates + returns sample rows, no DB write ── */
  const previewUpload = async (datasetType: string, file: File) => {
    setPreviewing(true);
    setPreviewData(null);
    setPreviewDatasetType(datasetType);
    setPreviewFile(file);
    setUploadErrors(null);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getSession()?.access_token;
      const url = `${BASE}/upload/${datasetType}/preview`;
      const res = await fetch(url, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        const errs = data?.detail?.validation_errors ?? [data?.detail ?? "Preview failed"];
        setUploadErrors(Array.isArray(errs) ? errs.map(String) : [String(errs)]);
        setPreviewDatasetType(null);
        setPreviewFile(null);
      } else {
        setPreviewData({
          columns: data.columns,
          rows: data.preview_rows,
          total: data.total_rows,
          errors: data.validation_errors ?? [],
        });
        setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      }
    } catch (e: any) {
      setUploadErrors([e?.message ?? "Preview failed"]);
      setPreviewDatasetType(null);
      setPreviewFile(null);
    } finally {
      setPreviewing(false);
    }
  };

  const confirmUpload = async () => {
    if (!previewFile || !previewDatasetType) return;
    await uploadFile(previewDatasetType, previewFile);
    setPreviewData(null);
    setPreviewDatasetType(null);
    setPreviewFile(null);
  };

  const cancelPreview = () => {
    setPreviewData(null);
    setPreviewDatasetType(null);
    setPreviewFile(null);
    setPreviewing(false);
  };

  const tabs = [
    { id: "risk" as const, label: "Risk Thresholds", icon: <ShieldAlert size={16} /> },
    { id: "horizons" as const, label: "Prediction Horizons", icon: <Activity size={16} /> },
    { id: "training" as const, label: "Training", icon: <Bot size={16} /> },
    { id: "cron" as const, label: "Cron Jobs", icon: <Clock3 size={16} /> },
    { id: "alerts" as const, label: "Alert Rules", icon: <Bell size={16} /> },
    { id: "users" as const, label: "Users", icon: <UserPlus size={16} /> },
    { id: "upload" as const, label: "Data Upload", icon: <Upload size={16} /> },
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
    draft,
    dirty,
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

          {/* Training Tab */}
          {activeTab === "training" && (
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bot size={18} /> Training Configuration</CardTitle>
                <CardDescription>Train models on demand or schedule automatic retraining.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* ── Hot trigger ── */}
                <div className="rounded-xl border border-inkomoko-border bg-gradient-to-r from-inkomoko-bg/40 to-inkomoko-bg/20 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Play size={15} className="text-inkomoko-blue" /> Train Models Now
                      </h3>
                      <p className="text-xs text-inkomoko-muted mt-1">
                        Run the full training pipeline immediately. This trains all models (revenue, employment, risk) from the latest data. May take 2–5 minutes.
                      </p>
                    </div>
                    <button
                      disabled={training}
                      onClick={async () => {
                        setTraining(true);
                        setTrainResult(null);
                        setError(null);
                        try {
                          const res = await apiFetch<{ status: string; message: string; models_trained?: number }>(
                            "/ml/train",
                            { method: "POST" },
                            true,
                          );
                          setTrainResult(res);
                          if (res.status === "success") {
                            setSuccess(res.message);
                            setTimeout(() => setSuccess(null), 5000);
                          } else {
                            setError(res.message || "Training failed.");
                          }
                        } catch (e: any) {
                          setError(e?.message ?? "Training request failed.");
                        } finally {
                          setTraining(false);
                        }
                      }}
                      className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all whitespace-nowrap ${
                        training
                          ? "bg-amber-50 text-amber-600 border border-amber-200 cursor-wait animate-pulse"
                          : "bg-gradient-to-r from-inkomoko-blue to-[#0d4f87] text-white hover:shadow-lg hover:scale-105 border border-inkomoko-blue/30 cursor-pointer"
                      }`}
                    >
                      <Play size={14} />
                      {training ? "Training in progress…" : "Train All Models"}
                    </button>
                  </div>
                  {trainResult && (
                    <div className={`mt-3 rounded-lg p-3 text-xs ${
                      trainResult.status === "success"
                        ? "bg-green-50 border border-green-200 text-green-700"
                        : "bg-red-50 border border-red-200 text-red-700"
                    }`}>
                      <span className="font-medium">{trainResult.status === "success" ? "✓" : "✗"}</span>{" "}
                      {trainResult.message}
                      {trainResult.models_trained != null && (
                        <span className="ml-2 text-green-500">({trainResult.models_trained} models trained)</span>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Scheduled retraining settings ── */}
                <div className="rounded-xl border border-inkomoko-border bg-inkomoko-bg/20 p-4">
                  <h3 className="text-sm font-semibold mb-3">Scheduled Retraining</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <label className="col-span-2 flex items-center gap-2 p-3 rounded-lg border border-inkomoko-border bg-white">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-inkomoko-border text-inkomoko-blue focus:ring-inkomoko-blue/30"
                        checked={draft.retraining.enabled}
                        onChange={(e) => setDraft((prev) => prev ? { ...prev, retraining: { ...prev.retraining, enabled: e.target.checked } } : prev)}
                      />
                      Enable scheduled retraining
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
                    <label className="col-span-2 flex items-center gap-2 p-3 rounded-lg border border-inkomoko-border bg-white">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-inkomoko-border text-inkomoko-blue focus:ring-inkomoko-blue/30"
                        checked={draft.retraining.auto_deploy}
                        onChange={(e) => setDraft((prev) => prev ? { ...prev, retraining: { ...prev.retraining, auto_deploy: e.target.checked } } : prev)}
                      />
                      Auto-deploy improved model version
                    </label>
                  </div>
                </div>
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

          {/* Data Upload Tab */}
          {activeTab === "upload" && (
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Upload size={18} /> Data Upload</CardTitle>
                <CardDescription>Upload CSV or JSON files for baseline, endline, investment data, or bulk-create user accounts. Files are previewed before saving — you can proceed or cancel.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Status banners */}
                {uploadErrors && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <h4 className="mb-2 text-sm font-semibold text-red-700">Validation Errors</h4>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-red-600">
                      {uploadErrors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                    <button onClick={() => setUploadErrors(null)} className="mt-2 text-xs text-red-400 hover:text-red-600 underline">Dismiss</button>
                  </div>
                )}
                {uploadResult && (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                    <h4 className="mb-1 text-sm font-semibold text-green-700">Upload Successful</h4>
                    <p className="text-xs text-green-600">
                      {uploadResult.rows_uploaded != null
                        ? `${uploadResult.rows_uploaded} rows uploaded to ${uploadResult.dataset_type}. Total rows in table: ${uploadResult.total_rows_in_table}.`
                        : `${uploadResult.users_created} users created, ${uploadResult.users_skipped} skipped. ${uploadResult.note}`}
                    </p>
                    {uploadResult.skipped_emails?.length > 0 && (
                      <p className="mt-1 text-xs text-green-500">Skipped emails: {uploadResult.skipped_emails.join(", ")}</p>
                    )}
                    <button onClick={() => setUploadResult(null)} className="mt-2 text-xs text-green-400 hover:text-green-600 underline">Dismiss</button>
                  </div>
                )}

                {/* Baseline */}
                <UploadSection
                  title="Baseline Data"
                  description="Survey data from baseline assessments."
                  columns={[
                    { name: "client_id", required: true }, { name: "country", required: true }, { name: "survey_date", required: true },
                    { name: "job_created", required: true }, { name: "revenue", required: true }, { name: "business_sector", required: true },
                    { name: "age", required: false }, { name: "gender", required: false }, { name: "strata", required: false },
                    { name: "client_location", required: false }, { name: "nationality", required: false }, { name: "education_level", required: false },
                    { name: "only_income_earner", required: false }, { name: "number_of_people_reponsible", required: false },
                    { name: "business_location", required: false }, { name: "is_business_registered", required: false },
                    { name: "has_access_to_finance_in_past6months", required: false }, { name: "have_bank_account", required: false },
                    { name: "monthly_customer", required: false }, { name: "kept_sales_record", required: false }, { name: "hh_expense", required: false },
                  ]}
                  datasetType="baseline"
                  uploading={previewing && previewDatasetType === "baseline"}
                  onPreview={previewUpload}
                />

                {/* Endline */}
                <UploadSection
                  title="Endline Data"
                  description="Follow-up survey data from endline assessments."
                  columns={[
                    { name: "client_id", required: true }, { name: "country", required: true }, { name: "survey_date", required: true },
                    { name: "job_created", required: true }, { name: "revenue", required: true }, { name: "business_sector", required: true },
                    { name: "age", required: false }, { name: "gender", required: false }, { name: "strata", required: false },
                    { name: "client_location", required: false }, { name: "nationality", required: false }, { name: "education_level", required: false },
                    { name: "only_income_earner", required: false }, { name: "number_of_people_reponsible", required: false },
                    { name: "business_location", required: false }, { name: "is_business_registered", required: false },
                    { name: "has_access_to_finance_in_past6months", required: false }, { name: "have_bank_account", required: false },
                    { name: "monthly_customer", required: false }, { name: "kept_sales_record", required: false }, { name: "hh_expense", required: false },
                    { name: "nps_detractor", required: false }, { name: "nps_passive", required: false }, { name: "nps_promoter", required: false },
                    { name: "satisfied_yes", required: false }, { name: "satisfied_no", required: false },
                  ]}
                  datasetType="endline"
                  uploading={previewing && previewDatasetType === "endline"}
                  onPreview={previewUpload}
                />

                {/* Investment */}
                <UploadSection
                  title="Investment Data"
                  description="Loan and investment portfolio data. Numeric columns (appliedamount, currentbalance, etc.) and date columns (disbursementdate) are validated."
                  columns={[
                    { name: "loannumber", required: true }, { name: "country", required: true }, { name: "disbursementdate", required: true },
                    { name: "appliedamount", required: true }, { name: "approvedamount", required: true }, { name: "disbursedamount", required: true },
                    { name: "currentbalance", required: true }, { name: "daysinarrears", required: true }, { name: "loanstatus", required: true },
                    { name: "industrysectorofactivity", required: true },
                    { name: "clientid", required: false }, { name: "baselineendlineclientid", required: false },
                    { name: "purpose", required: false }, { name: "strata", required: false }, { name: "age", required: false },
                    { name: "gender", required: false }, { name: "nationality", required: false }, { name: "cycle", required: false },
                    { name: "province", required: false }, { name: "district", required: false },
                    { name: "submissiondate", required: false }, { name: "approvaldate", required: false },
                    { name: "disbursementyear", required: false }, { name: "loantype", required: false }, { name: "termsduration", required: false },
                    { name: "actualpaymentamount", required: false }, { name: "principalpaid", required: false },
                    { name: "interestpaid", required: false }, { name: "insurancefeepaid", required: false },
                    { name: "totallatefeespaid", required: false }, { name: "excessamountpaid", required: false },
                    { name: "interestwaived", required: false }, { name: "principalbalance", required: false },
                    { name: "interestbalance", required: false }, { name: "feesbalance", required: false },
                    { name: "amountpastdue", required: false }, { name: "principalpastdue", required: false },
                    { name: "interestpastdue", required: false }, { name: "feespastdue", required: false },
                    { name: "scheduledprincipalamount", required: false }, { name: "scheduledinterestamount", required: false },
                    { name: "scheduledfeessamount", required: false }, { name: "scheduledpaymentamount", required: false },
                    { name: "lastpaymentamount", required: false }, { name: "lastprincipalamount", required: false },
                    { name: "lastinterestamount", required: false }, { name: "lastfeesamount", required: false },
                    { name: "lastlatefeesamount", required: false }, { name: "lastexcessamount", required: false },
                    { name: "installmentinarrears", required: false }, { name: "lastpaymentdate", required: false },
                    { name: "businesssubsector", required: false },
                  ]}
                  datasetType="investment"
                  uploading={previewing && previewDatasetType === "investment"}
                  onPreview={previewUpload}
                />

                {/* Users */}
                <UploadSection
                  title="User Accounts"
                  description="Bulk-create user accounts from CSV or JSON. All uploaded users are set as INACTIVE by default — activate them in the Users tab. Valid roles: admin, program_manager, advisor, donor."
                  columns={[
                    { name: "email", required: true }, { name: "full_name", required: true },
                    { name: "password", required: true }, { name: "role", required: true },
                  ]}
                  datasetType="users"
                  uploading={previewing && previewDatasetType === "users"}
                  onPreview={previewUpload}
                />

                {/* ── Data Preview ── */}
                {previewData && (
                  <div ref={previewRef} className="rounded-xl border border-inkomoko-blue/30 bg-inkomoko-blue/5 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">
                        Preview: <span className="capitalize">{previewDatasetType}</span>{" "}
                        <span className="text-xs font-normal text-inkomoko-muted">
                          ({previewData.total} total row{previewData.total !== 1 ? "s" : ""} — showing first {previewData.rows.length})
                        </span>
                      </h4>
                    </div>

                    {/* Validation warnings */}
                    {previewData.errors.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <h5 className="text-xs font-semibold text-amber-700 mb-1">Validation warnings — upload blocked</h5>
                        <ul className="list-disc pl-4 space-y-0.5 text-xs text-amber-600">
                          {previewData.errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Scrollable preview table */}
                    <div className="max-h-80 overflow-auto rounded-lg border border-inkomoko-border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-inkomoko-bg border-b border-inkomoko-border">
                          <tr>
                            <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-inkomoko-muted">#</th>
                            {previewData.columns.map((col) => (
                              <th key={col} className="px-2 py-1.5 text-left text-[11px] font-semibold text-inkomoko-muted whitespace-nowrap font-mono">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.rows.map((row, ri) => (
                            <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-inkomoko-bg/30"}>
                              <td className="px-2 py-1 text-inkomoko-muted">{ri + 1}</td>
                              {previewData.columns.map((col) => (
                                <td key={col} className="px-2 py-1 whitespace-nowrap max-w-[200px] truncate">
                                  {row[col] ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-3">
                      <button
                        disabled={previewData.errors.length > 0 || !!uploadingDataset}
                        onClick={confirmUpload}
                        className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-all ${
                          previewData.errors.length > 0 || !!uploadingDataset
                            ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                            : "bg-gradient-to-r from-green-600 to-green-700 text-white hover:shadow-lg hover:scale-105 border border-green-500/30 cursor-pointer"
                        }`}
                      >
                        {uploadingDataset ? "Uploading…" : "Proceed"}
                      </button>
                      <button
                        onClick={cancelPreview}
                        className="rounded-lg border border-inkomoko-border px-5 py-2 text-sm font-medium text-inkomoko-muted hover:bg-inkomoko-bg transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
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

function UploadSection({
  title,
  description,
  columns,
  datasetType,
  uploading,
  onPreview,
}: {
  title: string;
  description: string;
  columns: { name: string; required: boolean }[];
  datasetType: string;
  uploading: boolean;
  onPreview: (datasetType: string, file: File) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const downloadTemplate = (format: "csv" | "json") => {
    const allNames = columns.map((c) => c.name);
    let content: string;
    let mime: string;
    if (format === "csv") {
      // Header row with (required)/(optional) comments on a preceding line
      const commentLine = columns.map((c) => (c.required ? "required" : "optional")).join(",");
      content = `# ${commentLine}\n${allNames.join(",")}\n`;
      mime = "text/csv";
    } else {
      const row = Object.fromEntries(
        columns.map((c) => [c.name, c.required ? "(required)" : "(optional)"])
      );
      content = JSON.stringify([row], null, 2);
      mime = "application/json";
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${datasetType}_template.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const requiredCols = columns.filter((c) => c.required);
  const optionalCols = columns.filter((c) => !c.required);

  return (
    <div className="rounded-xl border border-inkomoko-border bg-inkomoko-bg/20 p-4">
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-xs text-inkomoko-muted mb-3">{description}</p>
      <div className="mb-2">
        <span className="text-[11px] font-medium text-inkomoko-muted block mb-1.5">
          Required columns <span className="text-[10px] text-inkomoko-muted/60">({requiredCols.length})</span>
        </span>
        <div className="flex flex-wrap gap-1.5">
          {requiredCols.map((col) => (
            <span key={col.name} className="inline-block rounded-md bg-inkomoko-blue/10 text-inkomoko-blue px-2 py-0.5 text-[11px] font-mono">
              {col.name}
            </span>
          ))}
        </div>
      </div>
      {optionalCols.length > 0 && (
        <div className="mb-3">
          <span className="text-[11px] font-medium text-inkomoko-muted block mb-1.5">
            Optional columns <span className="text-[10px] text-inkomoko-muted/60">({optionalCols.length})</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {optionalCols.map((col) => (
              <span key={col.name} className="inline-block rounded-md bg-gray-100 text-gray-500 px-2 py-0.5 text-[11px] font-mono">
                {col.name}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-medium text-inkomoko-muted">Download template:</span>
        <button onClick={() => downloadTemplate("csv")} className="inline-flex items-center gap-1 rounded-md border border-inkomoko-border px-2 py-0.5 text-[11px] font-medium text-inkomoko-muted hover:bg-inkomoko-bg transition">
          <Download size={10} /> CSV
        </button>
        <button onClick={() => downloadTemplate("json")} className="inline-flex items-center gap-1 rounded-md border border-inkomoko-border px-2 py-0.5 text-[11px] font-medium text-inkomoko-muted hover:bg-inkomoko-bg transition">
          <Download size={10} /> JSON
        </button>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex-1 relative">
          <input
            type="file"
            accept=".csv,.json"
            className="w-full text-sm text-inkomoko-muted file:mr-3 file:rounded-lg file:border-0 file:bg-inkomoko-blue/10 file:px-4 file:py-2 file:text-xs file:font-medium file:text-inkomoko-blue hover:file:bg-inkomoko-blue/20 file:cursor-pointer file:transition"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          disabled={!selectedFile || uploading}
          onClick={() => selectedFile && onPreview(datasetType, selectedFile)}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all whitespace-nowrap ${
            !selectedFile || uploading
              ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
              : "bg-gradient-to-r from-inkomoko-blue to-[#0d4f87] text-white hover:shadow-lg hover:scale-105 border border-inkomoko-blue/30 cursor-pointer"
          }`}
        >
          <Upload size={14} />
          {uploading ? "Loading preview…" : "Preview & Upload"}
        </button>
      </div>
    </div>
  );
}

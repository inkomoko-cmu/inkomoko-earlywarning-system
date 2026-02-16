"use client";

import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Database, GitBranch, Globe, Lock } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";

export default function SettingsPage() {
  return (
    <RequireRole allow={["Admin"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-inkomoko-blue">Settings</h1>
          <p className="text-sm text-inkomoko-muted mt-1">
            Platform configuration, governance policies, and versioning controls.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database size={18} /> Data layer
              </CardTitle>
              <CardDescription>
                PostgreSQL-backed backend with semantic enrichment for cross-country comparability.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Badge tone="blue">PostgreSQL</Badge>
              <Badge tone="orange">Semantic layer (embeddings + ontology)</Badge>
              <div className="text-sm text-inkomoko-muted mt-2">
                Governance rules are enforced centrally through role-based masking,
                consent flags, and auditable logs.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock size={18} /> Governance
              </CardTitle>
              <CardDescription>
                Policies-as-code for privacy, traceability, and donor compliance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Badge tone="success">Role-based access</Badge>
              <Badge tone="warning">Audit trails</Badge>
              <Badge tone="danger">PII minimization</Badge>
              <div className="text-sm text-inkomoko-muted mt-2">
                Export permissions and data masking are evaluated per role
                and logged for compliance review.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch size={18} /> Versioning
              </CardTitle>
              <CardDescription>
                Stable taxonomy and reproducible pipelines.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Badge tone="blue">Risk taxonomy v1.2</Badge>
              <Badge tone="orange">Model suite v1.x</Badge>
              <div className="text-sm text-inkomoko-muted mt-2">
                Definitions are maintained as a living standard to prevent
                shifting metrics over time and across countries.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe size={18} /> Low-bandwidth readiness
              </CardTitle>
              <CardDescription>
                Equity-driven access for field contexts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-inkomoko-muted leading-relaxed">
                The platform is designed for responsive delivery with caching
                patterns and offline-friendly access modes to support constrained
                connectivity environments.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </RequireRole>
  );
}

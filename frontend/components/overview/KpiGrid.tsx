"use client";

import { KPIS } from "@/lib/data";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

export function KpiGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {KPIS.map((k) => {
        const icon = k.trend === "up" ? <ArrowUpRight size={14} /> : k.trend === "down" ? <ArrowDownRight size={14} /> : <ArrowRight size={14} />;
        return (
          <Card key={k.label}>
            <CardHeader>
              <CardDescription>{k.label}</CardDescription>
              <div className="mt-1 flex items-end justify-between">
                <CardTitle className="text-2xl">{k.value}</CardTitle>
                <Badge tone={k.tone} className="gap-1">{icon}{k.delta}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-inkomoko-muted">
                Updated hourly · aligned across programs and countries.
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

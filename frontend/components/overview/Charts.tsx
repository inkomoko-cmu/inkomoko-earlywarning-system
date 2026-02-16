"use client";

import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { ENTERPRISES } from "@/lib/data";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar, Legend } from "recharts";

const COLORS = {
  low: "#16A34A",
  med: "#F59E0B",
  high: "#DC2626",
  blue: "#0B2E5B",
  orange: "#F05A28",
};

export function RiskDistribution() {
  const tiers = { Low: 0, Medium: 0, High: 0 } as Record<string, number>;
  ENTERPRISES.forEach((e) => (tiers[e.riskTier] += 1));
  const data = [
    { name: "Low", value: tiers.Low },
    { name: "Medium", value: tiers.Medium },
    { name: "High", value: tiers.High },
  ];

  return (
    <Card className="h-[340px]">
      <CardHeader>
        <CardTitle>Risk Tier Distribution</CardTitle>
        <CardDescription>3‑month vulnerability tiers across the active portfolio.</CardDescription>
      </CardHeader>
      <CardContent className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={3}>
              <Cell fill={COLORS.low} />
              <Cell fill={COLORS.med} />
              <Cell fill={COLORS.high} />
            </Pie>
            <RTooltip />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function RevenueTrend() {
  const data = [
    { month: "Sep", revenue: 5.8 },
    { month: "Oct", revenue: 6.1 },
    { month: "Nov", revenue: 6.6 },
    { month: "Dec", revenue: 6.9 },
    { month: "Jan", revenue: 7.4 },
    { month: "Feb", revenue: 7.9 },
  ];
  return (
    <Card className="h-[340px]">
      <CardHeader>
        <CardTitle>Projected Revenue Trend</CardTitle>
        <CardDescription>Short-horizon forecast, aggregated across countries (USD millions).</CardDescription>
      </CardHeader>
      <CardContent className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <RTooltip />
            <Line type="monotone" dataKey="revenue" stroke={COLORS.orange} strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function JobsFlow() {
  const data = [
    { month: "Sep", created: 410, lost: 190 },
    { month: "Oct", created: 440, lost: 205 },
    { month: "Nov", created: 510, lost: 220 },
    { month: "Dec", created: 560, lost: 240 },
    { month: "Jan", created: 610, lost: 260 },
    { month: "Feb", created: 670, lost: 280 },
  ];
  return (
    <Card className="h-[340px]">
      <CardHeader>
        <CardTitle>Jobs Created vs Jobs Lost</CardTitle>
        <CardDescription>3‑month outlook tracked over time (portfolio level).</CardDescription>
      </CardHeader>
      <CardContent className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <RTooltip />
            <Legend />
            <Bar dataKey="created" fill={COLORS.blue} radius={[8, 8, 0, 0]} />
            <Bar dataKey="lost" fill={COLORS.high} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function DonorScorecard() {
  const data = [
    { pillar: "Growth", score: 78 },
    { pillar: "Sustainability", score: 72 },
    { pillar: "Velocity", score: 81 },
    { pillar: "Quality", score: 74 },
  ];
  return (
    <Card className="h-[340px]">
      <CardHeader>
        <CardTitle>Balanced Scorecard</CardTitle>
        <CardDescription>Strategic view across the pillars donors monitor.</CardDescription>
      </CardHeader>
      <CardContent className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, 100]} />
            <YAxis type="category" dataKey="pillar" />
            <RTooltip />
            <Bar dataKey="score" fill={COLORS.orange} radius={[8, 8, 8, 8]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

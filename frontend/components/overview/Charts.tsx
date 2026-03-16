"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
  Area,
  AreaChart,
} from "recharts";

const COLORS = {
  low: "#16A34A",
  med: "#F59E0B",
  high: "#DC2626",
  blue: "#0B2E5B",
  orange: "#F05A28",
  teal: "#0891b2",
  indigo: "#4f46e5",
};

type RiskData = {
  name: string;
  value: number;
  pct: number;
};

type TrendPoint = {
  month: string;
  value: number;
  upper_ci: number;
  lower_ci: number;
  n?: number;
};

type TrendsResponse = {
  revenue: TrendPoint[];
  jobs_created: TrendPoint[];
};

type JobsSummary = {
  created: number;
  lost: number;
};

export function RiskDistribution() {
  const [data, setData] = useState<RiskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    const loadRiskDistribution = async () => {
      try {
        setLoading(true);
        setApiError(null);

        const res = await apiFetch<RiskData[]>(
          "/portfolio/risk-distribution",
          { method: "GET" },
          true
        );

        setData(res || []);
      } catch (e: any) {
        setApiError(e?.message ?? "Failed to load risk distribution.");
      } finally {
        setLoading(false);
      }
    };

    loadRiskDistribution();
  }, []);

  return (
    <Card className="h-[340px]">
      <CardHeader>
        <CardTitle>Risk Tier Distribution</CardTitle>
        <CardDescription>Portfolio risk composition from latest surveys.</CardDescription>
      </CardHeader>
      <CardContent className="h-[260px]">
        {loading ? (
          <div className="text-sm text-inkomoko-muted">Loading chart...</div>
        ) : apiError ? (
          <div className="text-sm text-red-600">{apiError}</div>
        ) : data.length === 0 ? (
          <div className="text-sm text-inkomoko-muted">No risk data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={3}>
                <Cell fill={COLORS.low} />
                <Cell fill={COLORS.med} />
                <Cell fill={COLORS.high} />
              </Pie>
              <RTooltip formatter={(value: number, name: string) => `${value} (${data.find(d => d.value === value)?.pct.toFixed(1)}%)`} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function RevenueTrend() {
  const [data, setData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    const loadRevenueTrend = async () => {
      try {
        setLoading(true);
        setApiError(null);

        const res = await apiFetch<TrendsResponse>(
          "/portfolio/trends?months=24",
          { method: "GET" },
          true
        );

        setData(res?.revenue || []);
      } catch (e: any) {
        setApiError(e?.message ?? "Failed to load revenue trend.");
      } finally {
        setLoading(false);
      }
    };

    loadRevenueTrend();
  }, []);

  return (
    <Card className="h-[340px]">
      <CardHeader>
        <CardTitle>Revenue Trend (3M Horizon)</CardTitle>
        <CardDescription>Historical average revenue with 95% confidence bands.</CardDescription>
      </CardHeader>
      <CardContent className="h-[260px]">
        {loading ? (
          <div className="text-sm text-inkomoko-muted">Loading chart...</div>
        ) : apiError ? (
          <div className="text-sm text-red-600">{apiError}</div>
        ) : data.length === 0 ? (
          <div className="text-sm text-inkomoko-muted">No revenue trend available.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <RTooltip formatter={(value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              <Area
                type="monotone"
                dataKey="upper_ci"
                stroke={COLORS.orange}
                fill={COLORS.orange}
                fillOpacity={0.1}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={COLORS.orange}
                strokeWidth={3}
                fill="transparent"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="lower_ci"
                stroke={COLORS.orange}
                fill={COLORS.orange}
                fillOpacity={0.1}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function JobsFlow() {
  const [data, setData] = useState<TrendPoint[]>([]);
  const [jobsSummary, setJobsSummary] = useState<JobsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    const loadJobsFlow = async () => {
      try {
        setLoading(true);
        setApiError(null);

        const trendsRes = await apiFetch<TrendsResponse>(
          "/portfolio/trends?months=24",
          { method: "GET" },
          true
        );
        setData(trendsRes?.jobs_created || []);

        const summaryRes = await apiFetch<JobsSummary>(
          "/portfolio/jobs-summary",
          { method: "GET" },
          true
        );
        setJobsSummary(summaryRes);
      } catch (e: any) {
        setApiError(e?.message ?? "Failed to load jobs flow.");
      } finally {
        setLoading(false);
      }
    };

    loadJobsFlow();
  }, []);

  // Combine created and lost into stacked bar format
  const chartData = data.map((d) => ({
    month: d.month,
    created: d.value,
    lost: Math.abs(d.lower_ci - d.value),
  }));

  return (
    <Card className="h-[340px]">
      <CardHeader>
        <CardTitle>Employment Flow</CardTitle>
        <CardDescription>
          {jobsSummary ? (
            <>
              {jobsSummary.created.toLocaleString()} created, {jobsSummary.lost.toLocaleString()} lost (3M horizon)
            </>
          ) : (
            "Jobs created vs lost over time."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="h-[260px]">
        {loading ? (
          <div className="text-sm text-inkomoko-muted">Loading chart...</div>
        ) : apiError ? (
          <div className="text-sm text-red-600">{apiError}</div>
        ) : chartData.length === 0 ? (
          <div className="text-sm text-inkomoko-muted">No employment data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <RTooltip />
              <Legend />
              <Bar dataKey="created" fill={COLORS.blue} radius={[8, 8, 0, 0]} />
              <Bar dataKey="lost" fill={COLORS.high} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function DonorScorecard() {
  const [data, setData] = useState<Array<{ pillar: string; score: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    const loadScorecard = async () => {
      try {
        setLoading(true);
        setApiError(null);

        // Placeholder: compute scorecard from overview metrics
        const overviewRes = await apiFetch<any>(
          "/portfolio/overview",
          { method: "GET" },
          true
        );

        // Simple scoring logic: derive from metrics
        const growth = 50 + (overviewRes.total_jobs_created_3m / 100); // jobs → growth
        const sustainability = 50 + (overviewRes.nps_promoter_pct / 2); // NPS → sustainability
        const velocity = 50 + ((1 - overviewRes.par30_pct / 100) * 50); // PAR30 → quality
        const quality = 50 + ((overviewRes.high_risk_count === 0 ? 50 : 0)); // risk → quality

        setData([
          { pillar: "Growth", score: Math.min(100, growth) },
          { pillar: "Sustainability", score: Math.min(100, sustainability) },
          { pillar: "Velocity", score: Math.min(100, velocity) },
          { pillar: "Quality", score: Math.min(100, quality) },
        ]);
      } catch (e: any) {
        setApiError(e?.message ?? "Failed to load scorecard.");
      } finally {
        setLoading(false);
      }
    };

    loadScorecard();
  }, []);

  return (
    <Card className="h-[340px]">
      <CardHeader>
        <CardTitle>Balanced Scorecard</CardTitle>
        <CardDescription>Strategic pillars aligned to donor expectations.</CardDescription>
      </CardHeader>
      <CardContent className="h-[260px]">
        {loading ? (
          <div className="text-sm text-inkomoko-muted">Loading chart...</div>
        ) : apiError ? (
          <div className="text-sm text-red-600">{apiError}</div>
        ) : data.length === 0 ? (
          <div className="text-sm text-inkomoko-muted">No scorecard data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis type="category" dataKey="pillar" />
              <RTooltip />
              <Bar dataKey="score" fill={COLORS.orange} radius={[8, 8, 8, 8]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}


// "use client";

// import { useEffect, useState } from "react";
// import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
// import { apiFetch } from "@/lib/api";
// import {
//   ResponsiveContainer,
//   PieChart,
//   Pie,
//   Cell,
//   Tooltip as RTooltip,
//   LineChart,
//   Line,
//   XAxis,
//   YAxis,
//   CartesianGrid,
//   BarChart,
//   Bar,
//   Legend,
// } from "recharts";

// const COLORS = {
//   low: "#16A34A",
//   med: "#F59E0B",
//   high: "#DC2626",
//   blue: "#0B2E5B",
//   orange: "#F05A28",
// };

// type RiskTierRow = {
//   name: string;
//   value: number;
// };

// type JobsSummary = {
//   created: number;
//   lost: number;
// };

// export function RiskDistribution() {
//   const [data, setData] = useState<RiskTierRow[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [apiError, setApiError] = useState<string | null>(null);

//   useEffect(() => {
//     const loadRiskDistribution = async () => {
//       try {
//         setLoading(true);
//         setApiError(null);

//         const res = await apiFetch<RiskTierRow[]>(
//           "/portfolio/risk-distribution",
//           { method: "GET" },
//           true
//         );

//         setData(res);
//       } catch (e: any) {
//         setApiError(e?.message ?? "Failed to load risk distribution.");
//       } finally {
//         setLoading(false);
//       }
//     };

//     loadRiskDistribution();
//   }, []);

//   return (
//     <Card className="h-[340px]">
//       <CardHeader>
//         <CardTitle>Risk Tier Distribution</CardTitle>
//         <CardDescription>Portfolio risk mix based on live backend data.</CardDescription>
//       </CardHeader>
//       <CardContent className="h-[260px]">
//         {loading ? (
//           <div className="text-sm text-inkomoko-muted">Loading chart...</div>
//         ) : apiError ? (
//           <div className="text-sm text-red-600">{apiError}</div>
//         ) : (
//           <ResponsiveContainer width="100%" height="100%">
//             <PieChart>
//               <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={3}>
//                 <Cell fill={COLORS.low} />
//                 <Cell fill={COLORS.med} />
//                 <Cell fill={COLORS.high} />
//               </Pie>
//               <RTooltip />
//             </PieChart>
//           </ResponsiveContainer>
//         )}
//       </CardContent>
//     </Card>
//   );
// }

// export function RevenueTrend() {
//   const data = [
//     { month: "Sep", revenue: 5.8 },
//     { month: "Oct", revenue: 6.1 },
//     { month: "Nov", revenue: 6.6 },
//     { month: "Dec", revenue: 6.9 },
//     { month: "Jan", revenue: 7.4 },
//     { month: "Feb", revenue: 7.9 },
//   ];

//   return (
//     <Card className="h-[340px]">
//       <CardHeader>
//         <CardTitle>Projected Revenue Trend</CardTitle>
//         <CardDescription>Short-horizon forecast, aggregated across countries (USD millions).</CardDescription>
//       </CardHeader>
//       <CardContent className="h-[260px]">
//         <ResponsiveContainer width="100%" height="100%">
//           <LineChart data={data}>
//             <CartesianGrid strokeDasharray="3 3" />
//             <XAxis dataKey="month" />
//             <YAxis />
//             <RTooltip />
//             <Line type="monotone" dataKey="revenue" stroke={COLORS.orange} strokeWidth={3} dot={false} />
//           </LineChart>
//         </ResponsiveContainer>
//       </CardContent>
//     </Card>
//   );
// }

// export function JobsFlow() {
//   const [data, setData] = useState<{ name: string; created: number; lost: number }[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [apiError, setApiError] = useState<string | null>(null);

//   useEffect(() => {
//     const loadJobsFlow = async () => {
//       try {
//         setLoading(true);
//         setApiError(null);

//         const res = await apiFetch<JobsSummary>(
//           "/portfolio/jobs-summary",
//           { method: "GET" },
//           true
//         );

//         setData([
//           {
//             name: "3M Jobs Outlook",
//             created: res.created ?? 0,
//             lost: res.lost ?? 0,
//           },
//         ]);
//       } catch (e: any) {
//         setApiError(e?.message ?? "Failed to load jobs summary.");
//       } finally {
//         setLoading(false);
//       }
//     };

//     loadJobsFlow();
//   }, []);

//   return (
//     <Card className="h-[340px]">
//       <CardHeader>
//         <CardTitle>Jobs Created vs Jobs Lost</CardTitle>
//         <CardDescription>Live 3-month jobs outlook from impact data.</CardDescription>
//       </CardHeader>
//       <CardContent className="h-[260px]">
//         {loading ? (
//           <div className="text-sm text-inkomoko-muted">Loading chart...</div>
//         ) : apiError ? (
//           <div className="text-sm text-red-600">{apiError}</div>
//         ) : (
//           <ResponsiveContainer width="100%" height="100%">
//             <BarChart data={data}>
//               <CartesianGrid strokeDasharray="3 3" />
//               <XAxis dataKey="name" />
//               <YAxis />
//               <RTooltip />
//               <Legend />
//               <Bar dataKey="created" fill={COLORS.blue} radius={[8, 8, 0, 0]} />
//               <Bar dataKey="lost" fill={COLORS.high} radius={[8, 8, 0, 0]} />
//             </BarChart>
//           </ResponsiveContainer>
//         )}
//       </CardContent>
//     </Card>
//   );
// }

// export function DonorScorecard() {
//   const data = [
//     { pillar: "Growth", score: 78 },
//     { pillar: "Sustainability", score: 72 },
//     { pillar: "Velocity", score: 81 },
//     { pillar: "Quality", score: 74 },
//   ];

//   return (
//     <Card className="h-[340px]">
//       <CardHeader>
//         <CardTitle>Balanced Scorecard</CardTitle>
//         <CardDescription>Strategic view across the pillars donors monitor.</CardDescription>
//       </CardHeader>
//       <CardContent className="h-[260px]">
//         <ResponsiveContainer width="100%" height="100%">
//           <BarChart data={data} layout="vertical" margin={{ left: 30 }}>
//             <CartesianGrid strokeDasharray="3 3" />
//             <XAxis type="number" domain={[0, 100]} />
//             <YAxis type="category" dataKey="pillar" />
//             <RTooltip />
//             <Bar dataKey="score" fill={COLORS.orange} radius={[8, 8, 8, 8]} />
//           </BarChart>
//         </ResponsiveContainer>
//       </CardContent>
//     </Card>
//   );
// }
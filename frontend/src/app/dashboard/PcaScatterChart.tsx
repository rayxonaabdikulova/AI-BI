"use client";

import {
  CartesianGrid,
  Legend,
  type TooltipProps,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { useLanguage } from "@/i18n/LanguageContext";

export type PcaRow = {
  pca1: number;
  pca2: number;
  cluster: number;
  idx: number;
};

const CLUSTER_FILLS = [
  "#0ea5e9",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
];

function clusterColor(cluster: number): string {
  return CLUSTER_FILLS[Math.abs(cluster) % CLUSTER_FILLS.length] ?? "#64748b";
}

function clusterDisplayName(cluster: number, groupLabel: string): string {
  const alpha = String.fromCharCode(65 + (Math.abs(cluster) % 26));
  return `${groupLabel} ${alpha}`;
}

function PcaTooltip({
  active,
  payload,
  axis1Label,
  axis2Label,
  groupLabel,
}: TooltipProps<number, string> & { axis1Label: string; axis2Label: string; groupLabel: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as Partial<PcaRow> | undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
        {typeof point.cluster === "number" ? clusterDisplayName(point.cluster, groupLabel) : "-"}
      </p>
      <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">
        {axis1Label}: {typeof point.pca1 === "number" ? point.pca1.toFixed(4) : "-"}
      </p>
      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
        {axis2Label}: {typeof point.pca2 === "number" ? point.pca2.toFixed(4) : "-"}
      </p>
    </div>
  );
}

export default function PcaScatterChart({ rows }: { rows: PcaRow[] }) {
  const { t } = useLanguage();
  const axis1Label = t("chart.pca1");
  const axis2Label = t("chart.pca2");
  const groupLabel = t("chart.group");
  const clusters = Array.from(new Set(rows.map((r) => r.cluster))).sort(
    (a, b) => a - b,
  );

  return (
    <div className="h-[420px] w-full rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-950/40">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 16, right: 16, bottom: 16, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis
            type="number"
            dataKey="pca1"
            name={axis1Label}
            tick={{ fill: "#71717a", fontSize: 12 }}
            axisLine={{ stroke: "#d4d4d8" }}
            tickLine={{ stroke: "#d4d4d8" }}
          />
          <YAxis
            type="number"
            dataKey="pca2"
            name={axis2Label}
            tick={{ fill: "#71717a", fontSize: 12 }}
            axisLine={{ stroke: "#d4d4d8" }}
            tickLine={{ stroke: "#d4d4d8" }}
          />
          <ZAxis range={[64, 64]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={<PcaTooltip axis1Label={axis1Label} axis2Label={axis2Label} groupLabel={groupLabel} />}
            formatter={(value, name) => [
              typeof value === "number" ? value.toFixed(4) : value,
              name,
            ]}
            labelFormatter={() => t("chart.tooltipPoint")}
          />
          <Legend />
          {clusters.map((c) => (
            <Scatter
              key={c}
              name={clusterDisplayName(c, groupLabel)}
              data={rows.filter((r) => r.cluster === c)}
              fill={clusterColor(c)}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

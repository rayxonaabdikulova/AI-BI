"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import axios from "axios";
import jsPDF from "jspdf";
import { toPng } from "html-to-image";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  AlertTriangle,
  BarChart2,
  CalendarDays,
  Database,
  DollarSign,
  Download,
  FileSpreadsheet,
  Layers,
  LineChart as LineChartIcon,
  Loader2,
  Sparkles,
  Users,
  UploadCloud,
} from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { getApiBaseUrl } from "@/lib/api";
import type { PcaRow } from "./PcaScatterChart";
import { ChatAssistant } from "./ChatAssistant";

const PcaScatterChart = dynamic(() => import("./PcaScatterChart"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
      Loading chart...
    </div>
  ),
});

type UploadApiResponse = {
  filename: string;
  preview_row_count: number;
  total_rows: number;
  total_columns: number;
  preview: Record<string, unknown>[];
};

type ClusterApiResponse = {
  n_clusters_used: number;
  cluster_labels: number[];
  numeric_feature_columns: string[];
  pca_coordinates: { pca1: number; pca2: number }[];
};

type ForecastPoint = {
  date: string;
  historical_value: number | null;
  predicted_value: number | null;
};

type ForecastDataRow = {
  date: string;
  historical_value: number | null;
  predicted_value: number | null;
};

type DonutDatum = {
  name: string;
  value: number;
};

type ActionableInsight = {
  id: string;
  text: string;
};
type DrilldownSortKey = "name" | "id" | "spend" | "frequency" | "recency" | "cluster";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b"];
const MAX_PCA_POINTS_FOR_RENDER = 2500;
const DRILLDOWN_PAGE_SIZE = 8;

function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
    return typeof detail === "string" ? detail : err.message;
  }
  return err instanceof Error ? err.message : "Request failed";
}

function isUnauthorized(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 401;
}

function inferForecastColumns(rows: Record<string, unknown>[]): { dateCol: string; valueCol: string } | null {
  if (!rows.length) return null;
  const keys = Object.keys(rows[0] ?? {});
  if (!keys.length) return null;

  let bestDateCol: string | null = null;
  for (const preferred of ["date", "transaction_date"]) {
    if (keys.includes(preferred)) {
      bestDateCol = preferred;
      break;
    }
  }
  if (!bestDateCol) bestDateCol = "date";

  let bestValueCol: string | null = null;
  let bestValueScore = 0;
  for (const key of keys) {
    if (key === bestDateCol) continue;
    let ok = 0;
    for (const row of rows) {
      const value = row[key];
      if (value == null) continue;
      const num = Number(value);
      if (Number.isFinite(num)) ok++;
    }
    const score = ok / rows.length;
    if (score > bestValueScore) {
      bestValueScore = score;
      bestValueCol = key;
    }
  }

  if (!bestValueCol || bestValueScore < 0.5) return null;
  return { dateCol: bestDateCol, valueCol: bestValueCol };
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "$0.00";
  return `$${Number(value).toFixed(2)}`;
}

function clusterDisplayName(clusterId: number, groupLabel: string): string {
  const alpha = String.fromCharCode(65 + (Math.abs(clusterId) % 26));
  return `${groupLabel} ${alpha}`;
}

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toNumeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function samplePcaRows(rows: PcaRow[], maxPoints: number, seed = 42): PcaRow[] {
  if (rows.length <= maxPoints) return rows;

  const byCluster = new Map<number, PcaRow[]>();
  for (const row of rows) {
    const bucket = byCluster.get(row.cluster) ?? [];
    bucket.push(row);
    byCluster.set(row.cluster, bucket);
  }

  const total = rows.length;
  const sampled: PcaRow[] = [];

  // Allocate samples proportionally per cluster while keeping at least one point.
  const quotas = Array.from(byCluster.entries()).map(([cluster, bucket]) => {
    const ratio = bucket.length / total;
    const quota = Math.max(1, Math.floor(maxPoints * ratio));
    return { cluster, bucket, quota };
  });

  let used = quotas.reduce((sum, q) => sum + q.quota, 0);
  // Trim overflow from largest clusters first.
  if (used > maxPoints) {
    quotas.sort((a, b) => b.bucket.length - a.bucket.length);
    for (const q of quotas) {
      if (used <= maxPoints) break;
      const removable = Math.min(q.quota - 1, used - maxPoints);
      if (removable > 0) {
        q.quota -= removable;
        used -= removable;
      }
    }
  }
  // Distribute remaining slots to largest clusters.
  if (used < maxPoints) {
    quotas.sort((a, b) => b.bucket.length - a.bucket.length);
    let i = 0;
    while (used < maxPoints && quotas.length > 0) {
      const q = quotas[i % quotas.length];
      if (q.quota < q.bucket.length) {
        q.quota += 1;
        used += 1;
      }
      i += 1;
      if (i > quotas.length * maxPoints) break;
    }
  }

  const rngBase = Math.abs(seed) + 1;
  for (const q of quotas) {
    if (q.quota >= q.bucket.length) {
      sampled.push(...q.bucket);
      continue;
    }
    // Deterministic pseudo-random selection (stable across renders).
    const keyed = q.bucket
      .map((item) => ({
        item,
        key:
          ((item.idx + 1) * 2654435761 +
            (item.cluster + 11) * 805459861 +
            rngBase * 104729) >>>
          0,
      }))
      .sort((a, b) => a.key - b.key)
      .slice(0, q.quota)
      .map((x) => x.item);
    sampled.push(...keyed);
  }

  return sampled.slice(0, maxPoints);
}

function DonutRevenueTooltip({
  active,
  payload,
  formatter,
}: TooltipProps<number, string> & { formatter: (value: number) => string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as DonutDatum | undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{point.name}</p>
      <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatter(point.value)}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { t, language } = useLanguage();
  const { token, initialized, logout } = useAuth();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [segmenting, setSegmenting] = useState(false);
  const [isLoadingForecast, setIsLoadingForecast] = useState(false);
  const [uploadData, setUploadData] = useState<UploadApiResponse | null>(null);
  const [clusterResult, setClusterResult] = useState<ClusterApiResponse | null>(null);
  const [clusterData, setClusterData] = useState<any[]>([]);
  const [forecastData, setForecastData] = useState<ForecastDataRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [drilldownQuery, setDrilldownQuery] = useState("");
  const [debouncedDrilldownQuery, setDebouncedDrilldownQuery] = useState("");
  const [drilldownPage, setDrilldownPage] = useState(1);
  const [drilldownSortKey, setDrilldownSortKey] = useState<DrilldownSortKey>("spend");
  const [drilldownSortDir, setDrilldownSortDir] = useState<"asc" | "desc">("desc");
  const isAnalyzing = uploading || segmenting;

  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const numberLocale = useMemo(() => {
    if (language === "uz") return "uz-UZ";
    if (language === "ru") return "ru-RU";
    return "en-US";
  }, [language]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    if (!initialized) return;
    if (!token) {
      router.replace("/login");
    }
  }, [initialized, isClient, token, router]);

  const chartRows: PcaRow[] = useMemo(() => {
    if (!clusterResult) return [];
    return clusterResult.pca_coordinates.map((point, idx) => ({
      pca1: point.pca1,
      pca2: point.pca2,
      cluster: clusterResult.cluster_labels[idx] ?? 0,
      idx,
    }));
  }, [clusterResult]);

  const chartRowsForRender = useMemo(
    () => samplePcaRows(chartRows, MAX_PCA_POINTS_FOR_RENDER, 42),
    [chartRows],
  );

  const handleExportPDF = useCallback(async () => {
    const reportRoot = document.getElementById("report-content");
    if (!reportRoot) {
      setError("Report content not found.");
      return;
    }
    setError(null);
    try {
      const imageData = await toPng(reportRoot, {
        cacheBust: true,
        pixelRatio: 2,
      });
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const elementWidth = reportRoot.offsetWidth || 1;
      const elementHeight = reportRoot.offsetHeight || 1;
      const pdfHeight = (elementHeight * pdfWidth) / elementWidth;
      pdf.addImage(imageData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save("AI_Business_Report.pdf");
    } catch (err) {
      console.error("PDF generation failed", err);
      setError(getErrorMessage(err));
    }
  }, []);

  const handleExportExcel = useCallback(async () => {
    if (!clusterResult?.cluster_labels?.length || !uploadData?.preview?.length) {
      setError(t("dashboard.clusterInsights.empty"));
      return;
    }

    setError(null);
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Customer Segments");
      worksheet.columns = [
        { header: t("excel.transaction_id"), key: "transaction_id", width: 25 },
        { header: t("excel.customer_name"), key: "customer_name", width: 25 },
        { header: t("excel.total_spent_usd"), key: "total_spent_usd", width: 25 },
        { header: t("excel.purchase_frequency"), key: "purchase_frequency", width: 25 },
        { header: t("excel.days_since_last_purchase"), key: "days_since_last_purchase", width: 25 },
        { header: t("excel.cluster"), key: "cluster", width: 25 },
      ];

      const rows = uploadData.preview.map((row, idx) => ({
        transaction_id: row["transaction_id"] ?? "",
        customer_name: row["customer_name"] ?? "",
        total_spent_usd: row["total_spent_usd"] ?? "",
        purchase_frequency: row["purchase_frequency"] ?? "",
        days_since_last_purchase: row["days_since_last_purchase"] ?? "",
        cluster: clusterResult.cluster_labels[idx] ?? "",
      }));

      rows.forEach((row) => {
        worksheet.addRow(row);
      });

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1F2937" },
        };
        cell.alignment = { vertical: "middle", horizontal: "left" };
      });
      worksheet.views = [{ state: "frozen", ySplit: 1 }];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, "AI_Customer_Segments.xlsx");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [clusterResult, t, uploadData]);

  const onUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (!token) {
        router.replace("/login");
        return;
      }

      setError(null);
      setClusterResult(null);
      setClusterData([]);
      setForecastData([]);
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const { data } = await axios.post<UploadApiResponse>(`${apiBase}/api/upload`, formData, {
          params: { numeric_imputation: "mean" },
          headers: { Authorization: "Bearer " + token },
        });

        setUploadData(data);
      } catch (err) {
        if (isUnauthorized(err)) {
          logout();
          router.replace("/login");
          return;
        }
        setUploadData(null);
        setError(getErrorMessage(err));
      } finally {
        setUploading(false);
      }
    },
    [apiBase, logout, router, token],
  );

  const onRunSegmentation = useCallback(async () => {
    if (!uploadData?.preview?.length) {
      setError(t("dashboard.errorNoUpload"));
      return;
    }
    if (!token) {
      router.replace("/login");
      return;
    }

    setError(null);
    setSegmenting(true);

    try {
      const { data } = await axios.post<ClusterApiResponse>(
        `${apiBase}/api/cluster`,
        {
          rows: uploadData.preview,
          n_clusters: 3,
        },
        {
          headers: { Authorization: "Bearer " + token },
        },
      );
      setClusterResult(data);
      const clusteredRows = uploadData.preview.map((row, idx) => ({
        ...row,
        cluster: data.cluster_labels[idx] ?? null,
        pca1: data.pca_coordinates[idx]?.pca1 ?? null,
        pca2: data.pca_coordinates[idx]?.pca2 ?? null,
      }));
      setClusterData(clusteredRows);
    } catch (err) {
      if (isUnauthorized(err)) {
        logout();
        router.replace("/login");
        return;
      }
      setClusterResult(null);
      setClusterData([]);
      setError(getErrorMessage(err));
    } finally {
      setSegmenting(false);
    }
  }, [apiBase, logout, router, token, t, uploadData]);

  const onGenerateForecast = useCallback(async () => {
    if (!uploadData?.preview?.length) {
      setError(t("dashboard.errorNoUpload"));
      return;
    }
    if (!token) {
      router.replace("/login");
      return;
    }

    const inferred = inferForecastColumns(uploadData.preview);
    if (!inferred) {
      setError(t("dashboard.forecast.errorInferColumns"));
      return;
    }

    setError(null);
    setIsLoadingForecast(true);
    try {
      const { data } = await axios.post<ForecastPoint[]>(
        `${apiBase}/api/forecast`,
        {
          rows: uploadData.preview,
          date_col: inferred.dateCol,
          value_col: inferred.valueCol,
          days_to_predict: 30,
        },
        {
          headers: { Authorization: "Bearer " + token },
        },
      );

      setForecastData(data);
    } catch (err) {
      console.error("Forecast generation failed", err);
      if (isUnauthorized(err)) {
        logout();
        router.replace("/login");
        return;
      }
      setForecastData([]);
      setError(getErrorMessage(err));
    } finally {
      setIsLoadingForecast(false);
    }
  }, [apiBase, logout, router, t, token, uploadData]);

  const clusterInsights = useMemo(() => {
    if (!clusterResult?.cluster_labels?.length) return [];
    const counts = new Map<number, number>();
    for (const label of clusterResult.cluster_labels) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
    const labels = [
      t("dashboard.clusterInsights.label.average"),
      t("dashboard.clusterInsights.label.vip"),
      t("dashboard.clusterInsights.label.risk"),
    ];
    return sorted.map(([cluster, count], idx) => ({
      cluster,
      count,
      label: labels[idx] ?? t("dashboard.clusterInsights.label.custom"),
    }));
  }, [clusterResult, t]);

  const availableClusters = useMemo(() => {
    const clusters = new Set<number>();
    for (const row of clusterData) {
      const cluster = toNumeric((row as Record<string, unknown>)?.cluster);
      if (cluster != null) clusters.add(Math.trunc(cluster));
    }
    return Array.from(clusters).sort((a, b) => a - b);
  }, [clusterData]);

  useEffect(() => {
    if (availableClusters.length === 0) {
      setSelectedCluster(null);
      return;
    }
    if (selectedCluster != null && availableClusters.includes(selectedCluster)) return;
    setSelectedCluster(availableClusters[0]);
  }, [availableClusters, selectedCluster]);

  const actionableInsights = useMemo((): ActionableInsight[] => {
    if (!clusterData.length) return [];

    const spendKeys = ["total_spent_usd", "total_spent", "spend", "revenue", "sales", "amount"];
    const recencyKeys = ["days_since_last_purchase", "days_since_last", "recency_days", "days_no_purchase"];
    const freqKeys = ["purchase_frequency", "frequency", "orders_count", "order_count"];

    const clusterStats = new Map<number, { count: number; spend: number[]; recency: number[]; freq: number[] }>();
    for (const row of clusterData) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      const cluster = toNumeric(record.cluster);
      if (cluster == null) continue;
      const clusterId = Math.trunc(cluster);
      const bucket = clusterStats.get(clusterId) ?? { count: 0, spend: [], recency: [], freq: [] };
      bucket.count += 1;
      for (const key of spendKeys) {
        const v = toNumeric(record[key]);
        if (v != null) {
          bucket.spend.push(v);
          break;
        }
      }
      for (const key of recencyKeys) {
        const v = toNumeric(record[key]);
        if (v != null) {
          bucket.recency.push(v);
          break;
        }
      }
      for (const key of freqKeys) {
        const v = toNumeric(record[key]);
        if (v != null) {
          bucket.freq.push(v);
          break;
        }
      }
      clusterStats.set(clusterId, bucket);
    }

    if (clusterStats.size === 0) return [];

    const entries = Array.from(clusterStats.entries());
    const avg = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
    const topSpend = [...entries].sort((a, b) => avg(b[1].spend) - avg(a[1].spend))[0];
    const topRecency = [...entries].sort((a, b) => avg(b[1].recency) - avg(a[1].recency))[0];
    const lowFreq = [...entries].sort((a, b) => avg(a[1].freq) - avg(b[1].freq))[0];
    const g = t("chart.group");

    const insights: ActionableInsight[] = [];
    if (topSpend) {
      insights.push({
        id: "vip",
        text: `${clusterDisplayName(topSpend[0], g)}: premium taklif/upsell kampaniyasi yoqing (eng yuqori xarajat).`,
      });
    }
    if (topRecency) {
      insights.push({
        id: "risk",
        text: `${clusterDisplayName(topRecency[0], g)}: churn-risk yuqori, re-engagement (chegirma + reminder) yuboring.`,
      });
    }
    if (lowFreq) {
      insights.push({
        id: "freq",
        text: `${clusterDisplayName(lowFreq[0], g)}: xarid chastotasi past, bundle yoki obuna taklifi bilan faollashtiring.`,
      });
    }
    return insights.slice(0, 3);
  }, [clusterData, t]);

  const drilldownRows = useMemo(() => {
    const rows: Array<{
      name: string;
      id: string;
      spend: number | null;
      frequency: number | null;
      recency: number | null;
      cluster: number;
    }> = [];

    for (const row of clusterData) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      const clusterNum = toNumeric(record.cluster);
      if (clusterNum == null) continue;
      const cluster = Math.trunc(clusterNum);
      if (selectedCluster != null && cluster !== selectedCluster) continue;

      const name = String(record.customer_name ?? record.name ?? record.client_name ?? "-");
      const id = String(record.transaction_id ?? record.customer_id ?? record.client_id ?? "-");
      const spend =
        toNumeric(record.total_spent_usd) ??
        toNumeric(record.total_spent) ??
        toNumeric(record.spend) ??
        toNumeric(record.revenue);
      const frequency = toNumeric(record.purchase_frequency) ?? toNumeric(record.frequency);
      const recency = toNumeric(record.days_since_last_purchase) ?? toNumeric(record.days_since_last);

      rows.push({ name, id, spend, frequency, recency, cluster });
    }

    rows.sort((a, b) => (b.spend ?? -Infinity) - (a.spend ?? -Infinity));
    return rows;
  }, [clusterData, selectedCluster]);

  const drilldownFilteredRows = useMemo(() => {
    const query = debouncedDrilldownQuery.trim().toLowerCase();
    if (!query) return drilldownRows;
    return drilldownRows.filter((row) => {
      return (
        row.name.toLowerCase().includes(query) ||
        row.id.toLowerCase().includes(query) ||
        clusterDisplayName(row.cluster, t("chart.group")).toLowerCase().includes(query)
      );
    });
  }, [drilldownRows, debouncedDrilldownQuery, t]);

  const drilldownSortedRows = useMemo(() => {
    const sorted = [...drilldownFilteredRows];
    const dir = drilldownSortDir === "asc" ? 1 : -1;
    const safeNum = (v: number | null) => (v == null ? Number.NEGATIVE_INFINITY : v);

    sorted.sort((a, b) => {
      switch (drilldownSortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "id":
          return a.id.localeCompare(b.id) * dir;
        case "spend":
          return (safeNum(a.spend) - safeNum(b.spend)) * dir;
        case "frequency":
          return (safeNum(a.frequency) - safeNum(b.frequency)) * dir;
        case "recency":
          return (safeNum(a.recency) - safeNum(b.recency)) * dir;
        case "cluster":
          return (a.cluster - b.cluster) * dir;
        default:
          return 0;
      }
    });
    return sorted;
  }, [drilldownFilteredRows, drilldownSortDir, drilldownSortKey]);

  const drilldownTotalPages = useMemo(
    () => Math.max(1, Math.ceil(drilldownSortedRows.length / DRILLDOWN_PAGE_SIZE)),
    [drilldownSortedRows.length],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedDrilldownQuery(drilldownQuery);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [drilldownQuery]);

  useEffect(() => {
    setDrilldownPage(1);
  }, [selectedCluster, debouncedDrilldownQuery, drilldownSortDir, drilldownSortKey]);

  useEffect(() => {
    if (drilldownPage > drilldownTotalPages) {
      setDrilldownPage(drilldownTotalPages);
    }
  }, [drilldownPage, drilldownTotalPages]);

  const drilldownPageRows = useMemo(() => {
    const start = (drilldownPage - 1) * DRILLDOWN_PAGE_SIZE;
    return drilldownSortedRows.slice(start, start + DRILLDOWN_PAGE_SIZE);
  }, [drilldownSortedRows, drilldownPage]);

  const onDrilldownSort = (key: DrilldownSortKey) => {
    if (drilldownSortKey === key) {
      setDrilldownSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setDrilldownSortKey(key);
    setDrilldownSortDir(key === "name" || key === "id" ? "asc" : "desc");
  };

  const sortIndicator = (key: DrilldownSortKey) => {
    if (drilldownSortKey !== key) return "↕";
    return drilldownSortDir === "asc" ? "↑" : "↓";
  };

  const handleExportDrilldownCsv = useCallback(() => {
    if (!drilldownSortedRows.length) {
      setError(t("dashboard.drilldown.empty"));
      return;
    }

    setError(null);
    const groupLabel = t("chart.group");
    const headers = [
      t("dashboard.drilldown.col.name"),
      t("dashboard.drilldown.col.id"),
      t("dashboard.drilldown.col.spend"),
      t("dashboard.drilldown.col.freq"),
      t("dashboard.drilldown.col.recency"),
      t("dashboard.drilldown.col.group"),
    ];

    const lines = [
      headers.map(csvEscape).join(","),
      ...drilldownSortedRows.map((row) =>
        [
          csvEscape(row.name),
          csvEscape(row.id),
          csvEscape(row.spend ?? ""),
          csvEscape(row.frequency ?? ""),
          csvEscape(row.recency ?? ""),
          csvEscape(clusterDisplayName(row.cluster, groupLabel)),
        ].join(","),
      ),
    ];

    const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8;" });
    const suffix =
      selectedCluster != null
        ? `_${clusterDisplayName(selectedCluster, groupLabel).replace(/\s+/g, "_")}`
        : "_all_groups";
    saveAs(blob, `AI_Drilldown${suffix}.csv`);
  }, [drilldownSortedRows, selectedCluster, t]);

  const { totalRevenue, totalCustomers, riskRevenue, donutData, activeClusters, avgRevenuePerCustomer, riskShare } =
    useMemo(() => {
    const toNumeric = (value: unknown): number | null => {
      if (value == null || value === "") return null;
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };
    const readFirstNumeric = (row: Record<string, unknown>, keys: string[]): number | null => {
      for (const key of keys) {
        const num = toNumeric(row[key]);
        if (num != null) return num;
      }
      return null;
    };

    const clusterRevenue = new Map<number, number>();
    const clusterRecency = new Map<number, number[]>();

    let revenueSum = 0;
    for (const row of clusterData) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      const cluster = toNumeric(record.cluster);
      if (cluster == null) continue;
      const clusterId = Math.trunc(cluster);

      const spend = readFirstNumeric(record, [
        "total_spent_usd",
        "total_spent",
        "spend",
        "revenue",
        "sales",
        "amount",
      ]);
      if (spend != null) {
        revenueSum += spend;
        clusterRevenue.set(clusterId, (clusterRevenue.get(clusterId) ?? 0) + spend);
      }

      const recency = readFirstNumeric(record, [
        "days_since_last_purchase",
        "days_since_last",
        "recency_days",
        "days_no_purchase",
      ]);
      if (recency != null) {
        const arr = clusterRecency.get(clusterId) ?? [];
        arr.push(recency);
        clusterRecency.set(clusterId, arr);
      }
    }

    let riskCluster: number | null = null;
    let maxRecency = -Infinity;
    for (const [clusterId, values] of clusterRecency.entries()) {
      if (!values.length) continue;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      if (avg > maxRecency) {
        maxRecency = avg;
        riskCluster = clusterId;
      }
    }
    if (riskCluster == null && clusterRevenue.has(1)) {
      riskCluster = 1;
    }

    const riskRevenueValue = riskCluster == null ? 0 : clusterRevenue.get(riskCluster) ?? 0;
    const donut = Array.from(clusterRevenue.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([clusterId, value]) => ({ name: clusterDisplayName(clusterId, t("chart.group")), value }));

      const customers = clusterData.length;
      const avgRevenue = customers > 0 ? revenueSum / customers : 0;
      const share = revenueSum > 0 ? (riskRevenueValue / revenueSum) * 100 : 0;

      return {
        totalRevenue: revenueSum,
        totalCustomers: customers,
        riskRevenue: riskRevenueValue,
        donutData: donut,
        activeClusters: donut.length,
        avgRevenuePerCustomer: avgRevenue,
        riskShare: share,
      };
    }, [clusterData, t]);

  const [animatedRevenue, setAnimatedRevenue] = useState(0);
  const [animatedRiskRevenue, setAnimatedRiskRevenue] = useState(0);
  const [animatedCustomers, setAnimatedCustomers] = useState(0);

  useEffect(() => {
    const durationMs = 650;
    const start = performance.now();
    const fromRevenue = animatedRevenue;
    const fromRiskRevenue = animatedRiskRevenue;
    const fromCustomers = animatedCustomers;

    let frameId = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - p) * (1 - p);
      setAnimatedRevenue(fromRevenue + (totalRevenue - fromRevenue) * eased);
      setAnimatedRiskRevenue(fromRiskRevenue + (riskRevenue - fromRiskRevenue) * eased);
      setAnimatedCustomers(Math.round(fromCustomers + (totalCustomers - fromCustomers) * eased));
      if (p < 1) frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
    // Intentionally animate only when KPI targets change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalRevenue, riskRevenue, totalCustomers]);

  const formatMoneyByLang = useCallback(
    (value: number) =>
      new Intl.NumberFormat(numberLocale, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(Number.isFinite(value) ? value : 0),
    [numberLocale],
  );

  const formatCountByLang = useCallback(
    (value: number) => new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(value),
    [numberLocale],
  );

  if (!isClient || !initialized || !token) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-10">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("dashboard.chartLoading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {t("dashboard.title")}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white/80 px-4 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            <Download className="size-4" aria-hidden />
            {t("dashboard.export.pdf")}
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!clusterResult?.cluster_labels?.length}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
          >
            <FileSpreadsheet className="size-4" aria-hidden />
            {t("dashboard.export.excel")}
          </button>
        </div>
      </header>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl hover:border-indigo-100 dark:border-zinc-800 dark:bg-zinc-950/60 dark:hover:border-indigo-900/40">
            <div className="flex items-center gap-2">
              <UploadCloud className="size-5 text-sky-600 dark:text-sky-400" aria-hidden />
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {t("dashboard.uploadTitle")}
              </h2>
            </div>

            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {t("dashboard.uploadBody.before")} /api/upload {t("dashboard.uploadBody.after")}
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={onFileChange}
            />

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={onUploadClick}
                disabled={uploading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {uploading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t("dashboard.uploading")}
                  </>
                ) : (
                  <>
                    <UploadCloud className="size-4" aria-hidden />
                    {t("uploadFile")}
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onRunSegmentation}
                disabled={segmenting || !uploadData?.preview?.length}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
              >
                {segmenting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t("dashboard.running")}
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4 text-violet-600 dark:text-violet-400" aria-hidden />
                    {t("dashboard.runSegmentation")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {isAnalyzing ? (
              <>
                <SkeletonCard className="h-28" />
                <SkeletonCard className="h-28" />
              </>
            ) : (
              <>
                <StatCard
                  icon={<Database className="size-5" />}
                  label={t("dashboard.stat.totalRows")}
                  value={uploadData ? String(uploadData.total_rows) : "-"}
                />
                <StatCard
                  icon={<Layers className="size-5" />}
                  label={t("dashboard.stat.columns")}
                  value={uploadData ? String(uploadData.total_columns) : "-"}
                />
              </>
            )}
          </div>
        </div>
      </section>

      <div id="report-content">
        {isAnalyzing ? (
          <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="mb-5 flex items-center justify-center gap-3 text-zinc-700 dark:text-zinc-200">
              <div className="flex size-10 animate-bounce items-center justify-center rounded-xl bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                AI
              </div>
              <div className="inline-flex items-center gap-2 text-sm font-medium">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {uploading ? t("dashboard.uploading") : t("dashboard.running")}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SkeletonCard className="h-32" />
              <SkeletonCard className="h-32" />
              <SkeletonCard className="h-32" />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <SkeletonCard className="h-[320px]" />
              </div>
              <div className="lg:col-span-5">
                <SkeletonCard className="h-[320px]" />
              </div>
            </div>
          </div>
        ) : null}
        <div className={`mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 ${isAnalyzing ? "opacity-0 pointer-events-none h-0 overflow-hidden mb-0" : ""}`}>
          <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-6 shadow-sm dark:border-zinc-800 dark:from-zinc-950/80 dark:to-blue-950/20">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("dashboard.kpi.total_revenue")}</p>
              <div className="rounded-xl bg-blue-100 p-2 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                <DollarSign className="size-4" aria-hidden />
              </div>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {formatMoneyByLang(animatedRevenue)}
            </p>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {t("dashboard.kpi.avg_per_customer")}: {formatMoneyByLang(avgRevenuePerCustomer)}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50 p-6 shadow-sm dark:border-zinc-800 dark:from-zinc-950/80 dark:to-emerald-950/20">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("dashboard.kpi.total_customers")}</p>
              <div className="rounded-xl bg-emerald-100 p-2 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Users className="size-4" aria-hidden />
              </div>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {formatCountByLang(animatedCustomers)}
            </p>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {t("dashboard.kpi.active_clusters")}: {formatCountByLang(activeClusters)}
            </p>
          </div>
          <div className="rounded-2xl border border-red-100 bg-gradient-to-br from-white to-red-50 p-6 shadow-sm dark:border-zinc-800 dark:from-zinc-950/80 dark:to-red-950/20">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("dashboard.kpi.risk_revenue")}</p>
              <div className="rounded-xl bg-red-100 p-2 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangle className="size-4" aria-hidden />
              </div>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-red-600 dark:text-red-400">
              {formatMoneyByLang(animatedRiskRevenue)}
            </p>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {t("dashboard.kpi.risk_share")}: {riskShare.toFixed(1)}%
            </p>
          </div>
        </div>

        <section className={`mt-10 ${isAnalyzing ? "hidden" : ""}`}>
          <div className="mb-3 flex items-center gap-2">
            <BarChart2 className="size-5 text-sky-600 dark:text-sky-400" aria-hidden />
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {t("dashboard.chartTitle")}
            </h3>
          </div>
          <div className="mb-3 rounded-xl border border-sky-200/70 bg-sky-50/70 px-3 py-2 text-xs leading-relaxed text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-200">
            <p className="font-semibold">{t("dashboard.chart.explain.title")}</p>
            <p className="mt-1">{t("dashboard.chart.explain.body")}</p>
          </div>

          {clusterResult && chartRowsForRender.length ? (
            <>
              {chartRows.length > chartRowsForRender.length ? (
                <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {`Performance mode: ${chartRowsForRender.length.toLocaleString()} / ${chartRows.length.toLocaleString()} points rendered.`}
                </p>
              ) : null}
              <PcaScatterChart rows={chartRowsForRender} />
            </>
          ) : (
            <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400">
              {t("dashboard.emptyChartTitle")}
            </div>
          )}
        </section>

        <section className={`mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12 ${isAnalyzing ? "hidden" : ""}`}>
          <div className="lg:col-span-5">
            <div className="grid gap-6">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="size-5 text-violet-600 dark:text-violet-400" aria-hidden />
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {t("dashboard.clusterInsights.title")}
                  </h3>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {t("dashboard.clusterInsights.subtitle")}
                </p>

                {clusterInsights.length ? (
                  <div className="mt-4 space-y-3">
                    {clusterInsights.map((item) => (
                      <div
                        key={item.cluster}
                        className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40"
                      >
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {t("dashboard.clusterInsights.clusterPrefix")} {item.cluster}: {item.label}
                        </p>
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                          {t("dashboard.clusterInsights.customerCount")}: {item.count}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                    {t("dashboard.clusterInsights.empty")}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {t("dashboard.chart.donut_title")}
                </h3>
                <div className="mt-4 h-[280px] w-full">
                  {donutData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={3}
                        >
                          {donutData.map((entry, index) => (
                            <Cell key={`cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<DonutRevenueTooltip formatter={formatMoneyByLang} />} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-200 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      {t("dashboard.clusterInsights.empty")}
                    </div>
                  )}
                </div>
                {donutData.length ? (
                  <div className="mt-4 space-y-2">
                    {donutData.map((item, idx) => {
                      const share = totalRevenue > 0 ? (item.value / totalRevenue) * 100 : 0;
                      return (
                        <div key={item.name} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                            <span
                              className="inline-block size-2.5 rounded-full"
                              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                            />
                            <span>{item.name}</span>
                          </div>
                          <div className="text-right text-zinc-700 dark:text-zinc-200">
                            <span className="mr-3">{formatMoneyByLang(item.value)}</span>
                            <span className="text-xs text-zinc-500">{share.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                      {t("dashboard.forecast.title")}
                    </h3>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {t("dashboard.forecast.subtitle")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onGenerateForecast}
                  disabled={isLoadingForecast || !uploadData?.preview?.length}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingForecast ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Loading...
                    </>
                  ) : (
                    <>
                      <LineChartIcon className="size-4" aria-hidden />
                      {t("dashboard.forecast.generate30")}
                    </>
                  )}
                </button>
              </div>
              <p className="mb-4 w-full rounded-lg border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                {t("dashboard.forecast.disclaimer")}
              </p>

              {forecastData.length > 0 ? (
                <div className="h-[340px] w-full rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/30">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={forecastData} margin={{ top: 10, right: 16, left: 0, bottom: 6 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d8" />
                      <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} />
                      <YAxis
                        tick={{ fill: "#71717a", fontSize: 11 }}
                        tickFormatter={(v: number) => formatCurrency(v)}
                      />
                      <Tooltip
                        formatter={(value: number | null) => formatCurrency(value)}
                        labelStyle={{ color: "#3f3f46", fontWeight: 600 }}
                        contentStyle={{
                          borderRadius: "12px",
                          border: "1px solid #e4e4e7",
                          boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.08)",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, color: "#52525b" }} />
                      <Line
                        type="monotone"
                        dataKey="historical_value"
                        name={t("dashboard.forecast.actual")}
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="predicted_value"
                        name={t("dashboard.forecast.predicted")}
                        stroke="#10b981"
                        strokeWidth={2}
                        strokeDasharray="6 5"
                        dot={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-zinc-200 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  {t("dashboard.forecast.empty")}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className={`${isAnalyzing ? "hidden" : ""} mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12`}>
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {t("dashboard.insights.title")}
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t("dashboard.insights.subtitle")}</p>
              {actionableInsights.length ? (
                <div className="mt-4 space-y-3">
                  {actionableInsights.map((insight) => (
                    <div
                      key={insight.id}
                      className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200"
                    >
                      {insight.text}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">{t("dashboard.clusterInsights.empty")}</p>
              )}
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {t("dashboard.drilldown.title")}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t("dashboard.drilldown.subtitle")}</p>
                </div>
                <button
                  type="button"
                  onClick={handleExportDrilldownCsv}
                  disabled={!drilldownSortedRows.length}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                >
                  <Download className="size-4" aria-hidden />
                  {t("dashboard.drilldown.exportCsv")}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCluster(null)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    selectedCluster == null
                      ? "border-violet-500 bg-violet-100 text-violet-700 dark:border-violet-400 dark:bg-violet-900/40 dark:text-violet-200"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  }`}
                >
                  {t("dashboard.drilldown.allGroups")}
                </button>
                {availableClusters.map((clusterId) => (
                  <button
                    key={clusterId}
                    type="button"
                    onClick={() => setSelectedCluster(clusterId)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      selectedCluster === clusterId
                        ? "border-violet-500 bg-violet-100 text-violet-700 dark:border-violet-400 dark:bg-violet-900/40 dark:text-violet-200"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {clusterDisplayName(clusterId, t("chart.group"))}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                <input
                  value={drilldownQuery}
                  onChange={(e) => setDrilldownQuery(e.target.value)}
                  placeholder={t("dashboard.drilldown.searchPlaceholder")}
                  className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-violet-500 dark:focus:ring-violet-900/40"
                />
              </div>

              <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 text-left dark:bg-zinc-900/60">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-zinc-600 dark:text-zinc-300">
                        <button type="button" onClick={() => onDrilldownSort("name")} className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100">
                          {t("dashboard.drilldown.col.name")} <span className="text-[10px]">{sortIndicator("name")}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 font-semibold text-zinc-600 dark:text-zinc-300">
                        <button type="button" onClick={() => onDrilldownSort("id")} className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100">
                          {t("dashboard.drilldown.col.id")} <span className="text-[10px]">{sortIndicator("id")}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 font-semibold text-zinc-600 dark:text-zinc-300">
                        <button type="button" onClick={() => onDrilldownSort("spend")} className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100">
                          {t("dashboard.drilldown.col.spend")} <span className="text-[10px]">{sortIndicator("spend")}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 font-semibold text-zinc-600 dark:text-zinc-300">
                        <button type="button" onClick={() => onDrilldownSort("frequency")} className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100">
                          {t("dashboard.drilldown.col.freq")} <span className="text-[10px]">{sortIndicator("frequency")}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 font-semibold text-zinc-600 dark:text-zinc-300">
                        <button type="button" onClick={() => onDrilldownSort("recency")} className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100">
                          {t("dashboard.drilldown.col.recency")} <span className="text-[10px]">{sortIndicator("recency")}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 font-semibold text-zinc-600 dark:text-zinc-300">
                        <button type="button" onClick={() => onDrilldownSort("cluster")} className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100">
                          {t("dashboard.drilldown.col.group")} <span className="text-[10px]">{sortIndicator("cluster")}</span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {drilldownPageRows.length ? (
                      drilldownPageRows.map((row, idx) => (
                        <tr key={`${row.id}-${idx}`} className="border-t border-zinc-200 dark:border-zinc-800">
                          <td className="px-3 py-2 text-zinc-800 dark:text-zinc-100">{row.name}</td>
                          <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">{row.id}</td>
                          <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">
                            {row.spend != null ? formatMoneyByLang(row.spend) : "-"}
                          </td>
                          <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">{row.frequency ?? "-"}</td>
                          <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">{row.recency ?? "-"}</td>
                          <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">
                            {clusterDisplayName(row.cluster, t("chart.group"))}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-400">
                          {t("dashboard.drilldown.empty")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t("dashboard.drilldown.pageStatus")
                    .replace("{page}", String(drilldownPage))
                    .replace("{total}", String(drilldownTotalPages))
                    .replace("{count}", String(drilldownFilteredRows.length))}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDrilldownPage((p) => Math.max(1, p - 1))}
                    disabled={drilldownPage <= 1}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {t("dashboard.drilldown.prev")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrilldownPage((p) => Math.min(drilldownTotalPages, p + 1))}
                    disabled={drilldownPage >= drilldownTotalPages}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {t("dashboard.drilldown.next")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <ChatAssistant clusterData={clusterData} />
      </div>
    </main>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl hover:border-indigo-100 dark:border-zinc-800 dark:bg-zinc-950/60 dark:hover:border-indigo-900/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{value}</p>
        </div>
        <div className="flex size-11 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
          {icon}
        </div>
      </div>
    </div>
  );
}

function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200/80 dark:bg-zinc-800 ${className}`} />;
}

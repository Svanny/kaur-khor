import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  ServiceRecord,
  SistConfidence,
  SistRegime,
  SistServiceDetail,
  SistSkuDetail,
  SistSystemDetail,
  StockReport,
} from '@shared/inventory';
import {
  AlertTriangle,
  Gauge,
  RefreshCcw,
  Settings2,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber, localeFor } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

type SistTab =
  | 'system'
  | 'forecasts'
  | 'rank-signals'
  | 'services'
  | 'skus'
  | 'evidence'
  | 'settings';
type ForecastEntityType = 'skus' | 'services';
type EvidenceFilter = 'all' | 'ranking' | 'restock' | 'service-stockout';
type SkuFilter = 'all' | 'high-risk' | 'reorder-due' | 'low-confidence';

type LoadState<T> = {
  data: T | null;
  error: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
};

type SummaryMetric = {
  caption: string;
  label: string;
  value: string;
};

type ChartPoint = {
  high: number;
  label: string;
  low: number;
  mean: number;
};

const SIST_TABS: Array<{ id: SistTab; label: string }> = [
  { id: 'system', label: 'System' },
  { id: 'forecasts', label: 'Forecasts' },
  { id: 'rank-signals', label: 'Rank signals' },
  { id: 'services', label: 'Services' },
  { id: 'skus', label: 'SKUs' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'settings', label: 'Settings' },
];

function emptyLoadState<T>(): LoadState<T> {
  return {
    data: null,
    error: null,
    status: 'idle',
  };
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return fallback;
}

function parseTab(value: string | null): SistTab {
  return SIST_TABS.some((tab) => tab.id === value) ? (value as SistTab) : 'system';
}

function formatDateTime(value: string | null, language: 'en' | 'km') {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatPercent(value: number, language: 'en' | 'km') {
  return `${formatNumber(value * 100, language)}%`;
}

function confidenceLabel(confidence: SistConfidence) {
  if (confidence === 'high') {
    return 'High';
  }
  if (confidence === 'medium') {
    return 'Medium';
  }
  return 'Low';
}

function regimeLabel(regime: SistRegime | null) {
  if (!regime) {
    return 'Unspecified';
  }

  return regime.replace(/_/g, ' ');
}

function latestSignalCount(report: StockReport | null) {
  if (!report) {
    return '—';
  }

  return String(
    report.topServiceRanking.length +
      report.topRetailRanking.length +
      report.serviceSignals.length +
      report.servicePriceAdjustments.length +
      report.skuObservations.filter((entry) => entry.retailStockout || entry.restockIncluded).length,
  );
}

function reportHasRankingSignal(report: StockReport) {
  return report.topServiceRanking.length > 0 || report.topRetailRanking.length > 0;
}

function reportHasRestock(report: StockReport) {
  return report.skuObservations.some((entry) => entry.restockIncluded);
}

function reportHasServiceStockout(report: StockReport) {
  return report.serviceSignals.some((entry) => entry.stockout);
}

function reportAffectedEntityCount(report: StockReport) {
  const entities = new Set<string>();
  report.skuObservations.forEach((entry) => entities.add(`sku:${entry.skuId}`));
  report.serviceSignals.forEach((entry) => entities.add(`service:${entry.serviceId}`));
  report.servicePriceAdjustments.forEach((entry) => entities.add(`service:${entry.serviceId}`));
  report.topServiceRanking.forEach((serviceId) => entities.add(`service:${serviceId}`));
  report.topRetailRanking.forEach((skuId) => entities.add(`sku:${skuId}`));
  return entities.size;
}

function reportSignalStrength(report: StockReport) {
  const slots =
    report.topServiceRanking.length +
    report.topRetailRanking.length +
    report.serviceSignals.length +
    report.servicePriceAdjustments.length;
  if (slots >= 8) {
    return 'High';
  }
  if (slots >= 3) {
    return 'Medium';
  }
  return 'Light';
}

function reportCompleteness(report: StockReport) {
  const activeParts = [
    report.skuObservations.length > 0,
    report.serviceSignals.length > 0,
    report.servicePriceAdjustments.length > 0,
    report.topServiceRanking.length > 0 || report.topRetailRanking.length > 0,
    Boolean(report.notes),
  ].filter(Boolean).length;

  if (activeParts >= 4) {
    return 'Dense';
  }
  if (activeParts >= 2) {
    return 'Partial';
  }
  return 'Sparse';
}

function findServiceName(services: ServiceRecord[], serviceId: string) {
  return services.find((service) => service.serviceId === serviceId)?.name ?? serviceId;
}

function badgeVariantForRisk(value: number) {
  if (value >= 0.5) {
    return 'destructive' as const;
  }
  if (value >= 0.2) {
    return 'secondary' as const;
  }
  return 'outline' as const;
}

function summaryMetrics({
  latestReport,
  particleCount,
  pendingReorders,
  topRegime,
  forecastHorizon,
  highRiskSkuCount,
  language,
}: {
  latestReport: StockReport | null;
  particleCount: number;
  pendingReorders: number;
  topRegime: SistRegime | null;
  forecastHorizon: number;
  highRiskSkuCount: number;
  language: 'en' | 'km';
}): SummaryMetric[] {
  return [
    {
      label: 'High-risk SKUs',
      value: formatNumber(highRiskSkuCount, language),
      caption: 'Posterior stockout pressure exceeds the analyst threshold.',
    },
    {
      label: 'Pending reorders',
      value: formatNumber(pendingReorders, language),
      caption: 'Entities already leaning through the current reorder policy.',
    },
    {
      label: 'Dominant regime',
      value: regimeLabel(topRegime),
      caption: 'Top posterior macro interpretation across the latest analysis.',
    },
    {
      label: 'Forecast horizon',
      value: `${formatNumber(forecastHorizon, language)}d`,
      caption: 'Forward window used for the active trajectory and disruption views.',
    },
    {
      label: 'Particle budget',
      value: formatNumber(particleCount, language),
      caption: 'Approximate inference budget currently shaping posterior stability.',
    },
    {
      label: 'Signals in latest report',
      value: latestSignalCount(latestReport),
      caption: 'Ranking, restock, stockout, and price signals captured most recently.',
    },
  ];
}

function buildChartPoints(
  detail: Pick<SistSkuDetail, 'posteriorInventoryTrajectory' | 'forecastTrajectory'>,
): ChartPoint[] {
  const history = detail.posteriorInventoryTrajectory ?? [];
  const forecast = detail.forecastTrajectory ?? [];
  return [...history, ...forecast].map((point, index) => ({
    label: index < history.length ? `H${index + 1}` : `F${index + 1 - history.length}`,
    mean: point.mean,
    low: point.low,
    high: point.high,
  }));
}

function buildServiceChartPoints(detail: SistServiceDetail): ChartPoint[] {
  return detail.viabilityForecast.map((point, index) => ({
    label: `F${index + 1}`,
    mean: point.mean,
    low: point.low,
    high: point.high,
  }));
}

function SparkBandChart({
  data,
  thresholds = [],
}: {
  data: ChartPoint[];
  thresholds?: Array<{ color: string; label: string; value: number }>;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No series available yet.</p>;
  }

  const width = 720;
  const height = 240;
  const paddingX = 28;
  const paddingY = 18;
  const values = [
    ...data.flatMap((point) => [point.low, point.high]),
    ...thresholds.map((threshold) => threshold.value),
  ];
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const y = (value: number) =>
    height - paddingY - ((value - min) / Math.max(max - min, 1)) * (height - paddingY * 2);
  const x = (index: number) =>
    paddingX + (index / Math.max(data.length - 1, 1)) * (width - paddingX * 2);
  const band = [
    ...data.map((point, index) => `${x(index)},${y(point.high)}`),
    ...[...data].reverse().map((point, index) => {
      const dataIndex = data.length - 1 - index;
      return `${x(dataIndex)},${y(point.low)}`;
    }),
  ].join(' ');
  const meanLine = data.map((point, index) => `${x(index)},${y(point.mean)}`).join(' ');

  return (
    <div className="space-y-3">
      <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`}>
        {[0.25, 0.5, 0.75].map((stop) => {
          const lineY = paddingY + stop * (height - paddingY * 2);
          return (
            <line
              key={stop}
              stroke="currentColor"
              strokeDasharray="4 6"
              strokeOpacity="0.15"
              strokeWidth="1"
              x1={paddingX}
              x2={width - paddingX}
              y1={lineY}
              y2={lineY}
            />
          );
        })}
        <polygon fill="rgba(196, 120, 76, 0.14)" points={band} />
        <polyline
          fill="none"
          points={meanLine}
          stroke="rgb(196, 120, 76)"
          strokeWidth="2.5"
        />
        {thresholds.map((threshold) => (
          <g key={threshold.label}>
            <line
              stroke={threshold.color}
              strokeDasharray="5 5"
              strokeOpacity="0.75"
              strokeWidth="1.5"
              x1={paddingX}
              x2={width - paddingX}
              y1={y(threshold.value)}
              y2={y(threshold.value)}
            />
            <text
              fill={threshold.color}
              fontSize="11"
              textAnchor="end"
              x={width - paddingX}
              y={y(threshold.value) - 6}
            >
              {threshold.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap justify-between gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function SectionBlock({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-[1.6rem] border border-border/60 bg-background/70 p-5', className)}>
      <div className="mb-4 flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StatusPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5">
      <span className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>{' '}
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function LoadStateMessage({
  error,
  fallback,
}: {
  error: string | null;
  fallback: string;
}) {
  return (
    <p className={cn('text-sm', error ? 'text-destructive' : 'text-muted-foreground')}>
      {error ?? fallback}
    </p>
  );
}

function SummaryStrip({ items }: { items: SummaryMetric[] }) {
  return (
    <div className="grid gap-0 overflow-hidden rounded-[1.8rem] border border-border/60 bg-background/60 lg:grid-cols-6">
      {items.map((item) => (
        <div
          className="flex flex-col gap-2 border-t border-border/50 px-5 py-4 first:border-t-0 lg:border-t-0 lg:border-l lg:first:border-l-0"
          key={item.label}
        >
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {item.label}
          </p>
          <p className="text-3xl font-semibold tracking-[-0.04em] text-foreground">{item.value}</p>
          <p className="text-sm leading-5 text-muted-foreground">{item.caption}</p>
        </div>
      ))}
    </div>
  );
}

export function SistRoute() {
  const {
    isSaving,
    listStockReports,
    loadSistServiceDetail,
    loadSistSkuDetail,
    loadSistSystemDetail,
    reload,
    saveSistSettings,
    snapshot,
  } = useInventory();
  const { language } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseTab(searchParams.get('tab'));
  const [reportsState, setReportsState] = useState<LoadState<StockReport[]>>(() => emptyLoadState());
  const [systemState, setSystemState] = useState<LoadState<SistSystemDetail>>(() => emptyLoadState());
  const [serviceDetails, setServiceDetails] = useState<Record<string, LoadState<SistServiceDetail>>>({});
  const [skuDetails, setSkuDetails] = useState<Record<string, LoadState<SistSkuDetail>>>({});
  const [forecastEntityType, setForecastEntityType] = useState<ForecastEntityType>('skus');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedSkuId, setSelectedSkuId] = useState<string>('');
  const [selectedRankReportId, setSelectedRankReportId] = useState<string>('');
  const [forecastQuery, setForecastQuery] = useState('');
  const [skuFilter, setSkuFilter] = useState<SkuFilter>('all');
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>('all');
  const [evidenceEntityQuery, setEvidenceEntityQuery] = useState('');
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] = useState(() => ({
    forecastHorizonDays: '',
    particleCount: '',
    smoothingWindowReports: '',
    targetServiceLevel: '',
  }));
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const validSkuIds = useMemo(
    () => new Set(snapshot?.sist.skuInsights.map((insight) => insight.skuId) ?? []),
    [snapshot],
  );
  const selectableSkus = useMemo(
    () => snapshot?.skus.filter((sku) => validSkuIds.has(sku.skuId)) ?? [],
    [snapshot, validSkuIds],
  );

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    setSettingsForm({
      targetServiceLevel: String(snapshot.sist.settings.targetServiceLevel),
      forecastHorizonDays: String(snapshot.sist.settings.forecastHorizonDays),
      particleCount: String(snapshot.sist.settings.particleCount),
      smoothingWindowReports: String(snapshot.sist.settings.smoothingWindowReports),
    });
    if (!selectedSkuId || !validSkuIds.has(selectedSkuId)) {
      setSelectedSkuId(snapshot.sist.skuInsights[0]?.skuId ?? '');
    }
    if (!selectedServiceId) {
      setSelectedServiceId(snapshot.services[0]?.serviceId ?? '');
    }
  }, [selectedServiceId, selectedSkuId, snapshot, validSkuIds]);

  useEffect(() => {
    if (!snapshot || reportsState.status !== 'idle') {
      return;
    }

    let cancelled = false;
    setReportsState({ data: null, error: null, status: 'loading' });
    listStockReports()
      .then((reports) => {
        if (!cancelled) {
          setReportsState({ data: reports, error: null, status: 'ready' });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setReportsState({
            data: null,
            error: errorMessage(error, 'Failed to load report history.'),
            status: 'error',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [listStockReports, reportsState.status, snapshot]);

  useEffect(() => {
    if (
      !snapshot ||
      activeTab !== 'system' ||
      systemState.status === 'loading' ||
      systemState.status === 'ready'
    ) {
      return;
    }

    let cancelled = false;
    setSystemState({ data: null, error: null, status: 'loading' });
    loadSistSystemDetail()
      .then((detail) => {
        if (!cancelled) {
          setSystemState({ data: detail, error: null, status: 'ready' });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSystemState({
            data: null,
            error: errorMessage(error, 'Failed to load system detail.'),
            status: 'error',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, loadSistSystemDetail, snapshot, systemState.status]);

  useEffect(() => {
    const targetSkuId =
      activeTab === 'skus' || (activeTab === 'forecasts' && forecastEntityType === 'skus')
        ? selectedSkuId
        : '';
    if (!targetSkuId || !snapshot) {
      return;
    }
    const current = skuDetails[targetSkuId];
    if (current && current.status !== 'idle') {
      return;
    }

    let cancelled = false;
    setSkuDetails((currentState) => ({
      ...currentState,
      [targetSkuId]: { data: null, error: null, status: 'loading' },
    }));
    loadSistSkuDetail(targetSkuId)
      .then((detail) => {
        if (!cancelled) {
          setSkuDetails((currentState) => ({
            ...currentState,
            [targetSkuId]: { data: detail, error: null, status: 'ready' },
          }));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSkuDetails((currentState) => ({
            ...currentState,
            [targetSkuId]: {
              data: null,
              error: errorMessage(error, 'Failed to load SKU detail.'),
              status: 'error',
            },
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, forecastEntityType, loadSistSkuDetail, selectedSkuId, skuDetails, snapshot]);

  useEffect(() => {
    const targetServiceId =
      activeTab === 'services' || (activeTab === 'forecasts' && forecastEntityType === 'services')
        ? selectedServiceId
        : '';
    if (!targetServiceId || !snapshot) {
      return;
    }
    const current = serviceDetails[targetServiceId];
    if (current && current.status !== 'idle') {
      return;
    }

    let cancelled = false;
    setServiceDetails((currentState) => ({
      ...currentState,
      [targetServiceId]: { data: null, error: null, status: 'loading' },
    }));
    loadSistServiceDetail(targetServiceId)
      .then((detail) => {
        if (!cancelled) {
          setServiceDetails((currentState) => ({
            ...currentState,
            [targetServiceId]: { data: detail, error: null, status: 'ready' },
          }));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setServiceDetails((currentState) => ({
            ...currentState,
            [targetServiceId]: {
              data: null,
              error: errorMessage(error, 'Failed to load service detail.'),
              status: 'error',
            },
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, forecastEntityType, loadSistServiceDetail, selectedServiceId, serviceDetails, snapshot]);

  const reports = reportsState.data ?? [];
  const rankingReports = useMemo(
    () => reports.filter((report) => reportHasRankingSignal(report)),
    [reports],
  );

  useEffect(() => {
    if (!selectedRankReportId && rankingReports[0]) {
      setSelectedRankReportId(rankingReports[0].reportId);
    }
  }, [rankingReports, selectedRankReportId]);

  const selectedRankReport =
    rankingReports.find((report) => report.reportId === selectedRankReportId) ?? rankingReports[0] ?? null;

  useEffect(() => {
    if (!snapshot || !selectedRankReport) {
      return;
    }

    selectedRankReport.topServiceRanking.forEach((serviceId) => {
      const current = serviceDetails[serviceId];
      if (current && current.status !== 'idle') {
        return;
      }
      setServiceDetails((currentState) => ({
        ...currentState,
        [serviceId]: { data: null, error: null, status: 'loading' },
      }));
      void loadSistServiceDetail(serviceId)
        .then((detail) => {
          setServiceDetails((currentState) => ({
            ...currentState,
            [serviceId]: { data: detail, error: null, status: 'ready' },
          }));
        })
        .catch((error) => {
          setServiceDetails((currentState) => ({
            ...currentState,
            [serviceId]: {
              data: null,
              error: errorMessage(error, 'Failed to load service detail.'),
              status: 'error',
            },
          }));
        });
    });
  }, [loadSistServiceDetail, selectedRankReport, serviceDetails, snapshot]);

  const latestReport = reports[0] ?? null;
  const selectedSkuDetail = selectedSkuId ? skuDetails[selectedSkuId]?.data ?? null : null;
  const selectedSkuDetailState = selectedSkuId ? skuDetails[selectedSkuId] ?? emptyLoadState<SistSkuDetail>() : emptyLoadState<SistSkuDetail>();
  const selectedServiceDetail = selectedServiceId ? serviceDetails[selectedServiceId]?.data ?? null : null;
  const selectedServiceDetailState = selectedServiceId
    ? serviceDetails[selectedServiceId] ?? emptyLoadState<SistServiceDetail>()
    : emptyLoadState<SistServiceDetail>();

  const summary = snapshot
    ? summaryMetrics({
        latestReport,
        particleCount: snapshot.sist.settings.particleCount,
        pendingReorders: snapshot.sist.pendingReorderCount,
        topRegime: snapshot.sist.topRegime,
        forecastHorizon: snapshot.sist.settings.forecastHorizonDays,
        highRiskSkuCount: snapshot.sist.highRiskSkuIds.length,
        language,
      })
    : [];

  const inferredRetailRanking = useMemo(() => {
    if (!selectedRankReport || !snapshot) {
      return [];
    }

    const insightBySku = new Map(snapshot.sist.skuInsights.map((insight) => [insight.skuId, insight]));
    return selectedRankReport.topRetailRanking
      .map((skuId) => ({
        label: snapshot.skus.find((sku) => sku.skuId === skuId)?.name ?? skuId,
        value: insightBySku.get(skuId)?.expectedDemandPerDay ?? 0,
      }))
      .sort((left, right) => right.value - left.value);
  }, [selectedRankReport, snapshot]);

  const inferredServiceRanking = useMemo(() => {
    if (!selectedRankReport || !snapshot) {
      return [];
    }

    return selectedRankReport.topServiceRanking
      .map((serviceId) => ({
        label: findServiceName(snapshot.services, serviceId),
        value: serviceDetails[serviceId]?.data?.estimatedActivityPerInterval ?? 0,
      }))
      .sort((left, right) => right.value - left.value);
  }, [selectedRankReport, serviceDetails, snapshot]);

  const filteredForecastSkus = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return selectableSkus.filter((sku) =>
      sku.name.toLowerCase().includes(forecastQuery.toLowerCase()) ||
      sku.skuId.toLowerCase().includes(forecastQuery.toLowerCase()),
    );
  }, [forecastQuery, selectableSkus, snapshot]);

  const filteredForecastServices = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return snapshot.services.filter((service) =>
      service.name.toLowerCase().includes(forecastQuery.toLowerCase()) ||
      service.serviceId.toLowerCase().includes(forecastQuery.toLowerCase()),
    );
  }, [forecastQuery, snapshot]);

  const skuRows = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.sist.skuInsights
      .map((insight) => ({
        insight,
        sku: snapshot.skus.find((sku) => sku.skuId === insight.skuId),
      }))
      .filter((row) => {
        if (skuFilter === 'high-risk') {
          return row.insight.stockoutRisk >= 0.35;
        }
        if (skuFilter === 'reorder-due') {
          return row.insight.reorderTriggerProbability >= 0.5;
        }
        if (skuFilter === 'low-confidence') {
          return row.insight.confidence === 'low';
        }
        return true;
      })
      .sort((left, right) => right.insight.stockoutRisk - left.insight.stockoutRisk);
  }, [skuFilter, snapshot]);

  const serviceRows = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.services
      .map((service) => {
        const detail = serviceDetails[service.serviceId]?.data ?? null;
        return {
          detail,
          service,
          state:
            detail?.disruptionWindow.probability && detail.disruptionWindow.probability >= 0.6
              ? 'High'
              : detail?.disruptionWindow.probability && detail.disruptionWindow.probability >= 0.25
                ? 'Medium'
                : 'Low',
        };
      })
      .sort(
        (left, right) =>
          (right.detail?.disruptionWindow.probability ?? -1) - (left.detail?.disruptionWindow.probability ?? -1),
      );
  }, [serviceDetails, snapshot]);

  const filteredEvidence = useMemo(() => {
    return reports.filter((report) => {
      if (evidenceFilter === 'ranking' && !reportHasRankingSignal(report)) {
        return false;
      }
      if (evidenceFilter === 'restock' && !reportHasRestock(report)) {
        return false;
      }
      if (evidenceFilter === 'service-stockout' && !reportHasServiceStockout(report)) {
        return false;
      }
      if (!evidenceEntityQuery) {
        return true;
      }
      const haystack = [
        ...report.skuObservations.map((entry) => entry.skuId),
        ...report.serviceSignals.map((entry) => entry.serviceId),
        ...report.servicePriceAdjustments.map((entry) => entry.serviceId),
        ...report.topServiceRanking,
        ...report.topRetailRanking,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(evidenceEntityQuery.toLowerCase());
    });
  }, [evidenceEntityQuery, evidenceFilter, reports]);

  if (!snapshot) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          description="SIST needs the inventory snapshot before diagnostics can render."
          title="SIST"
        />
      </WorkspacePage>
    );
  }

  async function handleSaveSettings() {
    const targetServiceLevel = Number(settingsForm.targetServiceLevel);
    const forecastHorizonDays = Number(settingsForm.forecastHorizonDays);
    const particleCount = Number(settingsForm.particleCount);
    const smoothingWindowReports = Number(settingsForm.smoothingWindowReports);

    if (
      Number.isNaN(targetServiceLevel) ||
      Number.isNaN(forecastHorizonDays) ||
      Number.isNaN(particleCount) ||
      Number.isNaN(smoothingWindowReports)
    ) {
      setSettingsError('Each setting must be numeric before SIST can save the model profile.');
      return;
    }

    setSettingsError(null);
    await saveSistSettings({
      targetServiceLevel,
      forecastHorizonDays,
      particleCount,
      smoothingWindowReports,
    });
  }

  function setTab(tab: SistTab) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  }

  return (
    <WorkspacePage data-testid="sist-route">
      <section className="overflow-hidden rounded-[2rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(248,244,238,0.88))] p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-[-0.05em] text-foreground">SIST</h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Sparse Inventory Service Twin diagnostics, forecasts, and demand evidence.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill label="State" value={snapshot.sist.status.state} />
              <StatusPill label="Reports" value={formatNumber(snapshot.sist.status.reportCount, language)} />
              <StatusPill label="Regime" value={regimeLabel(snapshot.sist.topRegime)} />
              <StatusPill
                label="Confidence"
                value={confidenceLabel(snapshot.sist.status.confidence)}
              />
              <StatusPill label="As of" value={formatDateTime(snapshot.sist.asOf, language)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => void reload()}>
              <RefreshCcw className="size-4" />
              Refresh analysis
            </Button>
            <Button type="button" onClick={() => setTab('settings')}>
              <Settings2 className="size-4" />
              Model settings
            </Button>
          </div>
        </div>
      </section>

      <SummaryStrip items={summary} />

      <Tabs className="gap-5" value={activeTab} onValueChange={(value) => setTab(parseTab(value))}>
        <div className="overflow-x-auto">
          <TabsList variant="line" className="min-w-max gap-5 border-b border-border/60 px-0 py-0">
            {SIST_TABS.map((tab) => (
              <TabsTrigger
                className="rounded-none px-0 pb-3 pt-0 text-sm"
                key={tab.id}
                value={tab.id}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="system">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,2.2fr)_340px]">
            <div className="space-y-5">
              <SectionBlock
                description="Interval-level posterior regime probabilities across the latest analysis window."
                title="Regime timeline"
              >
                {systemState.status === 'error' ? (
                  <p className="text-sm text-destructive">{systemState.error}</p>
                ) : systemState.status !== 'ready' ? (
                  <p className="text-sm text-muted-foreground">Loading regime history…</p>
                ) : (
                  <div className="space-y-3">
                    {systemState.data.regimePosteriorHistory.slice(-10).map((point) => (
                      <div className="space-y-1.5" key={`${point.intervalIndex}-${point.startAt}`}>
                        <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
                          <span>{formatDateTime(point.endAt, language)}</span>
                          <span>{regimeLabel(point.dominantRegime)}</span>
                        </div>
                        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                          {Object.entries(point.regimeProbabilities).map(([regime, probability]) => (
                            <div
                              key={regime}
                              className={cn(
                                'h-full',
                                regime === 'spike' && 'bg-amber-500',
                                regime === 'normal' && 'bg-slate-500',
                                regime === 'lull' && 'bg-sky-500',
                                regime === 'stockout_constrained' && 'bg-rose-500',
                                regime === 'promo' && 'bg-emerald-500',
                                regime === 'correction' && 'bg-violet-500',
                              )}
                              style={{ width: `${Math.max(probability * 100, 2)}%` }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionBlock>

              <SectionBlock
                description="Top risky entities, fragile services, and reorder pressure surfaced as one analytic surface."
                title="Risk pressure map"
              >
                {systemState.status === 'ready' ? (
                  <div className="space-y-3">
                    {systemState.data.topRiskyEntities.slice(0, 8).map((entity) => {
                      const label =
                        entity.entityType === 'sku'
                          ? snapshot.skus.find((sku) => sku.skuId === entity.entityId)?.name ?? entity.entityId
                          : findServiceName(snapshot.services, entity.entityId);
                      return (
                        <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)_90px]" key={`${entity.entityType}-${entity.entityId}`}>
                          <p className="text-sm font-medium text-foreground">{label}</p>
                          <div className="flex items-center gap-3">
                            <div className="h-2 flex-1 rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-amber-500"
                                style={{ width: `${Math.max(entity.riskScore * 100, 4)}%` }}
                              />
                            </div>
                            <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                              {entity.entityType}
                            </span>
                          </div>
                          <Badge variant={badgeVariantForRisk(entity.riskScore)}>
                            {formatPercent(entity.riskScore, language)}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {systemState.status === 'error'
                      ? systemState.error
                      : 'Loading risk map…'}
                  </p>
                )}
              </SectionBlock>

              <SectionBlock
                description="Current posterior confidence split across the SKU analyst set."
                title="Confidence distribution"
              >
                <div className="grid gap-4 md:grid-cols-3">
                  {(['high', 'medium', 'low'] as const).map((confidence) => {
                    const count = snapshot.sist.skuInsights.filter(
                      (insight) => insight.confidence === confidence,
                    ).length;
                    return (
                      <div className="rounded-[1.2rem] border border-border/60 bg-background/50 p-4" key={confidence}>
                        <p className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                          {confidenceLabel(confidence)}
                        </p>
                        <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                          {formatNumber(count, language)}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">SKU diagnostics in this band.</p>
                      </div>
                    );
                  })}
                </div>
              </SectionBlock>
            </div>

            <div className="space-y-5">
              <SectionBlock title="Current read">
                <p className="text-sm leading-6 text-foreground">
                  {snapshot.sist.topRegime === 'spike'
                    ? 'Spike pressure is concentrated in the latest demand window, with the highest-risk SKUs already leaning against reorder policy.'
                    : `The dominant regime is ${regimeLabel(snapshot.sist.topRegime)} and the current posterior still marks ${formatNumber(snapshot.sist.highRiskSkuIds.length, language)} SKUs as elevated risk.`}
                </p>
              </SectionBlock>
              <SectionBlock title="Signal intake">
                {systemState.status === 'ready' ? (
                  <div className="space-y-3">
                    {[
                      ['Reports with ranking signals', systemState.data.signalIntake.rankingObservations],
                      ['Reports with restock flags', systemState.data.signalIntake.restockFlags],
                      ['Reports with service stockouts', systemState.data.signalIntake.stockoutFlags],
                      ['Reports with price adjustments', systemState.data.signalIntake.priceAdjustments],
                    ].map(([label, value]) => (
                      <div className="flex items-center justify-between border-b border-border/50 pb-2 last:border-b-0 last:pb-0" key={label}>
                        <span className="text-sm text-muted-foreground">{label}</span>
                        <span className="text-sm font-medium text-foreground">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Signal intake will appear once system detail loads.</p>
                )}
              </SectionBlock>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="forecasts">
          <div className="space-y-5">
            <SectionBlock title="Forecast controls">
              <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)_220px_160px]">
                <div className="flex rounded-full border border-border/60 bg-background/70 p-1">
                  {(['skus', 'services'] as const).map((entityType) => (
                    <button
                      className={cn(
                        'rounded-full px-4 py-2 text-sm transition-colors',
                        forecastEntityType === entityType ? 'bg-foreground text-background' : 'text-muted-foreground',
                      )}
                      key={entityType}
                      type="button"
                      onClick={() => setForecastEntityType(entityType)}
                    >
                      {entityType === 'skus' ? 'SKUs' : 'Services'}
                    </button>
                  ))}
                </div>
                <Input
                  aria-label="Search forecast entities"
                  placeholder={`Search ${forecastEntityType}…`}
                  value={forecastQuery}
                  onChange={(event) => setForecastQuery(event.target.value)}
                />
                <select
                  aria-label="Forecast entity selector"
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                  value={forecastEntityType === 'skus' ? selectedSkuId : selectedServiceId}
                  onChange={(event) =>
                    forecastEntityType === 'skus'
                      ? setSelectedSkuId(event.target.value)
                      : setSelectedServiceId(event.target.value)
                  }
                >
                  {(forecastEntityType === 'skus' ? filteredForecastSkus : filteredForecastServices).map((entity) => (
                    <option
                      key={'skuId' in entity ? entity.skuId : entity.serviceId}
                      value={'skuId' in entity ? entity.skuId : entity.serviceId}
                    >
                      {entity.name}
                    </option>
                  ))}
                </select>
                <div className="flex h-10 items-center rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground">
                  Horizon {snapshot.sist.settings.forecastHorizonDays}d
                </div>
              </div>
            </SectionBlock>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,2.2fr)_320px]">
              <SectionBlock
                description={
                  forecastEntityType === 'skus'
                    ? 'Posterior inventory trajectory, forecast depletion, and uncertainty band.'
                    : 'Projected service viability with uncertainty and disruption window.'
                }
                title={forecastEntityType === 'skus' ? 'Inventory trajectory' : 'Service viability'}
              >
                {forecastEntityType === 'skus' ? (
                  selectedSkuDetailState.status === 'ready' && selectedSkuDetail ? (
                    <SparkBandChart
                      data={buildChartPoints(selectedSkuDetail)}
                      thresholds={[
                        {
                          color: 'rgb(191, 83, 72)',
                          label: 'Reorder point',
                          value: selectedSkuDetail.insight.reorderPoint,
                        },
                        {
                          color: 'rgb(118, 126, 140)',
                          label: 'Safety stock',
                          value: selectedSkuDetail.insight.safetyStock,
                        },
                      ]}
                    />
                ) : (
                  <LoadStateMessage
                    error={selectedSkuDetailState.status === 'error' ? selectedSkuDetailState.error : null}
                    fallback="Loading SKU forecast…"
                  />
                )
              ) : selectedServiceDetailState.status === 'ready' && selectedServiceDetail ? (
                <SparkBandChart data={buildServiceChartPoints(selectedServiceDetail)} />
              ) : (
                  <LoadStateMessage
                    error={
                      selectedServiceDetailState.status === 'error'
                        ? selectedServiceDetailState.error
                        : null
                    }
                    fallback="Loading service forecast…"
                  />
                )}
              </SectionBlock>

              <SectionBlock title="Selected entity">
                {forecastEntityType === 'skus' ? (
                  selectedSkuDetail ? (
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Stockout risk</span>
                        <Badge variant={badgeVariantForRisk(selectedSkuDetail.insight.stockoutRisk)}>
                          {formatPercent(selectedSkuDetail.insight.stockoutRisk, language)}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Expected demand/day</span>
                        <span>{formatNumber(selectedSkuDetail.insight.expectedDemandPerDay, language)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Reorder point</span>
                        <span>{formatNumber(selectedSkuDetail.insight.reorderPoint, language)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Safety stock</span>
                        <span>{formatNumber(selectedSkuDetail.insight.safetyStock, language)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Confidence</span>
                        <span>{confidenceLabel(selectedSkuDetail.insight.confidence)}</span>
                      </div>
                    </div>
                  ) : (
                    <LoadStateMessage
                      error={selectedSkuDetailState.status === 'error' ? selectedSkuDetailState.error : null}
                      fallback={
                        selectedSkuDetailState.status === 'loading'
                          ? 'Loading selected SKU diagnostics…'
                          : 'Select a SKU to inspect its forecast rail.'
                      }
                    />
                  )
                ) : selectedServiceDetail ? (
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Disruption risk</span>
                      <Badge variant={badgeVariantForRisk(selectedServiceDetail.disruptionWindow.probability)}>
                        {formatPercent(selectedServiceDetail.disruptionWindow.probability, language)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Expected activity</span>
                      <span>{formatNumber(selectedServiceDetail.estimatedActivityPerInterval, language)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Collapse window</span>
                      <span>{formatDateTime(selectedServiceDetail.disruptionWindow.startAt, language)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Top bottleneck probability</span>
                      <span>{formatPercent(selectedServiceDetail.bottleneckProbability, language)}</span>
                    </div>
                  </div>
                ) : (
                  <LoadStateMessage
                    error={
                      selectedServiceDetailState.status === 'error'
                        ? selectedServiceDetailState.error
                        : null
                    }
                    fallback={
                      selectedServiceDetailState.status === 'loading'
                        ? 'Loading selected service diagnostics…'
                        : 'Select a service to inspect its forecast rail.'
                    }
                  />
                )}
              </SectionBlock>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="rank-signals">
          <div className="space-y-5">
            <SectionBlock title="Signal interpretation">
              <p className="text-sm leading-6 text-foreground">
                Rank signals are evidence, not priorities. SIST uses recent selling order to improve
                demand interpretation.
              </p>
            </SectionBlock>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)]">
              <SectionBlock title="Signal history">
                {reportsState.status === 'error' ? (
                  <p className="text-sm text-destructive">{reportsState.error}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Top services</TableHead>
                        <TableHead>Top retail SKUs</TableHead>
                        <TableHead>Strength</TableHead>
                        <TableHead>Affected</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rankingReports.map((report) => (
                        <TableRow
                          className={cn(
                            'cursor-pointer',
                            selectedRankReport?.reportId === report.reportId && 'bg-muted/60',
                          )}
                          key={report.reportId}
                          onClick={() => setSelectedRankReportId(report.reportId)}
                        >
                          <TableCell>{formatDateTime(report.reportedAt, language)}</TableCell>
                          <TableCell>{report.topServiceRanking.length || '—'}</TableCell>
                          <TableCell>{report.topRetailRanking.length || '—'}</TableCell>
                          <TableCell>
                            {reportSignalStrength(report)} / {reportCompleteness(report)}
                          </TableCell>
                          <TableCell>{reportAffectedEntityCount(report)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </SectionBlock>

              <SectionBlock title="Interpretation panel">
                {selectedRankReport ? (
                  <div className="space-y-5">
                    <div className="rounded-[1.2rem] border border-border/60 bg-background/50 p-4">
                      <p className="text-sm font-medium text-foreground">
                        {formatDateTime(selectedRankReport.reportedAt, language)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        SIST translated this rank-capture into local demand emphasis and posterior ordering shifts.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                          Reported service ordering
                        </p>
                        {selectedRankReport.topServiceRanking.map((serviceId, index) => (
                          <div className="flex items-center justify-between border-b border-border/50 pb-2" key={serviceId}>
                            <span className="text-sm text-foreground">
                              #{index + 1} {findServiceName(snapshot.services, serviceId)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <p className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                          Inferred service demand ordering
                        </p>
                        {inferredServiceRanking.map((service, index) => (
                          <div className="flex items-center justify-between border-b border-border/50 pb-2" key={service.label}>
                            <span className="text-sm text-foreground">
                              #{index + 1} {service.label}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {formatNumber(service.value, language)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <p className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                          Reported retail ordering
                        </p>
                        {selectedRankReport.topRetailRanking.map((skuId, index) => (
                          <div className="flex items-center justify-between border-b border-border/50 pb-2" key={skuId}>
                            <span className="text-sm text-foreground">
                              #{index + 1} {snapshot.skus.find((sku) => sku.skuId === skuId)?.name ?? skuId}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <p className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                          Inferred retail demand ordering
                        </p>
                        {inferredRetailRanking.map((sku, index) => (
                          <div className="flex items-center justify-between border-b border-border/50 pb-2" key={sku.label}>
                            <span className="text-sm text-foreground">
                              #{index + 1} {sku.label}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {formatNumber(sku.value, language)}/day
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No ranking-signal reports are available yet.</p>
                )}
              </SectionBlock>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="services">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,1fr)]">
            <SectionBlock title="Service explorer">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Viability</TableHead>
                    <TableHead>Disruption window</TableHead>
                    <TableHead>Bottleneck</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serviceRows.map((row) => (
                    <TableRow
                      className={cn(
                        'cursor-pointer',
                        row.service.serviceId === selectedServiceId && 'bg-muted/60',
                      )}
                      key={row.service.serviceId}
                      onClick={() => setSelectedServiceId(row.service.serviceId)}
                    >
                      <TableCell>{row.service.name}</TableCell>
                      <TableCell>{row.state}</TableCell>
                      <TableCell>
                        {row.detail?.disruptionWindow.startAt
                          ? formatDateTime(row.detail.disruptionWindow.startAt, language)
                          : 'Pending'}
                      </TableCell>
                      <TableCell>{row.detail?.contributors[0]?.skuId ?? 'Pending'}</TableCell>
                      <TableCell>
                        {row.detail?.metadata ? confidenceLabel(snapshot.sist.status.confidence) : 'Pending'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SectionBlock>

            <SectionBlock title="Service detail">
              {selectedServiceDetail ? (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-[1.2rem] border border-border/60 bg-background/50 p-4">
                      <p className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                        Service viability
                      </p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                        {formatPercent(1 - selectedServiceDetail.disruptionWindow.probability, language)}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Projected collapse window starts around{' '}
                        {formatDateTime(selectedServiceDetail.disruptionWindow.startAt, language)}.
                      </p>
                    </div>
                    <div className="rounded-[1.2rem] border border-border/60 bg-background/50 p-4">
                      <p className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                        Dependency contributors
                      </p>
                      <div className="mt-3 space-y-2">
                        {selectedServiceDetail.contributors.slice(0, 4).map((contributor) => (
                          <div className="flex items-center justify-between" key={contributor.skuId}>
                            <span className="text-sm text-foreground">
                              {snapshot.skus.find((sku) => sku.skuId === contributor.skuId)?.name ?? contributor.skuId}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {formatPercent(contributor.pressureProbability, language)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <SectionBlock className="p-4" title="Service forecast">
                    <SparkBandChart data={buildServiceChartPoints(selectedServiceDetail)} />
                  </SectionBlock>
                  <SectionBlock className="p-4" title="Recent evidence">
                    <div className="space-y-3">
                      {selectedServiceDetail.evidenceTimeline.slice(0, 4).map((evidence) => (
                        <div className="flex items-center justify-between border-b border-border/50 pb-2" key={evidence.reportId}>
                          <span className="text-sm text-foreground">
                            {formatDateTime(evidence.reportedAt, language)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            ranking {formatPercent(evidence.rankingEvidence, language)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </SectionBlock>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {selectedServiceDetailState.status === 'error'
                    ? selectedServiceDetailState.error
                    : 'Select a service to inspect the analyst detail panel.'}
                </p>
              )}
            </SectionBlock>
          </div>
        </TabsContent>

        <TabsContent value="skus">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,1fr)]">
            <SectionBlock title="SKU explorer">
              <div className="mb-4 flex flex-wrap gap-2">
                {([
                  ['all', 'All'],
                  ['high-risk', 'High risk'],
                  ['reorder-due', 'Reorder due'],
                  ['low-confidence', 'Low confidence'],
                ] as Array<[SkuFilter, string]>).map(([value, label]) => (
                  <button
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition-colors',
                      skuFilter === value
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border bg-background text-muted-foreground',
                    )}
                    key={value}
                    type="button"
                    onClick={() => setSkuFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Posterior units</TableHead>
                    <TableHead>Days of cover</TableHead>
                    <TableHead>Stockout risk</TableHead>
                    <TableHead>Reorder point</TableHead>
                    <TableHead>Demand/day</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skuRows.map((row) => (
                    <TableRow
                      className={cn('cursor-pointer', row.insight.skuId === selectedSkuId && 'bg-muted/60')}
                      key={row.insight.skuId}
                      onClick={() => setSelectedSkuId(row.insight.skuId)}
                    >
                      <TableCell>{row.sku?.name ?? row.insight.skuId}</TableCell>
                      <TableCell>{formatNumber(row.insight.latestPosteriorUnits, language)}</TableCell>
                      <TableCell>
                        {row.insight.daysOfCover == null
                          ? '—'
                          : formatNumber(row.insight.daysOfCover, language)}
                      </TableCell>
                      <TableCell>{formatPercent(row.insight.stockoutRisk, language)}</TableCell>
                      <TableCell>{formatNumber(row.insight.reorderPoint, language)}</TableCell>
                      <TableCell>{formatNumber(row.insight.expectedDemandPerDay, language)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SectionBlock>

            <SectionBlock title="SKU detail">
              {selectedSkuDetail ? (
                <div className="space-y-5">
                  <SectionBlock className="p-4" title="Trajectory">
                    <SparkBandChart
                      data={buildChartPoints(selectedSkuDetail)}
                      thresholds={[
                        {
                          color: 'rgb(191, 83, 72)',
                          label: 'Reorder point',
                          value: selectedSkuDetail.insight.reorderPoint,
                        },
                      ]}
                    />
                  </SectionBlock>
                  <div className="grid gap-4 md:grid-cols-2">
                    <SectionBlock className="p-4" title="Demand">
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Expected demand/day</span>
                          <span>{formatNumber(selectedSkuDetail.insight.expectedDemandPerDay, language)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Interval bounds</span>
                          <span>
                            {formatNumber(selectedSkuDetail.insight.demandIntervalLow, language)} to{' '}
                            {formatNumber(selectedSkuDetail.insight.demandIntervalHigh, language)}
                          </span>
                        </div>
                      </div>
                    </SectionBlock>
                    <SectionBlock className="p-4" title="Reorder policy">
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Reorder point</span>
                          <span>{formatNumber(selectedSkuDetail.insight.reorderPoint, language)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Safety stock</span>
                          <span>{formatNumber(selectedSkuDetail.insight.safetyStock, language)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Trigger probability</span>
                          <span>{formatPercent(selectedSkuDetail.insight.reorderTriggerProbability, language)}</span>
                        </div>
                      </div>
                    </SectionBlock>
                  </div>
                  <SectionBlock className="p-4" title="Signal history">
                    <div className="space-y-3">
                      {(selectedSkuDetail.evidenceSummary ?? []).slice(0, 5).map((evidence) => (
                        <div className="flex items-center justify-between border-b border-border/50 pb-2" key={evidence.reportId}>
                          <span className="text-sm text-foreground">
                            {formatDateTime(evidence.reportedAt, language)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            ranking {formatPercent(evidence.rankingEvidence, language)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </SectionBlock>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {selectedSkuDetailState.status === 'error'
                    ? selectedSkuDetailState.error
                    : 'Select a SKU to inspect the analyst detail panel.'}
                </p>
              )}
            </SectionBlock>
          </div>
        </TabsContent>

        <TabsContent value="evidence">
          <div className="space-y-5">
            <SectionBlock title="Evidence filters">
              <div className="grid gap-4 md:grid-cols-[220px_220px_minmax(0,1fr)]">
                <select
                  aria-label="Evidence filter"
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                  value={evidenceFilter}
                  onChange={(event) => setEvidenceFilter(event.target.value as EvidenceFilter)}
                >
                  <option value="all">All reports</option>
                  <option value="ranking">Has ranking signal</option>
                  <option value="restock">Has restock flag</option>
                  <option value="service-stockout">Has service stockout flag</option>
                </select>
                <Input
                  aria-label="Evidence entity filter"
                  placeholder="Affected SKU or service"
                  value={evidenceEntityQuery}
                  onChange={(event) => setEvidenceEntityQuery(event.target.value)}
                />
                <div className="flex items-center rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground">
                  {formatNumber(filteredEvidence.length, language)} ledger rows in scope
                </div>
              </div>
            </SectionBlock>

            <SectionBlock title="Evidence ledger">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Captured signals</TableHead>
                    <TableHead>Affected entities</TableHead>
                    <TableHead>Dominant regime</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvidence.map((report) => {
                    const expanded = expandedEvidenceId === report.reportId;
                    return (
                      <Fragment key={report.reportId}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() =>
                            setExpandedEvidenceId(expanded ? null : report.reportId)
                          }
                        >
                          <TableCell>{formatDateTime(report.reportedAt, language)}</TableCell>
                          <TableCell>
                            {[reportHasRankingSignal(report) && 'ranking', reportHasRestock(report) && 'restock', reportHasServiceStockout(report) && 'service stockout']
                              .filter(Boolean)
                              .join(', ') || 'stock observation'}
                          </TableCell>
                          <TableCell>{reportAffectedEntityCount(report)}</TableCell>
                          <TableCell>{regimeLabel(snapshot.sist.topRegime)}</TableCell>
                          <TableCell>{report.notes ? 'Yes' : 'No'}</TableCell>
                        </TableRow>
                        {expanded ? (
                          <TableRow>
                            <TableCell className="whitespace-normal" colSpan={5}>
                              <div className="grid gap-4 md:grid-cols-3">
                                <div>
                                  <p className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                                    What was observed
                                  </p>
                                  <p className="mt-2 text-sm text-foreground">
                                    {report.skuObservations.length} SKU observations, {report.serviceSignals.length} service signals, {report.servicePriceAdjustments.length} price edits.
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                                    What SIST inferred
                                  </p>
                                  <p className="mt-2 text-sm text-foreground">
                                    The current model leans {regimeLabel(snapshot.sist.topRegime)} with {confidenceLabel(snapshot.sist.status.confidence).toLowerCase()} confidence.
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                                    Which entities were affected
                                  </p>
                                  <p className="mt-2 text-sm text-foreground">
                                    {report.topServiceRanking.concat(report.topRetailRanking).join(', ') || 'No explicit ranking capture.'}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </SectionBlock>
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_340px]">
            <SectionBlock title="Model settings">
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ['targetServiceLevel', 'Target service level'],
                  ['forecastHorizonDays', 'Forecast horizon'],
                  ['particleCount', 'Particle count'],
                  ['smoothingWindowReports', 'Smoothing window'],
                ].map(([field, label]) => (
                  <label className="space-y-2" key={field}>
                    <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {label}
                    </span>
                    <Input
                      aria-label={label}
                      value={settingsForm[field as keyof typeof settingsForm]}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              {settingsError ? <p className="mt-4 text-sm text-destructive">{settingsError}</p> : null}
              <div className="mt-5 flex justify-end">
                <Button disabled={isSaving} type="button" onClick={() => void handleSaveSettings()}>
                  Save model settings
                </Button>
              </div>
            </SectionBlock>

            <div className="space-y-5">
              <SectionBlock title="Plain-language explanation">
                <p className="text-sm leading-6 text-foreground">
                  These settings change how aggressively SIST protects against stockouts, how far it
                  projects demand, and how much uncertainty smoothing it applies to sparse reports.
                </p>
              </SectionBlock>
              <SectionBlock title="Technical impact">
                <div className="space-y-3 text-sm text-foreground">
                  <div className="flex gap-3">
                    <Gauge className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <p>Higher target service level raises reorder points and safety stock.</p>
                  </div>
                  <div className="flex gap-3">
                    <TrendingUp className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <p>Longer forecast horizon stretches the forward series and disruption window.</p>
                  </div>
                  <div className="flex gap-3">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <p>More particles stabilize posterior variance but cost more runtime.</p>
                  </div>
                  <div className="flex gap-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <p>Smoothing changes how strongly recent reports dominate drift and regime updates.</p>
                  </div>
                </div>
              </SectionBlock>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </WorkspacePage>
  );
}

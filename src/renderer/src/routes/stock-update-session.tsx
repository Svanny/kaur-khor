import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Circle, CircleDot, NotebookPen, RotateCcw, Search } from 'lucide-react';
import type { InventorySnapshot, RankingEntry, StockReport } from '@shared/inventory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  MerchandisingEditor,
  buildEligibleReportRanking,
  buildDefaultReportRanking,
  hasRankingChanged,
  normalizeReportRanking,
  rankingIdsByType,
} from '@/components/system/merchandising-editor';
import { DescriptionText } from '@/components/system/description-text';
import { HoverTooltip } from '@/components/system/hover-tooltip';
import { WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { currencyFractionDigits, formatCurrency, formatDecimal } from '@/lib/format';
import { summarizeCount } from '@/lib/stock-report-summary';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import {
  createOperationsSessionDraft,
  hasMeaningfulOperationsSessionChanges,
  useOperationsSession,
  type OperationsSessionPreset as Preset,
  type OperationsSessionRowFilter as RowFilter,
  type OperationsSessionStepId as SessionStepId,
} from '@/state/operations-session';
import { usePreferences } from '@/state/preferences';

type StepStatus = 'required' | 'optional' | 'complete' | 'skipped' | 'needs-attention';

const presetSteps: Record<Preset, { units: number; cost: number }> = {
  small: { units: 1, cost: 0.25 },
  medium: { units: 5, cost: 0.5 },
  big: { units: 20, cost: 1 },
};

const stepOrder: SessionStepId[] = ['observations', 'services', 'sales-signal', 'details', 'review'];

function getLatestReport(reports: StockReport[]) {
  return [...reports].sort(
    (left, right) => new Date(right.reportedAt).getTime() - new Date(left.reportedAt).getTime(),
  )[0] ?? null;
}

function getSalesSignalBaseline(snapshot: InventorySnapshot, reports: StockReport[]) {
  const latestReport = getLatestReport(reports);
  if (!latestReport) {
    return buildDefaultReportRanking(snapshot);
  }

  const preferredEntries = [
    ...latestReport.topServiceRanking.map((serviceId, index) => ({
      entryType: 'service' as const,
      entryId: serviceId,
      position: index,
    })),
    ...latestReport.topRetailRanking.map((skuId, index) => ({
      entryType: 'sku' as const,
      entryId: skuId,
      position: latestReport.topServiceRanking.length + index,
    })),
  ];

  return preferredEntries.length > 0
    ? normalizeReportRanking(snapshot, preferredEntries)
    : buildDefaultReportRanking(snapshot);
}

function getSalesSignalScopeCount(snapshot: InventorySnapshot) {
  return buildEligibleReportRanking(snapshot).length;
}

function splitRankingDraft(entries: RankingEntry[]) {
  return {
    topServiceRanking: rankingIdsByType(entries, 'service'),
    topRetailRanking: rankingIdsByType(entries, 'sku'),
  };
}

function toIsoTimestamp(value: string) {
  if (!value.trim()) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function resolveStep(rawStep: string | null) {
  if (rawStep && stepOrder.includes(rawStep as SessionStepId)) {
    return rawStep as SessionStepId;
  }
  return stepOrder[0];
}

function fractionDigitsForValue(value: string | number) {
  const normalized = String(value);
  const decimalIndex = normalized.indexOf('.');
  if (decimalIndex === -1) {
    return 0;
  }
  return normalized.length - decimalIndex - 1;
}

function getPresetName(
  preset: Preset,
  t: ReturnType<typeof usePreferences>['t'],
) {
  return preset === 'small'
    ? t('stockPresetSmall')
    : preset === 'medium'
      ? t('stockPresetMedium')
      : t('stockPresetBig');
}

function getPresetDetails(
  preset: Preset,
  t: ReturnType<typeof usePreferences>['t'],
  language: ReturnType<typeof usePreferences>['language'],
  currency: ReturnType<typeof usePreferences>['currency'],
) {
  const formattedCost = formatDecimal(
    presetSteps[preset].cost,
    language,
    currencyFractionDigits(currency),
  );

  return {
    compact: `${t('fieldUnitsInStock')} ±${presetSteps[preset].units} • ${t('fieldCostPerUnit')} ±${formattedCost}`,
    expanded: `${t('fieldUnitsInStock')} ±${presetSteps[preset].units} • ${t('fieldCostPerUnit')} ±${formattedCost}`,
  };
}

function PresetOptionCopy({
  preset,
  t,
  language,
  currency,
  compact = false,
}: {
  preset: Preset;
  t: ReturnType<typeof usePreferences>['t'];
  language: ReturnType<typeof usePreferences>['language'];
  currency: ReturnType<typeof usePreferences>['currency'];
  compact?: boolean;
}) {
  const details = getPresetDetails(preset, t, language, currency);

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-sm font-semibold text-foreground">{getPresetName(preset, t)}</span>
      {compact ? null : <span className="sr-only">, </span>}
      {compact ? null : (
        <span className="text-xs leading-5 whitespace-normal text-muted-foreground">
          {details.expanded}
        </span>
      )}
    </span>
  );
}

function formatDisplayedCostDraftValue(
  rawValue: string | undefined,
  language: ReturnType<typeof usePreferences>['language'],
  currency: ReturnType<typeof usePreferences>['currency'],
) {
  if (!rawValue?.trim()) {
    return rawValue ?? '';
  }

  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) {
    return rawValue;
  }

  return formatDecimal(parsed, language, currencyFractionDigits(currency));
}

function getSkuProductPriceDraftValue(
  rawValue: string | undefined,
  baselineValue: number | null,
) {
  if (rawValue !== undefined) {
    return rawValue;
  }
  return baselineValue == null ? '' : String(baselineValue);
}

function currencySymbol(
  currency: ReturnType<typeof usePreferences>['currency'],
  language: ReturnType<typeof usePreferences>['language'],
) {
  const parts = new Intl.NumberFormat(language === 'km' ? 'km-KH' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).formatToParts(0);

  return parts.find((part) => part.type === 'currency')?.value ?? currency;
}

export function StockUpdateSessionRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { snapshot, submitReport, isSaving, listStockReports } = useInventory();
  const { draft, ensureDraft, updateDraft, clearDraft, hasDraft } = useOperationsSession();
  const { currency, language, t } = usePreferences();
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<StockReport[]>([]);
  const [timestampTouched, setTimestampTouched] = useState(false);
  const [observationsQuery, setObservationsQuery] = useState('');
  const [serviceQuery, setServiceQuery] = useState('');
  const [expandedSkuNotes, setExpandedSkuNotes] = useState<Record<string, boolean>>({});
  const [expandedServiceNotes, setExpandedServiceNotes] = useState<Record<string, boolean>>({});
  const [focusedCostSkuId, setFocusedCostSkuId] = useState<string | null>(null);
  const [focusedProductPriceSkuId, setFocusedProductPriceSkuId] = useState<string | null>(null);
  const [focusedServicePriceId, setFocusedServicePriceId] = useState<string | null>(null);
  const [editingSkuCostValues, setEditingSkuCostValues] = useState<Record<string, string>>({});
  const [editingSkuProductPriceValues, setEditingSkuProductPriceValues] = useState<Record<string, string>>({});
  const [editingServicePriceValues, setEditingServicePriceValues] = useState<Record<string, string>>({});
  const focusedSkuRowRef = useRef<HTMLTableRowElement | null>(null);
  const focusedServiceRowRef = useRef<HTMLTableRowElement | null>(null);
  const focusedSkuScrollKeyRef = useRef<string | null>(null);
  const focusedServiceScrollKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    ensureDraft(snapshot);
  }, [ensureDraft, snapshot]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    let cancelled = false;
    void listStockReports()
      .then((nextReports) => {
        if (!cancelled) {
          setReports(nextReports);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReports([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [listStockReports, snapshot]);

  const sessionDraft = snapshot ? (draft ?? createOperationsSessionDraft(snapshot)) : null;
  const rows = sessionDraft?.rows ?? {};
  const serviceDrafts = sessionDraft?.serviceDrafts ?? {};
  const rankingDraft = sessionDraft?.rankingDraft ?? [];
  const preset = sessionDraft?.preset ?? 'small';
  const reportedAt = sessionDraft?.reportedAt ?? '';
  const reportNotes = sessionDraft?.reportNotes ?? '';
  const rowFilter = sessionDraft?.rowFilter ?? 'all';
  const serviceFilter = sessionDraft?.serviceFilter ?? 'all';
  const focusSku = searchParams.get('focusSku');
  const focusService = searchParams.get('focusService');
  const focusedSku = snapshot?.skus.find((sku) => sku.skuId === focusSku) ?? null;
  const focusedService = snapshot?.services.find((service) => service.serviceId === focusService) ?? null;
  const activeStep = resolveStep(
    searchParams.get('step') ?? (hasDraft ? sessionDraft?.lastStep ?? null : null),
  );

  const changedEntries = useMemo(
    () =>
      snapshot?.skus
        .map((sku) => ({
          sku,
          unitsInStock: Number(rows[sku.skuId]?.unitsInStock ?? sku.unitsInStock),
          costPerUnit: Number(rows[sku.skuId]?.costPerUnit ?? sku.costPerUnit),
          productPrice:
            rows[sku.skuId]?.productPrice?.trim() === ''
              ? null
              : Number(rows[sku.skuId]?.productPrice ?? sku.productPrice ?? 0),
          restockIncluded: rows[sku.skuId]?.restockIncluded ?? false,
          retailStockout: rows[sku.skuId]?.retailStockout ?? false,
          notes: rows[sku.skuId]?.notes?.trim() ?? '',
        }))
        .filter(
          (entry) =>
            entry.unitsInStock !== entry.sku.unitsInStock ||
            entry.costPerUnit !== entry.sku.costPerUnit ||
            entry.productPrice !== entry.sku.productPrice ||
            entry.restockIncluded ||
            entry.retailStockout ||
            entry.notes.length > 0,
        ) ?? [],
    [rows, snapshot],
  );

  const serviceChanges = useMemo(
    () =>
      snapshot?.services
        .map((service) => {
          const draft = serviceDrafts[service.serviceId];
          const nextPrice = Number(draft?.price ?? service.price);
          const notes = draft?.notes?.trim() ?? '';
          return {
            service,
            stockout: draft?.stockout ?? false,
            price: nextPrice,
            priceChanged: nextPrice !== service.price,
            notes,
          };
        })
        .filter((entry) => entry.stockout || entry.priceChanged || entry.notes.length > 0) ?? [],
    [serviceDrafts, snapshot],
  );

  const stockoutServiceCount = useMemo(
    () => serviceChanges.filter((entry) => entry.stockout).length,
    [serviceChanges],
  );
  const servicePriceChangeCount = useMemo(
    () => serviceChanges.filter((entry) => entry.priceChanged).length,
    [serviceChanges],
  );
  const normalizedServiceQuery = serviceQuery.trim().toLowerCase();
  const sortedServiceEntries = useMemo(
    () =>
      snapshot?.services
        .map((service) => {
          const draft = serviceDrafts[service.serviceId];
          const nextPrice = Number(draft?.price ?? service.price);
          const stockout = draft?.stockout ?? false;
          const priceChanged = nextPrice !== service.price;
          const notes = draft?.notes?.trim() ?? '';
          return {
            service,
            stockout,
            price: nextPrice,
            priceChanged,
            notes,
            changed: stockout || priceChanged || notes.length > 0,
          };
        }) ?? [],
    [serviceDrafts, snapshot],
  );
  const visibleServiceEntries = useMemo(
    () => {
      const filterSource =
        serviceFilter === 'changed'
          ? sortedServiceEntries.filter(
              (entry) => entry.changed || entry.service.serviceId === focusedService?.serviceId,
            )
          : sortedServiceEntries;

      const filteredEntries = normalizedServiceQuery
        ? filterSource.filter(
            (entry) =>
              `${entry.service.name} ${entry.service.serviceId}`.toLowerCase().includes(normalizedServiceQuery) ||
              entry.service.serviceId === focusedService?.serviceId,
          )
        : filterSource;

      if (!focusedService) {
        return filteredEntries;
      }

      return [...filteredEntries].sort((left, right) => {
        if (left.service.serviceId === focusedService.serviceId) {
          return -1;
        }
        if (right.service.serviceId === focusedService.serviceId) {
          return 1;
        }
        return 0;
      });
    },
    [focusedService, normalizedServiceQuery, serviceFilter, sortedServiceEntries],
  );
  const changedServicePreview = useMemo(
    () => serviceChanges.slice(0, 3).map((entry) => entry.service.name),
    [serviceChanges],
  );
  const salesSignalScopeCount = useMemo(
    () => (snapshot ? getSalesSignalScopeCount(snapshot) : 0),
    [snapshot],
  );
  const salesSignalBaseline = useMemo(
    () => (snapshot ? getSalesSignalBaseline(snapshot, reports) : []),
    [reports, snapshot],
  );
  const salesSignalChanged = useMemo(
    () => Boolean(snapshot && hasRankingChanged(salesSignalBaseline, rankingDraft)),
    [rankingDraft, salesSignalBaseline, snapshot],
  );
  const salesSignalTopPreview = useMemo(
    () =>
      rankingDraft
        .slice(0, 3)
        .map((entry) =>
          entry.entryType === 'service'
            ? snapshot?.services.find((service) => service.serviceId === entry.entryId)?.name
            : snapshot?.skus.find((sku) => sku.skuId === entry.entryId)?.name,
        )
        .filter((name): name is string => Boolean(name)),
    [rankingDraft, snapshot],
  );
  const salesSignalPriceByEntryKey = useMemo(() => {
    if (!snapshot) {
      return {};
    }

    return Object.fromEntries([
      ...snapshot.services.map((service) => {
        const nextPrice = Number(serviceDrafts[service.serviceId]?.price);
        return [`service:${service.serviceId}`, Number.isFinite(nextPrice) ? nextPrice : service.price];
      }),
      ...snapshot.skus
        .filter((sku) => sku.soldAsProduct && sku.productPrice !== null)
        .map((sku) => {
          const nextPrice = Number(rows[sku.skuId]?.productPrice);
          return [`sku:${sku.skuId}`, Number.isFinite(nextPrice) ? nextPrice : sku.productPrice ?? 0];
        }),
    ]);
  }, [rows, serviceDrafts, snapshot]);
  const salesSignalPriceChangeByEntryKey = useMemo(() => {
    if (!snapshot) {
      return {};
    }

    return Object.fromEntries([
      ...snapshot.services.map((service) => {
        const nextPrice = Number(serviceDrafts[service.serviceId]?.price);
        const currentPrice = Number.isFinite(nextPrice) ? nextPrice : service.price;
        return [
          `service:${service.serviceId}`,
          currentPrice > service.price ? 'up' : currentPrice < service.price ? 'down' : null,
        ];
      }),
      ...snapshot.skus
        .filter((sku) => sku.soldAsProduct && sku.productPrice !== null)
        .map((sku) => {
          const nextPrice = Number(rows[sku.skuId]?.productPrice);
          const currentPrice = Number.isFinite(nextPrice) ? nextPrice : sku.productPrice ?? 0;
          return [
            `sku:${sku.skuId}`,
            currentPrice > (sku.productPrice ?? 0)
              ? 'up'
              : currentPrice < (sku.productPrice ?? 0)
                ? 'down'
                : null,
          ];
        }),
    ]);
  }, [rows, serviceDrafts, snapshot]);
  const hasMeaningfulDraftChanges = Boolean(
    snapshot &&
      sessionDraft &&
      hasMeaningfulOperationsSessionChanges(snapshot, sessionDraft, salesSignalBaseline),
  );
  const detailsComplete = Boolean(toIsoTimestamp(reportedAt));
  const observationsComplete = changedEntries.length > 0;
  const servicesComplete = serviceChanges.length > 0;
  const salesSignalComplete = salesSignalChanged;
  const reviewReady = detailsComplete && observationsComplete;
  const timestampError = timestampTouched && !detailsComplete ? t('validationTimestamp') : null;
  const completedCount = [
    detailsComplete,
    observationsComplete,
    servicesComplete,
    salesSignalComplete,
    reviewReady,
  ].filter(Boolean).length;
  const changedEntryIds = useMemo(
    () => new Set(changedEntries.map((entry) => entry.sku.skuId)),
    [changedEntries],
  );
  const normalizedObservationsQuery = observationsQuery.trim().toLowerCase();
  const visibleSkus = useMemo(
    () => {
      const sourceSkus =
        rowFilter === 'changed'
          ? (snapshot?.skus ?? []).filter(
              (sku) => changedEntryIds.has(sku.skuId) || sku.skuId === focusedSku?.skuId,
            )
          : (snapshot?.skus ?? []);

      if (!focusedSku) {
        return normalizedObservationsQuery
          ? sourceSkus.filter((sku) =>
              `${sku.name} ${sku.skuId}`.toLowerCase().includes(normalizedObservationsQuery),
            )
          : sourceSkus;
      }

      const filteredSkus = normalizedObservationsQuery
        ? sourceSkus.filter(
            (sku) =>
              `${sku.name} ${sku.skuId}`.toLowerCase().includes(normalizedObservationsQuery) ||
              sku.skuId === focusedSku.skuId,
          )
        : sourceSkus;

      return [...filteredSkus].sort((left, right) => {
        if (left.skuId === focusedSku.skuId) {
          return -1;
        }
        if (right.skuId === focusedSku.skuId) {
          return 1;
        }
        return 0;
      });
    },
    [changedEntryIds, focusedSku, normalizedObservationsQuery, rowFilter, snapshot],
  );
  const presetOptions = useMemo(
    () =>
      (['small', 'medium', 'big'] as Preset[]).map((value) => ({
        value,
        name: getPresetName(value, t),
        details: getPresetDetails(value, t, language, currency),
      })),
    [currency, language, t],
  );

  function getStepStatus(stepId: SessionStepId): StepStatus {
    if (stepId === 'details') {
      return detailsComplete ? 'complete' : 'needs-attention';
    }
    if (stepId === 'observations') {
      return observationsComplete ? 'complete' : 'needs-attention';
    }
    if (stepId === 'services') {
      return serviceChanges.length > 0 ? 'complete' : 'skipped';
    }
    if (stepId === 'sales-signal') {
      if (salesSignalScopeCount === 0) {
        return 'skipped';
      }
      return salesSignalChanged ? 'complete' : 'skipped';
    }
    if (reviewReady) {
      return 'complete';
    }
    return 'required';
  }

  const steps = [
    {
      id: 'observations' as const,
      title: t('stockSessionStepObservations'),
      description: t('stockSessionStepObservationsDescription'),
      complete: observationsComplete,
      optional: false,
      status: getStepStatus('observations'),
    },
    {
      id: 'services' as const,
      title: t('stockSessionStepServices'),
      description: t('stockSessionStepServicesDescription'),
      complete: servicesComplete,
      optional: true,
      status: getStepStatus('services'),
    },
    {
      id: 'sales-signal' as const,
      title: t('stockSessionStepSalesSignal'),
      description: t('stockSessionStepSalesSignalDescription'),
      complete: salesSignalComplete,
      optional: true,
      status: getStepStatus('sales-signal'),
    },
    {
      id: 'details' as const,
      title: t('stockSessionStepDetails'),
      description: t('stockSessionStepDetailsDescription'),
      complete: detailsComplete,
      optional: false,
      status: getStepStatus('details'),
    },
    {
      id: 'review' as const,
      title: t('stockSessionStepReview'),
      description: t('stockSessionStepReviewDescription'),
      complete: reviewReady,
      optional: false,
      status: getStepStatus('review'),
    },
  ];

  function setActiveStep(nextStep: SessionStepId) {
    updateDraft((current) => ({ ...current, lastStep: nextStep }));
    const next = new URLSearchParams(searchParams);
    if (nextStep === stepOrder[0]) {
      next.delete('step');
    } else {
      next.set('step', nextStep);
    }
    setSearchParams(next, { replace: true });
  }

  const activeStepIndex = stepOrder.indexOf(activeStep);
  const previousStep = activeStepIndex > 0 ? stepOrder[activeStepIndex - 1] : null;
  const nextStep = activeStepIndex < stepOrder.length - 1 ? stepOrder[activeStepIndex + 1] : null;

  useEffect(() => {
    updateDraft((current) =>
      current.lastStep === activeStep ? current : { ...current, lastStep: activeStep },
    );
  }, [activeStep, updateDraft]);

  useEffect(() => {
    if (!snapshot || !sessionDraft) {
      return;
    }

    const seededBaseline = buildDefaultReportRanking(snapshot);
    if (hasRankingChanged(seededBaseline, salesSignalBaseline)) {
      updateDraft((current) => {
        if (hasRankingChanged(seededBaseline, current.rankingDraft)) {
          return current;
        }
        if (!hasRankingChanged(salesSignalBaseline, current.rankingDraft)) {
          return current;
        }
        return {
          ...current,
          rankingDraft: salesSignalBaseline,
        };
      });
    }
  }, [salesSignalBaseline, sessionDraft, snapshot, updateDraft]);

  useEffect(() => {
    if (activeStep !== 'observations' || !focusedSkuRowRef.current || !focusedSku) {
      return;
    }
    const scrollKey = `${focusedSku.skuId}:${activeStep}`;
    if (focusedSkuScrollKeyRef.current === scrollKey) {
      return;
    }
    focusedSkuScrollKeyRef.current = scrollKey;
    focusedSkuRowRef.current.scrollIntoView?.({ block: 'center' });
  }, [activeStep, focusedSku, visibleSkus]);

  useEffect(() => {
    if (activeStep !== 'services' || !focusedServiceRowRef.current || !focusedService) {
      return;
    }
    const scrollKey = `${focusedService.serviceId}:${activeStep}`;
    if (focusedServiceScrollKeyRef.current === scrollKey) {
      return;
    }
    focusedServiceScrollKeyRef.current = scrollKey;
    focusedServiceRowRef.current.scrollIntoView?.({ block: 'center' });
  }, [activeStep, focusedService, visibleServiceEntries]);

  function handleCancelSession() {
    if (hasMeaningfulDraftChanges && !window.confirm(t('stockSessionDiscardPrompt'))) {
      return;
    }

    clearDraft();
    navigate('/operations');
  }

  function updateSkuRowDraft(
    current: NonNullable<typeof sessionDraft>,
    skuId: string,
    updater: (row: (typeof current.rows)[string]) => (typeof current.rows)[string],
  ) {
    const currentRow = current.rows[skuId];
    if (!currentRow) {
      return current;
    }

    const nextRow = updater(currentRow);

    return {
      ...current,
      rows: {
        ...current.rows,
        [skuId]: nextRow,
      },
    };
  }

  function setField(
    skuId: string,
    key: 'unitsInStock' | 'costPerUnit' | 'productPrice' | 'notes',
    value: string,
  ) {
    const baselineUnitsInStock = snapshot?.skus.find((entry) => entry.skuId === skuId)?.unitsInStock;

    updateDraft((current) =>
      updateSkuRowDraft(current, skuId, (row) => ({
        ...row,
        [key]: value,
        ...(key === 'unitsInStock' && baselineUnitsInStock !== undefined
          ? {
              restockIncluded: Number(value) > baselineUnitsInStock,
              retailStockout: Number(value) === 0,
            }
          : {}),
      })),
    );
  }

  function toggleField(skuId: string, key: 'restockIncluded' | 'retailStockout', value: boolean) {
    updateDraft((current) =>
      updateSkuRowDraft(current, skuId, (row) => ({
        ...row,
        [key]: value,
      })),
    );
  }

  function adjustValue(
    skuId: string,
    key: 'unitsInStock' | 'costPerUnit' | 'productPrice',
    direction: -1 | 1,
  ) {
    if (!snapshot) {
      return;
    }

    const currentSku = snapshot.skus.find((sku) => sku.skuId === skuId);
    if (!currentSku) {
      return;
    }

    const step = key === 'unitsInStock' ? presetSteps[preset].units : presetSteps[preset].cost;
    const rawCurrentValue =
      key === 'productPrice'
        ? getSkuProductPriceDraftValue(rows[skuId]?.productPrice, currentSku.productPrice)
        : rows[skuId]?.[key] ?? String(currentSku[key]);
    const currentValue = Number(rawCurrentValue);
    const nextValue = Math.max(0, currentValue + step * direction);
    const fractionDigits = Math.max(
      fractionDigitsForValue(rawCurrentValue),
      fractionDigitsForValue(step),
    );

    setField(
      skuId,
      key,
      fractionDigits > 0
        ? nextValue.toFixed(fractionDigits).replace(/\.?0+$/, '')
        : String(nextValue),
    );
  }

  function toggleSkuNotes(skuId: string) {
    setExpandedSkuNotes((current) => ({
      ...current,
      [skuId]: !(current[skuId] ?? false),
    }));
  }

  function resetSkuRow(skuId: string) {
    const sku = snapshot?.skus.find((entry) => entry.skuId === skuId);
    if (!sku) {
      return;
    }

    updateDraft((current) => ({
      ...current,
      rows: {
        ...current.rows,
        [skuId]: {
          unitsInStock: String(sku.unitsInStock),
          costPerUnit: String(sku.costPerUnit),
          productPrice: sku.productPrice == null ? '' : String(sku.productPrice),
          restockIncluded: false,
          retailStockout: false,
          notes: '',
        },
      },
    }));
  }

  function resetAllSkuRows() {
    if (!snapshot) {
      return;
    }

    updateDraft((current) => ({
      ...current,
      rows: Object.fromEntries(
        snapshot.skus.map((sku) => [
          sku.skuId,
          {
            unitsInStock: String(sku.unitsInStock),
            costPerUnit: String(sku.costPerUnit),
            productPrice: sku.productPrice == null ? '' : String(sku.productPrice),
            restockIncluded: false,
            retailStockout: false,
            notes: '',
          },
        ]),
      ),
    }));
    setExpandedSkuNotes({});
  }

  function toggleServiceNotes(serviceId: string) {
    setExpandedServiceNotes((current) => ({
      ...current,
      [serviceId]: !(current[serviceId] ?? false),
    }));
  }

  function resetServiceRow(serviceId: string) {
    const service = snapshot?.services.find((entry) => entry.serviceId === serviceId);
    if (!service) {
      return;
    }

    updateDraft((current) => ({
      ...current,
      serviceDrafts: {
        ...current.serviceDrafts,
        [serviceId]: {
          price: String(service.price),
          stockout: false,
          notes: '',
        },
      },
    }));
    setExpandedServiceNotes((current) => {
      const next = { ...current };
      delete next[serviceId];
      return next;
    });
  }

  function startEditingSkuCost(skuId: string) {
    setFocusedCostSkuId(skuId);
    setEditingSkuCostValues((current) => ({
      ...current,
      [skuId]: formatDisplayedCostDraftValue(rows[skuId]?.costPerUnit, language, currency),
    }));
  }

  function stopEditingSkuCost(skuId: string) {
    setFocusedCostSkuId(null);
    setEditingSkuCostValues((current) => {
      const next = { ...current };
      delete next[skuId];
      return next;
    });
  }

  function startEditingSkuProductPrice(skuId: string) {
    setFocusedProductPriceSkuId(skuId);
    const sku = snapshot?.skus.find((entry) => entry.skuId === skuId);
    setEditingSkuProductPriceValues((current) => ({
      ...current,
      [skuId]: formatDisplayedCostDraftValue(
        getSkuProductPriceDraftValue(rows[skuId]?.productPrice, sku?.productPrice ?? null),
        language,
        currency,
      ),
    }));
  }

  function stopEditingSkuProductPrice(skuId: string) {
    setFocusedProductPriceSkuId(null);
    setEditingSkuProductPriceValues((current) => {
      const next = { ...current };
      delete next[skuId];
      return next;
    });
  }

  function startEditingServicePrice(serviceId: string) {
    setFocusedServicePriceId(serviceId);
    setEditingServicePriceValues((current) => ({
      ...current,
      [serviceId]: formatDisplayedCostDraftValue(serviceDrafts[serviceId]?.price, language, currency),
    }));
  }

  function stopEditingServicePrice(serviceId: string) {
    setFocusedServicePriceId(null);
    setEditingServicePriceValues((current) => {
      const next = { ...current };
      delete next[serviceId];
      return next;
    });
  }

  function handleSalesSignalChange(nextEntries: RankingEntry[]) {
    updateDraft((current) => ({
      ...current,
      rankingDraft: nextEntries,
    }));
  }

  function handleResetSalesSignal() {
    if (!snapshot) {
      return;
    }

    updateDraft((current) => ({
      ...current,
      rankingDraft: salesSignalBaseline,
    }));
  }

  async function handleSubmit() {
    const isoReportedAt = toIsoTimestamp(reportedAt);

    if (!isoReportedAt) {
      setTimestampTouched(true);
      setError(t('validationTimestamp'));
      setActiveStep('details');
      return;
    }
    if (!observationsComplete) {
      setError(t('validationStockChanges'));
      setActiveStep('observations');
      return;
    }

    setError(null);

    const trimmedNotes = reportNotes.trim();
    const rankingSubmission = salesSignalChanged ? splitRankingDraft(rankingDraft) : null;
    const nextSubmission = {
      reportedAt: isoReportedAt,
      skuObservations: changedEntries.map((entry) => ({
        skuId: entry.sku.skuId,
        unitsInStock: entry.unitsInStock,
        costPerUnit: entry.costPerUnit,
        productPrice: entry.productPrice,
        restockIncluded: entry.restockIncluded,
        retailStockout: entry.retailStockout,
        notes: entry.notes || null,
      })),
      ...(serviceChanges.some((entry) => entry.stockout)
        ? {
            serviceSignals: serviceChanges
              .filter((entry) => entry.stockout)
              .map((entry) => ({
                serviceId: entry.service.serviceId,
                stockout: true,
                notes: entry.notes || null,
              })),
          }
        : {}),
      ...(serviceChanges.some((entry) => entry.priceChanged)
        ? {
            servicePriceAdjustments: serviceChanges
              .filter((entry) => entry.priceChanged)
              .map((entry) => ({
                serviceId: entry.service.serviceId,
                price: entry.price,
                notes: entry.notes || null,
              })),
          }
        : {}),
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      ...(rankingSubmission ?? {}),
    };

    await submitReport(nextSubmission);

    clearDraft();
    navigate('/operations');
  }

  if (!snapshot) {
    return null;
  }

  return (
    <WorkspacePage>
      <WorkspacePanel contentClassName="pt-0">
        <div className="grid gap-8 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-border/70 bg-card/55 p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-primary/85">
                {t('stockSessionEyebrow')}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                {t('stockSessionTitle')}
              </h2>
              <DescriptionText className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('stockSessionDescription')}
              </DescriptionText>
              <div className="mt-4 flex items-center gap-3">
                <Badge variant="secondary">
                {completedCount} / {steps.length} {t('stockSessionProgress')}
              </Badge>
                {!reviewReady ? (
                  <Badge variant="outline">{t('stockSessionIncomplete')}</Badge>
                ) : (
                  <Badge variant="outline">{t('stockSessionReady')}</Badge>
                )}
              </div>
            </div>

            <div className="grid gap-3">
              {steps.map((step, index) => {
                const isActive = activeStep === step.id;
                return (
                  <button
                    className={cn(
                      'flex w-full items-start gap-3 rounded-3xl border px-4 py-4 text-left transition-colors',
                      isActive
                        ? 'border-primary/40 bg-primary/6'
                        : 'border-border/70 bg-card/50 hover:bg-card/75',
                    )}
                    key={step.id}
                    type="button"
                    onClick={() => setActiveStep(step.id)}
                  >
                    <span
                      className="mt-0.5 text-primary"
                      data-status={step.status}
                      data-testid={`stock-session-step-icon-${step.id}`}
                    >
                      {step.status === 'complete' ? (
                        <CheckCircle2 className="size-5" />
                      ) : isActive ? (
                        <CircleDot className="size-5" />
                      ) : (
                        <Circle className="size-5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          {t('stockSessionStepLabel')} {index + 1}
                        </p>
                        <Badge variant={step.status === 'needs-attention' ? 'secondary' : 'outline'}>
                          {t(stepStatusKey(step.status))}
                        </Badge>
                      </div>
                      <p className="mt-1 font-medium text-foreground">{step.title}</p>
                      <DescriptionText className="mt-1 text-sm leading-6 text-muted-foreground">
                        {step.description}
                      </DescriptionText>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancelSession}
              >
                {t('stockComposerCancel')}
              </Button>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {activeStep === 'details' ? (
              <WorkspacePanel
                description={t('stockSessionStepDetailsDescription')}
                title={t('stockSessionStepDetails')}
              >
                <div className="rounded-3xl border border-border/70 bg-card/55 p-4 lg:p-5">
                  <div className="space-y-6">
                    <div>
                      <label className="text-sm font-medium text-foreground" htmlFor="reported-at">
                        {t('stockReportedAt')}
                      </label>
                      <Input
                        className="mt-2 rounded-2xl"
                        id="reported-at"
                        type="datetime-local"
                        value={reportedAt}
                        onBlur={() => setTimestampTouched(true)}
                        onChange={(event) =>
                          updateDraft((current) => ({
                            ...current,
                            reportedAt: event.target.value,
                          }))
                        }
                      />
                      {timestampError ? (
                        <p className="mt-2 text-sm text-destructive">{timestampError}</p>
                      ) : null}
                    </div>

                    <div aria-hidden="true" className="h-px w-full bg-border/70" />

                    <div>
                      <label className="text-sm font-medium text-foreground" htmlFor="report-notes">
                        {t('stockReportNotes')}
                      </label>
                      <Textarea
                        className="mt-2 min-h-24 rounded-2xl"
                        id="report-notes"
                        value={reportNotes}
                        onChange={(event) =>
                          updateDraft((current) => ({
                            ...current,
                            reportNotes: event.target.value,
                          }))
                        }
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t('stockSessionNotesOptional')}
                      </p>
                    </div>
                  </div>
                </div>
              </WorkspacePanel>
            ) : null}

            {activeStep === 'observations' ? (
              <WorkspacePanel description={t('stockUpdateHint')} title={t('stockTableTitle')}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Badge variant="secondary">
                    {summarizeCount(
                      changedEntries.length,
                      t('stockHistoryChangedRowSingular'),
                      t('stockHistoryChangedRowPlural'),
                    )}
                  </Badge>
                  {changedEntries.length > 0 ? (
                    <Button type="button" variant="outline" onClick={resetAllSkuRows}>
                      {t('stockObservationsClearAction')}
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-[240px] flex-1">
                    <label className="sr-only" htmlFor="stock-observations-search">
                      {t('stockObservationsSearchLabel')}
                    </label>
                    <InputGroup className="h-12 rounded-full">
                      <InputGroupAddon className="pl-4 text-muted-foreground" align="inline-start">
                        <Search className="size-4" />
                      </InputGroupAddon>
                      <InputGroupInput
                        className="rounded-full pr-4 text-base"
                        id="stock-observations-search"
                        placeholder={t('stockObservationsSearchPlaceholder')}
                        value={observationsQuery}
                        onChange={(event) => setObservationsQuery(event.target.value)}
                      />
                    </InputGroup>
                  </div>
                  {normalizedObservationsQuery && visibleSkus.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {summarizeCount(
                        visibleSkus.length,
                        t('stockObservationsSearchResultSingular'),
                        t('stockObservationsSearchResultPlural'),
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <ToggleGroup
                      spacing={1}
                      type="single"
                      value={rowFilter}
                      onValueChange={(value) => {
                        if (!value) return;
                        updateDraft((current) => ({
                          ...current,
                          rowFilter: value as RowFilter,
                        }));
                      }}
                    >
                      <ToggleGroupItem value="all">{t('stockObservationsFilterAll')}</ToggleGroupItem>
                      <ToggleGroupItem value="changed">{t('stockObservationsFilterChanged')}</ToggleGroupItem>
                    </ToggleGroup>
                    <p className="text-sm text-muted-foreground">
                      {changedEntries.length > 0
                        ? t('stockObservationsChangedSummaryReady')
                        : t('stockObservationsChangedSummaryEmpty')}
                    </p>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
                    <label className="text-sm font-medium text-foreground" id="stock-increment-size-label">
                      {t('stockIncrementSize')}:
                    </label>
                    <Select
                      value={preset}
                      onValueChange={(value) =>
                        updateDraft((current) => ({
                          ...current,
                          preset: value as Preset,
                        }))
                      }
                    >
                      <SelectTrigger
                        aria-label={t('stockIncrementSize')}
                        aria-labelledby="stock-increment-size-label"
                        className="h-12 min-w-[180px] rounded-full px-5 text-base font-semibold"
                      >
                        <SelectValue className="min-w-0 flex-1">
                          <PresetOptionCopy
                            compact
                            currency={currency}
                            language={language}
                            preset={preset}
                            t={t}
                          />
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent
                        align="end"
                        className="rounded-3xl border-border/70 shadow-xl"
                        position="popper"
                        sideOffset={10}
                      >
                        {presetOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            className="items-start rounded-2xl px-4 py-3 pr-10"
                          >
                            <PresetOptionCopy
                              currency={currency}
                              language={language}
                              preset={option.value}
                              t={t}
                            />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {rowFilter === 'changed' && changedEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('stockObservationsFilterEmpty')}</p>
                  ) : null}
                </div>
                {focusedSku ? (
                  <p className="text-sm text-muted-foreground">
                    {t('stockFocusSkuHint')}: <span className="font-medium text-foreground">{focusedSku.name}</span>
                  </p>
                ) : null}
                {visibleSkus.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('inventoryColumnItem')}</TableHead>
                        <TableHead className="text-center">{t('fieldUnitsInStock')}</TableHead>
                        <TableHead className="text-center">{t('fieldCostPerUnit')}</TableHead>
                        <TableHead className="text-center">{t('fieldProductPrice')}</TableHead>
                        <TableHead className="text-center">{t('stockRestockIncluded')}</TableHead>
                        <TableHead className="text-center">{t('stockRetailStockout')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleSkus.map((sku) => (
                        (() => {
                          const skuNotes = rows[sku.skuId]?.notes ?? '';
                          const isChanged = changedEntryIds.has(sku.skuId);
                          const isNotesExpanded =
                            expandedSkuNotes[sku.skuId] ??
                            (focusedSku?.skuId === sku.skuId || skuNotes.trim().length > 0);

                          return (
                            <TableRow
                              className={cn(
                                isChanged ? 'bg-muted/70 hover:bg-muted/85' : undefined,
                                focusedSku?.skuId === sku.skuId ? 'ring-1 ring-primary/40' : undefined,
                              )}
                              data-state={focusedSku?.skuId === sku.skuId ? 'selected' : undefined}
                              key={sku.skuId}
                              ref={focusedSku?.skuId === sku.skuId ? focusedSkuRowRef : null}
                            >
                              <TableCell className="min-w-0">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate font-medium text-foreground">{sku.name}</p>
                                    {focusedSku?.skuId === sku.skuId ? (
                                      <Badge variant="secondary">{t('stockFocusedBadge')}</Badge>
                                    ) : null}
                                  </div>
                                  {focusedSku?.skuId === sku.skuId ? (
                                    <p className="truncate text-xs text-muted-foreground">{t('stockFocusSkuHint')}</p>
                                  ) : null}
                                  <div className="mt-1 flex flex-wrap items-center gap-3">
                                    <p className="truncate text-sm text-muted-foreground">{sku.skuId}</p>
                                    <HoverTooltip content={t('stockObservationAddNoteTooltip')} sideOffset={0}>
                                      <Button
                                        aria-expanded={isNotesExpanded}
                                        aria-label={`${isNotesExpanded ? t('stockObservationHideNotes') : t('stockObservationShowNotes')}: ${sku.name}`}
                                        size="icon-sm"
                                        type="button"
                                        variant="ghost"
                                        onClick={() => toggleSkuNotes(sku.skuId)}
                                      >
                                        <NotebookPen aria-hidden="true" className="size-4" />
                                      </Button>
                                    </HoverTooltip>
                                    {isChanged ? (
                                      <HoverTooltip content={t('stockObservationResetTooltip')} sideOffset={0}>
                                        <Button
                                          aria-label={`${t('stockObservationResetRow')}: ${sku.name}`}
                                          size="icon-sm"
                                          type="button"
                                          variant="ghost"
                                          onClick={() => resetSkuRow(sku.skuId)}
                                        >
                                          <RotateCcw aria-hidden="true" className="size-4" />
                                        </Button>
                                      </HoverTooltip>
                                    ) : null}
                                  </div>
                  {isNotesExpanded ? (
                    <div className="mt-3">
                      <Textarea
                        aria-label={t('stockObservationRowNotesLabel')}
                        className="min-h-20 rounded-2xl bg-background/70 text-sm"
                        id={`sku-note-${sku.skuId}`}
                        placeholder={`${t('stockObservationRowNotesLabel')}. ${t('stockObservationRowNotesPlaceholder')}`}
                        value={skuNotes}
                        onChange={(event) => setField(sku.skuId, 'notes', event.target.value)}
                      />
                    </div>
                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    size="icon-sm"
                                    type="button"
                                    variant="outline"
                                    onClick={() => adjustValue(sku.skuId, 'unitsInStock', -1)}
                                  >
                                    −
                                  </Button>
                                  <Input
                                    className="min-w-24 rounded-full border-border/70 bg-background/95 text-center"
                                    inputMode="decimal"
                                    value={rows[sku.skuId]?.unitsInStock ?? ''}
                                    onChange={(event) => setField(sku.skuId, 'unitsInStock', event.target.value)}
                                  />
                                  <Button
                                    size="icon-sm"
                                    type="button"
                                    variant="outline"
                                    onClick={() => adjustValue(sku.skuId, 'unitsInStock', 1)}
                                  >
                                    +
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    size="icon-sm"
                                    type="button"
                                    variant="outline"
                                    onClick={() => adjustValue(sku.skuId, 'costPerUnit', -1)}
                                  >
                                    −
                                  </Button>
                                  <Input
                                    className="min-w-24 rounded-full border-border/70 bg-background/95 text-center"
                                    inputMode="decimal"
                                    value={
                                      focusedCostSkuId === sku.skuId
                                        ? editingSkuCostValues[sku.skuId] ??
                                          formatDisplayedCostDraftValue(
                                            rows[sku.skuId]?.costPerUnit,
                                            language,
                                            currency,
                                          )
                                        : formatDisplayedCostDraftValue(
                                            rows[sku.skuId]?.costPerUnit,
                                            language,
                                            currency,
                                          )
                                    }
                                    onBlur={() => stopEditingSkuCost(sku.skuId)}
                                    onChange={(event) => {
                                      setEditingSkuCostValues((current) => ({
                                        ...current,
                                        [sku.skuId]: event.target.value,
                                      }));
                                      setField(sku.skuId, 'costPerUnit', event.target.value);
                                    }}
                                    onFocus={() => startEditingSkuCost(sku.skuId)}
                                  />
                                  <Button
                                    size="icon-sm"
                                    type="button"
                                    variant="outline"
                                    onClick={() => adjustValue(sku.skuId, 'costPerUnit', 1)}
                                  >
                                    +
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                {sku.soldAsProduct ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <Button
                                      size="icon-sm"
                                      type="button"
                                      variant="outline"
                                      onClick={() => adjustValue(sku.skuId, 'productPrice', -1)}
                                    >
                                      −
                                    </Button>
                                    <Input
                                      className="min-w-24 rounded-full border-border/70 bg-background/95 text-center"
                                      inputMode="decimal"
                                      value={
                                        focusedProductPriceSkuId === sku.skuId
                                          ? editingSkuProductPriceValues[sku.skuId] ??
                                            formatDisplayedCostDraftValue(
                                              getSkuProductPriceDraftValue(
                                                rows[sku.skuId]?.productPrice,
                                                sku.productPrice,
                                              ),
                                              language,
                                              currency,
                                            )
                                          : formatDisplayedCostDraftValue(
                                              getSkuProductPriceDraftValue(
                                                rows[sku.skuId]?.productPrice,
                                                sku.productPrice,
                                              ),
                                              language,
                                              currency,
                                            )
                                      }
                                      onBlur={() => stopEditingSkuProductPrice(sku.skuId)}
                                      onChange={(event) => {
                                        setEditingSkuProductPriceValues((current) => ({
                                          ...current,
                                          [sku.skuId]: event.target.value,
                                        }));
                                        setField(sku.skuId, 'productPrice', event.target.value);
                                      }}
                                      onFocus={() => startEditingSkuProductPrice(sku.skuId)}
                                    />
                                    <Button
                                      size="icon-sm"
                                      type="button"
                                      variant="outline"
                                      onClick={() => adjustValue(sku.skuId, 'productPrice', 1)}
                                    >
                                      +
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  className="mx-auto"
                                  checked={rows[sku.skuId]?.restockIncluded ?? false}
                                  onCheckedChange={(checked) =>
                                    toggleField(sku.skuId, 'restockIncluded', checked === true)
                                  }
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  className="mx-auto"
                                  checked={rows[sku.skuId]?.retailStockout ?? false}
                                  onCheckedChange={(checked) =>
                                    toggleField(sku.skuId, 'retailStockout', checked === true)
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })()
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('stockObservationsSearchEmpty')}</p>
                )}
              </WorkspacePanel>
            ) : null}

            {activeStep === 'services' ? (
              <WorkspacePanel
                description={t('stockSessionStepServicesDescription')}
                title={t('stockSessionStepServices')}
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{t('stockOptionalBadge')}</Badge>
                      <Badge variant="secondary">
                        {summarizeCount(
                          stockoutServiceCount,
                          t('stockServiceSummaryFlagSingular'),
                          t('stockServiceSummaryFlagPlural'),
                        )}
                      </Badge>
                      <Badge variant="secondary">
                        {summarizeCount(
                          servicePriceChangeCount,
                          t('stockServiceSummaryPriceSingular'),
                          t('stockServiceSummaryPricePlural'),
                        )}
                      </Badge>
                    </div>
                    {serviceChanges.length > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          updateDraft((current) => ({
                            ...current,
                            serviceDrafts: Object.fromEntries(
                              snapshot.services.map((service) => [
                                service.serviceId,
                                {
                                  price: String(service.price),
                                  stockout: false,
                                  notes: '',
                                },
                              ]),
                            ),
                          }));
                          setExpandedServiceNotes({});
                        }}
                      >
                        {t('stockServiceClearAction')}
                      </Button>
                    ) : null}
                  </div>

                  <p className="mt-4 text-sm text-muted-foreground">
                    {t('stockSessionServicesOptionalDescription')}
                  </p>

                  {focusedService ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {t('stockFocusServiceHint')}:{' '}
                      <span className="font-medium text-foreground">{focusedService.name}</span>
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <div className="min-w-[240px] flex-1">
                      <label className="sr-only" htmlFor="stock-services-search">
                        Search services
                      </label>
                      <InputGroup className="h-12 rounded-full">
                        <InputGroupAddon className="pl-4 text-muted-foreground" align="inline-start">
                          <Search className="size-4" />
                        </InputGroupAddon>
                        <InputGroupInput
                          className="rounded-full pr-4 text-base"
                          id="stock-services-search"
                          placeholder="Search service name or id..."
                          value={serviceQuery}
                          onChange={(event) => setServiceQuery(event.target.value)}
                        />
                      </InputGroup>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <ToggleGroup
                      spacing={1}
                      type="single"
                      value={serviceFilter}
                      onValueChange={(value) => {
                        if (!value) return;
                        updateDraft((current) => ({
                          ...current,
                          serviceFilter: value as RowFilter,
                        }));
                      }}
                    >
                      <ToggleGroupItem value="all">{t('stockServiceFilterAll')}</ToggleGroupItem>
                      <ToggleGroupItem value="changed">{t('stockServiceFilterChanged')}</ToggleGroupItem>
                    </ToggleGroup>
                    <p className="text-sm text-muted-foreground">
                      {serviceChanges.length > 0
                        ? t('stockServiceSummaryChangedPreview')
                        : t('stockServiceSummaryEmpty')}
                    </p>
                  </div>

                  <Table className="mt-4">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('inventoryColumnItem')}</TableHead>
                        <TableHead className="text-center">{t('stockServiceCurrentPriceColumn')}</TableHead>
                        <TableHead className="text-center">{t('stockServiceStockoutColumn')}</TableHead>
                        <TableHead className="text-center">
                          <span className="inline-block translate-x-3">{t('stockServiceOverridePriceColumn')}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleServiceEntries.map((entry) => {
                        const serviceNotes = serviceDrafts[entry.service.serviceId]?.notes ?? '';
                        const isServiceNotesExpanded =
                          expandedServiceNotes[entry.service.serviceId] ??
                          (focusedService?.serviceId === entry.service.serviceId || serviceNotes.trim().length > 0);

                        return (
                        <TableRow
                          className={cn(
                            entry.changed ? 'bg-muted/70 hover:bg-muted/85' : undefined,
                            focusedService?.serviceId === entry.service.serviceId
                              ? 'ring-1 ring-primary/40'
                              : undefined,
                          )}
                          data-state={
                            focusedService?.serviceId === entry.service.serviceId ? 'selected' : undefined
                          }
                          key={entry.service.serviceId}
                          ref={
                            focusedService?.serviceId === entry.service.serviceId
                              ? focusedServiceRowRef
                              : null
                          }
                        >
                          <TableCell>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-foreground">{entry.service.name}</p>
                                {focusedService?.serviceId === entry.service.serviceId ? (
                                  <Badge variant="secondary">{t('stockFocusedBadge')}</Badge>
                                ) : null}
                              </div>
                              {focusedService?.serviceId === entry.service.serviceId ? (
                                <p className="text-xs text-muted-foreground">{t('stockFocusServiceHint')}</p>
                              ) : null}
                              <div className="mt-1 flex flex-wrap items-center gap-3">
                                <p className="text-sm text-muted-foreground">{entry.service.serviceId}</p>
                                <HoverTooltip content={t('stockObservationAddNoteTooltip')} sideOffset={12}>
                                  <Button
                                    aria-expanded={isServiceNotesExpanded}
                                    aria-label={`${isServiceNotesExpanded ? t('stockObservationHideNotes') : t('stockObservationShowNotes')}: ${entry.service.name}`}
                                    size="icon-sm"
                                    type="button"
                                    variant="ghost"
                                    onClick={() => toggleServiceNotes(entry.service.serviceId)}
                                  >
                                    <NotebookPen aria-hidden="true" className="size-4" />
                                  </Button>
                                </HoverTooltip>
                                {entry.changed ? (
                                  <HoverTooltip content={t('stockObservationResetTooltip')} sideOffset={12}>
                                    <Button
                                      aria-label={`${t('stockObservationResetRow')}: ${entry.service.name}`}
                                      size="icon-sm"
                                      type="button"
                                      variant="ghost"
                                      onClick={() => resetServiceRow(entry.service.serviceId)}
                                    >
                                      <RotateCcw aria-hidden="true" className="size-4" />
                                    </Button>
                                  </HoverTooltip>
                                ) : null}
                              </div>
                              {isServiceNotesExpanded ? (
                                <div className="mt-3">
                                  <Textarea
                                    aria-label={t('stockObservationRowNotesLabel')}
                                    className="min-h-20 rounded-2xl bg-background/70 text-sm"
                                    id={`service-note-${entry.service.serviceId}`}
                                    placeholder={`${t('stockObservationRowNotesLabel')}. ${t('stockObservationRowNotesPlaceholder')}`}
                                    value={serviceNotes}
                                    onChange={(event) =>
                                      updateDraft((current) => ({
                                        ...current,
                                        serviceDrafts: {
                                          ...current.serviceDrafts,
                                          [entry.service.serviceId]: {
                                            ...current.serviceDrafts[entry.service.serviceId],
                                            notes: event.target.value,
                                          },
                                        },
                                      }))
                                    }
                                  />
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <p className="text-sm text-foreground">
                              {formatCurrency(entry.service.price, currency, language)}
                            </p>
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              className="mx-auto"
                              checked={entry.stockout}
                              onCheckedChange={(checked) =>
                                updateDraft((current) => ({
                                  ...current,
                                  serviceDrafts: {
                                    ...current.serviceDrafts,
                                    [entry.service.serviceId]: {
                                      ...current.serviceDrafts[entry.service.serviceId],
                                      stockout: checked === true,
                                    },
                                  },
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="mx-auto max-w-36">
                              <label className="sr-only" htmlFor={`service-price-${entry.service.serviceId}`}>
                                {t('fieldPrice')}
                              </label>
                              <InputGroup className="rounded-full border-border/70 bg-background/95">
                                <InputGroupAddon className="pl-4 text-foreground" align="inline-start">
                                  {currencySymbol(currency, language)}
                                </InputGroupAddon>
                                <InputGroupInput
                                  className="rounded-full pr-4 text-center text-base"
                                  id={`service-price-${entry.service.serviceId}`}
                                  inputMode="decimal"
                                  value={
                                    focusedServicePriceId === entry.service.serviceId
                                      ? editingServicePriceValues[entry.service.serviceId] ??
                                        formatDisplayedCostDraftValue(
                                          serviceDrafts[entry.service.serviceId]?.price,
                                          language,
                                          currency,
                                        )
                                      : formatDisplayedCostDraftValue(
                                          serviceDrafts[entry.service.serviceId]?.price,
                                          language,
                                          currency,
                                        )
                                  }
                                  onBlur={() => stopEditingServicePrice(entry.service.serviceId)}
                                  onChange={(event) => {
                                    setEditingServicePriceValues((current) => ({
                                      ...current,
                                      [entry.service.serviceId]: event.target.value,
                                    }));
                                    updateDraft((current) => ({
                                      ...current,
                                      serviceDrafts: {
                                        ...current.serviceDrafts,
                                        [entry.service.serviceId]: {
                                          ...current.serviceDrafts[entry.service.serviceId],
                                          price: event.target.value,
                                        },
                                      },
                                    }));
                                  }}
                                  onFocus={() => startEditingServicePrice(entry.service.serviceId)}
                                />
                              </InputGroup>
                            </div>
                          </TableCell>
                        </TableRow>
                      )})}
                    </TableBody>
                  </Table>
                </div>
              </WorkspacePanel>
            ) : null}

            {activeStep === 'sales-signal' ? (
              <WorkspacePanel
                description={t('stockSessionStepSalesSignalDescription')}
                title={t('stockSessionStepSalesSignal')}
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {salesSignalChanged ? (
                        <Badge variant="secondary">{t('stockSalesSignalUnsavedBadge')}</Badge>
                      ) : null}
                      <Badge variant="outline">
                        {summarizeCount(
                          salesSignalScopeCount,
                          t('stockSalesSignalEntrySingular'),
                          t('stockSalesSignalEntryPlural'),
                        )}
                      </Badge>
                      <Badge variant="outline">{t('stockOptionalBadge')}</Badge>
                    </div>
                    <Button
                      disabled={!salesSignalChanged}
                      type="button"
                      variant="outline"
                      onClick={handleResetSalesSignal}
                    >
                      {t('stockSalesSignalResetAction')}
                    </Button>
                  </div>

                  {salesSignalScopeCount > 0 ? (
                    <>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {t('stockSalesSignalSupportCopy')}
                      </p>

                      <MerchandisingEditor
                        entries={rankingDraft}
                        priceByEntryKey={salesSignalPriceByEntryKey}
                        priceChangeByEntryKey={salesSignalPriceChangeByEntryKey}
                        snapshot={snapshot}
                        titleLabel=""
                        onChange={handleSalesSignalChange}
                      />

                      <p className="text-sm text-muted-foreground">
                        {t('stockSalesSignalHelperNote')}
                      </p>
                    </>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-border/70 bg-background/40 p-5">
                      <p className="font-medium text-foreground">{t('stockSalesSignalEmptyTitle')}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {t('stockSalesSignalEmptyDescription')}
                      </p>
                    </div>
                  )}
                </div>
              </WorkspacePanel>
            ) : null}

            {activeStep === 'review' ? (
              <div className="space-y-6">
                <WorkspacePanel
                  description={t('stockReviewDescription')}
                  title={t('stockReviewTitle')}
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-foreground">{t('stockReportedAt')}</p>
                        <Button size="sm" type="button" variant="ghost" onClick={() => setActiveStep('details')}>
                          {t('stockEditAction')}
                        </Button>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {toIsoTimestamp(reportedAt)
                          ? new Intl.DateTimeFormat(language === 'km' ? 'km-KH' : 'en-US', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }).format(new Date(toIsoTimestamp(reportedAt) ?? ''))
                          : t('stockReviewMissingTimestamp')}
                      </p>
                      {reportNotes.trim() ? (
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">{reportNotes.trim()}</p>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">{t('stockReviewNoNotes')}</p>
                      )}
                    </div>

                    <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-foreground">{t('stockTableTitle')}</p>
                        <Button size="sm" type="button" variant="ghost" onClick={() => setActiveStep('observations')}>
                          {t('stockEditAction')}
                        </Button>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {observationsComplete
                          ? summarizeCount(
                              changedEntries.length,
                              t('stockHistoryChangedRowSingular'),
                              t('stockHistoryChangedRowPlural'),
                            )
                          : t('validationStockChanges')}
                      </p>
                      {changedEntries.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {changedEntries.slice(0, 6).map((entry) => (
                            <Badge key={entry.sku.skuId} variant="outline">
                              {entry.sku.name}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{t('stockSessionStepServices')}</p>
                        <DescriptionText className="mt-1 text-sm text-muted-foreground">
                          {t('stockSessionServicesOptionalDescription')}
                        </DescriptionText>
                      </div>
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() => setActiveStep('services')}
                      >
                        {t('stockEditAction')}
                      </Button>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {serviceChanges.length > 0
                        ? summarizeServiceReviewDetail(
                            stockoutServiceCount,
                            servicePriceChangeCount,
                            t('stockServiceSummaryFlagSingular'),
                            t('stockServiceSummaryFlagPlural'),
                            t('stockServiceSummaryPriceSingular'),
                            t('stockServiceSummaryPricePlural'),
                          )
                        : t('stockReviewNoServiceChanges')}
                    </p>
                    {serviceChanges.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {serviceChanges.slice(0, 3).map((entry) => (
                          <Badge key={entry.service.serviceId} variant="outline">
                            {entry.service.name}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{t('stockSessionStepSalesSignal')}</p>
                        <DescriptionText className="mt-1 text-sm text-muted-foreground">
                          {t('stockSessionStepSalesSignalDescription')}
                        </DescriptionText>
                      </div>
                      <Button size="sm" type="button" variant="ghost" onClick={() => setActiveStep('sales-signal')}>
                        {t('stockEditAction')}
                      </Button>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {salesSignalChanged
                        ? t('stockReviewSalesSignalChanged')
                        : t('stockReviewSalesSignalUnchanged')}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {summarizeCount(
                        salesSignalScopeCount,
                        t('stockSalesSignalEntrySingular'),
                        t('stockSalesSignalEntryPlural'),
                      )}
                    </p>
                    {salesSignalTopPreview.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {salesSignalTopPreview.map((name) => (
                          <Badge key={name} variant="outline">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </WorkspacePanel>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-3">
              {previousStep ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveStep(previousStep)}
                >
                  {t('stockSessionBack')}
                </Button>
              ) : null}
              {nextStep ? (
                <Button
                  disabled={activeStep === 'observations' && !observationsComplete}
                  type="button"
                  onClick={() => setActiveStep(nextStep)}
                >
                  {t('stockSessionNext')}
                </Button>
              ) : (
                <Button disabled={!reviewReady || isSaving} type="button" onClick={() => void handleSubmit()}>
                  {t('stockSessionSubmit')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}

function summarizeServiceChanges(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summarizeServiceReviewDetail(
  stockouts: number,
  priceEdits: number,
  stockoutSingular: string,
  stockoutPlural: string,
  priceSingular: string,
  pricePlural: string,
) {
  return [
    summarizeServiceChanges(stockouts, stockoutSingular, stockoutPlural),
    summarizeServiceChanges(priceEdits, priceSingular, pricePlural),
  ].join(' · ');
}

function stepStatusKey(status: StepStatus) {
  if (status === 'complete') {
    return 'stockStepStatusComplete';
  }
  if (status === 'skipped') {
    return 'stockStepStatusSkipped';
  }
  if (status === 'needs-attention') {
    return 'stockStepStatusNeedsAttention';
  }
  if (status === 'optional') {
    return 'stockStepStatusOptional';
  }
  return 'stockStepStatusRequired';
}

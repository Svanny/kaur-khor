import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
import { WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { formatCurrency } from '@/lib/format';
import { summarizeCount } from '@/lib/stock-report-summary';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import {
  createOperationsSessionDraft,
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

const stepOrder: SessionStepId[] = ['details', 'observations', 'services', 'review'];

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
  return 'details' as const;
}

export function StockUpdateSessionRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { snapshot, submitReport, isSaving } = useInventory();
  const { draft, ensureDraft, updateDraft, clearDraft, hasDraft } = useOperationsSession();
  const { currency, language, t } = usePreferences();
  const [error, setError] = useState<string | null>(null);
  const [timestampTouched, setTimestampTouched] = useState(false);
  const [servicePanelMode, setServicePanelMode] = useState<'summary' | 'editing'>('summary');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'changed'>('all');
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

  const sessionDraft = snapshot ? (draft ?? createOperationsSessionDraft(snapshot)) : null;
  const rows = sessionDraft?.rows ?? {};
  const serviceDrafts = sessionDraft?.serviceDrafts ?? {};
  const preset = sessionDraft?.preset ?? 'small';
  const reportedAt = sessionDraft?.reportedAt ?? '';
  const reportNotes = sessionDraft?.reportNotes ?? '';
  const rowFilter = sessionDraft?.rowFilter ?? 'all';
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
          restockIncluded: rows[sku.skuId]?.restockIncluded ?? false,
          retailStockout: rows[sku.skuId]?.retailStockout ?? false,
          notes: rows[sku.skuId]?.notes?.trim() ?? '',
        }))
        .filter(
          (entry) =>
            entry.unitsInStock !== entry.sku.unitsInStock ||
            entry.costPerUnit !== entry.sku.costPerUnit ||
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
          return {
            service,
            stockout: draft?.stockout ?? false,
            price: nextPrice,
            priceChanged: nextPrice !== service.price,
          };
        })
        .filter((entry) => entry.stockout || entry.priceChanged) ?? [],
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
  const sortedServiceEntries = useMemo(
    () =>
      snapshot?.services
        .map((service) => {
          const draft = serviceDrafts[service.serviceId];
          const nextPrice = Number(draft?.price ?? service.price);
          const stockout = draft?.stockout ?? false;
          const priceChanged = nextPrice !== service.price;
          return {
            service,
            stockout,
            price: nextPrice,
            priceChanged,
            changed: stockout || priceChanged,
          };
        })
        .sort((left, right) => {
          if (left.changed !== right.changed) {
            return left.changed ? -1 : 1;
          }
          return left.service.name.localeCompare(right.service.name);
        }) ?? [],
    [serviceDrafts, snapshot],
  );
  const visibleServiceEntries = useMemo(
    () => {
      const filteredEntries =
        serviceFilter === 'changed'
          ? sortedServiceEntries.filter(
              (entry) => entry.changed || entry.service.serviceId === focusedService?.serviceId,
            )
          : sortedServiceEntries;

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
    [focusedService, serviceFilter, sortedServiceEntries],
  );
  const changedServicePreview = useMemo(
    () => serviceChanges.slice(0, 3).map((entry) => entry.service.name),
    [serviceChanges],
  );
  const detailsComplete = Boolean(toIsoTimestamp(reportedAt));
  const observationsComplete = changedEntries.length > 0;
  const servicesComplete = true;
  const reviewReady = detailsComplete && observationsComplete;
  const timestampError = timestampTouched && !detailsComplete ? t('validationTimestamp') : null;
  const completedCount = [detailsComplete, observationsComplete, servicesComplete, reviewReady].filter(Boolean).length;
  const changedEntryIds = useMemo(
    () => new Set(changedEntries.map((entry) => entry.sku.skuId)),
    [changedEntries],
  );
  const visibleSkus = useMemo(
    () => {
      const sourceSkus =
        rowFilter === 'changed'
          ? (snapshot?.skus ?? []).filter(
              (sku) => changedEntryIds.has(sku.skuId) || sku.skuId === focusedSku?.skuId,
            )
          : (snapshot?.skus ?? []);

      if (!focusedSku) {
        return sourceSkus;
      }

      return [...sourceSkus].sort((left, right) => {
        if (left.skuId === focusedSku.skuId) {
          return -1;
        }
        if (right.skuId === focusedSku.skuId) {
          return 1;
        }
        return 0;
      });
    },
    [changedEntryIds, focusedSku, rowFilter, snapshot],
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
    if (reviewReady) {
      return 'complete';
    }
    return 'required';
  }

  const steps = [
    {
      id: 'details' as const,
      title: t('stockSessionStepDetails'),
      description: t('stockSessionStepDetailsDescription'),
      complete: detailsComplete,
      optional: false,
      status: getStepStatus('details'),
    },
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
    if (nextStep === 'details') {
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
    if (activeStep !== 'services') {
      return;
    }
    if (focusedService) {
      setServicePanelMode('editing');
    }
    setServiceFilter(serviceChanges.length > 0 ? 'changed' : 'all');
  }, [activeStep, focusedService, serviceChanges.length]);

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

  function setField(
    skuId: string,
    key: 'unitsInStock' | 'costPerUnit' | 'notes',
    value: string,
  ) {
    updateDraft((current) => ({
      ...current,
      rows: {
        ...current.rows,
        [skuId]: {
          ...current.rows[skuId],
          [key]: value,
        },
      },
    }));
  }

  function toggleField(skuId: string, key: 'restockIncluded' | 'retailStockout', value: boolean) {
    updateDraft((current) => ({
      ...current,
      rows: {
        ...current.rows,
        [skuId]: {
          ...current.rows[skuId],
          [key]: value,
        },
      },
    }));
  }

  function adjustValue(
    skuId: string,
    key: 'unitsInStock' | 'costPerUnit',
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
    const currentValue = Number(rows[skuId]?.[key] ?? currentSku[key]);
    setField(skuId, key, String(Math.max(0, currentValue + step * direction)));
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
    const nextSubmission = {
      reportedAt: isoReportedAt,
      skuObservations: changedEntries.map((entry) => ({
        skuId: entry.sku.skuId,
        unitsInStock: entry.unitsInStock,
        costPerUnit: entry.costPerUnit,
        restockIncluded: entry.restockIncluded,
        retailStockout: entry.retailStockout,
        notes: entry.notes || null,
      })),
      ...(serviceChanges.some((entry) => entry.stockout)
        ? {
            serviceSignals: serviceChanges
              .filter((entry) => entry.stockout)
              .map((entry) => ({ serviceId: entry.service.serviceId, stockout: true })),
          }
        : {}),
      ...(serviceChanges.some((entry) => entry.priceChanged)
        ? {
            servicePriceAdjustments: serviceChanges
              .filter((entry) => entry.priceChanged)
              .map((entry) => ({ serviceId: entry.service.serviceId, price: entry.price })),
          }
        : {}),
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
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
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('stockSessionDescription')}
              </p>
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
                    <span className="mt-0.5 text-primary">
                      {step.complete ? (
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
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
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
                onClick={() => {
                  clearDraft();
                  navigate('/operations');
                }}
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
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
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
                  <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
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
              </WorkspacePanel>
            ) : null}

            {activeStep === 'observations' ? (
              <WorkspacePanel description={t('stockUpdateHint')} title={t('stockTableTitle')}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="secondary">
                      {summarizeCount(
                        changedEntries.length,
                        t('stockHistoryChangedRowSingular'),
                        t('stockHistoryChangedRowPlural'),
                      )}
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      {changedEntries.length > 0
                        ? t('stockObservationsChangedSummaryReady')
                        : t('stockObservationsChangedSummaryEmpty')}
                    </p>
                  </div>
                  <ToggleGroup
                    spacing={1}
                    type="single"
                    value={preset}
                    onValueChange={(value) => {
                      if (!value) return;
                      updateDraft((current) => ({
                        ...current,
                        preset: value as Preset,
                      }));
                    }}
                  >
                    <ToggleGroupItem value="small">{t('stockPresetSmall')}</ToggleGroupItem>
                    <ToggleGroupItem value="medium">{t('stockPresetMedium')}</ToggleGroupItem>
                    <ToggleGroupItem value="big">{t('stockPresetBig')}</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4">
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
                  {rowFilter === 'changed' && changedEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('stockObservationsFilterEmpty')}</p>
                  ) : null}
                </div>
                {focusedSku ? (
                  <p className="text-sm text-muted-foreground">
                    {t('stockFocusSkuHint')}: <span className="font-medium text-foreground">{focusedSku.name}</span>
                  </p>
                ) : null}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('inventoryColumnItem')}</TableHead>
                      <TableHead>{t('fieldUnitsInStock')}</TableHead>
                      <TableHead>{t('fieldCostPerUnit')}</TableHead>
                      <TableHead>{t('stockRestockIncluded')}</TableHead>
                      <TableHead>{t('stockRetailStockout')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleSkus.map((sku) => (
                      <TableRow
                        className={cn(
                          changedEntryIds.has(sku.skuId) ? 'bg-primary/5' : undefined,
                          focusedSku?.skuId === sku.skuId ? 'ring-1 ring-primary/40' : undefined,
                        )}
                        data-state={
                          changedEntryIds.has(sku.skuId) || focusedSku?.skuId === sku.skuId
                            ? 'selected'
                            : undefined
                        }
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
                              {changedEntryIds.has(sku.skuId) ? (
                                <Badge variant="outline">{t('stockObservationsChangedBadge')}</Badge>
                              ) : null}
                            </div>
                            {focusedSku?.skuId === sku.skuId ? (
                              <p className="truncate text-xs text-muted-foreground">{t('stockFocusSkuHint')}</p>
                            ) : null}
                            <p className="truncate text-sm text-muted-foreground">{sku.skuId}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="icon-sm"
                              type="button"
                              variant="outline"
                              onClick={() => adjustValue(sku.skuId, 'unitsInStock', -1)}
                            >
                              −
                            </Button>
                            <Input
                              className="min-w-24 rounded-full text-center"
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
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="icon-sm"
                              type="button"
                              variant="outline"
                              onClick={() => adjustValue(sku.skuId, 'costPerUnit', -1)}
                            >
                              −
                            </Button>
                            <Input
                              className="min-w-24 rounded-full text-center"
                              inputMode="decimal"
                              value={rows[sku.skuId]?.costPerUnit ?? ''}
                              onChange={(event) => setField(sku.skuId, 'costPerUnit', event.target.value)}
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
                        <TableCell>
                          <Checkbox
                            checked={rows[sku.skuId]?.restockIncluded ?? false}
                            onCheckedChange={(checked) =>
                              toggleField(sku.skuId, 'restockIncluded', checked === true)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={rows[sku.skuId]?.retailStockout ?? false}
                            onCheckedChange={(checked) =>
                              toggleField(sku.skuId, 'retailStockout', checked === true)
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </WorkspacePanel>
            ) : null}

            {activeStep === 'services' ? (
              <WorkspacePanel
                description={t('stockSessionStepServicesDescription')}
                title={t('stockSessionStepServices')}
              >
                <div className="space-y-4">
                  <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant="outline">{t('stockOptionalBadge')}</Badge>
                      <p className="text-sm text-muted-foreground">{t('stockSessionServicesOptionalDescription')}</p>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
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
                    <p className="mt-4 text-sm text-muted-foreground">
                      {serviceChanges.length > 0
                        ? t('stockServiceSummaryChangedPreview')
                        : t('stockServiceSummaryEmpty')}
                    </p>
                    {serviceChanges.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {changedServicePreview.map((serviceName) => (
                          <Badge key={serviceName} variant="outline">
                            {serviceName}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button type="button" onClick={() => setServicePanelMode('editing')}>
                        {t('stockServiceReviewAction')}
                      </Button>
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
                                  },
                                ]),
                              ),
                            }));
                            setServicePanelMode('summary');
                          }}
                        >
                          {t('stockServiceClearAction')}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {servicePanelMode === 'editing' ? (
                    <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
                      {focusedService ? (
                        <p className="mb-4 text-sm text-muted-foreground">
                          {t('stockFocusServiceHint')}:{' '}
                          <span className="font-medium text-foreground">{focusedService.name}</span>
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant={serviceFilter === 'changed' ? 'default' : 'outline'}
                            onClick={() => setServiceFilter('changed')}
                          >
                            {t('stockServiceFilterChanged')}
                          </Button>
                          <Button
                            type="button"
                            variant={serviceFilter === 'all' ? 'default' : 'outline'}
                            onClick={() => setServiceFilter('all')}
                          >
                            {t('stockServiceFilterAll')}
                          </Button>
                        </div>
                        <Button type="button" variant="ghost" onClick={() => setServicePanelMode('summary')}>
                          {t('stockServiceDoneAction')}
                        </Button>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('inventoryColumnItem')}</TableHead>
                            <TableHead>{t('stockServiceCurrentPriceColumn')}</TableHead>
                            <TableHead>{t('stockServiceStockoutColumn')}</TableHead>
                            <TableHead>{t('stockServiceOverridePriceColumn')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleServiceEntries.map((entry) => (
                            <TableRow
                              className={cn(
                                entry.changed ? 'bg-primary/5' : undefined,
                                focusedService?.serviceId === entry.service.serviceId
                                  ? 'ring-1 ring-primary/40'
                                  : undefined,
                              )}
                              data-state={
                                entry.changed || focusedService?.serviceId === entry.service.serviceId
                                  ? 'selected'
                                  : undefined
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
                                    {entry.changed ? (
                                      <Badge variant="outline">{t('stockObservationsChangedBadge')}</Badge>
                                    ) : null}
                                  </div>
                                  {focusedService?.serviceId === entry.service.serviceId ? (
                                    <p className="text-xs text-muted-foreground">{t('stockFocusServiceHint')}</p>
                                  ) : null}
                                  <p className="text-sm text-muted-foreground">{entry.service.serviceId}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm text-foreground">
                                  {formatCurrency(entry.service.price, currency, language)}
                                </p>
                              </TableCell>
                              <TableCell>
                                <Checkbox
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
                              <TableCell>
                                <div className="max-w-36">
                                  <label className="sr-only" htmlFor={`service-price-${entry.service.serviceId}`}>
                                    {t('fieldPrice')}
                                  </label>
                                  <Input
                                    id={`service-price-${entry.service.serviceId}`}
                                    inputMode="decimal"
                                    value={serviceDrafts[entry.service.serviceId]?.price ?? ''}
                                    onChange={(event) =>
                                      updateDraft((current) => ({
                                        ...current,
                                        serviceDrafts: {
                                          ...current.serviceDrafts,
                                          [entry.service.serviceId]: {
                                            ...current.serviceDrafts[entry.service.serviceId],
                                            price: event.target.value,
                                          },
                                        },
                                      }))
                                    }
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
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
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('stockSessionServicesOptionalDescription')}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setServicePanelMode('editing');
                          setActiveStep('services');
                        }}
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
                        <p className="font-medium text-foreground">{t('stockReviewPlanningTitle')}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('stockReviewPlanningDescription')}
                        </p>
                      </div>
                      <Button asChild size="sm" type="button" variant="ghost">
                        <Link to="/planning?source=operations-review">{t('stockReviewOpenPlanning')}</Link>
                      </Button>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {summarizeCount(
                        snapshot.ranking.length,
                        t('stockReviewPlanningEntrySingular'),
                        t('stockReviewPlanningEntryPlural'),
                      )}
                    </p>
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

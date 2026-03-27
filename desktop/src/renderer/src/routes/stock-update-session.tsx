import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { RankingEntry } from '@shared/inventory';
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
import {
  buildDefaultReportRanking,
  hasRankingChanged,
  MerchandisingEditor,
  rankingIdsByType,
} from '@/components/system/merchandising-editor';
import {
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

type Preset = 'small' | 'medium' | 'big';
type SessionStepId = 'details' | 'observations' | 'services' | 'ranking';
type StepVisitedState = Record<SessionStepId, boolean>;

const presetSteps: Record<Preset, { units: number; cost: number }> = {
  small: { units: 1, cost: 0.25 },
  medium: { units: 5, cost: 0.5 },
  big: { units: 20, cost: 1 },
};

const stepOrder: SessionStepId[] = ['details', 'observations', 'services', 'ranking'];

function toLocalDateTimeValue(value?: string) {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
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

export function StockUpdateSessionRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { snapshot, submitReport, isSaving } = useInventory();
  const { currency, language, t } = usePreferences();
  const [rows, setRows] = useState<
    Record<
      string,
      {
        unitsInStock: string;
        costPerUnit: string;
        restockIncluded: boolean;
        retailStockout: boolean;
        notes: string;
      }
    >
  >({});
  const [serviceDrafts, setServiceDrafts] = useState<
    Record<string, { price: string; stockout: boolean }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>('small');
  const [reportedAt, setReportedAt] = useState(() => toLocalDateTimeValue());
  const [reportNotes, setReportNotes] = useState('');
  const [reportRanking, setReportRanking] = useState<RankingEntry[]>([]);
  const [visitedSteps, setVisitedSteps] = useState<StepVisitedState>({
    details: true,
    observations: false,
    services: false,
    ranking: false,
  });
  const rankingSectionRef = useRef<HTMLDivElement | null>(null);

  const requestedStep = searchParams.get('step');
  const activeStep = stepOrder.includes(requestedStep as SessionStepId)
    ? (requestedStep as SessionStepId)
    : 'details';

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    setRows(
      Object.fromEntries(
        snapshot.skus.map((sku) => [
          sku.skuId,
          {
            unitsInStock: String(sku.unitsInStock),
            costPerUnit: String(sku.costPerUnit),
            restockIncluded: false,
            retailStockout: false,
            notes: '',
          },
        ]),
      ),
    );
    setServiceDrafts(
      Object.fromEntries(
        snapshot.services.map((service) => [
          service.serviceId,
          {
            price: String(service.price),
            stockout: false,
          },
        ]),
      ),
    );
    setReportRanking(buildDefaultReportRanking(snapshot));
    setReportedAt(toLocalDateTimeValue());
    setReportNotes('');
    setVisitedSteps({
      details: true,
      observations: false,
      services: false,
      ranking: false,
    });
    setError(null);
  }, [snapshot]);

  useEffect(() => {
    setVisitedSteps((current) =>
      current[activeStep] ? current : { ...current, [activeStep]: true },
    );
  }, [activeStep]);

  useEffect(() => {
    if (activeStep === 'ranking') {
      rankingSectionRef.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [activeStep]);

  const baselineRanking = useMemo(
    () => (snapshot ? buildDefaultReportRanking(snapshot) : []),
    [snapshot],
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

  const rankingChanged = useMemo(
    () => hasRankingChanged(baselineRanking, reportRanking),
    [baselineRanking, reportRanking],
  );
  const detailsComplete = Boolean(toIsoTimestamp(reportedAt));
  const observationsComplete = changedEntries.length > 0 || visitedSteps.observations;
  const servicesComplete = serviceChanges.length > 0 || visitedSteps.services;
  const rankingComplete = rankingChanged || visitedSteps.ranking;
  const completedCount = [detailsComplete, observationsComplete, servicesComplete, rankingComplete].filter(Boolean).length;
  const allStepsComplete =
    detailsComplete && observationsComplete && servicesComplete && rankingComplete;

  const steps = [
    {
      id: 'details' as const,
      title: t('stockSessionStepDetails'),
      description: t('stockSessionStepDetailsDescription'),
      complete: detailsComplete,
    },
    {
      id: 'observations' as const,
      title: t('stockSessionStepObservations'),
      description: t('stockSessionStepObservationsDescription'),
      complete: observationsComplete,
    },
    {
      id: 'services' as const,
      title: t('stockSessionStepServices'),
      description: t('stockSessionStepServicesDescription'),
      complete: servicesComplete,
    },
    {
      id: 'ranking' as const,
      title: t('stockSessionStepRanking'),
      description: t('stockSessionStepRankingDescription'),
      complete: rankingComplete,
    },
  ];

  function resetSession(nextSnapshot = snapshot) {
    if (!nextSnapshot) {
      return;
    }
    setRows(
      Object.fromEntries(
        nextSnapshot.skus.map((sku) => [
          sku.skuId,
          {
            unitsInStock: String(sku.unitsInStock),
            costPerUnit: String(sku.costPerUnit),
            restockIncluded: false,
            retailStockout: false,
            notes: '',
          },
        ]),
      ),
    );
    setServiceDrafts(
      Object.fromEntries(
        nextSnapshot.services.map((service) => [
          service.serviceId,
          {
            price: String(service.price),
            stockout: false,
          },
        ]),
      ),
    );
    setReportRanking(buildDefaultReportRanking(nextSnapshot));
    setReportedAt(toLocalDateTimeValue());
    setReportNotes('');
    setError(null);
  }

  function setActiveStep(nextStep: SessionStepId) {
    const next = new URLSearchParams(searchParams);
    next.set('step', nextStep);
    setVisitedSteps((current) =>
      current[nextStep] ? current : { ...current, [nextStep]: true },
    );
    setSearchParams(next, { replace: true });
  }

  const activeStepIndex = stepOrder.indexOf(activeStep);
  const previousStep = activeStepIndex > 0 ? stepOrder[activeStepIndex - 1] : null;
  const nextStep = activeStepIndex < stepOrder.length - 1 ? stepOrder[activeStepIndex + 1] : null;

  function setField(
    skuId: string,
    key: 'unitsInStock' | 'costPerUnit' | 'notes',
    value: string,
  ) {
    setRows((current) => ({
      ...current,
      [skuId]: {
        ...current[skuId],
        [key]: value,
      },
    }));
  }

  function toggleField(skuId: string, key: 'restockIncluded' | 'retailStockout', value: boolean) {
    setRows((current) => ({
      ...current,
      [skuId]: {
        ...current[skuId],
        [key]: value,
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
      setError(t('validationTimestamp'));
      setActiveStep('details');
      return;
    }
    if (!observationsComplete) {
      setError(t('stockSessionStepRequired'));
      setActiveStep('observations');
      return;
    }
    if (!servicesComplete) {
      setError(t('stockSessionStepRequired'));
      setActiveStep('services');
      return;
    }
    if (!rankingComplete) {
      setError(t('stockSessionStepRequired'));
      setActiveStep('ranking');
      return;
    }

    setError(null);

    await submitReport({
      reportedAt: isoReportedAt,
      skuObservations: changedEntries.map((entry) => ({
        skuId: entry.sku.skuId,
        unitsInStock: entry.unitsInStock,
        costPerUnit: entry.costPerUnit,
        restockIncluded: entry.restockIncluded,
        retailStockout: entry.retailStockout,
        notes: entry.notes || null,
      })),
      serviceSignals: serviceChanges
        .filter((entry) => entry.stockout)
        .map((entry) => ({ serviceId: entry.service.serviceId, stockout: true })),
      servicePriceAdjustments: serviceChanges
        .filter((entry) => entry.priceChanged)
        .map((entry) => ({ serviceId: entry.service.serviceId, price: entry.price })),
      notes: reportNotes.trim() || null,
      ...(rankingChanged
        ? {
            topServiceRanking: rankingIdsByType(reportRanking, 'service'),
            topRetailRanking: rankingIdsByType(reportRanking, 'sku'),
          }
        : {}),
    });

    resetSession();
    navigate('/inventory/stock');
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
                {!allStepsComplete ? (
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
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        {t('stockSessionStepLabel')} {index + 1}
                      </p>
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
              <Button asChild type="button" variant="ghost">
                <Link to="/inventory/stock">{t('stockComposerCancel')}</Link>
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
                      onChange={(event) => setReportedAt(event.target.value)}
                    />
                  </div>
                  <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
                    <label className="text-sm font-medium text-foreground" htmlFor="report-notes">
                      {t('stockReportNotes')}
                    </label>
                    <Textarea
                      className="mt-2 min-h-24 rounded-2xl"
                      id="report-notes"
                      value={reportNotes}
                      onChange={(event) => setReportNotes(event.target.value)}
                    />
                  </div>
                </div>
              </WorkspacePanel>
            ) : null}

            {activeStep === 'observations' ? (
              <WorkspacePanel description={t('stockUpdateHint')} title={t('stockTableTitle')}>
                <div className="flex flex-wrap items-center gap-4">
                  <ToggleGroup
                    spacing={1}
                    type="single"
                    value={preset}
                    onValueChange={(value) => {
                      if (!value) return;
                      setPreset(value as Preset);
                    }}
                  >
                    <ToggleGroupItem value="small">{t('stockPresetSmall')}</ToggleGroupItem>
                    <ToggleGroupItem value="medium">{t('stockPresetMedium')}</ToggleGroupItem>
                    <ToggleGroupItem value="big">{t('stockPresetBig')}</ToggleGroupItem>
                  </ToggleGroup>
                </div>

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
                    {snapshot.skus.map((sku) => (
                      <TableRow key={sku.skuId}>
                        <TableCell className="min-w-0">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{sku.name}</p>
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
                <div className="grid gap-4">
                  {snapshot.services.map((service) => (
                    <div
                      className="rounded-3xl border border-border/70 bg-card/55 p-4"
                      key={service.serviceId}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{service.name}</p>
                          <p className="text-sm text-muted-foreground">{service.serviceId}</p>
                        </div>
                        <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                          <Checkbox
                            checked={serviceDrafts[service.serviceId]?.stockout ?? false}
                            onCheckedChange={(checked) =>
                              setServiceDrafts((current) => ({
                                ...current,
                                [service.serviceId]: {
                                  ...current[service.serviceId],
                                  stockout: checked === true,
                                },
                              }))
                            }
                          />
                          {t('stockServiceStockoutToggle')}
                        </label>
                      </div>
                      <div className="mt-4 max-w-xs">
                        <label className="text-sm font-medium text-foreground" htmlFor={`service-price-${service.serviceId}`}>
                          {t('fieldPrice')}
                        </label>
                        <Input
                          className="mt-2 rounded-2xl bg-background/60"
                          id={`service-price-${service.serviceId}`}
                          inputMode="decimal"
                          value={serviceDrafts[service.serviceId]?.price ?? ''}
                          onChange={(event) =>
                            setServiceDrafts((current) => ({
                              ...current,
                              [service.serviceId]: {
                                ...current[service.serviceId],
                                price: event.target.value,
                              },
                            }))
                          }
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t('stockServicePriceHint')}: {formatCurrency(service.price, currency, language)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </WorkspacePanel>
            ) : null}

            {activeStep === 'ranking' ? (
              <div ref={rankingSectionRef}>
                <WorkspacePanel
                  description={t('stockRankingDescription')}
                  title={t('stockRankingTitle')}
                >
                  <MerchandisingEditor
                    entries={reportRanking}
                    priceOverrides={Object.fromEntries(
                      Object.entries(serviceDrafts).map(([serviceId, value]) => [
                        serviceId,
                        Number(value.price),
                      ]),
                    )}
                    snapshot={snapshot}
                    titleLabel={t('stockRankingTitle')}
                    onChange={setReportRanking}
                  />
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
                <Button type="button" onClick={() => setActiveStep(nextStep)}>
                  {t('stockSessionNext')}
                </Button>
              ) : (
                <Button disabled={!allStepsComplete || isSaving} type="button" onClick={() => void handleSubmit()}>
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

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { EditorHeader } from '@/components/system/editor';
import {
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { formatNumber } from '@/lib/format';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

type Preset = 'small' | 'medium' | 'big';
type Phase = 'edit' | 'review';

const presetSteps: Record<Preset, { units: number; cost: number }> = {
  small: { units: 1, cost: 0.25 },
  medium: { units: 5, cost: 0.5 },
  big: { units: 20, cost: 1 },
};

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

export function StockUpdateRoute() {
  const navigate = useNavigate();
  const { snapshot, submitReport, isSaving } = useInventory();
  const { language, t } = usePreferences();
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
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>('small');
  const [phase, setPhase] = useState<Phase>('edit');
  const [reportedAt, setReportedAt] = useState(() => toLocalDateTimeValue());
  const [reportNotes, setReportNotes] = useState('');
  const [topServiceRanking, setTopServiceRanking] = useState('');
  const [topRetailRanking, setTopRetailRanking] = useState('');
  const [serviceSignals, setServiceSignals] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    setRows(
      Object.fromEntries(
        snapshot.skus.map((sku) => [
          sku.skuId,
          {
            unitsInStock: sku.unitsInStock.toString(),
            costPerUnit: sku.costPerUnit.toString(),
            restockIncluded: false,
            retailStockout: false,
            notes: '',
          },
        ]),
      ),
    );
    setServiceSignals(Object.fromEntries(snapshot.services.map((service) => [service.serviceId, false])));
    setReportedAt(toLocalDateTimeValue());
    setReportNotes('');
    setTopServiceRanking('');
    setTopRetailRanking('');
    setPhase('edit');
  }, [snapshot]);

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

  const selectedServiceSignals = useMemo(
    () => Object.entries(serviceSignals).filter(([, value]) => value).map(([serviceId]) => serviceId),
    [serviceSignals],
  );
  const hasRankingSignals = topServiceRanking.trim().length > 0 || topRetailRanking.trim().length > 0;
  const hasChanges =
    changedEntries.length > 0 || selectedServiceSignals.length > 0 || hasRankingSignals || reportNotes.trim().length > 0;

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

  async function handlePrimaryAction() {
    const isoReportedAt = toIsoTimestamp(reportedAt);

    if (!hasChanges) {
      setError(t('validationStockChanges'));
      return;
    }

    if (!isoReportedAt) {
      setError(t('validationTimestamp'));
      return;
    }

    if (changedEntries.length === 0) {
      setError(t('validationStockChanges'));
      return;
    }

    if (phase === 'edit') {
      setError(null);
      setPhase('review');
      return;
    }

    const serviceIds = new Set(snapshot?.services.map((service) => service.serviceId) ?? []);
    const retailIds = new Set(
      snapshot?.skus
        .filter((sku) => sku.soldAsProduct && sku.productPrice !== null)
        .map((sku) => sku.skuId) ?? [],
    );

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
      serviceSignals: selectedServiceSignals.map((serviceId) => ({ serviceId, stockout: true })),
      topServiceRanking: topServiceRanking
        .split(',')
        .map((value) => value.trim())
        .filter((value) => serviceIds.has(value)),
      topRetailRanking: topRetailRanking
        .split(',')
        .map((value) => value.trim())
        .filter((value) => retailIds.has(value)),
      notes: reportNotes.trim() || null,
    });
    navigate('/inventory');
  }

  function resetChanges() {
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
    setServiceSignals(Object.fromEntries(snapshot.services.map((service) => [service.serviceId, false])));
    setReportedAt(toLocalDateTimeValue());
    setReportNotes('');
    setTopServiceRanking('');
    setTopRetailRanking('');
    setError(null);
    setPhase('edit');
  }

  return (
    <WorkspacePage>
      <EditorHeader
        cancelLabel={t('cancel')}
        isSaving={isSaving}
        onCancel={resetChanges}
        onSave={() => {
          void handlePrimaryAction();
        }}
        saveLabel={phase === 'review' ? t('stockDone') : t('stockConfirm')}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <WorkspacePanel description={t('stockUpdateHint')} title={t('stockTableTitle')}>
          <div className="flex flex-wrap items-center justify-between gap-4">
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

            <Badge className="rounded-full" variant={phase === 'review' ? 'secondary' : 'outline'}>
              {phase === 'review' ? t('stockPhaseReview') : t('stockPhaseEditing')}
            </Badge>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
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

          {snapshot ? (
            <div className="mt-4 overflow-x-auto">
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
            </div>
          ) : (
            <WorkspaceEmpty description={t('apiUnavailable')} title={t('stockChangesTitle')} />
          )}
        </WorkspacePanel>

        <div className="flex flex-col gap-6">
          <WorkspacePanel description={t('stockSignalsHint')} title={t('stockServiceSignalsTitle')}>
            {snapshot && snapshot.services.length > 0 ? (
              <div className="flex flex-col gap-3">
                {snapshot.services.map((service) => (
                  <label
                    className="flex items-start gap-3 rounded-2xl border border-border/75 bg-card/70 px-4 py-3"
                    key={service.serviceId}
                  >
                    <Checkbox
                      checked={serviceSignals[service.serviceId] ?? false}
                      onCheckedChange={(checked) =>
                        setServiceSignals((current) => ({
                          ...current,
                          [service.serviceId]: checked === true,
                        }))
                      }
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{service.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{service.serviceId}</p>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('stockNoServiceSignals')}</p>
            )}
          </WorkspacePanel>

          <WorkspacePanel description={t('stockSignalsHint')} title={t('stockSummaryTitle')}>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-foreground" htmlFor="top-services">
                  {t('stockTopServiceRanking')}
                </label>
                <Input
                  className="mt-2 rounded-2xl"
                  id="top-services"
                  placeholder="service-001, service-002"
                  value={topServiceRanking}
                  onChange={(event) => setTopServiceRanking(event.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground" htmlFor="top-retail">
                  {t('stockTopRetailRanking')}
                </label>
                <Input
                  className="mt-2 rounded-2xl"
                  id="top-retail"
                  placeholder="sku-001, sku-003"
                  value={topRetailRanking}
                  onChange={(event) => setTopRetailRanking(event.target.value)}
                />
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{t('stockRankingHint')}</p>
            </div>
          </WorkspacePanel>

          <WorkspacePanel description={t('stockReviewDescription')} title={t('stockReviewTitle')}>
            {hasChanges ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-3xl border border-border/75 bg-background/60 px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{t('stockUpdatesReady')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatNumber(changedEntries.length, language)} SKU rows,{' '}
                    {formatNumber(selectedServiceSignals.length, language)} service flags
                  </p>
                </div>
                {changedEntries.slice(0, 6).map((entry) => (
                  <div
                    className="rounded-3xl border border-border/75 bg-background/60 px-4 py-3"
                    key={entry.sku.skuId}
                  >
                    <p className="font-medium text-foreground">{entry.sku.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatNumber(entry.unitsInStock, language)} units
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <WorkspaceEmpty description={t('stockSignalsHint')} title={t('stockSummaryTitle')} />
            )}
            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
          </WorkspacePanel>
        </div>
      </div>
    </WorkspacePage>
  );
}

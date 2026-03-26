import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageSection, SaveHeader, SectionHeading, Surface } from '@/components/banji-primitives';
import { formatCurrency } from '@/lib/format';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

type Preset = 'small' | 'medium' | 'big';

const presetSteps: Record<Preset, { units: number; cost: number }> = {
  small: { units: 1, cost: 0.25 },
  medium: { units: 5, cost: 0.5 },
  big: { units: 20, cost: 1 },
};

export function StockUpdateRoute() {
  const navigate = useNavigate();
  const { snapshot, saveStock, isSaving } = useInventory();
  const { currency, language, t } = usePreferences();
  const [rows, setRows] = useState<Record<string, { unitsInStock: string; costPerUnit: string }>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>('small');
  const [isReviewing, setIsReviewing] = useState(false);

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
          },
        ]),
      ),
    );
    setIsReviewing(false);
  }, [snapshot]);

  const changedEntries = useMemo(
    () =>
      snapshot?.skus
        .map((sku) => ({
          sku,
          unitsInStock: Number(rows[sku.skuId]?.unitsInStock ?? sku.unitsInStock),
          costPerUnit: Number(rows[sku.skuId]?.costPerUnit ?? sku.costPerUnit),
        }))
        .filter(
          (entry) =>
            entry.unitsInStock !== entry.sku.unitsInStock ||
            entry.costPerUnit !== entry.sku.costPerUnit,
        ) ?? [],
    [rows, snapshot],
  );

  const hasChanges = changedEntries.length > 0;

  function setField(
    skuId: string,
    key: 'unitsInStock' | 'costPerUnit',
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
    if (!hasChanges) {
      setError(t('validationStockChanges'));
      return;
    }

    if (!isReviewing) {
      setError(null);
      setIsReviewing(true);
      return;
    }

    await saveStock(
      changedEntries.map((entry) => ({
        skuId: entry.sku.skuId,
        unitsInStock: entry.unitsInStock,
        costPerUnit: entry.costPerUnit,
      })),
    );
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
          },
        ]),
      ),
    );
    setError(null);
    setIsReviewing(false);
  }

  function leavePage() {
    if (hasChanges && !window.confirm(t('unsavedChanges'))) {
      return;
    }
    navigate('/inventory');
  }

  return (
    <PageSection className="space-y-6">
      <SaveHeader
        backLabel={t('navInventory')}
        cancelLabel={t('cancel')}
        description={t('stockUpdateBody')}
        hasChanges={hasChanges}
        isSaving={isSaving}
        onBack={leavePage}
        onCancel={resetChanges}
        onSave={() => {
          void handlePrimaryAction();
        }}
        saveLabel={isReviewing ? t('stockDone') : t('stockConfirm')}
        savedLabel={t('savedState')}
        title={t('stockChangesTitle')}
        unsavedLabel={t('unsavedChanges')}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Surface className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionHeading title={t('stockTableTitle')} />
            <div className="flex flex-wrap items-center gap-2">
              {(['small', 'medium', 'big'] as const).map((option) => (
                <Button
                  className="rounded-full"
                  key={option}
                  size="sm"
                  type="button"
                  variant={preset === option ? 'default' : 'outline'}
                  onClick={() => setPreset(option)}
                >
                  {t(`stockPreset${option[0].toUpperCase()}${option.slice(1)}` as never)}
                </Button>
              ))}
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('inventoryColumnItem')}</TableHead>
                <TableHead>{t('fieldUnitsInStock')}</TableHead>
                <TableHead>{t('fieldCostPerUnit')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshot?.skus.map((sku) => (
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
                        className="rounded-full"
                        size="icon-sm"
                        type="button"
                        variant="outline"
                        onClick={() => adjustValue(sku.skuId, 'unitsInStock', -1)}
                      >
                        −
                      </Button>
                      <Input
                        className="h-10 min-w-24 rounded-full text-center"
                        inputMode="decimal"
                        value={rows[sku.skuId]?.unitsInStock ?? ''}
                        onChange={(event) => setField(sku.skuId, 'unitsInStock', event.target.value)}
                      />
                      <Button
                        className="rounded-full"
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
                        className="rounded-full"
                        size="icon-sm"
                        type="button"
                        variant="outline"
                        onClick={() => adjustValue(sku.skuId, 'costPerUnit', -1)}
                      >
                        −
                      </Button>
                      <Input
                        className="h-10 min-w-24 rounded-full text-center"
                        inputMode="decimal"
                        value={rows[sku.skuId]?.costPerUnit ?? ''}
                        onChange={(event) => setField(sku.skuId, 'costPerUnit', event.target.value)}
                      />
                      <Button
                        className="rounded-full"
                        size="icon-sm"
                        type="button"
                        variant="outline"
                        onClick={() => adjustValue(sku.skuId, 'costPerUnit', 1)}
                      >
                        +
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>

        <Surface className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <SectionHeading
            description={isReviewing ? t('stockReviewDescription') : t('stockUpdateHint')}
            title={isReviewing ? t('stockReviewTitle') : t('stockSummaryTitle')}
          />
          {hasChanges ? (
            <>
              <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                <span className="text-sm text-muted-foreground">{t('stockUpdatesReady')}</span>
                <Badge className="rounded-full" variant="secondary">
                  {changedEntries.length}
                </Badge>
              </div>
              <div className="space-y-3">
                {changedEntries.map((entry) => (
                  <div
                    className="rounded-[22px] border border-border/70 bg-background/70 px-4 py-3"
                    key={entry.sku.skuId}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{entry.sku.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{entry.sku.skuId}</p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <p>{entry.unitsInStock}</p>
                        <p>{formatCurrency(entry.costPerUnit, currency, language)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="rounded-full"
                  type="button"
                  variant="outline"
                  onClick={() => setIsReviewing((value) => !value)}
                >
                  {isReviewing ? t('stockEditAction') : t('stockConfirm')}
                </Button>
                {isReviewing ? (
                  <Button
                    className="rounded-full"
                    disabled={isSaving}
                    type="button"
                    onClick={() => {
                      void handlePrimaryAction();
                    }}
                  >
                    {t('stockDone')}
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <EmptyState
              description={t('stockReviewDescription')}
              title={t('stockNoChanges')}
              action={
                <Button className="rounded-full" disabled type="button" variant="outline">
                  {t('stockConfirm')}
                </Button>
              }
            />
          )}
        </Surface>
      </div>

      {error ? <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
    </PageSection>
  );
}

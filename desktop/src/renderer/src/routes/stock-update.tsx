import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EditorHeader } from '@/components/system/editor';
import {
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { formatCurrency } from '@/lib/format';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

type Preset = 'small' | 'medium' | 'big';
type Phase = 'edit' | 'review';

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
  const [phase, setPhase] = useState<Phase>('edit');

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
    setPhase('edit');
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

    if (phase === 'edit') {
      setError(null);
      setPhase('review');
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
    setPhase('edit');
  }

  function leavePage() {
    if (hasChanges && !window.confirm(t('unsavedChanges'))) {
      return;
    }
    navigate('/inventory');
  }

  return (
    <WorkspacePage>
      <EditorHeader
        backLabel={t('navInventory')}
        cancelLabel={t('cancel')}
        description={t('stockUpdateBody')}
        isSaving={isSaving}
        onBack={leavePage}
        onCancel={resetChanges}
        onSave={() => {
          void handlePrimaryAction();
        }}
        saveLabel={phase === 'review' ? t('stockDone') : t('stockConfirm')}
        saveState={hasChanges ? 'unsaved' : 'saved'}
        title={t('stockChangesTitle')}
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

          {snapshot ? (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('inventoryColumnItem')}</TableHead>
                    <TableHead>{t('fieldUnitsInStock')}</TableHead>
                    <TableHead>{t('fieldCostPerUnit')}</TableHead>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </WorkspacePanel>

        <WorkspacePanel
          className="xl:sticky xl:top-24 xl:self-start"
          description={phase === 'review' ? t('stockReviewDescription') : t('stockUpdateHint')}
          title={phase === 'review' ? t('stockReviewTitle') : t('stockSummaryTitle')}
        >
          {hasChanges ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-3xl border border-border/80 bg-background/60 px-4 py-3">
                <span className="text-sm text-muted-foreground">{t('stockUpdatesReady')}</span>
                <Badge className="rounded-full" variant="secondary">
                  {changedEntries.length}
                </Badge>
              </div>

              {changedEntries.map((entry) => (
                <div
                  className="rounded-3xl border border-border/80 bg-background/60 px-4 py-3"
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

              {phase === 'review' ? (
                <Button type="button" variant="outline" onClick={() => setPhase('edit')}>
                  {t('stockEditAction')}
                </Button>
              ) : null}
            </div>
          ) : (
            <WorkspaceEmpty
              description={error ?? t('stockUpdateHint')}
              title={t('stockSummaryTitle')}
            />
          )}
        </WorkspacePanel>
      </div>
    </WorkspacePage>
  );
}

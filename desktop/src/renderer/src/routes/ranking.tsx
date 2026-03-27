import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RankingEntry } from '@shared/inventory';
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EditorHeader } from '@/components/system/editor';
import {
  WorkspacePage,
  WorkspacePanel,
  WorkspaceEmpty,
} from '@/components/system/workspace';
import { formatCurrency, rankLabel } from '@/lib/format';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

function moveEntry(entries: RankingEntry[], index: number, offset: -1 | 1) {
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= entries.length) {
    return entries;
  }

  const next = [...entries];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next.map((entry, position) => ({ ...entry, position }));
}

function moveEntryToIndex(entries: RankingEntry[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) {
    return entries;
  }
  const next = [...entries];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((entry, position) => ({ ...entry, position }));
}

export function RankingRoute() {
  const navigate = useNavigate();
  const { snapshot, persistRanking, isSaving } = useInventory();
  const { currency, language, t } = usePreferences();
  const [entries, setEntries] = useState<RankingEntry[]>([]);

  useEffect(() => {
    if (snapshot?.ranking) {
      setEntries(snapshot.ranking);
    }
  }, [snapshot]);

  const hasChanges = JSON.stringify(entries) !== JSON.stringify(snapshot?.ranking ?? []);

  const topEntries = useMemo(() => entries.slice(0, 3), [entries]);

  if (!snapshot) {
    return null;
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
        cancelLabel={t('resetAction')}
        description={t('rankingBody')}
        isSaving={isSaving}
        onBack={leavePage}
        onCancel={() => setEntries(snapshot.ranking)}
        onSave={() => {
          void persistRanking(entries);
        }}
        saveLabel={t('saveRankingAction')}
        saveState={hasChanges ? 'unsaved' : 'saved'}
        title={t('productRankingTitle')}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <WorkspacePanel description={t('merchandisingPriorityNote')} title={t('productRankingTitle')}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t('rankHeaderName')}</TableHead>
                  <TableHead>{t('rankHeaderPrice')}</TableHead>
                  <TableHead className="text-right">{t('saveRankingAction')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody data-testid="ranking-list">
                {entries.map((entry, index) => {
                  const label = rankLabel(entry, snapshot.skus, snapshot.services);
                  const price =
                    entry.entryType === 'service'
                      ? snapshot.services.find((service) => service.serviceId === entry.entryId)?.price ?? 0
                      : snapshot.skus.find((sku) => sku.skuId === entry.entryId)?.productPrice ?? 0;

                  return (
                    <TableRow
                      draggable
                      key={`${entry.entryType}:${entry.entryId}`}
                      onDragEnd={(event) => {
                        event.currentTarget.removeAttribute('data-dragging');
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                      }}
                      onDragStart={(event) => {
                        event.currentTarget.setAttribute('data-dragging', 'true');
                        event.dataTransfer.setData('text/plain', String(index));
                      }}
                      onDrop={(event) => {
                        const fromIndex = Number(event.dataTransfer.getData('text/plain'));
                        setEntries((current) => moveEntryToIndex(current, fromIndex, index));
                      }}
                    >
                      <TableCell className="font-medium">#{index + 1}</TableCell>
                      <TableCell className="min-w-0">
                        <div className="flex min-w-0 items-center gap-3">
                          <GripVertical aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{label}</p>
                            <p className="text-sm text-muted-foreground">
                              {entry.entryType === 'service' ? t('serviceLabel') : t('skuLabel')}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(price, currency, language)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            aria-label={`${t('moveUp')} ${label}`}
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => setEntries((current) => moveEntry(current, index, -1))}
                          >
                            {t('moveUp')}
                          </Button>
                          <Button
                            aria-label={`${t('moveDown')} ${label}`}
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => setEntries((current) => moveEntry(current, index, 1))}
                          >
                            {t('moveDown')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </WorkspacePanel>

        <WorkspacePanel
          description={t('merchandisingTopThreeDescription')}
          title={t('merchandisingTopThreeTitle')}
        >
          {topEntries.length > 0 ? (
            <div className="flex flex-col gap-3">
              {topEntries.map((entry, index) => (
                <div
                  className="rounded-3xl border border-border/75 bg-background/60 px-4 py-4"
                  key={`${entry.entryType}:${entry.entryId}`}
                >
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Spot {index + 1}
                  </p>
                  <p className="mt-2 font-medium text-foreground">
                    {rankLabel(entry, snapshot.skus, snapshot.services)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {entry.entryType === 'service' ? t('serviceLabel') : t('skuLabel')}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <WorkspaceEmpty
              description={t('rankingBody')}
              title={t('merchandisingTopThreeTitle')}
            />
          )}
        </WorkspacePanel>
      </div>
    </WorkspacePage>
  );
}

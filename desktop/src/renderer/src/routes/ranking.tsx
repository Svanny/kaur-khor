import { useEffect, useState } from 'react';
import type { RankingEntry } from '@shared/inventory';
import { useNavigate } from 'react-router-dom';
import { useInventory } from '../state/inventory';
import { usePreferences } from '../state/preferences';
import { formatCurrency, rankLabel } from '../lib/format';
import { SaveChangeHeader, ShellCard } from '../ui';

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
    <section className="page-stack">
      <SaveChangeHeader
        cancelLabel={t('resetAction')}
        hasChanges={hasChanges}
        isSaving={isSaving}
        onBack={leavePage}
        onCancel={() => setEntries(snapshot.ranking)}
        onSave={() => {
          void persistRanking(entries);
        }}
        saveLabel={t('saveRankingAction')}
        title={t('productRankingTitle')}
      />

      <ShellCard className="ranking-card">
        <div className="ranking-table-header">
          <span className="ranking-rank-header">#</span>
          <span>{t('rankHeaderName')}</span>
          <span>{t('rankHeaderPrice')}</span>
        </div>
        <div className="ranking-list" data-testid="ranking-list">
          {entries.map((entry, index) => {
            const price =
              entry.entryType === 'service'
                ? snapshot.services.find((service) => service.serviceId === entry.entryId)?.price ?? 0
                : snapshot.skus.find((sku) => sku.skuId === entry.entryId)?.productPrice ?? 0;
            return (
              <div
                className="ranking-row"
                draggable
                key={`${entry.entryType}:${entry.entryId}`}
                onDragStart={(event) => {
                  event.currentTarget.setAttribute('data-dragging', 'true');
                  event.dataTransfer.setData('text/plain', String(index));
                }}
                onDragEnd={(event) => {
                  event.currentTarget.removeAttribute('data-dragging');
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  const fromIndex = Number(event.dataTransfer.getData('text/plain'));
                  setEntries((current) => moveEntryToIndex(current, fromIndex, index));
                }}
              >
                <span className="ranking-rank-pill">{index + 1}</span>
                <span aria-hidden="true" className="ranking-drag-handle">⋮⋮</span>
                <div className="ranking-copy">
                  <strong>{rankLabel(entry, snapshot.skus, snapshot.services)}</strong>
                  <p>{entry.entryType === 'service' ? t('serviceLabel') : t('skuLabel')}</p>
                </div>
                <div className="ranking-price">
                  <strong>{formatCurrency(price, currency, language)}</strong>
                  <div className="inline-actions">
                    <button
                      className="secondary-pill-button compact-pill-button"
                      type="button"
                      onClick={() => setEntries((current) => moveEntry(current, index, -1))}
                    >
                      {t('moveUp')}
                    </button>
                    <button
                      className="secondary-pill-button compact-pill-button"
                      type="button"
                      onClick={() => setEntries((current) => moveEntry(current, index, 1))}
                    >
                      {t('moveDown')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ShellCard>
    </section>
  );
}

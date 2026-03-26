import { useEffect, useState } from 'react';
import type { RankingEntry } from '@shared/inventory';
import { useInventory } from '../state/inventory';
import { usePreferences } from '../state/preferences';
import { rankLabel } from '../lib/format';

function moveEntry(entries: RankingEntry[], index: number, offset: -1 | 1) {
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= entries.length) {
    return entries;
  }

  const next = [...entries];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next.map((entry, position) => ({ ...entry, position }));
}

export function RankingRoute() {
  const { snapshot, persistRanking, isSaving } = useInventory();
  const { t } = usePreferences();
  const [entries, setEntries] = useState<RankingEntry[]>([]);

  useEffect(() => {
    if (snapshot?.ranking) {
      setEntries(snapshot.ranking);
    }
  }, [snapshot]);

  if (!snapshot) {
    return null;
  }

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h1>{t('rankingTitle')}</h1>
            <p>{t('rankingBody')}</p>
          </div>
          <button
            className="button primary"
            disabled={isSaving}
            type="button"
            onClick={() => persistRanking(entries)}
          >
            {t('saveRanking')}
          </button>
        </div>

        <div className="rank-list">
          {entries.map((entry, index) => (
            <div className="rank-row" key={`${entry.entryType}:${entry.entryId}`}>
              <span className="rank-chip">{index + 1}</span>
              <div className="rank-copy">
                <strong>{rankLabel(entry, snapshot.skus, snapshot.services)}</strong>
                <p>{entry.entryType === 'service' ? t('serviceLabel') : t('skuLabel')}</p>
              </div>
              <div className="action-row">
                <button
                  className="button secondary compact"
                  type="button"
                  onClick={() => setEntries((current) => moveEntry(current, index, -1))}
                >
                  {t('moveUp')}
                </button>
                <button
                  className="button secondary compact"
                  type="button"
                  onClick={() => setEntries((current) => moveEntry(current, index, 1))}
                >
                  {t('moveDown')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

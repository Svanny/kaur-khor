import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MerchandisingEditor } from '@/components/system/merchandising-editor';
import {
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { buildDefaultReportRanking } from '@/components/system/merchandising-editor';
import { formatNumber } from '@/lib/format';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { useInventory } from '@/state/inventory';
import { useOperationsSession } from '@/state/operations-session';
import { usePreferences } from '@/state/preferences';

export function PlanningRoute() {
  const [searchParams] = useSearchParams();
  const { snapshot, persistRanking, isSaving } = useInventory();
  const { hasDraft } = useOperationsSession();
  const { language, t } = usePreferences();
  const [draftRanking, setDraftRanking] = useState(snapshot ? buildDefaultReportRanking(snapshot) : []);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    setDraftRanking(buildDefaultReportRanking(snapshot));
    setSavedMessage(false);
  }, [snapshot]);

  const planningBaselineEntries = snapshot ? buildDefaultReportRanking(snapshot) : [];
  const baselineRanking = planningBaselineEntries;
  const rankableEntryCount = planningBaselineEntries.length;
  const hasChanges = JSON.stringify(draftRanking) !== JSON.stringify(baselineRanking);
  const source = searchParams.get('source');
  const isOperationsReviewSource = source === 'operations-review';
  const showReturnToReview = isOperationsReviewSource && hasDraft;
  useRouteLeaveConfirm({
    enabled: Boolean(snapshot) && hasChanges,
    message: t('planningUnsavedLeavePrompt'),
    onDiscard: () => {
      setDraftRanking(planningBaselineEntries);
      setSavedMessage(false);
    },
  });

  if (!snapshot) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty description={t('apiUnavailable')} title={t('navPlanning')} />
      </WorkspacePage>
    );
  }

  const highRiskCount = snapshot.sist.highRiskSkuIds.length;
  const topRankedEntries = draftRanking.slice(0, 3).map((entry) => {
    const label =
      entry.entryType === 'service'
        ? snapshot.services.find((service) => service.serviceId === entry.entryId)?.name ?? entry.entryId
        : snapshot.skus.find((sku) => sku.skuId === entry.entryId)?.name ?? entry.entryId;

    return {
      ...entry,
      label,
    };
  });
  const hasRankableEntries = rankableEntryCount > 0;

  async function handleSave() {
    await persistRanking(draftRanking);
    setSavedMessage(true);
  }

  function handleReset() {
    setDraftRanking(baselineRanking);
    setSavedMessage(false);
  }

  return (
    <WorkspacePage data-testid="planning-route">
      <WorkspacePanel
        description={t('planningBody')}
        title={t('navPlanning')}
      >
        {isOperationsReviewSource ? (
          <div className="rounded-3xl border border-border/70 bg-background/55 p-4">
            <p className="text-sm text-muted-foreground">{t('planningOperationsSource')}</p>
          </div>
        ) : null}

        <WorkspacePanel
          description={t('planningRankingWorkspaceDescription')}
          title={t('planningRankingWorkspaceTitle')}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            {showReturnToReview ? (
              <Button asChild type="button" variant="outline">
                <Link to="/operations/session?step=review">
                  {t('planningReturnToOperationsReview')}
                </Link>
              </Button>
            ) : (
              <Button asChild type="button" variant="outline">
                <Link to="/operations">{t('navOperations')}</Link>
              </Button>
            )}
          </div>

          {hasRankableEntries ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {savedMessage && !hasChanges ? (
                    <Badge variant="secondary">{t('savedState')}</Badge>
                  ) : null}
                  {hasChanges ? <Badge variant="outline">{t('unsavedChanges')}</Badge> : null}
                  <Badge variant="outline">
                    {formatNumber(rankableEntryCount, language)} {t('planningCoverageBadge')}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="outline" onClick={handleReset}>
                    {t('resetAction')}
                  </Button>
                  <Button
                    disabled={!hasChanges || isSaving}
                    type="button"
                    onClick={() => void handleSave()}
                  >
                    {t('saveRankingAction')}
                  </Button>
                </div>
              </div>

              <MerchandisingEditor
                entries={draftRanking}
                snapshot={snapshot}
                titleLabel={t('productRankingTitle')}
                onChange={setDraftRanking}
              />
            </>
          ) : (
            <WorkspaceEmpty
              action={
                <Button asChild>
                  <Link to="/catalog">{t('planningEmptyAction')}</Link>
                </Button>
              }
              description={t('planningEmptyDescription')}
              title={t('planningEmptyTitle')}
            />
          )}
        </WorkspacePanel>

        <WorkspacePanel
          description={t('planningContextDescription')}
          title={t('planningContextTitle')}
        >
          <div className="grid gap-4 lg:grid-cols-4">
            <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('overviewReorderPressure')}
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                {formatNumber(snapshot.sist.pendingReorderCount, language)}
              </p>
            </div>
            <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('overviewHighRiskSkuCount')}
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                {formatNumber(highRiskCount, language)}
              </p>
            </div>
            <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('planningLeadSpotlight')}
              </p>
              <div className="mt-3 space-y-2">
                {topRankedEntries.length > 0 ? (
                  topRankedEntries.map((entry, index) => (
                    <p className="text-sm font-medium text-foreground" key={`${entry.entryType}-${entry.entryId}`}>
                      {index + 1}. {entry.label}
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{t('planningLeadSpotlightEmpty')}</p>
                )}
              </div>
            </div>
            <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('planningCoverageTitle')}
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                {formatNumber(rankableEntryCount, language)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{t('planningCoverageDescription')}</p>
            </div>
          </div>
        </WorkspacePanel>
      </WorkspacePanel>
    </WorkspacePage>
  );
}

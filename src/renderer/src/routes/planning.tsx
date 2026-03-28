import { useEffect, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { HoverTooltip } from '@/components/system/hover-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MerchandisingEditor } from '@/components/system/merchandising-editor';
import { DescriptionText } from '@/components/system/description-text';
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

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    setDraftRanking(buildDefaultReportRanking(snapshot));
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
    },
  });

  if (!snapshot) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty description={t('apiUnavailable')} title={t('navPlanning')} />
      </WorkspacePage>
    );
  }

  const topHighRiskSkus = snapshot.sist.skuInsights
    .filter((insight) => snapshot.sist.highRiskSkuIds.includes(insight.skuId))
    .sort((left, right) => right.stockoutRisk - left.stockoutRisk)
    .slice(0, 3)
    .map((insight) => ({
      ...insight,
      name: snapshot.skus.find((sku) => sku.skuId === insight.skuId)?.name ?? insight.skuId,
    }));
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
  }

  function handleReset() {
    setDraftRanking(baselineRanking);
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
          title={
            <div className="flex items-center gap-2">
              <span>{t('planningRankingWorkspaceTitle')}</span>
              <HoverTooltip
                ariaLabel={`${t('planningRankingWorkspaceTitle')} help`}
                className="group rounded-full p-1 text-muted-foreground"
                content={
                  <div className="space-y-3 text-left">
                    <p className="font-medium text-background">{t('planningExplainerTitle')}</p>
                    <div className="space-y-2">
                      <div>
                        <p className="font-medium text-background">{t('planningExplainerTeamLabel')}</p>
                        <DescriptionText>{t('planningExplainerTeamBody')}</DescriptionText>
                      </div>
                      <div>
                        <p className="font-medium text-background">{t('planningExplainerSistLabel')}</p>
                        <DescriptionText>{t('planningExplainerSistBody')}</DescriptionText>
                      </div>
                    </div>
                    <DescriptionText className="text-[11px] text-background/80">
                      {t('planningExplainerFooter')}
                    </DescriptionText>
                  </div>
                }
                tooltipClassName="max-w-80"
              >
                {({ open }) => (
                  <CircleHelp
                    aria-hidden="true"
                    className={open ? 'size-4 text-foreground' : 'size-4 text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground'}
                  />
                )}
              </HoverTooltip>
            </div>
          }
        >
          {hasRankableEntries ? (
            <>
              <div
                className="flex flex-wrap items-center justify-between gap-3"
                data-testid="planning-action-rail"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {hasChanges ? <Badge variant="outline">{t('planningUnsavedBadge')}</Badge> : null}
                  <Badge variant="outline">
                    {formatNumber(rankableEntryCount, language)} {t('planningCoverageBadge')}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-3">
                  {showReturnToReview ? (
                    <Button asChild type="button" variant="outline">
                      <Link to="/operations/session?step=review">
                        {t('planningReturnToOperationsReview')}
                      </Link>
                    </Button>
                  ) : null}
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
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('planningDemandPressureTitle')}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {t('planningDemandPressureLabel')}: {formatNumber(snapshot.sist.pendingReorderCount, language)}
              </p>
              <div className="mt-4 space-y-3">
                {topHighRiskSkus.length > 0 ? (
                  topHighRiskSkus.map((sku) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/70 px-3 py-2"
                      key={sku.skuId}
                    >
                      <p className="text-sm font-medium text-foreground">{sku.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {Math.round(sku.stockoutRisk * 100)}% {t('catalogStockoutRisk').toLowerCase()}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{t('planningDemandPressureEmpty')}</p>
                )}
              </div>
            </div>
            <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('planningLeadSpotlight')}
              </p>
              <div className="mt-3 space-y-2">
                {topRankedEntries.length > 0 ? (
                  topRankedEntries.map((entry, index) => (
                    <p className="text-sm font-medium text-foreground" key={`${entry.entryType}-${entry.entryId}`}>
                      #{index + 1} {entry.label}
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{t('planningLeadSpotlightEmpty')}</p>
                )}
              </div>
            </div>
          </div>
        </WorkspacePanel>
      </WorkspacePanel>
    </WorkspacePage>
  );
}

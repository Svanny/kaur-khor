import { ActionConfirmIcon, ActionSaveIcon } from '@icons/actions';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SenaService } from '@shared/sena';
import { SearchInput } from '@/components/system/search-input';
import { ItemAvatar } from '@/components/system/item-identity';
import { MeasuredTileGrid } from '@/components/system/measured-tile-grid';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { CurrencyNumberInput } from '@/components/ui/currency-number-input';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { displayMoneyFromUsd, parseEditableNumberWithCommas, usdMoneyFromDisplay } from '@/lib/format';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { createUniqueServiceId, emptySenaCatalog, linkedSkuIdsForService, upsertSenaService } from '@/lib/sena-catalog';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { buildBanjiNavigationState, useNavigationHistory } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import { buildServiceCatalogEditObservation } from './catalog-edit-observation';
import { CatalogImageField } from './catalog-image-field';
import { EditorField, editorInputClassName, editorPanelClassName, editorTextareaClassName } from './editor-form-primitives';
import { DetailHeroWireframe } from './loading-wireframes';
import { SkuPageHero } from './sku-page-hero';
import { SectionTitle } from './sku-detail/section-heading';

function emptyService(serviceId = ''): SenaService {
  return {
    serviceId,
    name: '',
    description: '',
    imagePath: null,
    price: 0,
    archived: false,
    bundle: false,
  };
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizedServiceDirtySnapshot(service: SenaService) {
  return {
    name: service.name.trim(),
    description: service.description.trim(),
    imagePath: service.imagePath?.trim() || null,
    price: service.price,
  };
}

function moneyDraftFromUsd(amount: number | null, currency: 'USD' | 'KHR', usdToKhrExchangeRate: number) {
  if (amount == null) {
    return '';
  }
  return String(displayMoneyFromUsd(amount, currency, usdToKhrExchangeRate));
}

function parseNonNegativeMoneyDraft(value: string, currency: 'USD' | 'KHR', usdToKhrExchangeRate: number) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const displayValue = parseEditableNumberWithCommas(trimmed);
  if (!Number.isFinite(displayValue) || displayValue < 0) {
    return null;
  }
  const usdValue = usdMoneyFromDisplay(displayValue, currency, usdToKhrExchangeRate);
  return Number.isFinite(usdValue) && usdValue >= 0 ? usdValue : null;
}

function getSkuSearchScore(sku: { skuId: string; name: string; description: string }, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return null;
  }

  const terms = normalizedQuery.split(' ');
  const name = normalizeSearchValue(sku.name);
  const description = normalizeSearchValue(sku.description);

  let score = 0;

  for (const term of terms) {
    if (name === term) {
      score += 320;
      continue;
    }
    if (name.startsWith(term)) {
      score += 220;
      continue;
    }
    if (name.includes(term)) {
      score += 140;
      continue;
    }
    if (description.startsWith(term)) {
      score += 100;
      continue;
    }
    if (description.includes(term)) {
      score += 60;
      continue;
    }

    return null;
  }

  if (name === normalizedQuery) {
    score += 150;
  } else if (name.startsWith(normalizedQuery)) {
    score += 80;
  }

  return score;
}

function ServiceSkuGridTile({
  checked,
  className,
  description,
  imagePath,
  label,
  measure = false,
  skuId,
  onCheckedChange,
}: {
  checked: boolean;
  className?: string;
  description?: string;
  imagePath?: string | null;
  label: string;
  measure?: boolean;
  skuId: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-[1.25rem] border border-border/70 bg-muted/20 px-4 py-4 text-sm transition-colors',
        !measure && `cursor-pointer hover:border-border ${rowHoverClassName} focus-within:border-ring/70 focus-within:bg-muted/35`,
        className,
      )}
      aria-pressed={measure ? undefined : checked}
      data-measure={measure ? 'true' : undefined}
      data-sku-tile={measure ? undefined : 'true'}
      data-skuid={skuId}
      onClick={
        measure
          ? undefined
          : (event) => {
              if ((event.target as HTMLElement).closest('[data-slot="checkbox"]')) {
                return;
              }
              onCheckedChange(!checked);
            }
      }
    >
      {measure ? (
        <div className="size-5 shrink-0 rounded-[6px] border border-muted-foreground/45 bg-card" />
      ) : (
        <>
          <input
            aria-label={label}
            checked={checked}
            className="peer sr-only"
            type="checkbox"
            onChange={(event) => onCheckedChange(event.target.checked)}
          />
          <div
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-[border-color,background-color,box-shadow]',
              checked
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/45 bg-card text-transparent',
              'peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50',
            )}
          >
            <ActionConfirmIcon className="size-3.5" />
          </div>
        </>
      )}
      <ItemAvatar imagePath={imagePath} name={label} size="compact" type="sku" />
      <div className="grid min-w-0 gap-1">
        <div className="flex min-h-5 cursor-pointer items-center font-medium leading-5 text-foreground">
          {label}
        </div>
        {description ? <div className="truncate text-muted-foreground">{description}</div> : null}
      </div>
    </div>
  );
}

function ServiceFormLoadingState({ title }: { title: string }) {
  return (
    <WorkspacePage>
      <DetailHeroWireframe actionCount={1} badgeCount={0} showBody={false} title={title} />

      <div className="grid gap-6">
        <WorkspacePanel
          className={editorPanelClassName}
          title={<Skeleton className="h-7 w-36 rounded-full" />}
        >
          <div className="grid items-start gap-4 md:grid-cols-2">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
          <Skeleton className="h-32 rounded-2xl" />
        </WorkspacePanel>

        <WorkspacePanel
          className={editorPanelClassName}
          title={<Skeleton className="h-7 w-40 rounded-full" />}
        >
          <Skeleton className="h-14 rounded-xl md:max-w-[24rem]" />
        </WorkspacePanel>

        <WorkspacePanel
          className={editorPanelClassName}
          title={<Skeleton className="h-7 w-32 rounded-full" />}
        >
          <Skeleton className="h-12 rounded-full" />
          <Skeleton className="h-9 w-48 rounded-full" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={`service-form-sku-loading-${index}`} className="h-20 rounded-[1.25rem]" />
            ))}
          </div>
        </WorkspacePanel>
      </div>
    </WorkspacePage>
  );
}

export function ServiceFormRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const { serviceId } = useParams();
  const { catalog, ingestSenaObservation, isLoading, isSaving, upsertSenaCatalog } = useInventory();
  const { canGoBack, goBack, previousLocation } = useNavigationHistory();
  const { currency, t, usdToKhrExchangeRate } = usePreferences();
  const [form, setForm] = useState<SenaService>(() => emptyService(serviceId));
  const [servicePriceDraft, setServicePriceDraft] = useState('');
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [selectedSkuIds, setSelectedSkuIds] = useState<string[]>([]);
  const [localSavedService, setLocalSavedService] = useState<SenaService | null>(null);
  const [localSavedSkuIds, setLocalSavedSkuIds] = useState<string[]>([]);
  const [skuSearch, setSkuSearch] = useState('');
  const deferredSkuSearch = useDeferredValue(skuSearch);
  const editing = Boolean(serviceId);
  const formId = 'service-editor-form';
  const existingService = useMemo(
    () => catalog?.services.find((entry) => entry.serviceId === serviceId) ?? null,
    [catalog?.services, serviceId],
  );
  const baselineSelectedSkuIds = useMemo(
    () => (catalog && existingService ? linkedSkuIdsForService(catalog, existingService.serviceId) : []),
    [catalog, existingService],
  );

  useEffect(() => {
    if (existingService && catalog) {
      setLocalSavedService(existingService);
      setLocalSavedSkuIds(baselineSelectedSkuIds);
      setForm(existingService);
      setServicePriceDraft(moneyDraftFromUsd(existingService.price, currency, usdToKhrExchangeRate));
      setSelectedSkuIds(baselineSelectedSkuIds);
    } else if (!editing) {
      setLocalSavedService(null);
      setLocalSavedSkuIds([]);
      setForm(emptyService(''));
      setServicePriceDraft('');
      setSelectedSkuIds([]);
    }
  }, [baselineSelectedSkuIds, catalog, currency, editing, existingService, usdToKhrExchangeRate]);

  const normalizedDraft = useMemo(
    () => ({
      ...form,
      serviceId: form.serviceId.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
    }),
    [form],
  );
  const normalizedBaseline = useMemo(
    () => localSavedService ?? emptyService(editing ? (serviceId ?? '') : ''),
    [editing, localSavedService, serviceId],
  );
  const draftDirtySnapshot = useMemo(() => normalizedServiceDirtySnapshot(form), [form]);
  const baselineDirtySnapshot = useMemo(
    () => normalizedServiceDirtySnapshot(normalizedBaseline),
    [normalizedBaseline],
  );
  const baselineServicePriceDraft = editing
    ? moneyDraftFromUsd(normalizedBaseline.price, currency, usdToKhrExchangeRate)
    : '';
  const parsedServicePriceDraft = parseNonNegativeMoneyDraft(servicePriceDraft, currency, usdToKhrExchangeRate);
  const hasUnsavedServiceChanges =
    JSON.stringify(draftDirtySnapshot) !== JSON.stringify(baselineDirtySnapshot) ||
    servicePriceDraft !== baselineServicePriceDraft ||
    JSON.stringify([...selectedSkuIds].sort()) !== JSON.stringify([...localSavedSkuIds].sort());
  const serviceValidationErrors = {
    name: !form.name.trim() ? t('catalogServiceEditorNameRequired') : null,
    price: !servicePriceDraft.trim()
      ? t('catalogServiceEditorPriceRequired')
      : parsedServicePriceDraft == null
        ? 'Enter a non-negative finite service price before saving.'
        : null,
  };
  const hasServiceValidationErrors = Object.values(serviceValidationErrors).some(Boolean);
  const visibleServiceValidationErrors = saveAttempted ? serviceValidationErrors : {
    ...serviceValidationErrors,
    price: serviceValidationErrors.price,
  };
  function resetServiceDraft() {
    setForm(normalizedBaseline);
    setServicePriceDraft(moneyDraftFromUsd(normalizedBaseline.price, currency, usdToKhrExchangeRate));
    setSelectedSkuIds(localSavedSkuIds);
    setSaveAttempted(false);
  }

  const { confirmLeave, discardConfirmDialog } = useRouteLeaveConfirm({
    enabled: hasUnsavedServiceChanges,
    description: t('serviceEditorUnsavedLeavePrompt'),
    isSaveDisabled: hasServiceValidationErrors || isSaving,
    onDiscard: resetServiceDraft,
    onSave: (continueAfterSave) => saveServiceDraft({ afterSave: continueAfterSave, navigateAfterSave: false }),
    saveLabel: t('saveDraft'),
  });

  async function saveServiceDraft({
    afterSave,
    navigateAfterSave,
  }: {
    afterSave?: () => void;
    navigateAfterSave: boolean;
  }) {
    setSaveAttempted(true);
    if (hasServiceValidationErrors) {
      return false;
    }
    const baseCatalog = catalog ?? emptySenaCatalog();
    const nextService = editing
      ? { ...normalizedDraft, serviceId: normalizedBaseline.serviceId }
      : { ...normalizedDraft, serviceId: createUniqueServiceId(baseCatalog) };
    const nextCatalog = upsertSenaService(baseCatalog, nextService, selectedSkuIds, normalizedBaseline.serviceId);
    await upsertSenaCatalog(nextCatalog);
    const observation = editing
      ? buildServiceCatalogEditObservation({
          baseline: normalizedBaseline,
          next: nextService,
        })
      : null;
    if (observation) {
      await ingestSenaObservation(observation);
    }
    setLocalSavedService(nextService);
    setLocalSavedSkuIds(selectedSkuIds);
    setForm(nextService);
    setServicePriceDraft(moneyDraftFromUsd(nextService.price, currency, usdToKhrExchangeRate));
    setSaveAttempted(false);
    afterSave?.();
    if (!navigateAfterSave) {
      return true;
    }
    const detailNavigationState = buildBanjiNavigationState(location, '/catalog');
    const currentOrigin =
      location.state &&
      typeof location.state === 'object' &&
      'banjiNavigationOrigin' in location.state &&
      typeof location.state.banjiNavigationOrigin === 'string'
        ? location.state.banjiNavigationOrigin
        : null;
    await navigate(`/catalog/services/${nextService.serviceId}`, {
      replace: true,
      state: {
        ...detailNavigationState,
        banjiNavigationOrigin: currentOrigin ?? previousLocation ?? '/catalog',
      },
    });
    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveServiceDraft({ navigateAfterSave: true });
  }

  const filteredSkus = useMemo(() => {
    const query = normalizeSearchValue(deferredSkuSearch);
    const allSkus = [...(catalog?.skus ?? [])];
    const sortedSkus = allSkus.sort((left, right) => left.name.localeCompare(right.name));

    if (!query) {
      return sortedSkus;
    }

    return sortedSkus
      .map((sku) => ({ sku, score: getSkuSearchScore(sku, query) }))
      .filter((entry): entry is { sku: (typeof sortedSkus)[number]; score: number } => entry.score != null)
      .sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }

        return left.sku.name.localeCompare(right.sku.name);
      })
      .map(({ sku }) => sku);
  }, [catalog?.skus, deferredSkuSearch]);

  const selectedSkuCountLabel = useMemo(
    () => `${selectedSkuIds.length} ${t('serviceEditorLinkedSkusSelected')}`,
    [selectedSkuIds.length, t],
  );

  if (isLoading && !catalog) {
    return <ServiceFormLoadingState title={editing ? t('catalogServiceEditorTitleEdit') : t('catalogServiceEditorTitleNew')} />;
  }

  return (
    <WorkspacePage>
      {discardConfirmDialog}
      <SkuPageHero
        actions={
          <WorkspaceActionRow>
            <Button disabled={(editing && !hasUnsavedServiceChanges) || isSaving} form={formId} type="submit">
              <ActionSaveIcon data-icon="inline-start" />
              {editing ? t('saveDraft') : t('createEntry')}
            </Button>
          </WorkspaceActionRow>
        }
        onBack={canGoBack ? () => confirmLeave(goBack) : undefined}
        title={editing ? t('catalogServiceEditorTitleEdit') : t('catalogServiceEditorTitleNew')}
      />

      <form
        className="grid gap-6"
        id={formId}
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
      >
        <WorkspacePanel
          className={editorPanelClassName}
          descriptor={t('catalogServiceEditorDetailsDescriptor')}
          title={<SectionTitle helpHref="/settings/help#catalog-service-editor-details" title={t('editorDetailsTitle')} tooltip={t('catalogServiceEditorDetailsTooltip')} />}
        >
          <EditorField
            error={visibleServiceValidationErrors.name ?? undefined}
            helper={t('catalogServiceEditorNameHelper')}
            helpHref="/settings/help#catalog-service-editor-details"
            label={t('fieldName')}
            tooltip={t('catalogServiceEditorDetailsTooltip')}
          >
            <input
              className={editorInputClassName}
              required
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </EditorField>

          <EditorField
            helper={t('catalogServiceEditorDescriptionHelper')}
            helpHref="/settings/help#catalog-service-editor-details"
            label={t('fieldDescription')}
            tooltip={t('catalogServiceEditorDetailsTooltip')}
          >
            <textarea
              className={editorTextareaClassName}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </EditorField>

          <CatalogImageField
            helper="Choose, drop, or paste one PNG, JPEG, or WebP picture for this service. banji will show it on supported item surfaces."
            imagePath={form.imagePath}
            label="Picture"
            name={form.name || 'Service image'}
            type="service"
            onChange={(value) => setForm((current) => ({ ...current, imagePath: value }))}
          />
        </WorkspacePanel>

        <WorkspacePanel
          className={editorPanelClassName}
          descriptor={t('catalogServiceEditorPricingDescriptor')}
          title={<SectionTitle helpHref="/settings/help#catalog-service-editor-pricing" title={t('editorPricingTitle')} tooltip={t('catalogServiceEditorPricingTooltip')} />}
        >
          <EditorField
            error={visibleServiceValidationErrors.price ?? undefined}
            helper={t('catalogServiceEditorPriceHelper')}
            helpHref="/settings/help#catalog-service-editor-pricing"
            label={t('fieldPrice')}
            tooltip={t('catalogServiceEditorPriceTooltip')}
          >
            <CurrencyNumberInput
              className={editorInputClassName}
              currency={currency}
              min="0"
              required
              value={servicePriceDraft}
              onChange={(event) => {
                const nextValue = event.target.value;
                setServicePriceDraft(nextValue);
                if (!nextValue.trim()) {
                  return;
                }
                setForm((current) => ({
                  ...current,
                  price: usdMoneyFromDisplay(parseEditableNumberWithCommas(nextValue), currency, usdToKhrExchangeRate),
                }));
              }}
            />
          </EditorField>
        </WorkspacePanel>

        <WorkspacePanel
          className={editorPanelClassName}
          descriptor={t('catalogServiceEditorLinkedSkusDescriptor')}
          hint={t('catalogServiceEditorLinkedSkusHelper')}
          title={<SectionTitle helpHref="/settings/help#catalog-service-editor-linked-skus" title={t('editorSelectionTitle')} tooltip={t('catalogServiceEditorLinkedSkusTooltip')} />}
        >
          <SearchInput
            ariaLabel={t('fieldLinkedSkus')}
            className="h-12 rounded-full"
            placeholder={t('serviceEditorLinkedSkusSearchPlaceholder')}
            value={skuSearch}
            onChange={(event) => setSkuSearch(event.target.value)}
          />

          <div className="inline-flex w-fit items-center rounded-full border border-border/60 bg-muted/15 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {selectedSkuCountLabel}
            </p>
          </div>

          <MeasuredTileGrid
            items={filteredSkus}
            renderGrid={({ columnCount, gridRef }) => (
              <div
                ref={gridRef}
                className="grid gap-3"
                data-testid="linked-sku-grid"
                style={{
                  gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                }}
              >
                {filteredSkus.map((sku) => (
                  <ServiceSkuGridTile
                    key={sku.skuId}
                    checked={selectedSkuIds.includes(sku.skuId)}
                    description={sku.description || undefined}
                    imagePath={sku.imagePath}
                    label={sku.name}
                    skuId={sku.skuId}
                    onCheckedChange={(checked) =>
                      setSelectedSkuIds((current) =>
                        checked
                          ? [...new Set([...current, sku.skuId])]
                          : current.filter((entry) => entry !== sku.skuId),
                      )
                    }
                  />
                ))}
                {catalog?.skus.length ? null : (
                  <p className="col-span-full rounded-[1.25rem] border border-dashed border-border/70 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                    Add at least one SKU before linking services.
                  </p>
                )}
                {catalog?.skus.length && filteredSkus.length === 0 ? (
                  <p className="col-span-full rounded-[1.25rem] border border-dashed border-border/70 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                    {t('serviceEditorLinkedSkusNoMatches')}
                  </p>
                ) : null}
              </div>
            )}
            renderMeasureItem={(sku) => (
              <ServiceSkuGridTile
                key={`${sku.skuId}-measure`}
                checked={selectedSkuIds.includes(sku.skuId)}
                className="w-max max-w-none"
                description={sku.description || undefined}
                label={sku.name}
                measure
                skuId={sku.skuId}
                onCheckedChange={() => {}}
              />
            )}
          />
        </WorkspacePanel>
      </form>
    </WorkspacePage>
  );
}

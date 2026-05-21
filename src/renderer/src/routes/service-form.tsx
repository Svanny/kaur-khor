import { ActionArchiveIcon, ActionCloseIcon, ActionConfirmIcon, ActionSaveIcon } from '@icons/actions';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SenaService } from '@shared/sena';
import { SearchInput } from '@/components/system/search-input';
import { ItemAvatar } from '@/components/system/item-identity';
import { MeasuredTileGrid } from '@/components/system/measured-tile-grid';
import { ProductAttributesField } from '@/components/system/product-attributes-field';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CurrencyNumberInput } from '@/components/ui/currency-number-input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { displayMoneyFromUsd, formatCurrency, parseEditableNumberWithCommas, usdMoneyFromDisplay } from '@/lib/format';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { buildServiceDetailHref } from '@/lib/navigation-state';
import {
  archiveSenaService,
  createServiceAttributeVariants,
  createUniqueServiceId,
  emptySenaCatalog,
  linkedSkuIdsForService,
  nextCatalogCopyName,
  upsertSenaService,
} from '@/lib/sena-catalog';
import {
  emptyProductAttributeDraft,
  MAX_PRODUCT_ATTRIBUTE_VARIANTS,
  mergeCustomProductAttributePresets,
  mergedProductAttributePresets,
  productAttributeCombinationCount,
  productAttributeCombinations,
  productAttributeDraftDirtyKey,
  readCustomProductAttributePresets,
  writeCustomProductAttributePresets,
} from '@/lib/product-attributes';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { buildKaurKhorNavigationState, useNavigationHistory } from '@/state/navigation-history';
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

function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
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

function serviceSkuPricingSummary(
  sku: { costPerUnit: number; productPrice: number | null; soldAsProduct: boolean },
  options: {
    currency: 'USD' | 'KHR';
    language: 'en' | 'km';
    usdToKhrExchangeRate: number;
  },
) {
  const customerPrice =
    sku.soldAsProduct && sku.productPrice != null
      ? formatCurrency(sku.productPrice, options.currency, options.language, options.usdToKhrExchangeRate)
      : translateUiLiteral(options.language, 'n/a');

  return [
    `${translateUiLiteral(options.language, 'Supplier cost per unit')}: ${formatCurrency(sku.costPerUnit, options.currency, options.language, options.usdToKhrExchangeRate)}`,
    `${translateUiLiteral(options.language, 'Customer selling price')}: ${customerPrice}`,
  ].join(' · ');
}

function ServiceSkuGridTile({
  checked,
  className,
  description,
  imagePath,
  label,
  measure = false,
  pricingSummary,
  skuId,
  onCheckedChange,
}: {
  checked: boolean;
  className?: string;
  description?: string;
  imagePath?: string | null;
  label: string;
  measure?: boolean;
  pricingSummary: string;
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
        <div className="truncate text-muted-foreground">{pricingSummary}</div>
      </div>
    </div>
  );
}

function ServiceFormLoadingState({ title }: { title: string }) {
  return (
    <WorkspacePage className="pb-32 md:pb-36">
      <DetailHeroWireframe actionCount={1} badgeCount={0} showBody={false} title={title} />

      <div className="grid gap-6">
        <WorkspacePanel
          className={editorPanelClassName}
          helperExemptReason="loading skeleton panel has no visible business label"
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
          helperExemptReason="loading skeleton panel has no visible business label"
          title={<Skeleton className="h-7 w-40 rounded-full" />}
        >
          <Skeleton className="h-14 rounded-xl md:max-w-[24rem]" />
        </WorkspacePanel>

        <WorkspacePanel
          className={editorPanelClassName}
          helperExemptReason="loading skeleton panel has no visible business label"
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
  const { currency, language, t, usdToKhrExchangeRate } = usePreferences();
  const [form, setForm] = useState<SenaService>(() => emptyService(serviceId));
  const [servicePriceDraft, setServicePriceDraft] = useState('');
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [saveErrorFlashKey, setSaveErrorFlashKey] = useState(0);
  const [selectedSkuIds, setSelectedSkuIds] = useState<string[]>([]);
  const [localSavedService, setLocalSavedService] = useState<SenaService | null>(null);
  const [localSavedSkuIds, setLocalSavedSkuIds] = useState<string[]>([]);
  const [linkedSkuForkDialogOpen, setLinkedSkuForkDialogOpen] = useState(false);
  const [linkedSkuForkServiceName, setLinkedSkuForkServiceName] = useState('');
  const [linkedSkuForkArchiveCurrent, setLinkedSkuForkArchiveCurrent] = useState(false);
  const [skuSearch, setSkuSearch] = useState('');
  const [attributeDraft, setAttributeDraft] = useState(emptyProductAttributeDraft);
  const [customAttributePresets, setCustomAttributePresets] = useState(() => readCustomProductAttributePresets());
  const deferredSkuSearch = useDeferredValue(skuSearch);
  const previousMoneyFormatRef = useRef({ currency, usdToKhrExchangeRate });
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
      setAttributeDraft(emptyProductAttributeDraft());
    } else if (!editing) {
      setLocalSavedService(null);
      setLocalSavedSkuIds([]);
      setForm(emptyService(''));
      setServicePriceDraft('');
      setSelectedSkuIds([]);
      setAttributeDraft(emptyProductAttributeDraft());
    }
  }, [editing, existingService?.serviceId]);

  useEffect(() => {
    const previousMoneyFormat = previousMoneyFormatRef.current;
    if (
      previousMoneyFormat.currency === currency &&
      previousMoneyFormat.usdToKhrExchangeRate === usdToKhrExchangeRate
    ) {
      return;
    }

    const previousServicePriceDraft = moneyDraftFromUsd(
      form.price,
      previousMoneyFormat.currency,
      previousMoneyFormat.usdToKhrExchangeRate,
    );
    if (servicePriceDraft === previousServicePriceDraft) {
      setServicePriceDraft(moneyDraftFromUsd(form.price, currency, usdToKhrExchangeRate));
    }
    previousMoneyFormatRef.current = { currency, usdToKhrExchangeRate };
  }, [currency, form.price, servicePriceDraft, usdToKhrExchangeRate]);

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
  const attributePresets = useMemo(
    () => mergedProductAttributePresets(customAttributePresets),
    [customAttributePresets],
  );
  const attributeCombinations = useMemo(
    () => productAttributeCombinations(attributeDraft),
    [attributeDraft],
  );
  const attributeCombinationCount = useMemo(
    () => productAttributeCombinationCount(attributeDraft),
    [attributeDraft],
  );
  const hasUnsavedServiceChanges =
    JSON.stringify(draftDirtySnapshot) !== JSON.stringify(baselineDirtySnapshot) ||
    servicePriceDraft !== baselineServicePriceDraft ||
    JSON.stringify([...selectedSkuIds].sort()) !== JSON.stringify([...localSavedSkuIds].sort()) ||
    productAttributeDraftDirtyKey(attributeDraft) !== productAttributeDraftDirtyKey(emptyProductAttributeDraft());
  const linkedSkuSelectionChanged = editing && !sameStringSet(selectedSkuIds, localSavedSkuIds);
  const linkedSkuForkArchiveServiceName =
    normalizedBaseline.name.trim() || translateUiLiteral(language, 'this service');
  const serviceValidationErrors = {
    name: !form.name.trim() ? t('catalogServiceEditorNameRequired') : null,
    price: !servicePriceDraft.trim()
      ? t('catalogServiceEditorPriceRequired')
      : parsedServicePriceDraft == null
        ? translateUiLiteral(language, 'Enter a non-negative finite service price before saving.')
        : null,
    attributes: attributeCombinationCount > MAX_PRODUCT_ATTRIBUTE_VARIANTS
      ? translateUiLiteral(language, 'Choose 100 or fewer variants before saving.')
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
    setAttributeDraft(emptyProductAttributeDraft());
    setSaveAttempted(false);
    setSaveErrorFlashKey(0);
    setLinkedSkuForkDialogOpen(false);
    setLinkedSkuForkServiceName('');
    setLinkedSkuForkArchiveCurrent(false);
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
      setSaveErrorFlashKey((current) => current + 1);
      return false;
    }
    if (linkedSkuSelectionChanged) {
      const baseCatalog = catalog ?? emptySenaCatalog();
      setLinkedSkuForkServiceName((current) =>
        current.trim()
          ? current
          : nextCatalogCopyName(baseCatalog.services.map((service) => service.name), normalizedDraft.name),
      );
      setLinkedSkuForkArchiveCurrent(false);
      setLinkedSkuForkDialogOpen(true);
      return false;
    }
    const baseCatalog = catalog ?? emptySenaCatalog();
    const nextService = editing
      ? { ...normalizedDraft, serviceId: normalizedBaseline.serviceId }
      : { ...normalizedDraft, serviceId: createUniqueServiceId(baseCatalog) };
    const catalogWithBase = upsertSenaService(baseCatalog, nextService, selectedSkuIds, normalizedBaseline.serviceId);
    const nextCatalog = createServiceAttributeVariants(
      catalogWithBase,
      nextService,
      selectedSkuIds,
      attributeCombinations,
    );
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
    const nextCustomPresets = mergeCustomProductAttributePresets(customAttributePresets, attributeDraft);
    writeCustomProductAttributePresets(nextCustomPresets);
    setCustomAttributePresets(readCustomProductAttributePresets());
    setAttributeDraft(emptyProductAttributeDraft());
    setSaveAttempted(false);
    setSaveErrorFlashKey(0);
    afterSave?.();
    if (!navigateAfterSave) {
      return true;
    }
    await navigateToServiceDetail(nextService.serviceId);
    return true;
  }

  async function navigateToServiceDetail(nextServiceId: string) {
    const detailNavigationState = buildKaurKhorNavigationState(location, '/catalog');
    const currentOrigin =
      location.state &&
      typeof location.state === 'object' &&
      'kaurKhorNavigationOrigin' in location.state &&
      typeof location.state.kaurKhorNavigationOrigin === 'string'
        ? location.state.kaurKhorNavigationOrigin
        : null;
    await navigate(buildServiceDetailHref(nextServiceId), {
      replace: true,
      state: {
        ...detailNavigationState,
        kaurKhorNavigationOrigin: currentOrigin ?? previousLocation ?? '/catalog',
      },
    });
  }

  async function createLinkedSkuFork() {
    setSaveAttempted(true);
    if (hasServiceValidationErrors) {
      setSaveErrorFlashKey((current) => current + 1);
      return false;
    }
    const forkName = linkedSkuForkServiceName.trim();
    if (!forkName) {
      setSaveErrorFlashKey((current) => current + 1);
      return false;
    }

    const baseCatalog = catalog ?? emptySenaCatalog();
    const nextService = {
      ...normalizedDraft,
      archived: false,
      name: forkName,
      serviceId: createUniqueServiceId(baseCatalog),
    };
    const catalogWithFork = upsertSenaService(baseCatalog, nextService, selectedSkuIds);
    const catalogWithVariants = createServiceAttributeVariants(
      catalogWithFork,
      nextService,
      selectedSkuIds,
      attributeCombinations,
    );
    const nextCatalog = linkedSkuForkArchiveCurrent
      ? archiveSenaService(catalogWithVariants, normalizedBaseline.serviceId)
      : catalogWithVariants;

    await upsertSenaCatalog(nextCatalog);
    setLocalSavedService(nextService);
    setLocalSavedSkuIds(selectedSkuIds);
    setForm(nextService);
    setServicePriceDraft(moneyDraftFromUsd(nextService.price, currency, usdToKhrExchangeRate));
    const nextCustomPresets = mergeCustomProductAttributePresets(customAttributePresets, attributeDraft);
    writeCustomProductAttributePresets(nextCustomPresets);
    setCustomAttributePresets(readCustomProductAttributePresets());
    setAttributeDraft(emptyProductAttributeDraft());
    setSaveAttempted(false);
    setSaveErrorFlashKey(0);
    setLinkedSkuForkDialogOpen(false);
    setLinkedSkuForkArchiveCurrent(false);
    await navigateToServiceDetail(nextService.serviceId);
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
    <WorkspacePage className="pb-32 md:pb-36">
      {discardConfirmDialog}
      {linkedSkuForkDialogOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4 py-6"
          role="presentation"
          onClick={() => {
            if (!isSaving) {
              setLinkedSkuForkDialogOpen(false);
            }
          }}
        >
          <div
            aria-modal="true"
            className="w-full max-w-lg rounded-[1.75rem] border border-border/70 bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
            role="dialog"
            aria-labelledby="service-linked-sku-fork-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grid gap-2">
              <p id="service-linked-sku-fork-title" className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                {translateUiLiteral(language, 'Create a new service for linked SKU changes')}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                {translateUiLiteral(language, 'Changing linked SKUs must create a new service. Linked SKUs define how this service consumes stock. Keep the current service for history, then create a new service with the updated linked SKUs.')}
              </p>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="linked-sku-fork-service-name">
                  {translateUiLiteral(language, 'New service name')}
                </Label>
                <input
                  className={editorInputClassName}
                  id="linked-sku-fork-service-name"
                  value={linkedSkuForkServiceName}
                  onChange={(event) => setLinkedSkuForkServiceName(event.target.value)}
                />
                {saveAttempted && !linkedSkuForkServiceName.trim() ? (
                  <p className="text-sm text-destructive">
                    {translateUiLiteral(language, 'Enter a name for the new service.')}
                  </p>
                ) : null}
              </div>
              <div className="flex items-start gap-3 rounded-[1.25rem] border border-border/70 bg-muted/20 px-4 py-4">
                <Checkbox
                  checked={linkedSkuForkArchiveCurrent}
                  aria-labelledby="linked-sku-fork-archive-label"
                  className="mt-0.5 size-5 rounded-[6px]"
                  id="linked-sku-fork-archive-current"
                  onCheckedChange={(checked) => setLinkedSkuForkArchiveCurrent(checked === true)}
                />
                <div className="grid gap-1">
                  <Label
                    className="flex items-center gap-2"
                    id="linked-sku-fork-archive-label"
                    htmlFor="linked-sku-fork-archive-current"
                  >
                    <ActionArchiveIcon aria-hidden="true" className="size-4 shrink-0" />
                    {translateUiLiteral(language, 'Archive {name}', { name: linkedSkuForkArchiveServiceName })}
                  </Label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {translateUiLiteral(language, 'Leave unchecked to keep {name} active alongside the new service.', { name: linkedSkuForkArchiveServiceName })}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                disabled={isSaving}
                type="button"
                variant="ghost"
                onClick={() => setLinkedSkuForkDialogOpen(false)}
              >
                <ActionCloseIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'Cancel')}
              </Button>
              <Button
                disabled={isSaving || !linkedSkuForkServiceName.trim()}
                type="button"
                onClick={() => void createLinkedSkuFork()}
              >
                <ActionConfirmIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'Create new service')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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
            errorFlashKey={saveErrorFlashKey}
            helper={t('catalogServiceEditorNameHelper')}
            helpHref="/settings/help#catalog-service-editor-details"
            label={t('fieldName')}
            tooltip={t('catalogServiceEditorDetailsTooltip')}
          >
            <input
              autoFocus
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
            helper="Choose, drop, or paste one PNG, JPEG, or WebP picture for this service. Kaur Khor will show it on supported item surfaces."
            imagePath={form.imagePath}
            label="Picture"
            name={form.name || 'Service image'}
            type="service"
            onChange={(value) => setForm((current) => ({ ...current, imagePath: value }))}
          />
        </WorkspacePanel>

        <WorkspacePanel
          className={editorPanelClassName}
          descriptor={translateUiLiteral(language, 'Create active variants from selected attributes when saving this service.')}
          title={<SectionTitle helpHref="/settings/help#catalog-product-attributes" title={translateUiLiteral(language, 'Attributes')} tooltip={translateUiLiteral(language, 'Generate service variants without copying logs, observations, or captures.')} />}
        >
          <ProductAttributesField
            draft={attributeDraft}
            language={language}
            presets={attributePresets}
            onChange={setAttributeDraft}
          />
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
                    pricingSummary={serviceSkuPricingSummary(sku, { currency, language, usdToKhrExchangeRate })}
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
                pricingSummary={serviceSkuPricingSummary(sku, { currency, language, usdToKhrExchangeRate })}
                skuId={sku.skuId}
                onCheckedChange={() => {}}
              />
            )}
          />
        </WorkspacePanel>

        <WorkspacePanel
          className={editorPanelClassName}
          descriptor={t('catalogServiceEditorPricingDescriptor')}
          title={<SectionTitle helpHref="/settings/help#catalog-service-editor-pricing" title={t('editorPricingTitle')} tooltip={t('catalogServiceEditorPricingTooltip')} />}
        >
          <EditorField
            error={visibleServiceValidationErrors.price ?? undefined}
            errorFlashKey={saveErrorFlashKey}
            helper={t('catalogServiceEditorPriceHelper')}
            helpHref="/settings/help#catalog-service-editor-pricing"
            label={t('fieldServiceSellingPrice')}
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
                const parsedServicePrice = parseNonNegativeMoneyDraft(nextValue, currency, usdToKhrExchangeRate);
                if (parsedServicePrice == null) {
                  return;
                }
                setForm((current) => ({
                  ...current,
                  price: parsedServicePrice,
                }));
              }}
            />
          </EditorField>
        </WorkspacePanel>
      </form>
    </WorkspacePage>
  );
}

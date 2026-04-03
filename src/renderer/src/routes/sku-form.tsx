import { ChevronDown, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SenaLeadTimeVariabilityClass, SenaSku } from '@shared/sena';
import {
  classifyLeadTimeVariability,
  compatibilityStdDaysForClass,
  impliedLeadTimeRangeFromMeanStd,
  leadTimeVariabilityDescription,
  leadTimeVariabilityLabel,
  leadTimeVariabilityOptions,
  relativeLeadTimeWidth,
} from '@shared/sena-lead-time';
import { CheckboxRow } from '@/components/system/checkbox-row';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { emptySenaCatalog, upsertSenaSku } from '@/lib/sena-catalog';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { EditorField, editorInputClassName, editorPanelClassName, editorTextareaClassName } from './editor-form-primitives';
import { SkuPageHero } from './sku-page-hero';
import { SectionLabel, SectionTitle } from './sku-detail/section-heading';

function emptySku(skuId = ''): SenaSku {
  return {
    skuId,
    name: '',
    description: '',
    costPerUnit: 0,
    soldAsProduct: false,
    productPrice: null,
    leadTimeMeanDaysHint: null,
    leadTimeStdDaysHint: null,
  };
}

const nativeSelectClassName =
  'h-14 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-12 text-base shadow-none outline-none';

function parseOptionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

function deriveCatalogVariabilityClass(sku: SenaSku): SenaLeadTimeVariabilityClass | null {
  if (sku.leadTimeMeanDaysHint == null || sku.leadTimeStdDaysHint == null) {
    return null;
  }
  const range = impliedLeadTimeRangeFromMeanStd(sku.leadTimeMeanDaysHint, sku.leadTimeStdDaysHint);
  return classifyLeadTimeVariability(relativeLeadTimeWidth(range?.lowDays ?? null, range?.highDays ?? null));
}

export function SkuFormRoute() {
  const navigate = useNavigate();
  const { skuId } = useParams();
  const { catalog, isSaving, upsertSenaCatalog } = useInventory();
  const { t } = usePreferences();
  const [form, setForm] = useState<SenaSku>(() => emptySku(skuId));
  const [leadTimeVariability, setLeadTimeVariability] = useState<SenaLeadTimeVariabilityClass | ''>('');
  const editing = Boolean(skuId);
  const formId = 'sku-editor-form';

  useEffect(() => {
    const existing = catalog?.skus.find((entry) => entry.skuId === skuId);
    if (existing) {
      setForm(existing);
      setLeadTimeVariability(deriveCatalogVariabilityClass(existing) ?? '');
    } else if (!editing) {
      setForm(emptySku(''));
      setLeadTimeVariability('');
    }
  }, [catalog, editing, skuId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const baseCatalog = catalog ?? emptySenaCatalog();
    const normalized = {
      ...form,
      skuId: form.skuId.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      leadTimeStdDaysHint: compatibilityStdDaysForClass(form.leadTimeMeanDaysHint, leadTimeVariability || null),
    };
    const nextCatalog = upsertSenaSku(baseCatalog, normalized);
    await upsertSenaCatalog(nextCatalog);
    await navigate(`/catalog/skus/${normalized.skuId}`);
  }

  return (
    <WorkspacePage>
      <SkuPageHero
        actions={
          <WorkspaceActionRow>
            <Button disabled={isSaving} form={formId} type="submit">
              <Save data-icon="inline-start" />
              {editing ? t('saveDraft') : t('createEntry')}
            </Button>
          </WorkspaceActionRow>
        }
        title={editing ? t('catalogSkuEditorTitleEdit') : t('catalogSkuEditorTitleNew')}
      />

      <form
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
        id={formId}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="grid min-w-0 gap-6">
          <WorkspacePanel
            className={editorPanelClassName}
            description={editing ? t('catalogSkuEditorIdentifierDescription') : t('catalogSkuEditorDescriptionNew')}
            title={
              <SectionTitle
                title={t('editorDetailsTitle')}
                tooltip={t('catalogSkuEditorDetailsTooltip')}
              />
            }
          >
            <div className="grid items-start gap-4 md:grid-cols-2">
              <EditorField
                hint={editing ? t('catalogSkuEditorIdentifierDescription') : undefined}
                label={t('fieldId')}
                tooltip={t('catalogSkuEditorDetailsTooltip')}
              >
                <input
                  className={editorInputClassName}
                  disabled={editing}
                  required
                  value={form.skuId}
                  onChange={(event) => setForm((current) => ({ ...current, skuId: event.target.value }))}
                />
              </EditorField>
              <EditorField label={t('fieldName')}>
                <input
                  className={editorInputClassName}
                  required
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </EditorField>
            </div>

            <EditorField label={t('fieldDescription')}>
              <textarea
                className={editorTextareaClassName}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </EditorField>
          </WorkspacePanel>

          <WorkspacePanel
            className={editorPanelClassName}
            title={<SectionTitle title={t('editorPricingTitle')} tooltip={t('catalogSkuEditorPricingTooltip')} />}
          >
            <div className="grid items-start gap-4 md:grid-cols-2">
              <EditorField label={t('fieldCostPerUnit')}>
                <input
                  className={editorInputClassName}
                  min="0"
                  required
                  step="0.01"
                  type="number"
                  value={form.costPerUnit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, costPerUnit: Number(event.target.value) }))
                  }
                />
              </EditorField>

              <EditorField label={t('fieldProductPrice')} tooltip={t('catalogSkuEditorRetailPriceTooltip')}>
                <input
                  className={editorInputClassName}
                  disabled={!form.soldAsProduct}
                  min="0"
                  step="0.01"
                  type="number"
                  value={form.productPrice ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      productPrice: parseOptionalNumber(event.target.value),
                    }))
                  }
                />
              </EditorField>
            </div>

            <CheckboxRow
              checked={form.soldAsProduct}
              label={
                <SectionLabel tooltip={t('catalogSkuEditorSellAsProductTooltip')}>
                  {t('fieldSoldAsProduct')}
                </SectionLabel>
              }
              onCheckedChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  soldAsProduct: checked,
                  productPrice: checked ? current.productPrice : null,
                }))
              }
            />
          </WorkspacePanel>
        </div>

        <WorkspacePanel
          className={editorPanelClassName}
          description={t('catalogSkuPlanningInputsDescription')}
          title={<SectionTitle title={t('catalogSkuPlanningInputsTitle')} tooltip={t('catalogSkuEditorPlanningTooltip')} />}
        >
          <EditorField label={t('fieldLeadTimeMeanDays')} tooltip={t('catalogSkuEditorLeadTimeMeanTooltip')}>
            <input
              className={editorInputClassName}
              min="0"
              step="0.1"
              type="number"
              value={form.leadTimeMeanDaysHint ?? ''}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  leadTimeMeanDaysHint: parseOptionalNumber(event.target.value),
                }))
              }
            />
          </EditorField>

          <EditorField
            hint={
              leadTimeVariability
                ? leadTimeVariabilityDescription(leadTimeVariability)
                : t('catalogSkuEditorLeadTimeVariabilityHint')
            }
            label={t('fieldLeadTimeVariability')}
            tooltip={t('catalogSkuEditorLeadTimeVariabilityTooltip')}
          >
            <div className="relative">
              <select
                aria-label={t('fieldLeadTimeVariability')}
                className={nativeSelectClassName}
                value={leadTimeVariability}
                onChange={(event) =>
                  setLeadTimeVariability((event.target.value as SenaLeadTimeVariabilityClass | '') || '')
                }
              >
                <option value="">{t('catalogSkuLeadTimeVariabilityPlaceholder')}</option>
                {leadTimeVariabilityOptions().map((option) => (
                  <option key={option} value={option}>
                    {leadTimeVariabilityLabel(option)}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-foreground">
                <ChevronDown className="size-5" />
              </span>
            </div>
          </EditorField>
        </WorkspacePanel>
      </form>
    </WorkspacePage>
  );
}

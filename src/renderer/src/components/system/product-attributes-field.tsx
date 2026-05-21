import { ActionAddBadgeIcon, ActionDeleteIcon, ActionEditIcon } from '@icons/actions';
import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import type { ProductAttributeDraft, ProductAttributeDraftRow, ProductAttributePreset } from '@/lib/catalog/product-attributes';
import { MAX_PRODUCT_ATTRIBUTE_VARIANTS, productAttributeCombinationCount, sanitizeProductAttributeOptions } from '@/lib/catalog/product-attributes';
import { translateUiLiteral } from '@/lib/localization/translations';
import { cn } from '@/lib/utils';

type ProductAttributesFieldProps = {
  draft: ProductAttributeDraft;
  language: 'en' | 'km';
  presets: ProductAttributePreset[];
  onChange: (draft: ProductAttributeDraft) => void;
};

function mergeOptions(options: string[], nextOption: string) {
  return sanitizeProductAttributeOptions([...options, nextOption]);
}

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

const maxOptionNameLength = 32;
const customAttributePresetValue = '__custom_attribute__';
const hiddenAttributePresetNames = new Set(['flavor', 'pack size', 'pack-size', 'material', 'service type']);

function presetOptionHint(preset: ProductAttributePreset, language: 'en' | 'km') {
  return preset.options.slice(0, 3).map((option) => translateUiLiteral(language, option)).join(', ');
}

export function ProductAttributesField({ draft, language, presets, onChange }: ProductAttributesFieldProps) {
  const visiblePresets = useMemo(
    () => presets.filter((preset) => !hiddenAttributePresetNames.has(normalizeKey(preset.name))),
    [presets],
  );
  const [selectedPresetName, setSelectedPresetName] = useState(visiblePresets[0]?.name ?? '');
  const [addPresetFlashKey, setAddPresetFlashKey] = useState(0);
  const selectedPreset = selectedPresetName === customAttributePresetValue
    ? null
    : visiblePresets.find((preset) => preset.name === selectedPresetName) ?? visiblePresets[0] ?? null;
  const variantCount = useMemo(() => productAttributeCombinationCount(draft), [draft]);
  const statusTone = variantCount > 0 ? 'success' : draft.rows.length > 0 ? 'warning' : 'danger';
  const variantLimitExceeded = variantCount > MAX_PRODUCT_ATTRIBUTE_VARIANTS;

  function updateRow(index: number, updater: (row: ProductAttributeDraftRow) => ProductAttributeDraftRow) {
    onChange({
      ...draft,
      rows: draft.rows.map((row, rowIndex) => (rowIndex === index ? updater(row) : row)),
    });
  }

  function addPreset() {
    if (selectedPresetName === customAttributePresetValue) {
      addCustomAttribute();
      return;
    }

    const preset = visiblePresets.find((entry) => entry.name === selectedPresetName) ?? visiblePresets[0];
    if (!preset) {
      return;
    }

    const existingIndex = draft.rows.findIndex((row) => normalizeKey(row.name) === normalizeKey(preset.name));
    if (existingIndex >= 0) {
      updateRow(existingIndex, (row) => ({
        ...row,
        options: mergeOptions([...row.options, ...preset.options], ''),
      }));
      return;
    }

    onChange({
      ...draft,
      enabled: true,
      rows: [...draft.rows, { name: preset.name, options: [...preset.options], selectedOptions: [] }],
    });
  }

  function addCustomAttribute() {
    onChange({
      ...draft,
      enabled: true,
      rows: [...draft.rows, { name: '', options: [], selectedOptions: [] }],
    });
  }

  return (
    <div className="grid gap-4">
      <label className="flex items-start gap-3 rounded-[1.25rem] border border-border/70 bg-muted/15 px-4 py-4 text-sm">
        <Checkbox
          checked={draft.enabled}
          className="mt-0.5 size-5 rounded-[6px]"
          onCheckedChange={(checked) => onChange({ ...draft, enabled: checked === true })}
        />
        <span className="grid gap-1">
          <span className="font-medium text-foreground">{translateUiLiteral(language, 'Enable attributes')}</span>
          <span className="text-muted-foreground">
            {translateUiLiteral(language, 'Choose attributes and options to create variant copies when saving.')}
          </span>
        </span>
      </label>

      {draft.enabled ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-[14rem] flex-1 gap-2 text-sm md:max-w-sm">
              <span className="font-medium text-foreground">{translateUiLiteral(language, 'Attribute preset')}</span>
              <Select
                value={selectedPresetName}
                onValueChange={(value) => {
                  setSelectedPresetName(value);
                  setAddPresetFlashKey((current) => current + 1);
                }}
              >
                <SelectTrigger
                  aria-label={translateUiLiteral(language, 'Attribute preset')}
                  className="h-12 w-full rounded-xl border-border bg-background px-3 text-sm shadow-none data-[size=default]:h-12"
                >
                  {selectedPreset
                    ? `${translateUiLiteral(language, selectedPreset.name)} (${translateUiLiteral(language, 'e.g.')} ${presetOptionHint(selectedPreset, language)})`
                    : translateUiLiteral(language, 'Add custom attribute')}
                </SelectTrigger>
                <SelectContent align="start" className="max-w-[min(32rem,calc(100vw-2rem))]">
                  {visiblePresets.map((preset) => (
                    <SelectItem
                      key={preset.name}
                      className="pr-56"
                      textValue={`${translateUiLiteral(language, preset.name)} ${presetOptionHint(preset, language)}`}
                      trailing={
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          ({translateUiLiteral(language, 'e.g.')} {presetOptionHint(preset, language)})
                        </span>
                      }
                      value={preset.name}
                    >
                      <span className="font-medium">{translateUiLiteral(language, preset.name)}</span>
                    </SelectItem>
                  ))}
                  <SelectItem
                    className="pr-56"
                    textValue={translateUiLiteral(language, 'Add custom attribute')}
                    value={customAttributePresetValue}
                  >
                    <span className="font-medium">{translateUiLiteral(language, 'Add custom attribute')}</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
            <Button className="relative mb-1.5 self-end overflow-hidden rounded-xl" type="button" variant="outline" onClick={addPreset}>
              {addPresetFlashKey > 0 ? (
                <span
                  key={addPresetFlashKey}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[#cfe6a4] [opacity:var(--kaur-khor-attention-progress,0)] [will-change:opacity] motion-safe:animate-[kaur-khor-attention-flash_1800ms_ease-in-out_1] motion-reduce:opacity-100"
                />
              ) : null}
              <ActionAddBadgeIcon className="relative" data-icon="inline-start" />
              <span className="relative">{translateUiLiteral(language, 'Add selected attribute')}</span>
            </Button>
          </div>

          <div className="h-px bg-border/70" />

          {draft.rows.length ? (
            <div className="divide-y divide-border/70">
              {draft.rows.map((row, rowIndex) => (
                <ProductAttributeRow
                  key={rowIndex}
                  language={language}
                  row={row}
                  onRemove={() => onChange({ ...draft, rows: draft.rows.filter((_, index) => index !== rowIndex) })}
                  onUpdate={(updater) => updateRow(rowIndex, updater)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
              {translateUiLiteral(language, 'Add an attribute to start generating variants.')}
            </div>
          )}

          <div
            className={cn(
              'inline-flex w-fit rounded-full border px-4 py-2 text-sm',
              statusTone === 'success' && (variantLimitExceeded ? 'border-destructive/35 bg-destructive/8 text-destructive' : 'border-emerald-300 bg-emerald-50 text-emerald-800'),
              statusTone === 'warning' && 'border-amber-300 bg-amber-50 text-amber-800',
              statusTone === 'danger' && 'border-destructive/35 bg-destructive/8 text-destructive',
            )}
          >
            {variantLimitExceeded
              ? translateUiLiteral(language, 'Choose {count} or fewer variants before saving.').replace('{count}', String(MAX_PRODUCT_ATTRIBUTE_VARIANTS))
              : variantCount > 0
              ? translateUiLiteral(language, variantCount === 1 ? '{count} variant will be created' : '{count} variants will be created').replace('{count}', String(variantCount))
              : draft.rows.length > 0
                ? translateUiLiteral(language, 'No variants will be created until at least one option is selected.')
                : translateUiLiteral(language, 'No attributes selected yet.')}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ProductAttributeRow({
  language,
  row,
  onRemove,
  onUpdate,
}: {
  language: 'en' | 'km';
  row: ProductAttributeDraftRow;
  onRemove: () => void;
  onUpdate: (updater: (row: ProductAttributeDraftRow) => ProductAttributeDraftRow) => void;
}) {
  const [editingOptionIndex, setEditingOptionIndex] = useState<number | null>(null);

  function toggleOption(option: string, checked: boolean) {
    if (!option.trim()) {
      return;
    }
    onUpdate((current) => ({
      ...current,
      selectedOptions: checked
        ? mergeOptions(current.selectedOptions, option)
        : current.selectedOptions.filter((entry) => normalizeKey(entry) !== normalizeKey(option)),
    }));
  }

  function addOptionPill() {
    const nextIndex = row.options.length;
    onUpdate((current) => ({
      ...current,
      options: [...current.options, ''],
    }));
    setEditingOptionIndex(nextIndex);
  }

  function updateOption(index: number, value: string) {
    const nextValue = value.slice(0, maxOptionNameLength);
    onUpdate((current) => {
      const previousOption = current.options[index] ?? '';
      return {
        ...current,
        options: current.options.map((option, optionIndex) => (optionIndex === index ? nextValue : option)),
        selectedOptions: current.selectedOptions.map((option) =>
          normalizeKey(option) === normalizeKey(previousOption) ? nextValue : option,
        ),
      };
    });
  }

  function commitOption(index: number) {
    const option = row.options[index]?.trim() ?? '';
    if (!option) {
      onUpdate((current) => ({
        ...current,
        options: current.options.filter((_, optionIndex) => optionIndex !== index),
        selectedOptions: current.selectedOptions.filter((entry) => entry.trim()),
      }));
    } else {
      onUpdate((current) => ({
        ...current,
        options: current.options.map((entry, optionIndex) => (optionIndex === index ? option : entry)),
        selectedOptions: current.selectedOptions.map((entry) =>
          normalizeKey(entry) === normalizeKey(row.options[index] ?? '') ? option : entry,
        ),
      }));
    }
    setEditingOptionIndex(null);
  }

  return (
    <div className="grid gap-4 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-[14rem] flex-1 gap-2 text-sm">
          <span className="font-medium text-foreground">{translateUiLiteral(language, 'Attribute name')}</span>
          <input
            className="h-12 rounded-xl border border-border bg-background px-3"
            value={row.name}
            onChange={(event) => onUpdate((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <Button className="mb-1.5 self-end rounded-xl" type="button" variant="destructive-outline" onClick={onRemove}>
          <ActionDeleteIcon data-icon="inline-start" />
          {translateUiLiteral(language, 'Remove attribute')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {row.options.map((option, optionIndex) => {
          const checked = row.selectedOptions.some((entry) => normalizeKey(entry) === normalizeKey(option));
          const isEditing = editingOptionIndex === optionIndex;
          const label = option.trim() ? translateUiLiteral(language, option) : translateUiLiteral(language, 'Enter option name');
          return (
            <div
              key={optionIndex}
              className={cn(
                'inline-flex min-h-10 w-fit max-w-full items-center gap-2 rounded-full border px-3 text-sm transition-colors',
                checked ? 'border-primary/55 bg-primary/10 text-foreground' : 'border-border/70 bg-background text-muted-foreground',
              )}
            >
              <Checkbox
                checked={checked}
                aria-label={`${translateUiLiteral(language, 'Select option')} ${label}`}
                onCheckedChange={(nextChecked) => toggleOption(option, nextChecked === true)}
              />
              {isEditing ? (
                <input
                  autoFocus
                  aria-label={translateUiLiteral(language, 'Option name')}
                  className="min-w-[20ch] max-w-[34ch] flex-1 bg-transparent font-medium leading-5 text-foreground outline-none"
                  maxLength={maxOptionNameLength}
                  placeholder={translateUiLiteral(language, 'Enter option name')}
                  style={{ width: `${Math.min(maxOptionNameLength + 2, Math.max(20, option.length + 1))}ch` }}
                  value={option}
                  onBlur={() => commitOption(optionIndex)}
                  onChange={(event) => updateOption(optionIndex, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setEditingOptionIndex(null);
                    }
                  }}
                />
              ) : (
                <button
                  className="inline-flex max-w-[34ch] items-center gap-1.5 truncate font-medium leading-5 text-left"
                  type="button"
                  onClick={() => setEditingOptionIndex(optionIndex)}
                >
                  <ActionEditIcon aria-hidden="true" className="size-3.5 shrink-0" />
                  {label}
                </button>
              )}
              <button
                className="grid size-6 place-items-center rounded-full text-destructive hover:bg-destructive/10"
                type="button"
                aria-label={`${translateUiLiteral(language, 'Remove option')} ${label}`}
                onClick={() =>
                  onUpdate((current) => ({
                    ...current,
                    options: current.options.filter((entry) => normalizeKey(entry) !== normalizeKey(option)),
                    selectedOptions: current.selectedOptions.filter((entry) => normalizeKey(entry) !== normalizeKey(option)),
                  }))
                }
              >
                <ActionDeleteIcon className="size-3.5" />
              </button>
            </div>
          );
        })}
        <Button
          className="h-10 rounded-full px-3"
          type="button"
          variant="outline"
          onMouseDown={(event) => event.preventDefault()}
          onClick={addOptionPill}
        >
          <ActionAddBadgeIcon data-icon="inline-start" />
          {translateUiLiteral(language, 'Add option')}
        </Button>
      </div>
    </div>
  );
}

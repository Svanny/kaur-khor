import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SenaCatalog, SenaService, SenaSku } from '@shared/sena';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ItemIdentityBlock } from '@/components/system/item-identity';
import {
  supplierNameForSku,
  supplierNamesFromCatalog,
  type SupplierFilterValue,
} from '@/lib/sena-catalog';
import { cn } from '@/lib/utils';

export const noSupplierFilterValue = '__no_supplier__';
const customSupplierValue = '__custom_supplier__';
const noSupplierFieldValue = '__no_supplier_field__';

export function supplierFilterValueForQuery(value: string | null | undefined): SupplierFilterValue {
  if (!value || value === 'all') {
    return 'all';
  }
  return value === noSupplierFilterValue ? 'none' : value;
}

export function supplierFilterQueryValue(value: SupplierFilterValue | null | undefined) {
  if (!value || value === 'all') {
    return null;
  }
  return value === 'none' ? noSupplierFilterValue : value;
}

export function SupplierBadge({
  className,
  showEmpty = false,
  supplierName,
}: {
  className?: string;
  showEmpty?: boolean;
  supplierName: string | null | undefined;
}) {
  const normalizedSupplierName = supplierName?.trim() ?? '';
  if (!normalizedSupplierName && !showEmpty) {
    return null;
  }

  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-md border border-border/70 bg-muted/45 px-2 py-0.5 text-xs font-medium text-muted-foreground',
        className,
      )}
    >
      {normalizedSupplierName || 'No supplier'}
    </span>
  );
}

export function SupplierField({
  catalog,
  className,
  inputClassName,
  label = 'Supplier',
  placeholder = 'Choose your supplier...',
  value,
  onChange,
}: {
  catalog: SenaCatalog | null | undefined;
  className?: string;
  inputClassName?: string;
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const supplierNames = supplierNamesFromCatalog(catalog);
  const normalizedValue = value.trim();
  const isExistingSupplier = supplierNames.includes(normalizedValue);
  const isCustomSupplier = Boolean(normalizedValue) && !isExistingSupplier;
  const [customMode, setCustomMode] = useState(isCustomSupplier);
  const [customDraft, setCustomDraft] = useState(isCustomSupplier ? value : '');
  const selectValue = useMemo(() => {
    if (customMode || isCustomSupplier) {
      return customSupplierValue;
    }
    if (isExistingSupplier) {
      return normalizedValue;
    }
    return undefined;
  }, [customMode, isCustomSupplier, isExistingSupplier, normalizedValue]);

  useEffect(() => {
    if (isCustomSupplier) {
      setCustomMode(true);
      setCustomDraft(value);
      return;
    }
    if ((isExistingSupplier || !normalizedValue) && !customMode) {
      setCustomMode(false);
      setCustomDraft('');
    }
  }, [customMode, isCustomSupplier, isExistingSupplier, normalizedValue, value]);

  return (
    <div className={cn('grid gap-3', className)}>
      <Select
        value={selectValue}
        onValueChange={(nextValue) => {
          if (nextValue === customSupplierValue) {
            setCustomMode(true);
            const nextDraft = isCustomSupplier ? value : '';
            setCustomDraft(nextDraft);
            if (!isCustomSupplier) {
              onChange(nextDraft);
            }
            return;
          }
          if (nextValue === noSupplierFieldValue) {
            setCustomMode(false);
            setCustomDraft('');
            onChange('');
            return;
          }
          setCustomMode(false);
          setCustomDraft('');
          onChange(nextValue);
        }}
      >
        <SelectTrigger aria-label={label} className={cn(inputClassName, 'justify-between data-[size=default]:h-14')}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {supplierNames.map((supplierName) => (
            <SelectItem key={supplierName} value={supplierName}>
              {supplierName}
            </SelectItem>
          ))}
          <SelectItem value={customSupplierValue}>Custom supplier</SelectItem>
          <SelectItem value={noSupplierFieldValue}>No supplier</SelectItem>
        </SelectContent>
      </Select>
      {customMode ? (
        <input
          aria-label="Custom supplier"
          autoFocus
          className={inputClassName}
          placeholder="Write supplier name"
          value={customDraft}
          onChange={(event) => {
            setCustomDraft(event.target.value);
            onChange(event.target.value);
          }}
        />
      ) : null}
    </div>
  );
}

export function SupplierFilter({
  catalog,
  className,
  label = 'Filter by supplier',
  value,
  onChange,
}: {
  catalog: SenaCatalog | null | undefined;
  className?: string;
  label?: string;
  value: SupplierFilterValue;
  onChange: (value: SupplierFilterValue) => void;
}) {
  const supplierNames = supplierNamesFromCatalog(catalog);

  return (
    <Select value={supplierFilterQueryValue(value) ?? 'all'} onValueChange={(nextValue) => onChange(supplierFilterValueForQuery(nextValue))}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          'min-w-[12rem] justify-between border border-border/70 bg-background/80 text-sm font-medium text-foreground shadow-xs [&_svg]:opacity-100',
          className,
        )}
      >
        <SelectValue placeholder="All suppliers" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All suppliers</SelectItem>
        {supplierNames.map((supplierName) => (
          <SelectItem key={supplierName} value={supplierName}>
            {supplierName}
          </SelectItem>
        ))}
        <SelectItem value={noSupplierFilterValue}>No supplier</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function SkuIdentityCell({
  align = 'center',
  children,
  className,
  secondary,
  showEmptySupplier = false,
  sku,
  skuName,
}: {
  align?: 'start' | 'center';
  children?: ReactNode;
  className?: string;
  secondary?: ReactNode;
  showEmptySupplier?: boolean;
  sku?: SenaSku | null;
  skuName?: string;
}) {
  return (
    <ItemIdentityBlock
      align={align}
      className={className}
      imagePath={sku?.imagePath}
      metadata={<SupplierBadge showEmpty={showEmptySupplier} supplierName={supplierNameForSku(sku)} />}
      name={sku?.name ?? skuName ?? ''}
      secondary={secondary}
      size="compact"
      type="sku"
    >
      {children}
    </ItemIdentityBlock>
  );
}

export function ServiceIdentityCell({
  align = 'center',
  children,
  className,
  secondary,
  service,
  serviceName,
}: {
  align?: 'start' | 'center';
  children?: ReactNode;
  className?: string;
  secondary?: ReactNode;
  service?: SenaService | null;
  serviceName?: string;
}) {
  return (
    <ItemIdentityBlock
      align={align}
      className={className}
      imagePath={service?.imagePath}
      name={service?.name ?? serviceName ?? ''}
      secondary={secondary}
      size="compact"
      type="service"
    >
      {children}
    </ItemIdentityBlock>
  );
}

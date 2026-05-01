import { getRegimeIcon } from '@icons/domain';
import type { AppLanguage } from '@shared/inventory';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { translateRegimeLabel } from '@/lib/localized-display';
import { regimeChartFill, regimeTintedSurfaceClassName } from '@/lib/state-tones';
import { cn } from '@/lib/utils';

export type RegimeGlyphMode = 'icon' | 'initials' | 'hidden';

export function regimeGlyphMode(slotWidth: number): RegimeGlyphMode {
  if (slotWidth >= 56) {
    return 'icon';
  }
  if (slotWidth >= 34) {
    return 'initials';
  }
  return 'hidden';
}

export function regimeInitials(regime: string, language: AppLanguage = 'en') {
  const normalized = regime.trim().toLowerCase();
  if (language === 'km') {
    if (normalized.includes('stockout')) {
      return 'អស់';
    }
    if (normalized.includes('promo')) {
      return 'ប្រូ';
    }
    if (normalized.includes('spike')) {
      return 'កើន';
    }
    if (normalized.includes('lull')) {
      return 'ស្ង';
    }
    if (normalized.includes('correction')) {
      return 'កែ';
    }
    return 'ធម្ម';
  }
  if (normalized.includes('stockout')) {
    return 'SC';
  }
  if (normalized.includes('promo')) {
    return 'P';
  }
  if (normalized.includes('spike')) {
    return 'S';
  }
  if (normalized.includes('lull')) {
    return 'L';
  }
  if (normalized.includes('correction')) {
    return 'C';
  }
  return 'N';
}

function RegimeGlyph({
  language,
  mode,
  regime,
}: {
  language: AppLanguage;
  mode: RegimeGlyphMode;
  regime: string;
}) {
  if (mode === 'hidden') {
    return null;
  }

  if (mode === 'initials') {
    return (
      <span className="text-[0.62rem] font-semibold tracking-[0.02em] text-foreground/80">
        {regimeInitials(regime, language)}
      </span>
    );
  }

  const Icon = getRegimeIcon(regime);
  return <Icon className="size-4 text-foreground/75" />;
}

export function DetailRegimeLegendItem({
  language,
  regime,
}: {
  language: AppLanguage;
  regime: string;
}) {
  return (
    <span
      key={regime}
      className="inline-flex items-center gap-2"
      data-regime-legend-item="true"
      data-regime={regime}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-4 items-center justify-center rounded-full border',
          regimeTintedSurfaceClassName(regime),
        )}
      >
        <RegimeGlyph language={language} mode="icon" regime={regime} />
      </span>
      {translateRegimeLabel(language, regime)}
    </span>
  );
}

export function DetailRegimeOverlay({
  activeIndex,
  axisContentWidth,
  axisEndPadding,
  axisStartPadding,
  cellClassName,
  intervals,
  language,
  onSelect,
  slotWidth,
}: {
  activeIndex: number | null;
  axisContentWidth: number;
  axisEndPadding: number;
  axisStartPadding: number;
  cellClassName?: string;
  intervals: Array<{ dominantRegime: string; intervalIndex: number }>;
  language: AppLanguage;
  onSelect: (index: number) => void;
  slotWidth: number;
}) {
  const glyphMode = regimeGlyphMode(slotWidth);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 grid overflow-hidden rounded-[1rem]"
      style={{
        width: axisContentWidth,
        paddingLeft: axisStartPadding,
        paddingRight: axisEndPadding,
        gridTemplateColumns: `repeat(${Math.max(intervals.length, 1)}, minmax(0, 1fr))`,
      }}
    >
      {intervals.map((interval, intervalPosition) => {
        const isSelected = activeIndex === interval.intervalIndex;
        const regimeLabel = translateRegimeLabel(language, interval.dominantRegime);

        return (
          <Tooltip key={interval.intervalIndex}>
            <TooltipTrigger asChild>
              <button
                aria-label={regimeLabel}
                className={cn(
                  'relative flex items-start justify-center border-r border-background/35 px-1 text-center text-xs text-foreground transition-colors last:border-r-0',
                  isSelected ? '' : 'text-foreground/80',
                  cellClassName,
                )}
                data-regime-slot="true"
                data-regime-glyph-mode={glyphMode}
                data-selected={isSelected ? 'true' : 'false'}
                style={{
                  backgroundColor: regimeChartFill(interval.dominantRegime, isSelected ? 'strong' : 'muted'),
                  borderTopLeftRadius: intervalPosition === 0 ? '0.85rem' : undefined,
                  borderBottomLeftRadius: intervalPosition === 0 ? '0.85rem' : undefined,
                  borderTopRightRadius: intervalPosition === intervals.length - 1 ? '0.85rem' : undefined,
                  borderBottomRightRadius: intervalPosition === intervals.length - 1 ? '0.85rem' : undefined,
                }}
                type="button"
                onClick={() => onSelect(interval.intervalIndex)}
              >
                <span aria-hidden="true" className="mt-2 inline-flex min-h-4 items-center justify-center">
                  <RegimeGlyph language={language} mode={glyphMode} regime={interval.dominantRegime} />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>{regimeLabel}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

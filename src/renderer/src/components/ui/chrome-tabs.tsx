import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

const CHROME_TABS_GEOMETRY_STYLE = {
  '--chrome-tabs-leading-inset': '1px',
  '--chrome-tabs-trailing-inset': '1px',
  '--chrome-tabs-bottom-bar-height': '0px',
  '--chrome-tabs-surface-overlap': '1px',
  '--chrome-tabs-hover-fill': '#f6f2ee',
  '--chrome-tabs-active-fill': '#ffffff',
  '--chrome-tabs-divider-color': '#a9adb0',
  '--chrome-tabs-border-stroke': 'color-mix(in oklch, var(--border) 84%, white 16%)',
} as React.CSSProperties;

type ChromeTabsContextValue = {
  value: string | undefined;
};

const ChromeTabsContext = React.createContext<ChromeTabsContextValue>({ value: undefined });

type ChromeTabsListContextValue = {
  activeIndex: number;
  count: number;
};

const ChromeTabsListContext = React.createContext<ChromeTabsListContextValue>({
  activeIndex: -1,
  count: 0,
});

function ChromeTabBackground({
  className,
  fill = 'none',
  stroke,
  strokeWidth,
}: {
  className?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  const geometryId = React.useId();

  return (
    <span aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <svg className="size-full" preserveAspectRatio="none" viewBox="0 0 100 36">
        <defs>
          <symbol id={geometryId} viewBox="0 0 214 36">
            <path d="M17 0h197v36H0v-2c4.5 0 9-3.5 9-8V8c0-4.5 3.5-8 8-8z" />
          </symbol>
        </defs>

        <svg height="100%" preserveAspectRatio="none" width="52%">
          <use
            className={className}
            fill={fill}
            height="36"
            href={`#${geometryId}`}
            shapeRendering="geometricPrecision"
            stroke={stroke}
            strokeWidth={strokeWidth}
            vectorEffect={stroke ? 'non-scaling-stroke' : undefined}
            width="214"
          />
        </svg>

        <g transform="scale(-1 1)">
          <svg height="100%" preserveAspectRatio="none" width="52%" x="-100%" y="0">
            <use
              className={className}
              fill={fill}
              height="36"
              href={`#${geometryId}`}
              shapeRendering="geometricPrecision"
              stroke={stroke}
              strokeWidth={strokeWidth}
              vectorEffect={stroke ? 'non-scaling-stroke' : undefined}
              width="214"
            />
          </svg>
        </g>
      </svg>
    </span>
  );
}

function ChromeTabs({
  className,
  defaultValue,
  onValueChange,
  orientation = 'horizontal',
  style,
  value,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const currentValue = value ?? internalValue;

  return (
    <ChromeTabsContext.Provider value={{ value: currentValue }}>
      <TabsPrimitive.Root
        data-orientation={orientation}
        data-slot="chrome-tabs"
        orientation={orientation}
        value={value}
        defaultValue={defaultValue}
        className={cn('group/chrome-tabs flex flex-col gap-0', className)}
        style={{
          ...CHROME_TABS_GEOMETRY_STYLE,
          ...style,
        }}
        onValueChange={(nextValue) => {
          if (value === undefined) {
            setInternalValue(nextValue);
          }
          onValueChange?.(nextValue);
        }}
        {...props}
      />
    </ChromeTabsContext.Provider>
  );
}

function ChromeTabsList({
  children,
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const { value } = React.useContext(ChromeTabsContext);
  const items = React.Children.toArray(children).filter(
    (child): child is React.ReactElement<ChromeTabsTriggerProps> =>
      React.isValidElement<ChromeTabsTriggerProps>(child),
  );
  const activeIndex = items.findIndex((child) => child.props.value === value);

  const enhancedChildren = items.map((child, index) =>
    React.cloneElement(child, {
      chromeTabCount: items.length,
      chromeTabIndex: index,
    }),
  );

  return (
    <ChromeTabsListContext.Provider value={{ activeIndex, count: items.length }}>
      <TabsPrimitive.List
        data-slot="chrome-tabs-list"
        className={cn(
          'relative inline-flex min-h-11 w-fit min-w-full items-end gap-0 overflow-visible bg-transparent pt-2',
          className,
        )}
        style={{
          paddingInlineStart: 'var(--chrome-tabs-leading-inset)',
          paddingInlineEnd: 'var(--chrome-tabs-trailing-inset)',
        }}
        {...props}
      >
        {enhancedChildren}
        <span
          aria-hidden="true"
          data-slot="chrome-tabs-bottom-bar"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
          style={{
            height: 'var(--chrome-tabs-bottom-bar-height)',
            backgroundColor: 'var(--chrome-tabs-active-fill)',
          }}
        />
      </TabsPrimitive.List>
    </ChromeTabsListContext.Provider>
  );
}

type ChromeTabsTriggerProps = React.ComponentProps<typeof TabsPrimitive.Trigger> & {
  leading?: React.ReactNode;
  chromeTabCount?: number;
  chromeTabIndex?: number;
};

function ChromeTabsTrigger({
  children,
  className,
  chromeTabCount = 0,
  chromeTabIndex = 0,
  leading,
  value,
  ...props
}: ChromeTabsTriggerProps) {
  const { activeIndex } = React.useContext(ChromeTabsListContext);
  const isBeforeActive = chromeTabIndex === activeIndex - 1;
  const hideTrailingDivider =
    chromeTabIndex === chromeTabCount - 1 || chromeTabIndex === activeIndex || isBeforeActive;

  return (
    <TabsPrimitive.Trigger
      data-hide-trailing-divider={hideTrailingDivider ? 'true' : 'false'}
      data-slot="chrome-tabs-trigger"
      value={value}
      className={cn(
        'group/chrome-tab relative flex h-9 shrink-0 items-stretch border-0 bg-transparent px-0 text-[#5f6368] outline-none transition-[color,filter]',
        'hover:text-foreground focus-visible:z-20 focus-visible:rounded-t-[10px] focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'data-[state=active]:z-[5] data-[state=active]:text-[#45474a]',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute bottom-[7px] top-[7px] right-0 w-px translate-x-1/2 bg-[#a9adb0] transition-opacity',
          'group-data-[hide-trailing-divider=true]/chrome-tab:opacity-0',
        )}
        style={{
          backgroundColor: 'var(--chrome-tabs-divider-color)',
        }}
      />

      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 group-data-[state=active]/chrome-tab:opacity-0',
          'group-hover/chrome-tab:opacity-100',
        )}
      >
        <ChromeTabBackground fill="var(--chrome-tabs-hover-fill)" />
      </span>

      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150',
          'group-data-[state=active]/chrome-tab:opacity-100',
        )}
      >
        <ChromeTabBackground fill="var(--chrome-tabs-active-fill)" />
      </span>

      <span
        aria-hidden="true"
        data-slot="chrome-tabs-seam"
        className="pointer-events-none absolute inset-x-[10px] z-[1]"
        style={{
          bottom: 'calc(var(--chrome-tabs-surface-overlap) * -1)',
          height: 'var(--chrome-tabs-surface-overlap)',
        }}
      >
        <span
          className={cn(
            'absolute inset-0 opacity-0 transition-opacity duration-150 group-data-[state=active]/chrome-tab:opacity-0',
            'group-hover/chrome-tab:opacity-100',
          )}
          style={{
            backgroundColor: 'var(--chrome-tabs-hover-fill)',
          }}
        />
        <span
          className={cn(
            'absolute inset-0 opacity-0 transition-opacity duration-150',
            'group-data-[state=active]/chrome-tab:opacity-100',
          )}
          style={{
            backgroundColor: 'var(--chrome-tabs-active-fill)',
          }}
        />
      </span>

      <span
        aria-hidden="true"
        data-slot="chrome-tabs-border"
        className={cn(
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150',
          'group-data-[state=active]/chrome-tab:opacity-100',
        )}
        style={{
          clipPath: 'inset(0 0 2px 0)',
        }}
      >
        <ChromeTabBackground fill="none" stroke="var(--chrome-tabs-border-stroke)" strokeWidth={0.75} />
      </span>

      <span
        className={cn(
          'relative z-[11] flex min-w-0 items-center gap-2 rounded-t-[8px] px-8 py-[9px]',
          leading ? 'pl-8 pr-8' : '',
        )}
      >
        {leading ? <span className="shrink-0">{leading}</span> : null}
        <span className="truncate whitespace-nowrap">{children}</span>
      </span>
    </TabsPrimitive.Trigger>
  );
}

export { ChromeTabs, ChromeTabsList, ChromeTabsTrigger };

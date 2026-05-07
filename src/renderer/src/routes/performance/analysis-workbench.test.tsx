import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { AppLanguage } from '@shared/inventory';
import type { SenaCatalog, SenaDiagnostics, SenaObservationRecord, SenaServiceDetail, SenaSkuDetail, SenaWorkspaceSummary } from '@shared/sena';
import { getTranslation } from '@/lib/translations';
import { AnalysisWorkbench } from './analysis-workbench';
import { deriveAnalysisViewModel } from './analysis-view-model';

const preferenceState: {
  currency: string;
  language: AppLanguage;
  showFloatingTitleActions: boolean;
  showRightRailCards: boolean;
  t: (key: string, variables?: Record<string, string | number | null | undefined>) => string;
} = {
  currency: 'USD',
  language: 'en',
  showFloatingTitleActions: false,
  showRightRailCards: false,
  t: (key: string, variables?: Record<string, string | number | null | undefined>) =>
    getTranslation(preferenceState.language, key as never, variables),
};

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferenceState,
}));

const catalog: SenaCatalog = {
  schemaVersion: 1,
  bundles: [],
  services: [
    {
      archived: false,
      bundle: false,
      description: 'Signature haircut',
      name: 'Haircut',
      price: 18,
      serviceId: 'service-haircut',
    },
  ],
  sharingMask: [{ enabled: true, serviceId: 'service-haircut', skuId: 'sku-razor', usageProbability: 1 }],
  skus: [
    {
      archived: false,
      costPerUnit: 6,
      description: 'Refill cartridge',
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
      name: 'Razor Refill',
      productPrice: 18,
      skuId: 'sku-razor',
      soldAsProduct: true,
    },
  ],
};

const workspaceSummary: SenaWorkspaceSummary = {
  highRiskSkuIds: ['sku-razor'],
  intervalCount: 2,
  latestObservedAt: '2026-04-03T08:00:00.000Z',
  ownerSub: 'desktop-owner',
  pendingReorderCount: 1,
  runId: 'run-1',
  serviceCount: 1,
  skuCount: 1,
  skuSummaries: [
    {
      credibleIntervalHigh: 13,
      credibleIntervalLow: 9,
      daysOfCover: 3,
      demandPerDayMean: 4,
      expectedLeadTimeDemand: 12,
      latestPosteriorUnits: 11,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1.5,
      reorderPoint: 14,
      reorderTriggerProbability: 0.68,
      reorderQuantity: {
        recommendedUnits: 14.2,
        ungatedRecommendedUnits: 14.2,
        likelyRangeLow: 10,
        likelyRangeHigh: 18,
        needProbability: 0.78,
        recommendationIssued: true,
        recommendationQuantile: 0.7,
        intervalLowQuantile: 0.1,
        intervalHighQuantile: 0.9,
        needProbabilityGate: 0.5,
        reviewDelayDays: 0,
      },
      regimeProbabilities: { normal: 0.35, promo: 0.65 },
      safetyStock: 4,
      skuId: 'sku-razor',
      stockoutRisk: 0.54,
    },
  ],
  topRegime: 'promo',
};

const diagnostics: SenaDiagnostics = {
  changePointProbability: 0.22,
  coverageEstimate: 0.89,
  effectiveSampleSizeMean: 84,
  posteriorPredictiveErrorMean: 0.18,
  regimeHistory: [
    {
      dominantRegime: 'normal',
      endAt: '2026-03-05T08:00:00.000Z',
      intervalIndex: 0,
      regimeProbabilities: { normal: 0.7, promo: 0.3 },
      startAt: '2026-02-20T08:00:00.000Z',
    },
    {
      dominantRegime: 'promo',
      endAt: '2026-04-03T08:00:00.000Z',
      intervalIndex: 1,
      regimeProbabilities: { normal: 0.25, promo: 0.75 },
      startAt: '2026-03-06T08:00:00.000Z',
    },
  ],
  resamplingCount: 8,
  seasonalityActive: false,
  smoothingEnabled: true,
};

const observations: SenaObservationRecord[] = [
  {
    input: {
      leadTimeHints: [],
      notes: 'Demand softened after a price move.',
      observedAt: '2026-03-01T08:00:00.000Z',
      orderSignals: [{ approximateOrderQuantity: 10, approximateReceiptQuantity: null, orderPlaced: true, receiptArrived: false, skuId: 'sku-razor' }],
      retailPrices: [{ price: 17, skuId: 'sku-razor' }],
      retailRankings: ['sku-razor'],
      servicePrices: [],
      serviceRankings: ['service-haircut'],
      serviceStockouts: [],
      stockSnapshot: [],
      retailStockouts: [],
    },
    observationId: 'obs-1',
    ownerSub: 'desktop-owner',
  },
];

const serviceDetailsById: Record<string, SenaServiceDetail | null> = {
  'service-haircut': {
    activityIntervalHigh: 8,
    activityIntervalLow: 6,
    activityMean: 7,
    bottleneckProbability: 0.65,
    contributors: [{ bottleneckProbability: 0.65, skuId: 'sku-razor', usageProbability: 1 }],
    regimeTimeline: [],
    serviceId: 'service-haircut',
  },
};

const skuDetailsById: Record<string, SenaSkuDetail | null> = {
  'sku-razor': {
    demandPosterior: [
      {
        adjustmentsMean: -1,
        deltaDays: 14,
        endAt: '2026-03-05T08:00:00.000Z',
        intervalIndex: 0,
        realizedConsumptionMean: 3,
        receiptsMean: 0,
        retailDemandMean: 1,
        serviceDemandMean: 2,
        startAt: '2026-02-20T08:00:00.000Z',
        unconstrainedDemandMean: 3,
      },
      {
        adjustmentsMean: 1,
        deltaDays: 28,
        endAt: '2026-04-03T08:00:00.000Z',
        intervalIndex: 1,
        realizedConsumptionMean: 4,
        receiptsMean: 8,
        retailDemandMean: 1,
        serviceDemandMean: 3,
        startAt: '2026-03-06T08:00:00.000Z',
        unconstrainedDemandMean: 4,
      },
    ],
    inventoryPosterior: [
      { at: '2026-03-05T08:00:00.000Z', high: 14, low: 10, mean: 12 },
      { at: '2026-04-03T08:00:00.000Z', high: 13, low: 9, mean: 11 },
    ],
    leadTimePosterior: [
      {
        intervalIndex: 0,
        logMeanDays: 1.5,
        logStdDays: 0.2,
        meanDays: 5,
        observedRelativeWidth: 0.2,
        observedVariabilityClass: 'tight',
        stdDays: 1,
      },
      {
        intervalIndex: 1,
        logMeanDays: 1.6,
        logStdDays: 0.28,
        meanDays: 6,
        observedRelativeWidth: 0.3,
        observedVariabilityClass: 'wide',
        stdDays: 2,
      },
    ],
    pipelinePosterior: [
      {
        ageDaysMean: 3,
        inTransitMean: 6,
        intervalIndex: 0,
        orderProbability: 0.74,
        orderQuantityMean: 10,
        receiptQuantityMean: 0,
      },
      {
        ageDaysMean: 5,
        inTransitMean: 9,
        intervalIndex: 1,
        orderProbability: 0.86,
        orderQuantityMean: 9,
        receiptQuantityMean: 8,
      },
    ],
    summary: workspaceSummary.skuSummaries[0],
  },
};

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}

    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return 720;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 320;
    },
  });
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      bottom: 320,
      height: 320,
      left: 0,
      right: 720,
      toJSON() {
        return {};
      },
      top: 0,
      width: 720,
      x: 0,
      y: 0,
    } as DOMRect;
  };
});

afterEach(() => {
  preferenceState.showFloatingTitleActions = false;
  preferenceState.language = 'en';
  preferenceState.t = (key: string, variables?: Record<string, string | number | null | undefined>) =>
    getTranslation(preferenceState.language, key as never, variables);
});

function buildModel() {
  return deriveAnalysisViewModel({
    catalog,
    currency: 'USD',
    diagnostics,
    language: 'en',
    observations,
    scope: 'all',
    serviceDetailsById,
    skuDetailsById,
    workspaceSummary,
  });
}

describe('AnalysisWorkbench', () => {
  test('keeps the analysis nav collapsed inside the Work-style tab rail so fragility stays reachable', async () => {
    const user = userEvent.setup();
    const model = buildModel();

    const setSection = vi.fn();
    render(<AnalysisWorkbench model={model} section="workbench" setSection={setSection} showRightRailCards={false} />);

    expect(screen.getByRole('tab', { name: 'Blockers' })).toBeInTheDocument();

    const tabList = screen.getByRole('tablist', { name: 'Select Explain view' });
    expect(tabList).toHaveClass('min-w-0');
    expect(tabList).toHaveAttribute('data-presentation-mode');
    expect(tabList.parentElement).toHaveClass('overflow-hidden');

    await user.click(screen.getByRole('tab', { name: 'Blockers' }));

    expect(setSection).toHaveBeenCalledWith('fragility');
  });

  test('keeps the Observations tab visible when saved observations exist but evidence rows are empty', async () => {
    const model = {
      ...buildModel(),
      evidenceRows: [],
      observationCount: 1,
    };
    const setSection = vi.fn();

    render(<AnalysisWorkbench model={model} section="pressure" setSection={setSection} showRightRailCards={false} />);

    expect(screen.getByRole('tab', { name: 'Main view' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Risks' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: 'Observations' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Blockers' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Parameters' })).toBeInTheDocument();

    await screen.findByText('Risk explorer');
    expect(setSection).not.toHaveBeenCalled();
  });

  test('hides only the Observations tab when no observations exist', async () => {
    const model = {
      ...buildModel(),
      evidenceRows: [],
      observationCount: 0,
    };
    const setSection = vi.fn();

    render(<AnalysisWorkbench model={model} section="pressure" setSection={setSection} showRightRailCards={false} />);

    expect(screen.getByRole('tab', { name: 'Main view' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Risks' })).toHaveAttribute('data-state', 'active');
    expect(screen.queryByRole('tab', { name: 'Observations' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Blockers' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Parameters' })).toBeInTheDocument();

    await screen.findByText('Risk explorer');
    expect(setSection).not.toHaveBeenCalled();
  });

  test('falls back from a requested empty Observations tab to Main view', async () => {
    const model = {
      ...buildModel(),
      evidenceRows: [],
      observationCount: 0,
    };
    const setSection = vi.fn();

    render(
      <AnalysisWorkbench
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={model}
        section="observations"
        setSection={setSection}
        showRightRailCards={false}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Main view' })).toHaveAttribute('data-state', 'active');
    expect(screen.queryByRole('tab', { name: 'Observations' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'System timeline' })).toBeInTheDocument();
    await waitFor(() => expect(setSection).toHaveBeenCalledWith('workbench'));
  });

  test('does not mount the inspector rail on the observations tab', () => {
    render(<AnalysisWorkbench model={buildModel()} section="observations" setSection={vi.fn()} showRightRailCards />);

    expect(screen.getByText('Saved updates')).toBeInTheDocument();
    expect(document.querySelector('[data-analysis-inspector="true"]')).toBeNull();
  });

  test('renders observation rows as non-interactive records', () => {
    render(<AnalysisWorkbench model={buildModel()} section="observations" setSection={vi.fn()} showRightRailCards={false} />);

    expect(screen.queryByRole('button', { name: /latest observation/i })).toBeNull();
  });

test('shows reorder policy in the selected SKU inspector', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AnalysisWorkbench model={buildModel()} section="pressure" setSection={vi.fn()} showRightRailCards />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Razor Refill/i }));

    expect(screen.getAllByText('Order suggestion').length).toBeGreaterThan(0);
    expect(screen.getAllByText('15 units').length).toBeGreaterThan(0);
    expect(screen.getAllByText('10-18 units').length).toBeGreaterThan(0);
    expect(screen.getAllByText('78%').length).toBeGreaterThan(0);

    const protectionHorizon = screen
      .getAllByText('ETA + 0d review delay')
      .find((node) => node.className.includes('[overflow-wrap:anywhere]'));
    expect(protectionHorizon).toBeTruthy();
    expect(protectionHorizon).toHaveClass('min-w-0', 'break-words', 'text-right');
  });

  test('keeps risk pill colors stable in Khmer mode', () => {
    preferenceState.language = 'km';

    const model = deriveAnalysisViewModel({
      catalog,
      currency: 'USD',
      diagnostics,
      language: 'km',
      observations,
      scope: 'all',
      serviceDetailsById,
      skuDetailsById,
      workspaceSummary,
    });

    render(
      <MemoryRouter>
        <AnalysisWorkbench model={model} section="pressure" setSection={vi.fn()} showRightRailCards={false} />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('ខ្ពស់').find((node) => node.className.includes('text-rose-800'))).toBeTruthy();
    expect(screen.getAllByText('ទាប').find((node) => node.className.includes('text-sky-700'))).toBeTruthy();
    expect(screen.getAllByText('មធ្យម').find((node) => node.className.includes('text-amber-800'))).toBeTruthy();
  });

  test('renders Explain navigation in Khmer without English leaks', () => {
    preferenceState.language = 'km';
    const model = deriveAnalysisViewModel({
      catalog,
      currency: 'USD',
      diagnostics,
      language: 'km',
      observations,
      scope: 'all',
      serviceDetailsById,
      skuDetailsById,
      workspaceSummary,
    });

    render(
      <MemoryRouter>
        <AnalysisWorkbench model={model} section="pressure" setSection={vi.fn()} showRightRailCards={false} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('tablist', { name: 'ជ្រើសទិដ្ឋភាពការពន្យល់' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'ហានិភ័យ' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'ភស្តុតាង' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'ចំណុចរារាំង' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'ប៉ារ៉ាម៉ែត្រ' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Risks' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Blockers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Parameters' })).not.toBeInTheDocument();
  });

  test('does not mount the inspector rail on the fragility tab', () => {
    render(<AnalysisWorkbench model={buildModel()} section="fragility" setSection={vi.fn()} showRightRailCards />);

    expect(screen.getByText('Service blocker map')).toBeInTheDocument();
    expect(document.querySelector('[data-analysis-inspector="true"]')).toBeNull();
    expect(document.querySelector('[data-slot="fragility-map-scroll-viewport"]')).not.toBeNull();
  });

  test('shows help tooltips for each analysis setting field', () => {
    render(<AnalysisWorkbench model={buildModel()} section="settings" setSection={vi.fn()} showRightRailCards={false} />);

    expect(screen.getByRole('button', { name: 'Run ID help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Latest observed help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Observations used help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Intervals in view help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Smoothing help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Evidence strength help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prediction gap help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coverage level help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scope help' })).toBeInTheDocument();
  });

  test('renders the shared chart viewport without making the mainview window scroll internally', () => {
    const { container } = render(
      <AnalysisWorkbench
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    expect(screen.getByRole('heading', { name: 'System timeline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1D' })).toBeInTheDocument();
    expect(screen.getByTestId('insights-board-section')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('insights-board-section')).not.toHaveClass('overflow-y-auto');
  });

  test('bounds the workbench chart board when the right rail is visible', () => {
    render(
      <AnalysisWorkbench
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards
      />,
    );

    const board = screen.getByTestId('insights-board-section');
    const root = board.closest('[data-analysis-workbench-root="true"]');
    const analysisWindow = document.querySelector('[data-analysis-window="true"]');
    const breathingRoom = document.querySelector('[data-analysis-bottom-breathing-room="true"]');
    const nav = document.querySelector('[data-analysis-nav="true"]');
    const rail = document.querySelector('[data-analysis-inspector="true"]');
    const firstRailSection = rail?.querySelector('section');
    const innerShell = document.querySelector('.analysis-panel-shell');
    expect(root).toHaveClass('flex-1', 'flex-col', 'shrink-0');
    expect(root).not.toHaveClass('h-full', 'min-h-0');
    expect(analysisWindow).toHaveClass('shrink-0');
    expect(analysisWindow).not.toHaveClass('h-full');
    expect(breathingRoom).toHaveClass('h-32', 'shrink-0', 'md:h-36');
    expect(nav).toHaveClass('overflow-hidden');
    expect(board).toHaveClass('flex-1', 'overflow-hidden');
    expect(board).toHaveClass('!border-white/70');
    expect(innerShell).toHaveClass('!border-transparent', '!shadow-none', '!rounded-none');
    expect(board.firstElementChild).toHaveClass('flex-1', 'items-stretch', 'h-full', 'min-h-0');
    expect(rail).toHaveClass('h-full', 'min-h-0', 'overflow-y-auto');
    expect(rail).toHaveClass('lg:[background:linear-gradient(to_bottom,#fff_0,#fff_8px,hsl(var(--secondary)/0.15)_8px)]');
    expect(firstRailSection).toHaveClass('first-of-type:border-t-0');
    expect(rail).not.toHaveClass('min-h-full');
  });

  test('lets non-chart explain sections fill available height and grow when needed', () => {
    render(
      <AnalysisWorkbench
        model={buildModel()}
        section="pressure"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    const board = screen.getByTestId('insights-board-section');
    const root = board.closest('[data-analysis-workbench-root="true"]');
    const analysisWindow = document.querySelector('[data-analysis-window="true"]');
    const breathingRoom = document.querySelector('[data-analysis-bottom-breathing-room="true"]');
    const tabs = board.closest('[data-slot="chrome-tabs"]');
    const surface = document.querySelector('[data-analysis-surface="true"]');
    const surfaceContent = document.querySelector('[data-analysis-surface-content="true"]');
    const nav = document.querySelector('[data-analysis-nav="true"]');
    expect(board).toHaveClass('flex-1', 'overflow-hidden');
    expect(board.firstElementChild).toHaveClass('min-h-full', 'flex-1', 'items-stretch');
    expect(nav).toHaveClass('overflow-hidden');
    expect(board).not.toHaveClass('overflow-y-auto');
    expect(root).toHaveClass('flex-1', 'flex-col');
    expect(root).toHaveClass('shrink-0');
    expect(root).not.toHaveClass('h-full', 'min-h-full', 'mb-32', 'md:mb-36');
    expect(analysisWindow).toHaveClass('shrink-0');
    expect(breathingRoom).toHaveClass('h-32', 'shrink-0', 'md:h-36');
    expect(tabs).toHaveClass('flex-1');
    expect(tabs).not.toHaveClass('pb-32', 'md:pb-36');
    expect(surface).toHaveClass('flex-1');
    expect(surfaceContent).toHaveClass('min-h-full');
  });

  test('keeps non-chart sections natural height with right-rail bottom breathing room', () => {
    render(
      <MemoryRouter>
        <AnalysisWorkbench
          model={buildModel()}
          section="pressure"
          setSection={vi.fn()}
          showRightRailCards
        />
      </MemoryRouter>,
    );

    const board = screen.getByTestId('insights-board-section');
    const root = board.closest('[data-analysis-workbench-root="true"]');
    const analysisWindow = document.querySelector('[data-analysis-window="true"]');
    const breathingRoom = document.querySelector('[data-analysis-bottom-breathing-room="true"]');
    const tabs = board.closest('[data-slot="chrome-tabs"]');
    const surface = document.querySelector('[data-analysis-surface="true"]');
    const surfaceContent = document.querySelector('[data-analysis-surface-content="true"]');
    const rail = document.querySelector('[data-analysis-inspector="true"]');
    const firstRailSection = rail?.querySelector('section');
    const measurements = document.querySelector('[data-analysis-inspector-measurements="true"]');
    expect(board).toHaveClass('flex-1', 'overflow-hidden');
    expect(board.firstElementChild).toHaveClass('min-h-full', 'flex-1', 'items-stretch');
    expect(board).not.toHaveClass('overflow-y-auto');
    expect(root).toHaveClass('flex-1', 'flex-col');
    expect(root).toHaveClass('shrink-0');
    expect(root).not.toHaveClass('h-full', 'min-h-full', 'mb-32', 'md:mb-36');
    expect(analysisWindow).toHaveClass('shrink-0');
    expect(breathingRoom).toHaveClass('h-32', 'shrink-0', 'md:h-36');
    expect(tabs).toHaveClass('flex-1');
    expect(tabs).not.toHaveClass('pb-32', 'md:pb-36');
    expect(surface).toHaveClass('flex-1');
    expect(surfaceContent).toHaveClass('min-h-full');
    expect(rail).toHaveClass('h-full', 'min-h-full');
    expect(rail).toHaveClass('lg:[background:linear-gradient(to_bottom,#fff_0,#fff_8px,hsl(var(--secondary)/0.15)_8px)]');
    expect(firstRailSection).toHaveClass('first-of-type:border-t-0');
    expect(rail).not.toHaveClass('overflow-y-auto');
    expect(measurements).toHaveClass('h-0', 'overflow-hidden');
  });

  test('does not render the expanded ledger viewport spacer', () => {
    const { container } = render(
      <AnalysisWorkbench
        expanded
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    expect(
      Array.from(container.querySelectorAll('[class]')).some((element) =>
        String(element.getAttribute('class')).includes('min-h-[100svh]'),
      ),
    ).toBe(false);
  });

  test('renders the shared ledger controls on the workbench surface', () => {
    render(
      <AnalysisWorkbench
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    expect(screen.getByRole('heading', { name: 'System timeline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Indicators' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Layout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset chart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1D' })).toBeInTheDocument();
  });

  test('forwards shared chart reset actions from the analysis workbench', async () => {
    const user = userEvent.setup();
    const onResetCharts = vi.fn(async () => {});

    render(
      <AnalysisWorkbench
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        onResetCharts={onResetCharts}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Reset chart' }));

    expect(onResetCharts).toHaveBeenCalledTimes(1);
  });

  test('forwards shared chart expand and collapse controls from the analysis workbench', async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    const { rerender } = render(
      <AnalysisWorkbench
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        onToggleExpand={onToggleExpand}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Expand chart' }));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);

    rerender(
      <AnalysisWorkbench
        expanded
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        onToggleExpand={onToggleExpand}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Collapse chart' }));
    expect(onToggleExpand).toHaveBeenCalledTimes(2);
  });

  test('renders the loading pill from the shared ledger footer when expanded and busy', () => {
    render(
      <AnalysisWorkbench
        expanded
        hasOlderIntervals={false}
        isHydratingDetails
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={buildModel()}
        section="workbench"
        setSection={vi.fn()}
        showRightRailCards={false}
      />,
    );

    expect(screen.getByText('Loading data')).toBeInTheDocument();
  });
}, 10_000);

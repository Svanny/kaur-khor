import { test, expect, type Page, type TestInfo } from '@playwright/test';
import type { DesktopPreferences } from '../../src/shared/ipc';
import { launchKaurKhorForBenchmark, closeKaurKhorBenchmarkSession, navigateBenchmarkRoute, waitForBenchmarkEventCount } from '../helpers/electron-app';

type ExplainSectionId = 'workbench' | 'pressure' | 'fragility' | 'settings';

interface ExplainLayoutState {
  activeSection: ExplainSectionId;
  heading: string;
  id: string;
  route: `/${string}`;
  rail: 'present' | 'absent';
  scrollMode: 'chart' | 'natural';
}

interface ElementSnapshot {
  bottom: number;
  className: string;
  clientHeight: number;
  display: string;
  height: number;
  minHeight: string;
  offsetHeight: number;
  overflow: string;
  overflowY: string;
  position: string;
  scrollHeight: number;
  scrollTop: number;
  top: number;
  visibility: string;
}

interface ExplainLayoutSnapshot {
  activeSection: string | null;
  board: ElementSnapshot | null;
  breathingRoom: ElementSnapshot | null;
  chartContainer: ElementSnapshot | null;
  chartDuration: ElementSnapshot | null;
  contentColumn: ElementSnapshot | null;
  documentElement: ElementSnapshot | null;
  headeredTable: ElementSnapshot | null;
  inspector: ElementSnapshot | null;
  main: ElementSnapshot | null;
  nav: ElementSnapshot | null;
  preferences: Pick<DesktopPreferences, 'displayViewMode' | 'showRightRailCards'> | null;
  root: ElementSnapshot | null;
  surface: ElementSnapshot | null;
  surfaceContent: ElementSnapshot | null;
  tabLabels: string[];
  tabList: ElementSnapshot | null;
  viewport: {
    height: number;
    width: number;
  };
}

const EXPLAIN_LAYOUT_STATES: ExplainLayoutState[] = [
  {
    activeSection: 'workbench',
    heading: 'System timeline',
    id: 'main',
    rail: 'present',
    route: '/insights/explain',
    scrollMode: 'chart',
  },
  {
    activeSection: 'settings',
    heading: 'Explain details',
    id: 'settings',
    rail: 'present',
    route: '/insights/explain?section=settings',
    scrollMode: 'natural',
  },
  {
    activeSection: 'pressure',
    heading: 'Risk explorer',
    id: 'pressure',
    rail: 'present',
    route: '/insights/explain?section=pressure',
    scrollMode: 'natural',
  },
  {
    activeSection: 'fragility',
    heading: 'Service blocker map',
    id: 'fragility',
    rail: 'absent',
    route: '/insights/explain?section=fragility',
    scrollMode: 'natural',
  },
];

async function forceMaximalPreferences(page: Page) {
  const preferences = await page.evaluate(async () => {
    const desktop = (window as Window & {
      kaurKhorDesktop?: {
        preferences?: {
          save: (payload: Partial<DesktopPreferences>) => Promise<DesktopPreferences>;
        };
      };
    }).kaurKhorDesktop;
    if (!desktop?.preferences) {
      throw new Error('Desktop preferences bridge is unavailable');
    }
    return desktop.preferences.save({
      displayViewMode: 'maximal',
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showOverviewTaskTabs: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      showPerformanceCompareToggle: true,
      showPerformanceTimelineCard: true,
      showLogsViewToggle: true,
      showHeartbeatRibbons: true,
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: true,
      customShowRightRailCards: true,
      customShowOverviewTaskTabs: true,
      customShowAutomationsPage: true,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: true,
      customShowPerformanceTimelineCard: true,
      customShowLogsViewToggle: true,
      customShowHeartbeatRibbons: true,
    });
  });
  expect(preferences.displayViewMode).toBe('maximal');
  expect(preferences.showRightRailCards).toBe(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function explainLayoutSnapshot(page: Page): Promise<ExplainLayoutSnapshot> {
  return page.evaluate(async () => {
    const rect = (selector: string): ElementSnapshot | null => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) {
        return null;
      }
      const bounds = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return {
        bottom: bounds.bottom,
        className: node.className,
        clientHeight: node.clientHeight,
        display: style.display,
        height: bounds.height,
        minHeight: style.minHeight,
        offsetHeight: node.offsetHeight,
        overflow: style.overflow,
        overflowY: style.overflowY,
        position: style.position,
        scrollHeight: node.scrollHeight,
        scrollTop: node.scrollTop,
        top: bounds.top,
        visibility: style.visibility,
      };
    };
    const desktop = (window as Window & {
      kaurKhorDesktop?: {
        preferences?: {
          get: () => Promise<DesktopPreferences>;
        };
      };
    }).kaurKhorDesktop;
    const preferences = await desktop?.preferences?.get().catch(() => null) ?? null;
    return {
      activeSection: document.querySelector<HTMLElement>('[data-analysis-workbench-root="true"]')
        ?.getAttribute('data-analysis-active-section') ?? null,
      board: rect('[data-testid="insights-board-section"]'),
      breathingRoom: rect('[data-analysis-bottom-breathing-room="true"]'),
      chartContainer: rect('[data-testid="sku-trading-chart"]'),
      chartDuration: rect('[aria-label="Chart duration"]'),
      contentColumn: rect('[data-analysis-content-column="true"]'),
      documentElement: rect('html'),
      headeredTable: rect('[data-slot="headered-table"]'),
      inspector: rect('[data-analysis-inspector="true"]'),
      main: rect('main#main-content'),
      nav: rect('[data-analysis-nav="true"]'),
      preferences: preferences
        ? {
          displayViewMode: preferences.displayViewMode,
          showRightRailCards: preferences.showRightRailCards,
        }
        : null,
      root: rect('[data-analysis-workbench-root="true"]'),
      surface: rect('[data-analysis-surface="true"]'),
      surfaceContent: rect('[data-analysis-surface-content="true"]'),
      tabList: rect('[role="tablist"][aria-label="Select Explain view"]'),
      tabLabels: Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'))
        .map((tab) => tab.getAttribute('aria-label') ?? tab.textContent?.trim() ?? ''),
      viewport: {
        height: window.innerHeight,
        width: window.innerWidth,
      },
    };
  });
}

async function attachExplainLayoutArtifacts(
  testInfo: TestInfo,
  page: Page,
  state: ExplainLayoutState,
  snapshot: ExplainLayoutSnapshot,
) {
  await testInfo.attach(`explain-${state.id}-geometry.json`, {
    body: JSON.stringify(snapshot, null, 2),
    contentType: 'application/json',
  });
  await testInfo.attach(`explain-${state.id}-viewport.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
}

function requireSnapshotElement(
  snapshot: ExplainLayoutSnapshot,
  key: 'board' | 'breathingRoom' | 'contentColumn' | 'documentElement' | 'main' | 'nav' | 'root' | 'surface' | 'tabList',
) {
  const element = snapshot[key];
  expect(element, `${key} should exist`).not.toBeNull();
  return element!;
}

async function navigateExplainLayoutState(
  page: Page,
  state: ExplainLayoutState,
  expectedReadyCount: number,
) {
  await navigateBenchmarkRoute(page, state.route);
  await waitForBenchmarkEventCount({ page }, 'route.insights.explain.ready', expectedReadyCount, { timeoutMs: 30_000 });
  await page.locator(`[data-analysis-workbench-root="true"][data-analysis-active-section="${state.activeSection}"]`).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('heading', { name: state.heading }).waitFor({ state: 'visible', timeout: 10_000 });
}

function assertExplainLayoutState(state: ExplainLayoutState, snapshot: ExplainLayoutSnapshot) {
  expect(snapshot.preferences).toEqual({
    displayViewMode: 'maximal',
    showRightRailCards: true,
  });
  expect(snapshot.activeSection).toBe(state.activeSection);
  expect(snapshot.tabLabels).toEqual(expect.arrayContaining(['Main view', 'Risks', 'Blockers', 'Parameters']));

  const main = requireSnapshotElement(snapshot, 'main');
  const root = requireSnapshotElement(snapshot, 'root');
  const nav = requireSnapshotElement(snapshot, 'nav');
  const tabList = requireSnapshotElement(snapshot, 'tabList');
  const board = requireSnapshotElement(snapshot, 'board');
  const contentColumn = requireSnapshotElement(snapshot, 'contentColumn');
  const documentElement = requireSnapshotElement(snapshot, 'documentElement');
  const surface = requireSnapshotElement(snapshot, 'surface');

  expect(main.clientHeight).toBeGreaterThan(0);
  expect(root.clientHeight).toBeGreaterThan(0);
  expect(nav.height).toBeGreaterThan(32);
  expect(tabList.height).toBeGreaterThan(32);
  expect(tabList.top).toBeLessThan(board.top);
  expect(tabList.visibility).toBe('visible');
  expect(board.bottom).toBeGreaterThanOrEqual(main.clientHeight - 64);
  expect(board.bottom + 2).toBeGreaterThanOrEqual(contentColumn.bottom);
  expect(contentColumn.bottom + 2).toBeGreaterThanOrEqual(board.bottom);
  expect(contentColumn.bottom + 2).toBeGreaterThanOrEqual(surface.bottom);
  expect(surface.bottom + 2).toBeGreaterThanOrEqual(board.bottom);
  if (state.id === 'pressure') {
    expect(snapshot.headeredTable, 'pressure table should render the shared table surface').not.toBeNull();
    expect(snapshot.headeredTable!.bottom + 2).toBeGreaterThanOrEqual(surface.bottom);
  }

  if (state.rail === 'present') {
    expect(snapshot.inspector, `${state.id} should render the right rail`).not.toBeNull();
    expect(board.bottom + 2).toBeGreaterThanOrEqual(snapshot.inspector!.bottom);
    expect(snapshot.inspector!.bottom + 2).toBeGreaterThanOrEqual(board.bottom);
  } else {
    expect(snapshot.inspector, `${state.id} should not render the right rail`).toBeNull();
  }

  const breathingRoom = requireSnapshotElement(snapshot, 'breathingRoom');
  const windowBottom = Math.max(board.bottom, snapshot.inspector?.bottom ?? board.bottom);
  const windowBottomInMainScroll = windowBottom - main.top + main.scrollTop;
  const breathingRoomTopInMainScroll = breathingRoom.top - main.top + main.scrollTop;
  const breathingRoomBottomInMainScroll = breathingRoom.bottom - main.top + main.scrollTop;
  const scrollBreathingRoom = main.scrollHeight - windowBottomInMainScroll;
  const breathingDiagnostics = JSON.stringify({
    breathingRoomBottomInMainScroll,
    breathingRoomHeight: breathingRoom.height,
    breathingRoomTopInMainScroll,
    mainScrollHeight: main.scrollHeight,
    mainScrollTop: main.scrollTop,
    scrollBreathingRoom,
    state: state.id,
    windowBottomInMainScroll,
  });

  if (state.scrollMode === 'chart') {
    expect(snapshot.chartContainer, `${state.id} should render the chart canvas container`).not.toBeNull();
    expect(snapshot.chartDuration, `${state.id} should keep the chart footer controls visible`).not.toBeNull();
    expect(snapshot.chartContainer!.height).toBeGreaterThanOrEqual(420);
    expect(board.bottom + 2).toBeGreaterThanOrEqual(snapshot.chartContainer!.bottom);
    expect(board.bottom + 2).toBeGreaterThanOrEqual(snapshot.chartDuration!.bottom);
    expect(board.overflowY).toBe('hidden');
    expect(breathingRoom.height).toBeGreaterThanOrEqual(96);
    expect(breathingRoomTopInMainScroll + 2).toBeGreaterThanOrEqual(windowBottomInMainScroll);
    expect(scrollBreathingRoom, breathingDiagnostics).toBeGreaterThanOrEqual(64);
    expect(scrollBreathingRoom, breathingDiagnostics).toBeLessThanOrEqual(220);
    expect(documentElement.scrollHeight).toBeLessThanOrEqual(Math.max(snapshot.viewport.height * 2, 1800));
    return;
  }

  expect(board.overflowY).toBe('hidden');
  expect(board.bottom).toBeGreaterThanOrEqual(main.clientHeight - 64);
  expect(snapshot.surfaceContent, `${state.id} content should render a stretchable surface`).not.toBeNull();
  expect(surface.bottom + 2).toBeGreaterThanOrEqual(snapshot.surfaceContent!.bottom);
  expect(breathingRoom.height).toBeGreaterThanOrEqual(96);
  expect(breathingRoomTopInMainScroll + 2).toBeGreaterThanOrEqual(windowBottomInMainScroll);
  expect(breathingRoomBottomInMainScroll).toBeGreaterThan(windowBottomInMainScroll);
  expect(scrollBreathingRoom, breathingDiagnostics).toBeGreaterThanOrEqual(64);
  expect(scrollBreathingRoom, breathingDiagnostics).toBeLessThanOrEqual(220);
  expect(main.scrollHeight + 2).toBeGreaterThanOrEqual(windowBottomInMainScroll);
  expect(documentElement.scrollHeight).toBeLessThanOrEqual(Math.max(snapshot.viewport.height * 4, 2400));
}

test('insights explain layout stays visible across maximal route states', async ({}, testInfo) => {
  const launched = await launchKaurKhorForBenchmark('explain-main-view-scroll', testInfo, {
    fixtureSize: 'minimal',
    prepareWorkspace: true,
  });

  try {
    await forceMaximalPreferences(launched.page);

    let expectedReadyCount = 0;
    for (const state of EXPLAIN_LAYOUT_STATES) {
      expectedReadyCount += 1;
      await navigateExplainLayoutState(launched.page, state, expectedReadyCount);
      const snapshot = await explainLayoutSnapshot(launched.page);
      await attachExplainLayoutArtifacts(testInfo, launched.page, state, snapshot);
      assertExplainLayoutState(state, snapshot);
    }
  } finally {
    await closeKaurKhorBenchmarkSession(launched);
  }
});

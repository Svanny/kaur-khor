import { test, expect } from '@playwright/test';
import { launchKaurKhorForBenchmark, closeKaurKhorBenchmarkSession, navigateBenchmarkRoute, waitForBenchmarkEventCount } from '../helpers/electron-app';

test('diagnose insights explain scroll source', async ({}, testInfo) => {
  const launched = await launchKaurKhorForBenchmark('explain-scroll-diagnose', testInfo, {
    fixtureSize: 'minimal',
    prepareWorkspace: true,
  });

  try {
    await navigateBenchmarkRoute(launched.page, '/insights/explain');
    await waitForBenchmarkEventCount(launched, 'route.insights.explain.ready', 1, { timeoutMs: 30_000 });

    const sizes = await launched.page.evaluate(() => {
      const el = (e: Element | null) => {
        if (!e) return null;
        const rect = e.getBoundingClientRect();
        const style = window.getComputedStyle(e);
        return {
          tag: e.tagName,
          class: (e as HTMLElement).className.slice(0, 120),
          scrollHeight: e.scrollHeight,
          clientHeight: e.clientHeight,
          offsetHeight: (e as HTMLElement).offsetHeight,
          height: rect.height,
          overflow: style.overflow,
          overflowY: style.overflowY,
          minHeight: style.minHeight,
          maxHeight: style.maxHeight,
        };
      };
      const chartContainer = document.querySelector('[data-testid="sku-trading-chart"]');
      const laneRows = document.querySelector('[data-analysis-lane-rows="true"]');
      const boardSection = document.querySelector('[data-testid="insights-board-section"]');
      return {
        main: el(document.querySelector('main#main-content')),
        shellFrame: el(document.querySelector('[data-testid="shell-main-frame"]')),
        workspacePage: el(document.querySelector('[data-testid="shell-main-frame"] > div')),
        analysisWorkbench: el(laneRows?.parentElement ?? null),
        chromeTabs: el(document.querySelector('[data-slot="chrome-tabs"]')),
        boardSection: el(boardSection),
        chartSection: el(chartContainer?.closest('section') ?? null),
        chartContainer: el(chartContainer),
      };
    });

    console.log(JSON.stringify(sizes, null, 2));
    expect(sizes.main).not.toBeNull();
  } finally {
    await closeKaurKhorBenchmarkSession(launched);
  }
});

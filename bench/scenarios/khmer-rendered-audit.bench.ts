import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  closeKaurKhorBenchmarkSession,
  launchKaurKhorForBenchmark,
  navigateBenchmarkRoute,
  waitForPersistedBenchmarkEventCount,
} from '../helpers/electron-app';
import { benchmarkDataDirectory, benchmarkOutputDirectory, benchmarkRunId } from '../helpers/artifact-paths';
import { prepareBenchmarkWorkspace } from '../helpers/workspace-seed';

interface AuditEntry {
  route: string;
  roleName: string | null;
  screenshotPath: string | null;
  selectorPath: string;
  stateId: string;
  stateLabel: string;
  text: string;
  textKind: 'aria-description' | 'aria-label' | 'alt' | 'placeholder' | 'selected-option' | 'text' | 'title';
  timestamp: string;
}

interface UnreachableAuditState {
  reason: string;
  route: string;
  stateId: string;
  stateLabel: string;
  timestamp: string;
}

interface AuditArtifact {
  entries: AuditEntry[];
  metadata: {
    app: 'Kaur Khor';
    artifactVersion: 1;
    currency: 'KHR';
    generatedAt: string;
    language: 'km';
    runId: string;
  };
  routeCoverage: Array<{
    route: string;
    screenshotPath: string | null;
    stateCount: number;
    status: 'captured' | 'unreachable';
  }>;
  unreachable: UnreachableAuditState[];
}

type LaunchedAuditApp = Awaited<ReturnType<typeof launchKaurKhorForBenchmark>>;

const REQUESTED_STATIC_ROUTES = [
  '/',
  '/work',
  '/work/queue',
  '/work/intake',
  '/work/capture',
  '/catalog',
  '/catalog/skus/new',
  '/catalog/services/new',
  '/insights',
  '/insights/pressure',
  '/insights/money',
  '/insights/explain',
  '/settings/workspace',
  '/settings/interface',
  '/settings/planning',
  '/settings/local-data',
  '/settings/benchmarks',
  '/settings/automation',
  '/settings/history',
  '/settings/help',
  '/settings/credits',
  '/settings/danger-zone',
] as const;

const SCREENSHOT_OPTIONS = { fullPage: true, animations: 'disabled' as const };

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'root';
}

async function seedKhmerPreferences(dataDirectory: string) {
  await writeFile(
    join(dataDirectory, 'desktop-preferences.json'),
    `${JSON.stringify({
      currency: 'KHR',
      customShowAnalysisPage: true,
      customShowAutomationsPage: true,
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: true,
      customShowHeartbeatRibbons: true,
      customShowLogsViewToggle: true,
      customShowOverviewTaskTabs: true,
      customShowPerformanceCompareToggle: true,
      customShowPerformanceTimelineCard: true,
      customShowRightRailCards: true,
      displayViewMode: 'maximal',
      language: 'km',
      onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
      seenUnlockedNavItems: {
        automations: true,
        catalog: true,
        financials: true,
        operations: true,
        performance: true,
      },
      showAnalysisPage: true,
      showAutomationsPage: true,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showHeartbeatRibbons: true,
      showLogsViewToggle: true,
      showOverviewTaskTabs: true,
      showPerformanceCompareToggle: true,
      showPerformanceTimelineCard: true,
      showRightRailCards: true,
    }, null, 2)}\n`,
    'utf8',
  );
}

async function launchKhmerAuditApp(testInfo: Parameters<Parameters<typeof test>[1]>[1]) {
  const runId = benchmarkRunId(`khmer-rendered-audit-${testInfo.retry}`);
  const outputDirectory = await benchmarkOutputDirectory(runId);
  const dataDirectory = await benchmarkDataDirectory(runId);
  await prepareBenchmarkWorkspace({ dataDirectory, size: 'medium' });
  await seedKhmerPreferences(dataDirectory);
  return launchKaurKhorForBenchmark('khmer-rendered-audit', testInfo, {
    dataDirectory,
    fixtureSize: 'medium',
    outputDirectory,
    prepareWorkspace: false,
    runId,
  });
}

async function activeCatalogRoutes(launched: LaunchedAuditApp): Promise<Array<{ label: string; route: string }>> {
  const targets = await launched.page.evaluate(async () => {
    const desktop = window as Window & {
      kaurKhorDesktop?: {
        sena?: {
          getCatalog?: () => Promise<{
            services: Array<{ archived: boolean; serviceId: string }>;
            skus: Array<{ archived: boolean; skuId: string }>;
          } | null>;
        };
      };
    };
    const catalog = await desktop.kaurKhorDesktop?.sena?.getCatalog?.();
    return {
      serviceId: catalog?.services.find((service) => !service.archived)?.serviceId ?? null,
      skuId: catalog?.skus.find((sku) => !sku.archived)?.skuId ?? null,
    };
  });

  return [
    targets.skuId ? { label: 'first-active-sku-detail', route: `/catalog/skus/${targets.skuId}` } : null,
    targets.serviceId ? { label: 'first-active-service-detail', route: `/catalog/services/${targets.serviceId}` } : null,
    targets.skuId ? { label: 'first-active-sku-ledger', route: `/catalog/skus/${targets.skuId}?chart=expanded` } : null,
  ].filter((route): route is { label: string; route: string } => route != null);
}

async function collectRenderedEvidence(
  launched: LaunchedAuditApp,
  {
    route,
    screenshotPath,
    stateId,
    stateLabel,
  }: {
    route: string;
    screenshotPath: string | null;
    stateId: string;
    stateLabel: string;
  },
): Promise<AuditEntry[]> {
  const timestamp = new Date().toISOString();
  return launched.page.evaluate(
    ({ nextRoute, nextScreenshotPath, nextStateId, nextStateLabel, nextTimestamp }) => {
      type TextKind = AuditEntry['textKind'];
      const attributeKinds: Array<[string, TextKind]> = [
        ['aria-label', 'aria-label'],
        ['aria-description', 'aria-description'],
        ['placeholder', 'placeholder'],
        ['title', 'title'],
        ['alt', 'alt'],
      ];

      function isVisible(element: Element | null) {
        if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) {
          return false;
        }
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }

      function textValue(value: string | null | undefined) {
        return value?.replace(/\s+/g, ' ').trim() ?? '';
      }

      function selectorPath(element: Element) {
        const segments: string[] = [];
        let current: Element | null = element;
        while (current && current !== document.documentElement && segments.length < 6) {
          const tag = current.tagName.toLowerCase();
          const testId = current.getAttribute('data-testid');
          const slot = current.getAttribute('data-slot');
          const role = current.getAttribute('role');
          const id = current.id;
          let segment = tag;
          if (id) {
            segment += `#${id}`;
          } else if (testId) {
            segment += `[data-testid="${testId}"]`;
          } else if (slot) {
            segment += `[data-slot="${slot}"]`;
          } else if (role) {
            segment += `[role="${role}"]`;
          }
          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter((sibling) => sibling.tagName === current?.tagName);
            if (siblings.length > 1) {
              segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
            }
          }
          segments.unshift(segment);
          current = current.parentElement;
        }
        return segments.join(' > ');
      }

      function roleName(element: Element) {
        const role = element.getAttribute('role') ?? element.tagName.toLowerCase();
        const name = textValue(
          element.getAttribute('aria-label')
            ?? element.getAttribute('title')
            ?? element.textContent,
        ).slice(0, 160);
        return name ? `${role}:${name}` : role;
      }

      const entries: AuditEntry[] = [];
      const pushEntry = (element: Element, textKind: TextKind, text: string) => {
        const normalized = textValue(text);
        if (!normalized) {
          return;
        }
        entries.push({
          route: nextRoute,
          roleName: roleName(element),
          screenshotPath: nextScreenshotPath,
          selectorPath: selectorPath(element),
          stateId: nextStateId,
          stateLabel: nextStateLabel,
          text: normalized,
          textKind,
          timestamp: nextTimestamp,
        });
      };

      const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (textWalker.nextNode()) {
        const node = textWalker.currentNode;
        const parent = node.parentElement;
        if (parent && isVisible(parent)) {
          pushEntry(parent, 'text', node.textContent ?? '');
        }
      }

      for (const element of Array.from(document.body.querySelectorAll('*'))) {
        if (!isVisible(element)) {
          continue;
        }
        for (const [attributeName, textKind] of attributeKinds) {
          pushEntry(element, textKind, element.getAttribute(attributeName) ?? '');
        }
        if (element instanceof HTMLSelectElement) {
          for (const option of Array.from(element.selectedOptions)) {
            pushEntry(element, 'selected-option', option.textContent ?? '');
          }
        }
      }

      return entries;
    },
    {
      nextRoute: route,
      nextScreenshotPath: screenshotPath,
      nextStateId: stateId,
      nextStateLabel: stateLabel,
      nextTimestamp: timestamp,
    },
  );
}

async function screenshotAndCollect(
  launched: LaunchedAuditApp,
  artifactDirectory: string,
  state: {
    route: string;
    stateId: string;
    stateLabel: string;
  },
) {
  const screenshotPath = join(
    artifactDirectory,
    `${slugify(state.route)}-${slugify(state.stateId)}.png`,
  );
  await launched.page.screenshot({ path: screenshotPath, ...SCREENSHOT_OPTIONS });
  const entries = await collectRenderedEvidence(launched, {
    ...state,
    screenshotPath,
  });
  return { entries, screenshotPath };
}

async function recordUnreachable(
  unreachable: UnreachableAuditState[],
  route: string,
  stateId: string,
  stateLabel: string,
  reason: string,
) {
  unreachable.push({
    reason,
    route,
    stateId,
    stateLabel,
    timestamp: new Date().toISOString(),
  });
}

async function settleRenderedRoute(launched: LaunchedAuditApp, route: string) {
  await navigateBenchmarkRoute(launched.page, route as `/${string}`);
  await launched.page.waitForFunction(() => document.body.innerText.trim().length > 0);
  await launched.page.waitForLoadState('domcontentloaded');
}

async function captureCommandPalette(
  launched: LaunchedAuditApp,
  artifactDirectory: string,
  route: string,
  unreachable: UnreachableAuditState[],
) {
  await launched.page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  const dialog = launched.page.getByRole('dialog').filter({ has: launched.page.locator('input') }).first();
  if (!(await dialog.isVisible().catch(() => false))) {
    await recordUnreachable(unreachable, route, 'command-palette', 'Command palette', 'Keyboard shortcut did not open a visible dialog.');
    return [];
  }
  const { entries } = await screenshotAndCollect(launched, artifactDirectory, {
    route,
    stateId: 'command-palette',
    stateLabel: 'Command palette',
  });
  await launched.page.keyboard.press('Escape');
  return entries;
}

async function captureSidebarStates(
  launched: LaunchedAuditApp,
  artifactDirectory: string,
  route: string,
  unreachable: UnreachableAuditState[],
) {
  const toggle = launched.page.getByTestId('sidebar-collapse-toggle').first();
  if (!(await toggle.isVisible().catch(() => false))) {
    await recordUnreachable(unreachable, route, 'sidebar-collapsed', 'Sidebar collapsed', 'Sidebar collapse toggle was not visible.');
    return [];
  }
  await toggle.click();
  const collapsed = await screenshotAndCollect(launched, artifactDirectory, {
    route,
    stateId: 'sidebar-collapsed',
    stateLabel: 'Sidebar collapsed',
  });
  await toggle.click();
  const expanded = await screenshotAndCollect(launched, artifactDirectory, {
    route,
    stateId: 'sidebar-expanded',
    stateLabel: 'Sidebar expanded',
  });
  return [...collapsed.entries, ...expanded.entries];
}

async function captureFirstCombobox(
  launched: LaunchedAuditApp,
  artifactDirectory: string,
  route: string,
  unreachable: UnreachableAuditState[],
) {
  const comboboxes = launched.page.getByRole('combobox');
  const count = await comboboxes.count();
  for (let index = 0; index < Math.min(count, 3); index += 1) {
    const combobox = comboboxes.nth(index);
    if (!(await combobox.isVisible().catch(() => false)) || !(await combobox.isEnabled().catch(() => false))) {
      continue;
    }
    await combobox.click();
    const listboxOrMenu = launched.page.locator('[role="listbox"], [role="menu"], [data-radix-popper-content-wrapper]').first();
    if (!(await listboxOrMenu.isVisible().catch(() => false))) {
      await launched.page.keyboard.press('Escape');
      continue;
    }
    const { entries } = await screenshotAndCollect(launched, artifactDirectory, {
      route,
      stateId: `combobox-${index + 1}`,
      stateLabel: `Combobox ${index + 1}`,
    });
    await launched.page.keyboard.press('Escape');
    return entries;
  }
  await recordUnreachable(unreachable, route, 'combobox-menu', 'Basic dropdown/select menu', 'No enabled visible combobox opened a visible menu.');
  return [];
}

async function captureTooltip(
  launched: LaunchedAuditApp,
  artifactDirectory: string,
  route: string,
  unreachable: UnreachableAuditState[],
) {
  const triggers = launched.page.locator(
    'button[aria-describedby], [data-slot="tooltip-trigger"], [data-radix-tooltip-trigger]',
  );
  const count = await triggers.count();
  for (let index = 0; index < Math.min(count, 8); index += 1) {
    const trigger = triggers.nth(index);
    if (!(await trigger.isVisible().catch(() => false))) {
      continue;
    }
    const hovered = await trigger.hover({ timeout: 1_000 }).then(() => true).catch(() => false);
    if (!hovered) {
      continue;
    }
    const tooltip = launched.page.getByRole('tooltip').first();
    if (!(await tooltip.isVisible().catch(() => false))) {
      continue;
    }
    const { entries } = await screenshotAndCollect(launched, artifactDirectory, {
      route,
      stateId: `tooltip-${index + 1}`,
      stateLabel: `Help tooltip ${index + 1}`,
    });
    await launched.page.mouse.move(0, 0);
    return entries;
  }
  await recordUnreachable(unreachable, route, 'help-tooltip', 'Help tooltip trigger', 'No visible tooltip trigger opened tooltip content.');
  return [];
}

async function writeArtifact(path: string, artifact: AuditArtifact) {
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  const parsed = JSON.parse(await readFile(path, 'utf8')) as AuditArtifact;
  expect(parsed.entries.length).toBeGreaterThan(0);
  expect(parsed.routeCoverage.length).toBeGreaterThan(0);
  expect(parsed.entries.some((entry) => entry.route === '/')).toBe(true);
}

test('captures rendered Khmer DOM copy audit evidence', async ({}, testInfo) => {
  const launched = await launchKhmerAuditApp(testInfo);
  const artifactDirectory = join(launched.outputDirectory, 'khmer-rendered-audit');
  await mkdir(artifactDirectory, { recursive: true });
  const artifactPath = join(artifactDirectory, 'artifact.json');
  const entries: AuditEntry[] = [];
  const unreachable: UnreachableAuditState[] = [];
  const routeCoverage: AuditArtifact['routeCoverage'] = [];

  try {
    await waitForPersistedBenchmarkEventCount(launched, 'renderer.workspace.ready');
    const dynamicRoutes = await activeCatalogRoutes(launched);
    const routes = [
      ...REQUESTED_STATIC_ROUTES.map((route) => ({ label: route, route })),
      ...dynamicRoutes,
    ];

    for (const target of routes) {
      try {
        await settleRenderedRoute(launched, target.route);
        const currentRoute = await launched.page.evaluate(() => window.location.hash.slice(1) || '/');
        if (currentRoute !== target.route) {
          await recordUnreachable(
            unreachable,
            target.route,
            'route',
            target.label,
            `Navigation ended at ${currentRoute}.`,
          );
          routeCoverage.push({
            route: target.route,
            screenshotPath: null,
            stateCount: 0,
            status: 'unreachable',
          });
          continue;
        }

        const routeCapture = await screenshotAndCollect(launched, artifactDirectory, {
          route: target.route,
          stateId: 'route',
          stateLabel: target.label,
        });
        entries.push(...routeCapture.entries);
        routeCoverage.push({
          route: target.route,
          screenshotPath: routeCapture.screenshotPath,
          stateCount: 1,
          status: 'captured',
        });

        try {
          entries.push(...await captureFirstCombobox(launched, artifactDirectory, target.route, unreachable));
        } catch (error) {
          await recordUnreachable(
            unreachable,
            target.route,
            'combobox-menu',
            'Basic dropdown/select menu',
            error instanceof Error ? error.message : String(error),
          );
        }
        try {
          entries.push(...await captureTooltip(launched, artifactDirectory, target.route, unreachable));
        } catch (error) {
          await recordUnreachable(
            unreachable,
            target.route,
            'help-tooltip',
            'Help tooltip trigger',
            error instanceof Error ? error.message : String(error),
          );
        }
      } catch (error) {
        await recordUnreachable(
          unreachable,
          target.route,
          'route',
          target.label,
          error instanceof Error ? error.message : String(error),
        );
        routeCoverage.push({
          route: target.route,
          screenshotPath: null,
          stateCount: 0,
          status: 'unreachable',
        });
      }
    }

    await settleRenderedRoute(launched, '/');
    entries.push(...await captureCommandPalette(launched, artifactDirectory, '/', unreachable));
    entries.push(...await captureSidebarStates(launched, artifactDirectory, '/', unreachable));
    for (const coverage of routeCoverage) {
      if (coverage.status !== 'captured') {
        continue;
      }
      coverage.stateCount = new Set(
        entries
          .filter((entry) => entry.route === coverage.route)
          .map((entry) => entry.stateId),
      ).size;
    }

    await writeArtifact(artifactPath, {
      entries,
      metadata: {
        app: 'Kaur Khor',
        artifactVersion: 1,
        currency: 'KHR',
        generatedAt: new Date().toISOString(),
        language: 'km',
        runId: launched.runId,
      },
      routeCoverage,
      unreachable,
    });
  } finally {
    await closeKaurKhorBenchmarkSession(launched);
  }

  testInfo.attachments.push({
    contentType: 'application/json',
    name: 'khmer-rendered-audit-artifact',
    path: artifactPath,
  });
});

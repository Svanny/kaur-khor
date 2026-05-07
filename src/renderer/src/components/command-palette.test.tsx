import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CommandPaletteProvider } from './command-palette';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();
const savePreferences = vi.fn(async () => {});
const applyDisplayViewMode = vi.fn(async () => {});
const applySenaEngineParameters = vi.fn(async () => {});
const archiveCatalogEntity = vi.fn(async () => null);
const unarchiveCatalogEntity = vi.fn(async () => null);
const createBackupSnapshot = vi.fn(async () => ({
  createdAt: '2026-04-10T10:00:00.000Z',
  fileCount: 2,
  snapshotPath: '/tmp/kaur-khor/backup-snapshots/manual-snapshot',
  trigger: 'manual',
}));
const restoreBackupSnapshot = vi.fn(async () => null);
const listObservations = vi.fn(async () => []);
const getCatalog = vi.fn(async () => null);
const getWorkspaceSummary = vi.fn(async () => null);
const getDiagnostics = vi.fn(async () => null);
const getRunStatus = vi.fn(async () => null);

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

describe('CommandPaletteProvider', () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    });

    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [],
        sharingMask: [],
        skus: [{ archived: false, costPerUnit: 4, description: 'SKU', leadTimeMeanDaysHint: 5, leadTimeStdDaysHint: 1, name: 'SKU 1', productPrice: 9, skuId: 'sku-1', soldAsProduct: true }],
      },
      diagnostics: null,
      error: null,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations: [{ observationId: 'obs-1' }, { observationId: 'obs-2' }],
      reload: vi.fn(),
      reports: [],
      senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
      snapshot: null,
      workspaceSummary: null,
      archiveCatalogEntity,
      unarchiveCatalogEntity,
    });
    preferencesHook.mockReturnValue({
      applyDisplayViewMode,
      applySenaEngineParameters,
      currency: 'USD',
      displayViewMode: 'custom',
      language: 'en',
      savePreferences,
      senaEngineParameters: { smoothingEnabled: true },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      t: (key: string) =>
        ({
          navAnalysis: 'Explain',
          navArchive: 'Archive',
          navCatalog: 'Products',
          navOperations: 'Logs',
          navOverview: 'Overview',
          navPerformance: 'Performance',
          navRecordUpdate: 'Record update',
          navSettings: 'Settings',
          navHelp: 'Help',
          settingsBackupSnapshotAction: 'Create backup snapshot',
          settingsExportLogsAction: 'Export Logs',
          settingsExportSenaDataAction: 'Export planning data',
          settingsLocalWorkspaceStorageTitle: 'Local workspace data',
          settingsRestoreSnapshotAction: 'Restore saved snapshot',
        }[key] ?? key),
    });
    savePreferences.mockClear();
    applyDisplayViewMode.mockClear();
    applySenaEngineParameters.mockClear();
    archiveCatalogEntity.mockClear();
    unarchiveCatalogEntity.mockClear();
    createBackupSnapshot.mockClear();
    restoreBackupSnapshot.mockClear();
    listObservations.mockClear();
    getCatalog.mockClear();
    getWorkspaceSummary.mockClear();
    getDiagnostics.mockClear();
    getRunStatus.mockClear();
    window.kaurKhorDesktop = {
      ...(window.kaurKhorDesktop ?? {}),
      system: {
        ...(window.kaurKhorDesktop?.system ?? {}),
        createBackupSnapshot,
        restoreBackupSnapshot,
      },
      sena: {
        ...(window.kaurKhorDesktop?.sena ?? {}),
        listObservations,
        getCatalog,
        getWorkspaceSummary,
        getDiagnostics,
        getRunStatus,
      },
    };
  });

  test('opens from the global shortcut and navigates on selection', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPaletteProvider>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
            <Route element={<div>Products screen</div>} path="/catalog" />
          </Routes>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });

    expect(screen.getByRole('searchbox', { name: 'Search commands' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /^ProductsPage/ }));

    await waitFor(() => {
      expect(screen.getByText('Products screen')).toBeInTheDocument();
    });
    expect(screen.queryByRole('searchbox', { name: 'Search commands' })).not.toBeInTheDocument();
  }, 10000);

  test('opens even when a text input is focused', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPaletteProvider>
          <Routes>
            <Route
              element={<input aria-label="Plain input" />}
              path="/"
            />
          </Routes>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    const input = screen.getByRole('textbox', { name: 'Plain input' });
    input.focus();
    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });

    expect(screen.getByRole('searchbox', { name: 'Search commands' })).toBeInTheDocument();
  });

  test('executes settings commands directly from the palette', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPaletteProvider>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search commands' }), {
      target: { value: 'khmer' },
    });

    fireEvent.click(screen.getByRole('option', { name: /Set language to Khmer/ }));

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith({ language: 'km' });
    });
  });

  test('omits locked page commands until data unlocks them', async () => {
    inventoryHook.mockReturnValue({
      ...inventoryHook(),
      catalog: { schemaVersion: 1, bundles: [], services: [], sharingMask: [], skus: [] },
      observations: [],
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPaletteProvider>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search commands' }), {
      target: { value: 'catalog' },
    });

    expect(screen.queryByRole('option', { name: /^ProductsPage/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^PerformancePage/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^FinancialsPage/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^LogsPage/ })).not.toBeInTheDocument();
  });

  test('runs local workspace backup actions from the command palette', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <CommandPaletteProvider>
          <Routes>
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search commands' }), {
      target: { value: 'backup snapshot' },
    });
    fireEvent.click(screen.getByRole('option', { name: /Create backup snapshot/ }));

    await waitFor(() => {
      expect(createBackupSnapshot).toHaveBeenCalledTimes(1);
    });
  });

  test('runs local workspace exports from the command palette', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <CommandPaletteProvider>
          <Routes>
            <Route element={<div>Settings screen</div>} path="/settings" />
          </Routes>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search commands' }), {
      target: { value: 'planning data' },
    });
    fireEvent.click(screen.getByRole('option', { name: /Export planning data: Excel/ }));

    await waitFor(() => {
      expect(getCatalog).toHaveBeenCalledTimes(1);
      expect(listObservations).toHaveBeenCalledTimes(1);
      expect(getWorkspaceSummary).toHaveBeenCalledTimes(1);
      expect(getDiagnostics).toHaveBeenCalledTimes(1);
    });
  });

  test('renders Khmer search chrome and result copy when the language is Khmer', () => {
    preferencesHook.mockReturnValue({
      applyDisplayViewMode,
      applySenaEngineParameters,
      currency: 'USD',
      displayViewMode: 'custom',
      language: 'km',
      savePreferences,
      senaEngineParameters: { smoothingEnabled: true },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      t: (key: string) =>
        ({
          navAnalysis: 'Explain',
          navArchive: 'បណ្ណសារ',
          navCatalog: 'ទំនិញ',
          navHome: 'Home',
          navInbox: 'Inbox',
          navWork: 'ការងារ',
          navCapture: 'Capture',
          navInsights: 'Insights',
          navHistory: 'History',
          navOperations: 'កំណត់ហេតុ',
          navOverview: 'ទិដ្ឋភាពទូទៅ',
          navPerformance: 'សុខភាពអាជីវកម្ម',
          navRecordUpdate: 'កត់ត្រាការអាប់ដេត',
          navSettings: 'ការកំណត់',
          navHelp: 'ជំនួយ',
          settingsBackupSnapshotAction: 'បង្កើតស្នេបស្ហតបម្រុងទុក',
          settingsExportLogsAction: 'នាំចេញកំណត់ហេតុ',
          settingsExportSenaDataAction: 'នាំចេញទិន្នន័យផែនការ',
          settingsLocalWorkspaceStorageTitle: 'ទិន្នន័យកន្លែងធ្វើការក្នុងម៉ាស៊ីន',
          settingsRestoreSnapshotAction: 'ស្តារស្នេបស្ហតដែលបានរក្សាទុក',
          settingsPreferencesControlsTitle: 'ចំណូលចិត្តកន្លែងធ្វើការ',
          settingsSenaParametersPanelTitle: 'ការកំណត់លម្អិតផែនការ',
        }[key] ?? key),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPaletteProvider>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });

    expect(screen.getByRole('searchbox', { name: 'ស្វែងរកពាក្យបញ្ជា' })).toBeInTheDocument();
    expect(screen.getByText('ទំព័រដើម និងច្រកចូលការងារប្រចាំថ្ងៃ')).toBeInTheDocument();
    expect(screen.getAllByText('ទំព័រ').length).toBeGreaterThan(0);
    expect(screen.queryByText('Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Command home and daily entry point')).not.toBeInTheDocument();
    expect(screen.getByText('រុករក')).toBeInTheDocument();
    expect(screen.getByText('បើក')).toBeInTheDocument();
    expect(screen.getByText('បិទ')).toBeInTheDocument();
  });

  test('finds settings commands from Khmer search terms without English-only aliases', () => {
    preferencesHook.mockReturnValue({
      applyDisplayViewMode,
      applySenaEngineParameters,
      currency: 'USD',
      displayViewMode: 'custom',
      language: 'km',
      savePreferences,
      senaEngineParameters: { smoothingEnabled: true },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      t: (key: string) =>
        ({
          navSettings: 'ការកំណត់',
          settingsExportLogsAction: 'នាំចេញកំណត់ហេតុ',
          settingsExportSenaDataAction: 'នាំចេញទិន្នន័យផែនការ',
          settingsLocalWorkspaceStorageTitle: 'ទិន្នន័យកន្លែងធ្វើការក្នុងម៉ាស៊ីន',
          settingsPreferencesControlsTitle: 'ចំណូលចិត្តកន្លែងធ្វើការ',
          settingsSenaParametersPanelTitle: 'ការកំណត់លម្អិតផែនការ',
        }[key] ?? key),
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPaletteProvider>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });
    const searchbox = screen.getByRole('searchbox', { name: 'ស្វែងរកពាក្យបញ្ជា' });

    fireEvent.change(searchbox, { target: { value: 'ភាសា' } });
    expect(screen.getByRole('option', { name: /ប្តូរភាសាទៅខ្មែរ/ })).toBeInTheDocument();

    fireEvent.change(searchbox, { target: { value: 'រូបិយប័ណ្ណ' } });
    expect(screen.getByRole('option', { name: /ប្តូររូបិយប័ណ្ណទៅរៀល/ })).toBeInTheDocument();

    fireEvent.change(searchbox, { target: { value: 'តេលេក្រាម' } });
    expect(screen.getByRole('option', { name: /ការទទួលសំណើ/ })).toBeInTheDocument();

    fireEvent.change(searchbox, { target: { value: 'នាំចេញទិន្នន័យ' } });
    expect(screen.getByRole('option', { name: /នាំចេញទិន្នន័យផែនការ: ឯកសារអិចសែល/ })).toBeInTheDocument();
    expect(screen.queryByText(/Excel/)).not.toBeInTheDocument();
  });

  test('renders best matches ahead of grouped page, tab, and action results', () => {
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [],
        sharingMask: [],
        skus: [{
          archived: false,
          costPerUnit: 4,
          description: 'SKU 1',
          leadTimeMeanDaysHint: 5,
          leadTimeStdDaysHint: 1,
          name: 'SKU 1',
          productPrice: 9,
          skuId: 'sku-1',
          soldAsProduct: true,
        }],
      },
      diagnostics: null,
      error: null,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations: [],
      reload: vi.fn(),
      reports: [],
      senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
      snapshot: null,
      workspaceSummary: null,
      archiveCatalogEntity,
      unarchiveCatalogEntity,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPaletteProvider>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search commands' }), {
      target: { value: 'c' },
    });

    expect(screen.getByText('Best Matches')).toBeInTheDocument();
    expect(screen.getByText('Pages')).toBeInTheDocument();
    expect(screen.getByText('Tabs')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  test('scrolls the active result into view during arrow navigation', () => {
    const scrollIntoView = vi.fn();
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: Array.from({ length: 8 }, (_, index) => ({
          archived: false,
          bundle: false,
          description: `Service ${index + 1}`,
          name: `Service ${index + 1}`,
          price: 10 + index,
          serviceId: `service-${index + 1}`,
        })),
        sharingMask: [],
        skus: Array.from({ length: 12 }, (_, index) => ({
          archived: false,
          costPerUnit: 4,
          description: `SKU ${index + 1}`,
          leadTimeMeanDaysHint: 5,
          leadTimeStdDaysHint: 1,
          name: `SKU ${index + 1}`,
          productPrice: 9,
          skuId: `sku-${index + 1}`,
          soldAsProduct: true,
        })),
      },
      diagnostics: null,
      error: null,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations: [],
      reload: vi.fn(),
      reports: [],
      senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
      snapshot: null,
      workspaceSummary: null,
      archiveCatalogEntity,
      unarchiveCatalogEntity,
    });

    const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPaletteProvider>
          <Routes>
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });

    const input = screen.getByRole('searchbox', { name: 'Search commands' });
    fireEvent.change(input, { target: { value: 'sku' } });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(scrollIntoView).toHaveBeenCalled();

    window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  test('opens the shared confirmation dialog before archiving from the command palette', async () => {
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [],
        sharingMask: [],
        skus: [{
          archived: false,
          costPerUnit: 4,
          description: 'SKU 1',
          leadTimeMeanDaysHint: 5,
          leadTimeStdDaysHint: 1,
          name: 'SKU 1',
          productPrice: 9,
          skuId: 'sku-1',
          soldAsProduct: true,
        }],
      },
      diagnostics: null,
      error: null,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations: [],
      reload: vi.fn(),
      reports: [],
      senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
      snapshot: null,
      workspaceSummary: null,
      archiveCatalogEntity,
      unarchiveCatalogEntity,
    });

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <CommandPaletteProvider>
          <Routes>
            <Route element={<div>Products screen</div>} path="/catalog" />
          </Routes>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search commands' }), {
      target: { value: 'archive sku 1' },
    });
    fireEvent.click(screen.getByRole('option', { name: /Archive SKU 1/ }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Archive SKU 1?');

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(archiveCatalogEntity).toHaveBeenCalledWith({
        entityId: 'sku-1',
        entityType: 'sku',
      });
    });
  });

  test('opens the shared confirmation dialog before unarchiving from the command palette', async () => {
    inventoryHook.mockReturnValue({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [],
        sharingMask: [],
        skus: [{
          archived: true,
          costPerUnit: 4,
          description: 'SKU 1',
          leadTimeMeanDaysHint: 5,
          leadTimeStdDaysHint: 1,
          name: 'SKU 1',
          productPrice: 9,
          skuId: 'sku-1',
          soldAsProduct: true,
        }],
      },
      diagnostics: null,
      error: null,
      isLoading: false,
      isSaving: false,
      latestRun: null,
      observations: [],
      reload: vi.fn(),
      reports: [],
      senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
      snapshot: null,
      workspaceSummary: null,
      archiveCatalogEntity,
      unarchiveCatalogEntity,
    });

    render(
      <MemoryRouter initialEntries={['/operations/archive']}>
        <CommandPaletteProvider>
          <Routes>
            <Route element={<div>Archive screen</div>} path="/operations/archive" />
          </Routes>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search commands' }), {
      target: { value: 'unarchive sku 1' },
    });
    fireEvent.click(screen.getByRole('option', { name: /Unarchive SKU 1/ }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Unarchive SKU 1?');

    fireEvent.click(screen.getByRole('button', { name: 'Unarchive' }));

    await waitFor(() => {
      expect(unarchiveCatalogEntity).toHaveBeenCalledWith({
        entityId: 'sku-1',
        entityType: 'sku',
      });
    });
  });
});

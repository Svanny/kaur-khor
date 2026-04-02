import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManagedCoreController } from './core-manager';
import { migrateLegacyDesktopData } from './data-migration';
import { hasMacDockIconPair, macIconAssets } from './icon';
import { loadDesktopPreferences, saveDesktopPreferences } from './preferences';
import {
  IPC_CHANNELS,
  type DesktopAppContext,
  type DesktopExportResult,
  type DesktopLocalDataInfo,
  type DesktopPreferences,
  type GetSenaServiceDetailPayload,
  type GetSenaSkuDetailPayload,
  type GetSistServiceDetailPayload,
  type GetSistSkuDetailPayload,
  type SaveRankingPayload,
  type SaveServicePayload,
  type SaveSkuPayload,
} from '@shared/ipc';
import type {
  InventorySnapshot,
  RankingEntryType,
  ServiceRecord,
  SkuRecord,
  SistSettings,
  StockReport,
  StockReportDeletePayload,
  StockReportSubmission,
  StockReportUpdatePayload,
  StockUpdatePayload,
} from '@shared/inventory';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationRecord,
  SenaServiceDetail,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
const iconAssets = macIconAssets(projectRoot);
const desktopDataPath = app.isPackaged
  ? app.getPath('userData')
  : join(projectRoot, '.banji-dev-data');

let mainWindow: BrowserWindow | null = null;
let desktopContext: DesktopAppContext = {
  appVersion: app.getVersion(),
  platform: process.platform,
};
const managedCore = createManagedCoreController({
  projectRoot,
  userDataPath: desktopDataPath,
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
});

const INVENTORY_STORE_FILENAME = 'desktop-inventory-store.json';
const PREFERENCES_STORE_FILENAME = 'desktop-preferences.json';

function toCsvValue(value: boolean | number | string | null | undefined) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function toCsvLine(values: Array<boolean | number | string | null | undefined>) {
  return values
    .map((value) => `"${toCsvValue(value).replace(/"/g, '""')}"`)
    .join(',');
}

function getRankingPosition(
  snapshot: InventorySnapshot,
  entryType: RankingEntryType,
  entryId: string,
) {
  const match = snapshot.ranking.find(
    (entry) => entry.entryType === entryType && entry.entryId === entryId,
  );
  return match ? match.position + 1 : null;
}

function buildSkusCsv(snapshot: InventorySnapshot) {
  const header = toCsvLine([
    'sku_id',
    'name',
    'description',
    'units_in_stock',
    'cost_per_unit',
    'sold_as_product',
    'product_price',
    'lead_time_mean_days',
    'lead_time_std_days',
    'ranking_position',
  ]);
  const rows = snapshot.skus.map((sku: SkuRecord) =>
    toCsvLine([
      sku.skuId,
      sku.name,
      sku.description,
      sku.unitsInStock,
      sku.costPerUnit,
      sku.soldAsProduct,
      sku.productPrice,
      sku.leadTimeMeanDays,
      sku.leadTimeStdDays,
      getRankingPosition(snapshot, 'sku', sku.skuId),
    ]),
  );
  return `${[header, ...rows].join('\n')}\n`;
}

function buildServicesCsv(snapshot: InventorySnapshot) {
  const header = toCsvLine([
    'service_id',
    'name',
    'description',
    'price',
    'linked_sku_ids',
    'linked_sku_count',
    'ranking_position',
  ]);
  const rows = snapshot.services.map((service: ServiceRecord) =>
    toCsvLine([
      service.serviceId,
      service.name,
      service.description,
      service.price,
      service.skuIds.join('|'),
      service.skuIds.length,
      getRankingPosition(snapshot, 'service', service.serviceId),
    ]),
  );
  return `${[header, ...rows].join('\n')}\n`;
}

function buildStockReportsCsv(snapshot: InventorySnapshot, reports: StockReport[]) {
  const skuNames = new Map(snapshot.skus.map((sku) => [sku.skuId, sku.name]));
  const serviceNames = new Map(snapshot.services.map((service) => [service.serviceId, service.name]));
  const header = toCsvLine([
    'report_id',
    'report_source',
    'reported_at',
    'row_type',
    'item_id',
    'item_name',
    'units_in_stock',
    'cost_per_unit',
    'restock_included',
    'retail_stockout',
    'stockout',
    'price',
    'report_notes',
    'row_notes',
  ]);
  const rows = reports.flatMap((report) => {
    const skuRows = report.skuObservations.map((row) =>
      toCsvLine([
        report.reportId,
        report.reportSource,
        report.reportedAt,
        'sku_observation',
        row.skuId,
        skuNames.get(row.skuId) ?? row.skuId,
        row.unitsInStock,
        row.costPerUnit,
        row.restockIncluded ?? null,
        row.retailStockout ?? null,
        null,
        null,
        report.notes,
        row.notes,
      ]),
    );
    const signalRows = report.serviceSignals.map((row) =>
      toCsvLine([
        report.reportId,
        report.reportSource,
        report.reportedAt,
        'service_signal',
        row.serviceId,
        serviceNames.get(row.serviceId) ?? row.serviceId,
        null,
        null,
        null,
        null,
        row.stockout ?? null,
        null,
        report.notes,
        null,
      ]),
    );
    const priceRows = report.servicePriceAdjustments.map((row) =>
      toCsvLine([
        report.reportId,
        report.reportSource,
        report.reportedAt,
        'service_price_adjustment',
        row.serviceId,
        serviceNames.get(row.serviceId) ?? row.serviceId,
        null,
        null,
        null,
        null,
        null,
        row.price,
        report.notes,
        null,
      ]),
    );

    return [...skuRows, ...signalRows, ...priceRows];
  });

  return `${[header, ...rows].join('\n')}\n`;
}

async function exportCsv(
  defaultFileName: string,
  buildContents: () => Promise<string>,
): Promise<DesktopExportResult | null> {
  const result = await dialog.showSaveDialog(mainWindow ?? undefined, {
    defaultPath: join(desktopDataPath, defaultFileName),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await mkdir(dirname(result.filePath), { recursive: true });
  const contents = await buildContents();
  await writeFile(result.filePath, contents, 'utf8');
  return { path: result.filePath };
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#f2e8d8',
    title: 'Banji Desktop',
    icon: process.platform === 'darwin' ? undefined : iconAssets.dockIconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[renderer:load-failed] ${errorCode} ${errorDescription} ${validatedURL}`,
      );
    },
  );
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(
      `[renderer:gone] reason=${details.reason} exitCode=${details.exitCode}`,
    );
  });
}

async function boot() {
  if (!app.isPackaged) {
    const migratedFiles = await migrateLegacyDesktopData(
      desktopDataPath,
      app.getPath('userData'),
    );
    if (migratedFiles.length > 0) {
      console.log(
        `[desktop-data] migrated ${migratedFiles.join(', ')} from legacy Electron userData`,
      );
    }
  }
  if (process.platform === 'darwin' && hasMacDockIconPair(projectRoot)) {
    app.dock.setIcon(nativeImage.createFromPath(iconAssets.dockIconPath));
  }
  await createMainWindow();
}

ipcMain.handle(IPC_CHANNELS.systemGetAppContext, async () => desktopContext);
ipcMain.handle(IPC_CHANNELS.systemGetLocalDataInfo, async () => {
  const info: DesktopLocalDataInfo = {
    dataDirectoryPath: desktopDataPath,
    inventoryStorePath: join(desktopDataPath, INVENTORY_STORE_FILENAME),
    preferencesPath: join(desktopDataPath, PREFERENCES_STORE_FILENAME),
    storageFormat: 'json',
  };
  return info;
});
ipcMain.handle(IPC_CHANNELS.systemOpenLocalDataFolder, async () => {
  await mkdir(desktopDataPath, { recursive: true });
  const openError = await shell.openPath(desktopDataPath);
  if (openError) {
    throw new Error(openError);
  }
});
ipcMain.handle(IPC_CHANNELS.systemExportSkusCsv, async () =>
  exportCsv('banji-skus.csv', async () => {
    const snapshot = await managedCore.invoke<InventorySnapshot>('inventory.getSnapshot');
    return buildSkusCsv(snapshot);
  }),
);
ipcMain.handle(IPC_CHANNELS.systemExportServicesCsv, async () =>
  exportCsv('banji-services.csv', async () => {
    const snapshot = await managedCore.invoke<InventorySnapshot>('inventory.getSnapshot');
    return buildServicesCsv(snapshot);
  }),
);
ipcMain.handle(IPC_CHANNELS.systemExportStockReportsCsv, async () =>
  exportCsv('banji-stock-reports.csv', async () => {
    const [snapshot, reports] = await Promise.all([
      managedCore.invoke<InventorySnapshot>('inventory.getSnapshot'),
      managedCore.invoke<StockReport[]>('inventory.listStockReports'),
    ]);
    return buildStockReportsCsv(snapshot, reports);
  }),
);
ipcMain.handle(IPC_CHANNELS.inventoryGetSnapshot, async () =>
  managedCore.invoke<InventorySnapshot>('inventory.getSnapshot'),
);
ipcMain.handle(IPC_CHANNELS.inventoryListStockReports, async () =>
  managedCore.invoke<StockReport[]>('inventory.listStockReports'),
);
ipcMain.handle(IPC_CHANNELS.inventorySaveSku, async (_event, payload: SaveSkuPayload) =>
  managedCore.invoke<InventorySnapshot>('inventory.saveSku', payload),
);
ipcMain.handle(
  IPC_CHANNELS.inventorySaveService,
  async (_event, payload: SaveServicePayload) =>
    managedCore.invoke<InventorySnapshot>('inventory.saveService', payload),
);
ipcMain.handle(
  IPC_CHANNELS.inventoryApplyStockUpdates,
  async (_event, payload: StockUpdatePayload) =>
    managedCore.invoke<InventorySnapshot>('inventory.applyStockUpdates', payload),
);
ipcMain.handle(
  IPC_CHANNELS.inventorySubmitStockReport,
  async (_event, payload: StockReportSubmission) =>
    managedCore.invoke<InventorySnapshot>('inventory.submitStockReport', payload),
);
ipcMain.handle(
  IPC_CHANNELS.inventoryUpdateStockReport,
  async (_event, payload: StockReportUpdatePayload) =>
    managedCore.invoke<InventorySnapshot>('inventory.updateStockReport', payload),
);
ipcMain.handle(
  IPC_CHANNELS.inventoryDeleteStockReport,
  async (_event, payload: StockReportDeletePayload) =>
    managedCore.invoke<InventorySnapshot>('inventory.deleteStockReport', payload),
);
ipcMain.handle(
  IPC_CHANNELS.inventorySaveRanking,
  async (_event, payload: SaveRankingPayload) =>
    managedCore.invoke<InventorySnapshot>('inventory.saveRanking', payload),
);
ipcMain.handle(
  IPC_CHANNELS.inventoryGetSistSkuDetail,
  async (_event, payload: GetSistSkuDetailPayload) =>
    managedCore.invoke('inventory.getSistSkuDetail', {
      skuId: payload.skuId,
    }),
);
ipcMain.handle(
  IPC_CHANNELS.inventoryGetSistServiceDetail,
  async (_event, payload: GetSistServiceDetailPayload) =>
    managedCore.invoke('inventory.getSistServiceDetail', {
      serviceId: payload.serviceId,
    }),
);
ipcMain.handle(IPC_CHANNELS.inventoryGetSistSystemDetail, async () =>
  managedCore.invoke('inventory.getSistSystemDetail'),
);
ipcMain.handle(
  IPC_CHANNELS.inventoryUpdateSistSettings,
  async (_event, payload: SistSettings) =>
    managedCore.invoke<InventorySnapshot>('inventory.updateSistSettings', payload),
);
ipcMain.handle(IPC_CHANNELS.inventoryGetSenaCatalog, async () =>
  managedCore.invoke<SenaCatalog | null>('sena.getCatalog'),
);
ipcMain.handle(IPC_CHANNELS.inventoryListSenaObservations, async () =>
  managedCore.invoke<SenaObservationRecord[]>('sena.listObservations'),
);
ipcMain.handle(IPC_CHANNELS.inventoryUpsertSenaCatalog, async (_event, payload: SenaCatalog) =>
  managedCore.invoke<SenaCatalog>('sena.upsertCatalog', payload),
);
ipcMain.handle(
  IPC_CHANNELS.inventoryTriggerSenaRun,
  async (_event, payload?: { algorithmVersion?: string }) =>
    managedCore.invoke<SenaAnalysisRunRecord>('sena.triggerRun', payload),
);
ipcMain.handle(IPC_CHANNELS.inventoryGetSenaWorkspaceSummary, async () =>
  managedCore.invoke<SenaWorkspaceSummary | null>('sena.getWorkspaceSummary'),
);
ipcMain.handle(
  IPC_CHANNELS.inventoryGetSenaSkuDetail,
  async (_event, payload: GetSenaSkuDetailPayload) =>
    managedCore.invoke<SenaSkuDetail | null>('sena.getSkuDetail', {
      skuId: payload.skuId,
    }),
);
ipcMain.handle(IPC_CHANNELS.inventoryGetSenaDiagnostics, async () =>
  managedCore.invoke<SenaDiagnostics | null>('sena.getDiagnostics'),
);
ipcMain.handle(
  IPC_CHANNELS.inventoryGetSenaServiceDetail,
  async (_event, payload: GetSenaServiceDetailPayload) =>
    managedCore.invoke<SenaServiceDetail | null>('sena.getServiceDetail', {
      serviceId: payload.serviceId,
    }),
);
ipcMain.handle(IPC_CHANNELS.preferencesGet, async () =>
  loadDesktopPreferences(desktopDataPath),
);
ipcMain.handle(
  IPC_CHANNELS.preferencesSave,
  async (_event, payload: Partial<DesktopPreferences>) =>
    saveDesktopPreferences(desktopDataPath, payload),
);

app.whenReady().then(boot);

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await managedCore.stop();
    app.quit();
  }
});

app.on('before-quit', async () => {
  await managedCore.stop();
});

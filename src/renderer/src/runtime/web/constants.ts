export const BANJI_BROWSER_APP_DATABASE = 'banji_browser_app_v1.sqlite3';
export const BANJI_BROWSER_DEMO_DATABASE = 'banji_browser_demo_v1.sqlite3';
export const BANJI_BROWSER_PREFERRED_VFS = 'opfs-sahpool';
export const BANJI_BROWSER_SCHEMA_VERSION = 1;

export type BanjiBrowserDatabaseName =
  | typeof BANJI_BROWSER_APP_DATABASE
  | typeof BANJI_BROWSER_DEMO_DATABASE;


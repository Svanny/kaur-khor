import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rcedit } from 'rcedit';

export default async function afterPackWindowsUnsignedIcon(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const projectDir = context.packager?.projectDir ?? process.cwd();
  const packageJson = JSON.parse(readFileSync(resolve(projectDir, 'package.json'), 'utf8'));
  const appInfo = context.packager?.appInfo;
  const productName = appInfo?.productName ?? packageJson.productName ?? 'KAUR KHOR';
  const productFilename = appInfo?.productFilename ?? productName;
  const version = appInfo?.version ?? packageJson.version;
  const copyright = appInfo?.copyright ?? 'Copyright © 2026 Svanny';
  const companyName = appInfo?.companyName ?? packageJson.author?.name ?? 'Svanny';
  const exePath = resolve(context.appOutDir, `${productFilename}.exe`);
  const iconPath = resolve(projectDir, 'resources/windows/kaur-khor.ico');

  if (!existsSync(exePath)) {
    throw new Error(`Cannot apply Windows app icon; executable was not found at ${exePath}.`);
  }

  if (!existsSync(iconPath)) {
    throw new Error(`Cannot apply Windows app icon; icon was not found at ${iconPath}.`);
  }

  await rcedit(exePath, {
    icon: iconPath,
    'file-version': version,
    'product-version': version,
    'version-string': {
      CompanyName: companyName,
      FileDescription: productName,
      InternalName: productFilename,
      LegalCopyright: copyright,
      OriginalFilename: `${productFilename}.exe`,
      ProductName: productName,
    },
  });
}

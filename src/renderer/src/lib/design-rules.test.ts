import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { kmUiCopy } from './km-ui-copy';
import { translateUiLiteral } from './translations';
import { activeEnUiCopy } from './ui-copy-map';

const rendererRoot = resolve(process.cwd(), 'src/renderer/src');
const existingIconlessButtons = [
  'components/banji-shell.tsx:662',
  'components/system/batch-action-prompt.tsx:62',
  'components/system/confirm-action-dialog.tsx:60',
  'components/system/confirm-action-dialog.tsx:63',
  'components/system/editor.tsx:81',
  'components/system/hover-tooltip.tsx:70',
  'components/system/interval-strip.tsx:483',
  'components/system/trading-chart/chart.tsx:2193',
  'components/system/trading-chart/chart.tsx:2196',
  'components/system/trading-chart/chart.tsx:2199',
  'components/system/trading-chart/chart.tsx:3999',
  'components/system/trading-chart/chart.tsx:4021',
  'components/system/trading-chart/chart.tsx:4049',
  'components/system/trading-chart/chart.tsx:4210',
  'components/system/trading-chart/chart.tsx:4226',
  'components/system/trading-chart/chart.tsx:4346',
  'components/system/trading-chart/chart.tsx:4355',
  'components/system/trading-chart/chart.tsx:4485',
  'components/system/trading-chart/chart.tsx:4494',
  'components/system/trading-chart/chart.tsx:4621',
  'components/system/trading-chart/chart.tsx:4630',
  'components/system/trading-chart/chart.tsx:4823',
  'components/system/trading-chart/chart.tsx:4842',
  'components/system/trading-chart/chart.tsx:4886',
  'components/system/trading-chart/chart.tsx:4898',
  'components/system/trading-chart/chart.tsx:4905',
  'components/system/trading-chart/chart.tsx:4928',
  'components/system/trading-chart/chart.tsx:4959',
  'components/system/trading-chart/chart.tsx:4962',
  'components/system/trading-chart/chart.tsx:4976',
  'components/system/trading-chart/ledger-overlay.tsx:22',
  'components/system/typed-confirm-dialog.tsx:64',
  'components/system/typed-confirm-dialog.tsx:67',
  'components/ui/anchored-menu.tsx:93',
  'components/ui/input-group.tsx:84',
  'components/ui/sidebar.tsx:287',
  'routes/benchmark-settings.tsx:52',
  'routes/benchmark-settings.tsx:556',
  'routes/benchmark-settings.tsx:559',
  'routes/benchmark-settings.tsx:631',
  'routes/benchmark-settings.tsx:693',
  'routes/catalog-item-actions.tsx:143',
  'routes/catalog-item-actions.tsx:173',
  'routes/dashboard.tsx:614',
  'routes/dashboard.tsx:654',
  'routes/dashboard.tsx:738',
  'routes/dashboard.tsx:870',
  'routes/dashboard.tsx:895',
  'routes/dashboard.tsx:924',
  'routes/detail-panels.tsx:81',
  'routes/detail-panels.tsx:90',
  'routes/detail-regime-overlay.tsx:132',
  'routes/help.tsx:103',
  'routes/help.tsx:206',
  'routes/inventory.tsx:518',
  'routes/inventory.tsx:525',
  'routes/performance/analysis-workbench.tsx:968',
  'routes/performance/analysis-workbench.tsx:1110',
  'routes/performance/analysis-workbench.tsx:1153',
  'routes/performance/analysis-workbench.tsx:1299',
  'routes/performance/analysis-workbench.tsx:1330',
  'routes/performance/analysis-workbench.tsx:1446',
  'routes/performance/analysis-workbench.tsx:1867',
  'routes/performance/analysis-workbench.tsx:1894',
  'routes/performance.tsx:85',
  'routes/record-update-hub.tsx:152',
  'routes/record-update-hub.tsx:340',
  'routes/record-update-hub.tsx:343',
  'routes/service-detail.tsx:335',
  'routes/service-detail.tsx:363',
  'routes/settings.tsx:361',
  'routes/settings.tsx:643',
  'routes/sku-detail/index.tsx:289',
  'routes/stock-update-session.tsx:2010',
  'routes/stock-update-session.tsx:2531',
  'routes/stock-update-session.tsx:2534',
  'routes/stock-update-session.tsx:4267',
  'routes/stock-update-session.tsx:4320',
  'routes/stock-update.tsx:940',
];

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return collectSourceFiles(path);
      }
      if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) {
        return [];
      }
      return [path];
    }),
  );
  return nested.flat();
}

function scriptKindForPath(path: string): ts.ScriptKind {
  return path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function isQuotedLiteralNode(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function collectCapitalizedBrandLiterals(ast: ts.SourceFile): string[] {
  const offenders: string[] = [];

  function visit(node: ts.Node) {
    if (isQuotedLiteralNode(node) && /\bBanji\b/.test(node.text)) {
      const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
      offenders.push(`${relative(rendererRoot, ast.fileName)}:${line + 1}`);
    }

    if (ts.isJsxText(node) && /\bBanji\b/.test(node.getText(ast))) {
      const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
      offenders.push(`${relative(rendererRoot, ast.fileName)}:${line + 1}`);
    }

    ts.forEachChild(node, visit);
  }

  visit(ast);
  return offenders;
}

function jsxTagName(name: ts.JsxTagNameExpression): string {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  if (ts.isPropertyAccessExpression(name)) {
    return name.name.text;
  }
  return name.getText();
}

function hasIconDescendant(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  let found = false;

  function visit(child: ts.Node) {
    if (found) {
      return;
    }

    if (ts.isJsxElement(child)) {
      const tagName = jsxTagName(child.openingElement.tagName);
      if (tagName === 'svg' || tagName.endsWith('Icon')) {
        found = true;
        return;
      }
    }

    if (ts.isJsxSelfClosingElement(child)) {
      const tagName = jsxTagName(child.tagName);
      if (tagName === 'svg' || tagName.endsWith('Icon')) {
        found = true;
        return;
      }
    }

    ts.forEachChild(child, visit);
  }

  ts.forEachChild(node, visit);
  return found;
}

function isButtonElement(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const tagName = ts.isJsxElement(node)
    ? jsxTagName(node.openingElement.tagName)
    : jsxTagName(node.tagName);
  return tagName === 'button' || tagName === 'Button';
}

describe('global design rules', () => {
  test('keeps the canonical brand token and Khmer translation explicit in UI copy', () => {
    expect(activeEnUiCopy.appBrand).toBe('banj');
    expect(kmUiCopy.appBrand).toBe('បញ្ជី');
    expect(translateUiLiteral('km', 'banj')).toBe('បញ្ជី');
    expect(translateUiLiteral('km', 'banji')).toBe('បញ្ជី');
  });

  test('blocks capitalized Banji in renderer source literals', async () => {
    const sourceFiles = await collectSourceFiles(rendererRoot);
    const offenders: string[] = [];

    for (const sourceFile of sourceFiles) {
      const source = await readFile(sourceFile, 'utf8');
      const ast = ts.createSourceFile(
        sourceFile,
        source,
        ts.ScriptTarget.Latest,
        true,
        scriptKindForPath(sourceFile),
      );
      offenders.push(...collectCapitalizedBrandLiterals(ast));
    }

    expect(offenders).toEqual([]);
  });

  test('tracks iconless button debt so new buttons include icons', async () => {
    const sourceFiles = await collectSourceFiles(rendererRoot);
    const iconlessButtons: string[] = [];

    for (const sourceFile of sourceFiles) {
      const source = await readFile(sourceFile, 'utf8');
      const ast = ts.createSourceFile(
        sourceFile,
        source,
        ts.ScriptTarget.Latest,
        true,
        scriptKindForPath(sourceFile),
      );

      function visit(node: ts.Node) {
        if (
          (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) &&
          isButtonElement(node) &&
          !hasIconDescendant(node)
        ) {
          const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
          iconlessButtons.push(`${relative(rendererRoot, sourceFile)}:${line + 1}`);
        }
        ts.forEachChild(node, visit);
      }

      visit(ast);
    }

    expect(iconlessButtons).toEqual(existingIconlessButtons);
  });
});

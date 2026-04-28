import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { kmUiCopy } from './km-ui-copy';
import { translateUiLiteral } from './translations';
import { activeEnUiCopy } from './ui-copy-map';

const rendererRoot = resolve(process.cwd(), 'src/renderer/src');

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

function jsxElementChildren(node: ts.JsxElement | ts.JsxFragment): ts.NodeArray<ts.JsxChild> {
  return node.children;
}

function jsxAttributeName(node: ts.JsxAttributeLike): string | null {
  if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  return null;
}

function isIconName(name: string): boolean {
  return name === 'svg' || name === 'Icon' || name.endsWith('Icon') || name.toLowerCase() === 'icon';
}

function isDestructiveIconName(name: string): boolean {
  return name === 'ActionDeleteIcon' || name === 'ActionExplosionIcon';
}

function expressionLooksLikeIcon(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return /(^icon$|Icon$)/.test(expression.text);
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return /(^icon$|Icon$)/.test(expression.name.text);
  }

  if (ts.isJsxElement(expression)) {
    return isIconName(jsxTagName(expression.openingElement.tagName)) || hasIconDescendant(expression);
  }

  if (ts.isJsxSelfClosingElement(expression)) {
    return isIconName(jsxTagName(expression.tagName));
  }

  if (ts.isConditionalExpression(expression)) {
    return expressionLooksLikeIcon(expression.whenTrue) || expressionLooksLikeIcon(expression.whenFalse);
  }

  if (ts.isParenthesizedExpression(expression)) {
    return expressionLooksLikeIcon(expression.expression);
  }

  return false;
}

function expressionLooksLikeDestructiveIcon(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return isDestructiveIconName(expression.text);
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return isDestructiveIconName(expression.name.text);
  }

  if (ts.isJsxElement(expression)) {
    return isDestructiveIconName(jsxTagName(expression.openingElement.tagName));
  }

  if (ts.isJsxSelfClosingElement(expression)) {
    return isDestructiveIconName(jsxTagName(expression.tagName));
  }

  if (ts.isConditionalExpression(expression)) {
    return expressionLooksLikeDestructiveIcon(expression.whenTrue)
      || expressionLooksLikeDestructiveIcon(expression.whenFalse);
  }

  if (ts.isParenthesizedExpression(expression)) {
    return expressionLooksLikeDestructiveIcon(expression.expression);
  }

  return false;
}

function hasIconDescendant(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  let found = false;

  function visit(child: ts.Node) {
    if (found) {
      return;
    }

    if (ts.isJsxElement(child)) {
      const tagName = jsxTagName(child.openingElement.tagName);
      if (isIconName(tagName)) {
        found = true;
        return;
      }

      for (const attribute of child.openingElement.attributes.properties) {
        if (jsxAttributeName(attribute) === 'data-icon') {
          found = true;
          return;
        }
      }

      jsxElementChildren(child).forEach(visit);
      return;
    }

    if (ts.isJsxSelfClosingElement(child)) {
      const tagName = jsxTagName(child.tagName);
      if (isIconName(tagName)) {
        found = true;
        return;
      }

      for (const attribute of child.attributes.properties) {
        if (jsxAttributeName(attribute) === 'data-icon') {
          found = true;
          return;
        }
      }
    }

    if (ts.isJsxExpression(child) && child.expression && expressionLooksLikeIcon(child.expression)) {
      found = true;
      return;
    }
  }

  if (ts.isJsxElement(node)) {
    jsxElementChildren(node).forEach(visit);
  }
  return found;
}

function hasDestructiveIconDescendant(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  let found = false;

  function visit(child: ts.Node) {
    if (found) {
      return;
    }

    if (ts.isJsxElement(child)) {
      if (isDestructiveIconName(jsxTagName(child.openingElement.tagName))) {
        found = true;
        return;
      }

      jsxElementChildren(child).forEach(visit);
      return;
    }

    if (ts.isJsxSelfClosingElement(child) && isDestructiveIconName(jsxTagName(child.tagName))) {
      found = true;
      return;
    }

    if (ts.isJsxExpression(child) && child.expression && expressionLooksLikeDestructiveIcon(child.expression)) {
      found = true;
    }
  }

  if (ts.isJsxElement(node)) {
    jsxElementChildren(node).forEach(visit);
  }

  return found;
}

function expressionLooksLikeVisibleLabel(expression: ts.Expression | undefined): boolean {
  if (!expression) {
    return false;
  }

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text.trim().length > 0;
  }

  if (ts.isTemplateExpression(expression) || ts.isBinaryExpression(expression)) {
    return true;
  }

  if (ts.isConditionalExpression(expression)) {
    return expressionLooksLikeVisibleLabel(expression.whenTrue)
      || expressionLooksLikeVisibleLabel(expression.whenFalse);
  }

  if (ts.isCallExpression(expression)) {
    const callee = expression.expression.getText();
    return /(^|\.)t$|translateUiLiteral|format|Label|label/i.test(callee);
  }

  if (ts.isIdentifier(expression)) {
    return /label|title|name/i.test(expression.text);
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return /label|title|name/i.test(expression.name.text);
  }

  return false;
}

function hasVisibleButtonLabel(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  if (ts.isJsxSelfClosingElement(node)) {
    return false;
  }

  let found = false;

  function visit(child: ts.JsxChild) {
    if (found) {
      return;
    }

    if (ts.isJsxText(child) && child.getText().trim().length > 0) {
      found = true;
      return;
    }

    if (ts.isJsxExpression(child) && expressionLooksLikeVisibleLabel(child.expression)) {
      found = true;
      return;
    }

    if (ts.isJsxElement(child) || ts.isJsxFragment(child)) {
      jsxElementChildren(child).forEach(visit);
    }
  }

  jsxElementChildren(node).forEach(visit);
  return found;
}

function isButtonElement(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const tagName = ts.isJsxElement(node)
    ? jsxTagName(node.openingElement.tagName)
    : jsxTagName(node.tagName);
  return tagName === 'button' || tagName === 'Button';
}

function isTogglePillElement(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const tagName = ts.isJsxElement(node)
    ? jsxTagName(node.openingElement.tagName)
    : jsxTagName(node.tagName);
  return tagName === 'ToggleGroupItem';
}

function attributeExpressionText(attribute: ts.JsxAttributeLike): string {
  if (!ts.isJsxAttribute(attribute) || !attribute.initializer) {
    return '';
  }

  if (ts.isStringLiteral(attribute.initializer)) {
    return attribute.initializer.text;
  }

  if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
    return attribute.initializer.expression.getText();
  }

  return '';
}

function collectIntentText(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  const parts: string[] = [];

  function add(value: string | undefined) {
    if (value) {
      parts.push(value);
    }
  }

  function visit(child: ts.Node) {
    if (ts.isJsxText(child)) {
      add(child.getText());
      return;
    }

    if (ts.isJsxExpression(child) && child.expression) {
      add(child.expression.getText());
      return;
    }

    if (ts.isJsxElement(child) || ts.isJsxFragment(child)) {
      jsxElementChildren(child).forEach(visit);
    }
  }

  if (ts.isJsxElement(node)) {
    jsxElementChildren(node).forEach(visit);
  }

  for (const attribute of ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties) {
    const name = jsxAttributeName(attribute);
    if (!name || (name !== 'aria-label' && name !== 'title')) {
      continue;
    }

    if (attribute.initializer && ts.isStringLiteral(attribute.initializer)) {
      add(attribute.initializer.text);
    }

    if (attribute.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
      add(attribute.initializer.expression.getText());
    }
  }

  return parts.join(' ');
}

const destructiveIntentPattern = /\b(delete|remove|discard|destroy|erase)\b|clear current/i;

function hasDestructiveIntent(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  return hasDestructiveIconDescendant(node) || destructiveIntentPattern.test(collectIntentText(node));
}

function buttonVariantExpression(node: ts.JsxElement | ts.JsxSelfClosingElement): string | null {
  const attributes = ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;

  for (const attribute of attributes) {
    if (jsxAttributeName(attribute) !== 'variant') {
      continue;
    }

    if (attribute.initializer && ts.isStringLiteral(attribute.initializer)) {
      return attribute.initializer.text;
    }

    if (attribute.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
      return attribute.initializer.expression.getText();
    }
  }

  return null;
}

function buttonClassExpression(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  const attributes = ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;

  for (const attribute of attributes) {
    if (jsxAttributeName(attribute) !== 'className') {
      continue;
    }

    if (attribute.initializer && ts.isStringLiteral(attribute.initializer)) {
      return attribute.initializer.text;
    }

    if (attribute.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
      return attribute.initializer.expression.getText();
    }
  }

  return '';
}

function togglePillValueExpression(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  const attributes = ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;

  for (const attribute of attributes) {
    if (jsxAttributeName(attribute) === 'value') {
      return attributeExpressionText(attribute);
    }
  }

  return '';
}

function parentToggleGroup(node: ts.Node): ts.JsxElement | ts.JsxSelfClosingElement | null {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (ts.isJsxElement(current) && jsxTagName(current.openingElement.tagName) === 'ToggleGroup') {
      return current;
    }
    if (ts.isJsxSelfClosingElement(current) && jsxTagName(current.tagName) === 'ToggleGroup') {
      return current;
    }
    current = current.parent;
  }

  return null;
}

const timeframeToggleValuePattern = /^(h|d|w|m|y|max|ytd|recent|custom|all|\d+[hdwmy])$/i;
const timeframeToggleGroupPattern = /time\s*range|timeframe|date\s*range|business\s*window/i;

function isTimeframeTogglePill(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const valueExpression = togglePillValueExpression(node);
  if (timeframeToggleValuePattern.test(valueExpression.trim())) {
    return true;
  }

  const group = parentToggleGroup(node);
  if (!group) {
    return false;
  }

  const attributes = ts.isJsxElement(group) ? group.openingElement.attributes.properties : group.attributes.properties;
  return attributes.some((attribute) =>
    jsxAttributeName(attribute) === 'aria-label' &&
    timeframeToggleGroupPattern.test(attributeExpressionText(attribute)),
  );
}

const chartTimeframeContainerPattern = /^(Chart duration|Chart timeframe)$/;

function isChartTimeframeButton(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (ts.isJsxElement(current)) {
      const tagName = jsxTagName(current.openingElement.tagName);
      if (tagName === 'div' || tagName === 'span') {
        const attributes = current.openingElement.attributes.properties;
        for (const attribute of attributes) {
          if (jsxAttributeName(attribute) === 'aria-label') {
            const text = attributeExpressionText(attribute);
            if (chartTimeframeContainerPattern.test(text)) {
              return true;
            }
          }
        }
      }
    }
    current = current.parent;
  }

  return false;
}

function hasDestructiveTreatment(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const tagName = isButtonElement(node) ? (ts.isJsxElement(node) ? jsxTagName(node.openingElement.tagName) : jsxTagName(node.tagName)) : null;
  if (!tagName) {
    return false;
  }

  if (tagName === 'Button') {
    return /destructive/.test(buttonVariantExpression(node) ?? '');
  }

  return /destructive|rose-|red-/.test(buttonClassExpression(node));
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

  test('requires every visible-label button to include an icon', async () => {
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
          hasVisibleButtonLabel(node) &&
          !isChartTimeframeButton(node) &&
          !hasIconDescendant(node)
        ) {
          const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
          iconlessButtons.push(`${relative(rendererRoot, sourceFile)}:${line + 1}`);
        }
        ts.forEachChild(node, visit);
      }

      visit(ast);
    }

    expect(iconlessButtons).toEqual([]);
  });

  test('requires every visible-label toggle pill to include an icon', async () => {
    const sourceFiles = await collectSourceFiles(rendererRoot);
    const iconlessTogglePills: string[] = [];

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
          isTogglePillElement(node) &&
          hasVisibleButtonLabel(node) &&
          !isTimeframeTogglePill(node) &&
          !hasIconDescendant(node)
        ) {
          const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
          iconlessTogglePills.push(`${relative(rendererRoot, sourceFile)}:${line + 1}`);
        }
        ts.forEachChild(node, visit);
      }

      visit(ast);
    }

    expect(iconlessTogglePills).toEqual([]);
  });

  test('requires destructive buttons to use destructive treatment', async () => {
    const sourceFiles = await collectSourceFiles(rendererRoot);
    const unsafeDestructiveButtons: string[] = [];

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
          hasDestructiveIntent(node) &&
          !hasDestructiveTreatment(node)
        ) {
          const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
          unsafeDestructiveButtons.push(`${relative(rendererRoot, sourceFile)}:${line + 1}`);
        }
        ts.forEachChild(node, visit);
      }

      visit(ast);
    }

    expect(unsafeDestructiveButtons).toEqual([]);
  });
});

import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { kmUiCopy } from '../localization/km-ui-copy';
import { translateUiLiteral } from '../localization/translations';
import { activeEnUiCopy } from '../localization/ui-copy-map';

const rendererRoot = resolve(process.cwd(), 'src/renderer/src');
const docsRoot = resolve(process.cwd(), 'docs');

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

function slugifyHelpHeading(value: string) {
  const explicitAnchor = value.match(/\{#([\p{Letter}\p{Number}_-]+)\}\s*$/u)?.[1];
  if (explicitAnchor) {
    return explicitAnchor;
  }
  return visibleHelpHeading(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function visibleHelpHeading(value: string) {
  return value.replace(/\s*\{#[\p{Letter}\p{Number}_-]+\}\s*$/u, '');
}

async function collectHelpSubsectionIds(path: string) {
  const markdown = await readFile(path, 'utf8');
  return new Set(
    markdown
      .split(/\r?\n/)
      .filter((line) => line.startsWith('### ') || line.startsWith('#### '))
      .map((line) => slugifyHelpHeading(line.replace(/^#{3,4}\s+/, ''))),
  );
}

async function collectRepeatedHelpSubsectionPrefixes(path: string) {
  const markdown = await readFile(path, 'utf8');
  const offenders: string[] = [];
  let sectionTitle = '';
  const alternatePrefixesBySection = new Map([
    ['Capture', ['Record Update']],
    ['Intake', ['Automation']],
    ['Automations', ['Automation']],
  ]);

  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      sectionTitle = visibleHelpHeading(line.replace(/^##\s+/, '')).trim();
      continue;
    }
    if (!line.startsWith('### ') && !line.startsWith('#### ')) {
      continue;
    }

    const title = visibleHelpHeading(line.replace(/^#{3,4}\s+/, '')).trim();
    const prefixes = [sectionTitle, ...(alternatePrefixesBySection.get(sectionTitle) ?? [])].filter(Boolean);
    if (prefixes.some((prefix) => title.startsWith(`${prefix} `))) {
      offenders.push(title);
    }
  }

  return offenders;
}

async function collectLatinKhmerHelpSubsectionTitles(path: string) {
  const markdown = await readFile(path, 'utf8');
  return markdown
    .split(/\r?\n/)
    .filter((line) => line.startsWith('### ') || line.startsWith('#### '))
    .map((line) => visibleHelpHeading(line.replace(/^#{3,4}\s+/, '')).trim())
    .filter((title) => /\p{Script=Latin}/u.test(title));
}

function isQuotedLiteralNode(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function collectOldBrandLiterals(ast: ts.SourceFile): string[] {
  const offenders: string[] = [];
  const oldBrandPattern = new RegExp(`\\b(?:[Bb]anji|${'BAN' + 'JI'})\\b`);

  function isAllowedGitHubSurfaceLiteral(value: string) {
    return (
      value.includes('github.com/Svanny/kaur-khor') ||
      value.includes('api.github.com/repos/Svanny/kaur-khor') ||
      value.includes('svanny.github.io/kaur-khor') ||
      value.includes('/kaur-khor/') ||
      /\bkaur-khor-\d/.test(value) ||
      /\bkaur-khor-<version>/.test(value) ||
      value.includes('kaur-khor-source.tar.gz') ||
      value.includes('cd kaur-khor-main')
    );
  }

  function visit(node: ts.Node) {
    if (isQuotedLiteralNode(node) && oldBrandPattern.test(node.text) && !isAllowedGitHubSurfaceLiteral(node.text)) {
      const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
      offenders.push(`${relative(rendererRoot, ast.fileName)}:${line + 1}`);
    }

    if (ts.isJsxText(node) && oldBrandPattern.test(node.getText(ast))) {
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

function isDesignIconExemptButton(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const attributes = ts.isJsxElement(node)
    ? node.openingElement.attributes.properties
    : node.attributes.properties;
  return attributes.some((attribute) => jsxAttributeName(attribute) === 'data-design-icon-exempt');
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

    add(attributeExpressionText(attribute));
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

    return attributeExpressionText(attribute);
  }

  return null;
}

function buttonClassExpression(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  const attributes = ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;

  for (const attribute of attributes) {
    if (jsxAttributeName(attribute) !== 'className') {
      continue;
    }

    return attributeExpressionText(attribute);
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

const chartTimeframeContainerPattern = /(?:^|['"`])(Chart duration|Chart timeframe)(?:['"`]|$)/;

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

function isPaginationEndpointButton(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  return jsxAttributes(node).some((attribute) =>
    jsxAttributeName(attribute) === 'data-slot' &&
    attributeExpressionText(attribute) === 'paged-panel-nav-pill',
  );
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

const helperRequiredComponents = new Set([
  'HeaderedTableHeaderCell',
  'OverviewColumn',
  'PerformanceRightRailBlock',
  'PerformanceSectionShell',
  'RailBlock',
  'SectionLabel',
  'SectionTitle',
  'TableHead',
  'WorkspacePanel',
  'WorkspaceTitleCard',
]);

const helperCoveredChildComponents = new Set([
  'HeaderTooltipLabel',
  'HelpTooltip',
  'SectionLabel',
  'SectionTitle',
]);

const helperCoverageAttributes = new Set([
  'data-helper-exempt',
  'helpHref',
  'helperExemptReason',
  'tooltip',
  'tooltipKey',
]);

const explicitHelpHrefComponents = new Set([
  'AnalysisRailSection',
  'EditorField',
  'HeaderTooltipLabel',
  'HelpTooltip',
  'LaneLabel',
  'PerformanceRightRailBlock',
  'PerformanceSectionShell',
  'SectionLabel',
  'SectionTitle',
]);

const helperCoverageAllowlist: Record<string, string> = {
  'components/system/merchandising-editor.tsx:261': 'legacy merchandising ranking header awaiting dedicated column help',
  'components/system/merchandising-editor.tsx:263': 'legacy merchandising ranking header awaiting dedicated column help',
  'components/system/merchandising-editor.tsx:264': 'legacy merchandising ranking header awaiting dedicated column help',
  'components/system/merchandising-editor.tsx:265': 'legacy merchandising ranking header awaiting dedicated column help',
  'routes/archive.tsx:137': 'legacy archive title card awaiting route-level helper copy',
  'routes/archive.tsx:203': 'legacy archive grouped panel awaiting archive helper copy',
  'routes/archive.tsx:244': 'legacy archive grouped panel awaiting archive helper copy',
  'routes/automations.tsx:692': 'legacy automation empty-state title card',
  'routes/automations.tsx:707': 'legacy automation title card awaiting route-level helper copy',
  'routes/automations/exception-table.tsx:67': 'action column contains commands rather than business meaning',
  'routes/automations/intake-table.tsx:70': 'action column contains commands rather than business meaning',
  'routes/command-home.tsx:133': 'legacy command-home title card awaiting route-level helper copy',
  'routes/workspace/command-home.tsx:133': 'legacy command-home title card awaiting route-level helper copy',
  'routes/dashboard.tsx:787': 'legacy work title card awaiting route-level helper copy',
  'routes/dashboard.tsx:918': 'legacy dashboard work-table header awaiting helper copy',
  'routes/dashboard.tsx:919': 'legacy dashboard work-table header awaiting helper copy',
  'routes/dashboard.tsx:920': 'legacy dashboard work-table header awaiting helper copy',
  'routes/dashboard.tsx:921': 'action column contains commands rather than business meaning',
  'routes/dashboard.tsx:1103': 'legacy dashboard supplier-table header awaiting helper copy',
  'routes/dashboard.tsx:1104': 'legacy dashboard supplier-table header awaiting helper copy',
  'routes/dashboard.tsx:1105': 'legacy dashboard supplier-table header awaiting helper copy',
  'routes/dashboard.tsx:1106': 'action column contains commands rather than business meaning',
  'routes/dashboard.tsx:1726': 'queue catalog shortcut title relies on adjacent route copy',
  'routes/dashboard.tsx:1857': 'customer queue header is covered by the queue page description',
  'routes/dashboard.tsx:1858': 'customer queue header is covered by the queue page description',
  'routes/dashboard.tsx:1859': 'customer queue header is covered by the queue page description',
  'routes/dashboard.tsx:1860': 'action column contains commands rather than business meaning',
  'routes/dashboard.tsx:2050': 'supplier queue header is covered by the queue page description',
  'routes/dashboard.tsx:2051': 'supplier queue header is covered by the queue page description',
  'routes/dashboard.tsx:2052': 'supplier queue header is covered by the queue page description',
  'routes/dashboard.tsx:2053': 'action column contains commands rather than business meaning',
  'routes/financials.tsx:705': 'legacy money title card awaiting route-level helper copy',
  'routes/help.tsx:175': 'help page own title card explains itself through the guide intro',
  'routes/help.tsx:218': 'empty state title, not an information-bearing section',
  'routes/help.tsx:250': 'rendered guide section title from docs content',
  'routes/help.tsx:336': 'help index navigation title, not business concept copy',
  'routes/help.tsx:374': 'repository-link support panel, not business concept copy',
  'routes/insights.tsx:91': 'legacy insights title card awaiting route-level helper copy',
  'routes/inventory.tsx:348': 'loading catalog panel placeholder',
  'routes/inventory.tsx:357': 'loading catalog panel placeholder',
  'routes/inventory.tsx:378': 'loading catalog panel placeholder',
  'routes/inventory.tsx:387': 'loading catalog panel placeholder',
  'routes/inventory.tsx:492': 'legacy catalog empty-state title card',
  'routes/inventory.tsx:516': 'legacy catalog title card awaiting route-level helper copy',
  'routes/inventory.tsx:665': 'catalog action rail is covered by the route title card',
  'routes/inventory.tsx:689': 'catalog action rail is covered by the route title card',
  'routes/loading-wireframes.tsx:54': 'loading wireframe title placeholder',
  'routes/inventory/loading-wireframes.tsx:54': 'loading wireframe title placeholder',
  'routes/performance.tsx:558': 'legacy pressure title card awaiting route-level helper copy',
  'routes/insights/performance.tsx:558': 'legacy pressure title card awaiting route-level helper copy',
  'routes/performance/analysis-content.tsx:224': 'legacy explain title card awaiting route-level helper copy',
  'routes/record-update-hub.tsx:666': 'legacy capture hub title card awaiting route-level helper copy',
  'routes/service-detail/right-rail.tsx:66': 'legacy service rail block awaiting helper copy',
  'routes/inventory/service-detail/right-rail.tsx:66': 'legacy service rail block awaiting helper copy',
  'routes/service-detail/right-rail.tsx:78': 'legacy service rail block awaiting helper copy',
  'routes/inventory/service-detail/right-rail.tsx:78': 'legacy service rail block awaiting helper copy',
  'routes/service-detail/right-rail.tsx:90': 'legacy service rail block awaiting helper copy',
  'routes/inventory/service-detail/right-rail.tsx:90': 'legacy service rail block awaiting helper copy',
  'routes/service-detail/right-rail.tsx:112': 'legacy service rail block awaiting helper copy',
  'routes/inventory/service-detail/right-rail.tsx:112': 'legacy service rail block awaiting helper copy',
  'routes/service-detail/right-rail.tsx:134': 'legacy service rail block awaiting helper copy',
  'routes/inventory/service-detail/right-rail.tsx:134': 'legacy service rail block awaiting helper copy',
  'routes/service-detail/right-rail.tsx:149': 'legacy service rail block awaiting helper copy',
  'routes/inventory/service-detail/right-rail.tsx:149': 'legacy service rail block awaiting helper copy',
  'routes/service-detail/right-rail.tsx:160': 'legacy service rail block awaiting helper copy',
  'routes/inventory/service-detail/right-rail.tsx:160': 'legacy service rail block awaiting helper copy',
  'routes/service-form.tsx:204': 'loading service editor panel placeholder',
  'routes/service-form.tsx:215': 'loading service editor panel placeholder',
  'routes/service-form.tsx:222': 'loading service editor panel placeholder',
  'routes/service-form.tsx:242': 'loading service editor panel placeholder',
  'routes/service-form.tsx:253': 'loading service editor panel placeholder',
  'routes/service-form.tsx:260': 'loading service editor panel placeholder',
  'routes/settings.tsx:1510': 'destructive confirmation route title handled by dialog copy',
  'routes/stock-update.tsx:807': 'legacy history title card awaiting route-level helper copy',
  'routes/stock-update.tsx:876': 'legacy history panel awaiting helper copy',
  'routes/stock-update.tsx:986': 'selected-day title is dynamic context, not a reusable concept header',
  'routes/stock-update.tsx:1019': 'legacy history panel awaiting helper copy',
  'routes/stock-update-session.tsx:377': 'record-update loading placeholder',
  'routes/stock-update-session.tsx:378': 'record-update loading placeholder',
  'routes/stock-update-session.tsx:379': 'record-update loading placeholder',
  'routes/stock-update-session.tsx:471': 'record-update POS stock summary header',
  'routes/stock-update-session.tsx:472': 'record-update POS stock summary header',
  'routes/stock-update-session.tsx:473': 'record-update POS stock summary header',
  'routes/stock-update-session.tsx:4062': 'legacy record-update session panel awaiting helper copy',
  'routes/stock-update-session.tsx:4174': 'legacy record-update session panel awaiting helper copy',
  'routes/stock-update-session.tsx:4318': 'legacy record-update session panel awaiting helper copy',
  'routes/stock-update-session.tsx:4482': 'legacy record-update session panel awaiting helper copy',
  'routes/stock-update-session.tsx:4635': 'legacy record-update session panel awaiting helper copy',
  'routes/stock-update-session.tsx:4675': 'legacy record-update session panel awaiting helper copy',
  'routes/stock-update-session.tsx:4747': 'legacy record-update session panel awaiting helper copy',
  'routes/stock-update-session.tsx:4813': 'legacy record-update session panel awaiting helper copy',
  'routes/stock-update-session.tsx:4891': 'legacy record-update session panel awaiting helper copy',
  'routes/stock-update-session.tsx:5055': 'legacy record-update session panel awaiting helper copy',
  'routes/stock-update-session.tsx:5248': 'legacy record-update session panel awaiting helper copy',
  'routes/stock-update-session.tsx:5387': 'legacy record-update session panel awaiting helper copy',
  'routes/stock-update-session.tsx:9866': 'legacy record-update review panel awaiting helper copy',
  'routes/stock-update-session.tsx:9881': 'legacy record-update review panel awaiting helper copy',
  'routes/stock-update-session.tsx:10428': 'legacy record-update summary panel awaiting helper copy',
  'routes/stock-update-session.tsx:10694': 'legacy record-update summary panel awaiting helper copy',
  'routes/stock-update-session.tsx:11180': 'record-update POS timing summary surface',
  'routes/stock-update-session.tsx:11195': 'record-update POS delivery summary surface',
  'routes/stock-update-session.tsx:11213': 'record-update POS discount summary surface',
  'routes/stock-update-session.tsx:11151': 'record-update summary loading placeholder',
  'routes/stock-update-session.tsx:11152': 'record-update summary loading placeholder',
  'routes/stock-update-session.tsx:11153': 'record-update summary loading placeholder',
  'routes/stock-update-session.tsx:12056': 'record-update POS customer order stage header',
  'routes/stock-update-session.tsx:12343': 'record-update POS customer order stage header',
  'routes/stock-update-session.tsx:12857': 'record-update POS receipt confirmation header',
  'routes/stock-update-session.tsx:12858': 'record-update POS receipt confirmation header',
  'routes/stock-update-session.tsx:12859': 'record-update POS receipt confirmation header',
  'routes/work.tsx:55': 'legacy work redirect title card awaiting helper copy',
  'routes/work.tsx:130': 'legacy work redirect title card awaiting helper copy',
};

function jsxAttributes(node: ts.JsxElement | ts.JsxSelfClosingElement): ts.NodeArray<ts.JsxAttributeLike> {
  return ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;
}

function hasAttribute(node: ts.JsxElement | ts.JsxSelfClosingElement, names: Set<string>) {
  return jsxAttributes(node).some((attribute) => {
    const name = jsxAttributeName(attribute);
    return name != null && names.has(name);
  });
}

function hasAttributeNamed(node: ts.JsxElement | ts.JsxSelfClosingElement, name: string) {
  return jsxAttributes(node).some((attribute) => jsxAttributeName(attribute) === name);
}

function literalTextFromExpression(expression: ts.Expression): string | null {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  return null;
}

function literalTextFromJsxAttribute(attribute: ts.JsxAttribute): string | null {
  if (!attribute.initializer) {
    return null;
  }

  if (ts.isStringLiteral(attribute.initializer)) {
    return attribute.initializer.text;
  }

  if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
    return literalTextFromExpression(attribute.initializer.expression);
  }

  return null;
}

function jsxElementTagName(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  return ts.isJsxElement(node) ? jsxTagName(node.openingElement.tagName) : jsxTagName(node.tagName);
}

function childHasHelperCoverage(node: ts.JsxElement): boolean {
  let covered = false;

  function visit(child: ts.Node) {
    if (covered) {
      return;
    }

    if (ts.isJsxElement(child)) {
      const tagName = jsxTagName(child.openingElement.tagName);
      if (helperCoveredChildComponents.has(tagName)) {
        covered = true;
        return;
      }
      jsxElementChildren(child).forEach(visit);
      return;
    }

    if (ts.isJsxSelfClosingElement(child)) {
      const tagName = jsxTagName(child.tagName);
      if (helperCoveredChildComponents.has(tagName)) {
        covered = true;
      }
    }
  }

  jsxElementChildren(node).forEach(visit);
  return covered;
}

function expressionHasHelperCoverage(expression: ts.Expression): boolean {
  if (ts.isJsxElement(expression)) {
    const tagName = jsxTagName(expression.openingElement.tagName);
    return helperCoveredChildComponents.has(tagName) || childHasHelperCoverage(expression);
  }

  if (ts.isJsxSelfClosingElement(expression)) {
    return helperCoveredChildComponents.has(jsxTagName(expression.tagName));
  }

  if (ts.isParenthesizedExpression(expression)) {
    return expressionHasHelperCoverage(expression.expression);
  }

  if (ts.isConditionalExpression(expression)) {
    return expressionHasHelperCoverage(expression.whenTrue) || expressionHasHelperCoverage(expression.whenFalse);
  }

  return false;
}

function titleAttributeHasHelperCoverage(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  for (const attribute of jsxAttributes(node)) {
    if (jsxAttributeName(attribute) !== 'title' || !ts.isJsxAttribute(attribute) || !attribute.initializer) {
      continue;
    }

    if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
      return expressionHasHelperCoverage(attribute.initializer.expression);
    }
  }

  return false;
}

function hasHelperCoverage(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  return hasAttribute(node, helperCoverageAttributes)
    || titleAttributeHasHelperCoverage(node)
    || (ts.isJsxElement(node) && childHasHelperCoverage(node));
}

function helperSurfaceHasVisibleLabel(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const tagName = jsxElementTagName(node);
  if (tagName === 'WorkspacePanel' || tagName === 'WorkspaceTitleCard') {
    return jsxAttributes(node).some((attribute) => jsxAttributeName(attribute) === 'title');
  }

  if (tagName === 'PerformanceSectionShell' || tagName === 'PerformanceRightRailBlock' || tagName === 'OverviewColumn' || tagName === 'RailBlock') {
    return jsxAttributes(node).some((attribute) => jsxAttributeName(attribute) === 'title');
  }

  if (ts.isJsxSelfClosingElement(node)) {
    return hasAttribute(node, new Set(['children', 'title']));
  }

  return hasVisibleButtonLabel(node);
}

function collectLiteralHelpHrefs(ast: ts.SourceFile): string[] {
  const helpHrefs: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      for (const attribute of jsxAttributes(node)) {
        if (jsxAttributeName(attribute) !== 'helpHref' || !ts.isJsxAttribute(attribute) || !attribute.initializer) {
          continue;
        }

        const literal = literalTextFromJsxAttribute(attribute);
        if (literal) {
          helpHrefs.push(literal);
        }
      }
    }

    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'helpHref'
    ) {
      const literal = literalTextFromExpression(node.initializer);
      if (literal) {
        helpHrefs.push(literal);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(ast);
  return helpHrefs;
}

function helperComponentNeedsExplicitHelpHref(node: ts.JsxElement | ts.JsxSelfClosingElement) {
  const tagName = jsxElementTagName(node);
  if (!explicitHelpHrefComponents.has(tagName)) {
    return false;
  }

  if (tagName === 'HelpTooltip') {
    return true;
  }

  return hasAttributeNamed(node, 'tooltip') || hasAttributeNamed(node, 'content');
}

describe('global design rules', () => {
  test('keeps the canonical brand token and Khmer translation explicit in UI copy', () => {
    expect(activeEnUiCopy.appBrand).toBe('KAUR KHOR');
    expect(kmUiCopy.appBrand).toBe('កខ');
    expect(translateUiLiteral('km', 'Kaur Khor')).toBe('កខ');
    expect(translateUiLiteral('km', 'KAUR KHOR')).toBe('កខ');
  });

  test('blocks old brand literals in renderer source literals', async () => {
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
      offenders.push(...collectOldBrandLiterals(ast));
    }

    expect(offenders).toEqual([]);
  });

  test('blocks old GitHub, Pages, and release slugs in renderer source literals', () => {
    const oldSlug = ['ba', 'nji'].join('');
    const sourceFile = resolve(rendererRoot, 'old-slug-guard.ts');
    const source = [
      `const staleGithub = 'https://github.com/Svanny/${oldSlug}/blob/main/docs/user-guide.md';`,
      `const stalePages = 'https://svanny.github.io/${oldSlug}/';`,
      `const staleRelease = '${oldSlug}-1.2.3.dmg';`,
      "const currentGithub = 'https://github.com/Svanny/kaur-khor/blob/main/docs/user-guide.md';",
      "const currentPages = 'https://svanny.github.io/kaur-khor/';",
      "const currentRelease = 'kaur-khor-1.2.3.dmg';",
    ].join('\n');
    const ast = ts.createSourceFile(
      sourceFile,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    expect(collectOldBrandLiterals(ast)).toEqual([
      'old-slug-guard.ts:1',
      'old-slug-guard.ts:2',
      'old-slug-guard.ts:3',
    ]);
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
          !isPaginationEndpointButton(node) &&
          !isDesignIconExemptButton(node) &&
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

  test('requires visible app title and table header surfaces to include helper coverage or an explicit exemption', async () => {
    const sourceFiles = await collectSourceFiles(rendererRoot);
    const missingHelperCoverage: string[] = [];

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
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tagName = jsxElementTagName(node);
          if (
            helperRequiredComponents.has(tagName) &&
            helperSurfaceHasVisibleLabel(node) &&
            !hasHelperCoverage(node)
          ) {
            const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
            const key = `${relative(rendererRoot, sourceFile)}:${line + 1}`;
            if (!helperCoverageAllowlist[key]) {
              missingHelperCoverage.push(key);
            }
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(ast);
    }

    expect(missingHelperCoverage).toEqual([]);
  });

  test('requires helper tooltip surfaces to pass an explicit helpHref', async () => {
    const sourceFiles = await collectSourceFiles(rendererRoot);
    const missingExplicitHelpHref: string[] = [];

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
          helperComponentNeedsExplicitHelpHref(node) &&
          !hasAttributeNamed(node, 'helpHref')
        ) {
          const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
          missingExplicitHelpHref.push(`${relative(rendererRoot, sourceFile)}:${line + 1}`);
        }
        ts.forEachChild(node, visit);
      }

      visit(ast);
    }

    expect(missingExplicitHelpHref).toEqual([]);
  });

  test('requires each More help link to target its own existing Help section', async () => {
    const sourceFiles = await collectSourceFiles(rendererRoot);
    const enHelpSubsections = await collectHelpSubsectionIds(resolve(docsRoot, 'user-guide.md'));
    const kmHelpSubsections = await collectHelpSubsectionIds(resolve(docsRoot, 'user-guide.km.md'));
    const missingSections: string[] = [];
    const bareHelpTargets: string[] = [];
    const glossaryTargets: string[] = [];

    for (const sourceFile of sourceFiles) {
      const source = await readFile(sourceFile, 'utf8');
      const ast = ts.createSourceFile(
        sourceFile,
        source,
        ts.ScriptTarget.Latest,
        true,
        scriptKindForPath(sourceFile),
      );

      for (const helpHref of collectLiteralHelpHrefs(ast)) {
        const sectionId = helpHref.startsWith('/settings/help#') ? helpHref.slice('/settings/help#'.length) : '';
        if (sectionId.length === 0) {
          bareHelpTargets.push(`${relative(rendererRoot, sourceFile)}:${helpHref}`);
          continue;
        }
        if (sectionId === 'glossary-terms') {
          glossaryTargets.push(`${relative(rendererRoot, sourceFile)}:${helpHref}`);
        }
        if (!enHelpSubsections.has(sectionId) || !kmHelpSubsections.has(sectionId)) {
          missingSections.push(`${relative(rendererRoot, sourceFile)}:${helpHref}`);
        }
      }
    }

    expect(bareHelpTargets).toEqual([]);
    expect(glossaryTargets).toEqual([]);
    expect(missingSections).toEqual([]);
  });

  test('keeps Help subsection titles free of repeated page prefixes', async () => {
    const prefixedHeadings = await collectRepeatedHelpSubsectionPrefixes(resolve(docsRoot, 'user-guide.md'));

    expect(prefixedHeadings).toEqual([]);
  });

  test('keeps visible Khmer Help subsection titles free of Latin text', async () => {
    const latinHeadings = await collectLatinKhmerHelpSubsectionTitles(resolve(docsRoot, 'user-guide.km.md'));

    expect(latinHeadings).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { createWorkbook } from './xlsx';

describe('createWorkbook', () => {
  it('builds a real xlsx zip archive with one worksheet per table', () => {
    const workbook = createWorkbook([
      {
        name: 'Products SKUs',
        rows: [{ skuId: 'sku-1', onHand: 12 }],
      },
      {
        name: 'Diagnostics',
        rows: [{ ok: true }],
      },
    ]);

    expect(Array.from(workbook.slice(0, 2))).toEqual([0x50, 0x4b]);

    const archiveText = new TextDecoder().decode(workbook);
    expect(archiveText).toContain('[Content_Types].xml');
    expect(archiveText).toContain('xl/workbook.xml');
    expect(archiveText).toContain('xl/worksheets/sheet1.xml');
    expect(archiveText).toContain('xl/worksheets/sheet2.xml');
    expect(archiveText).toContain('Products SKUs');
    expect(archiveText).toContain('Diagnostics');
    expect(archiveText).toContain('sku-1');
    expect(archiveText).toContain('<v>12</v>');
    expect(archiveText).toContain('<v>1</v>');
  });

  it('sanitizes and deduplicates worksheet names for excel limits', () => {
    const workbook = createWorkbook([
      { name: 'Bad:/\\?*[]Name', rows: [] },
      { name: 'Bad:/\\?*[]Name', rows: [] },
      { name: 'A'.repeat(31) + '1', rows: [] },
      { name: 'A'.repeat(31) + '2', rows: [] },
    ]);

    const archiveText = new TextDecoder().decode(workbook);
    expect(archiveText).toContain('Bad       Name');
    expect(archiveText).toContain('Bad       Name (2)');
    expect(archiveText).toContain(`${'A'.repeat(31)}" sheetId=`);
    expect(archiveText).toContain(`${'A'.repeat(27)} (2)`);
  });

  it('deduplicates worksheet names case-insensitively for Excel', () => {
    const workbook = createWorkbook([
      { name: 'Sales', rows: [] },
      { name: 'sales', rows: [] },
    ]);

    const archiveText = new TextDecoder().decode(workbook);
    expect(archiveText).toContain('Sales');
    expect(archiveText).toContain('sales (2)');
  });

  it('serializes dirty object cells without failing workbook creation', () => {
    const circular: Record<string, unknown> = { label: 'dirty' };
    circular.self = circular;

    const workbook = createWorkbook([
      {
        name: 'Dirty',
        rows: [{ payload: circular, bigintValue: BigInt(12) }],
      },
    ]);

    const archiveText = new TextDecoder().decode(workbook);
    expect(archiveText).toContain('&quot;self&quot;:&quot;[Circular]&quot;');
    expect(archiveText).toContain('12');
  });

  it('strips XML-invalid text from workbook cells without removing valid Unicode pairs', () => {
    const workbook = createWorkbook([
      {
        name: 'Dirty XML',
        rows: [{ label: 'before\uD800after 🍵', control: 'ok\u0001done', khmer: 'តែ 🍵' }],
      },
    ]);

    const archiveText = new TextDecoder().decode(workbook);
    const worksheetXml = archiveText.slice(archiveText.indexOf('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet'));
    expect(archiveText).toContain('beforeafter');
    expect(archiveText).toContain('beforeafter 🍵');
    expect(archiveText).toContain('តែ 🍵');
    expect(archiveText).toContain('okdone');
    expect(worksheetXml).not.toContain('\uD800');
    expect(worksheetXml).not.toContain('ok\u0001done');
  });

  it('neutralizes formula-leading workbook text and headers', () => {
    const workbook = createWorkbook([
      {
        name: 'Formula inputs',
        rows: [
          {
            '=HYPERLINK("https://example.test")': '=SUM(1,2)',
            plus: '+1',
            minus: '-1',
            at: '@foo',
            tabFormula: '\t=SUM(1,2)',
            spaceFormula: ' @foo',
          },
        ],
      },
    ]);

    const archiveText = new TextDecoder().decode(workbook);
    expect(archiveText).toContain('&apos;=HYPERLINK(&quot;https://example.test&quot;)');
    expect(archiveText).toContain('&apos;=SUM(1,2)');
    expect(archiveText).toContain('&apos;+1');
    expect(archiveText).toContain('&apos;-1');
    expect(archiveText).toContain('&apos;@foo');
    expect(archiveText).toContain('&apos;\t=SUM(1,2)');
    expect(archiveText).toContain('&apos; @foo');
  });
});

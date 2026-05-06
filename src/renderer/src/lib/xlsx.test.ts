import { describe, expect, it } from 'vitest';
import { createWorkbook } from './xlsx';

describe('createWorkbook', () => {
  it('builds a real xlsx zip archive with one worksheet per table', () => {
    const workbook = createWorkbook([
      {
        name: 'Catalog SKUs',
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
    expect(archiveText).toContain('Catalog SKUs');
    expect(archiveText).toContain('Diagnostics');
    expect(archiveText).toContain('sku-1');
    expect(archiveText).toContain('<v>12</v>');
    expect(archiveText).toContain('<v>1</v>');
  });

  it('sanitizes and deduplicates worksheet names for excel limits', () => {
    const workbook = createWorkbook([
      { name: 'Bad:/\\?*[]Name', rows: [] },
      { name: 'Bad:/\\?*[]Name', rows: [] },
    ]);

    const archiveText = new TextDecoder().decode(workbook);
    expect(archiveText).toContain('Bad       Name');
    expect(archiveText).toContain('Bad       Name (2)');
  });
});

import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { Table, TableBody, TableCell, TableRow } from './table';

describe('TableRow', () => {
  test('uses the shared row hover styling', () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Row content</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(container.querySelector('[data-slot="table-row"]')?.className).toContain(rowHoverClassName);
  });
});

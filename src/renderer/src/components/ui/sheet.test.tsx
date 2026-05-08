import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet';

describe('Sheet portal target', () => {
  afterEach(() => {
    delete document.documentElement.dataset.kaurKhorEmbeddedPhoneLandscape;
  });

  test('renders inside the embedded surface in phone landscape mode', async () => {
    document.documentElement.dataset.kaurKhorEmbeddedPhoneLandscape = 'true';
    const embeddedSurface = document.createElement('div');
    embeddedSurface.dataset.slot = 'embedded-auto-zoom-surface';
    document.body.appendChild(embeddedSurface);

    try {
      render(
        <Sheet open>
          <SheetContent>
            <SheetTitle>Drawer title</SheetTitle>
            <SheetDescription>Drawer description</SheetDescription>
          </SheetContent>
        </Sheet>,
      );

      await waitFor(() => {
        expect(embeddedSurface).toContainElement(screen.getByRole('dialog'));
      });
    } finally {
      embeddedSurface.remove();
    }
  });
});

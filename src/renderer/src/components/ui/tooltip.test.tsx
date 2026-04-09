import { render, screen } from '@testing-library/react';
import { DescriptionTextVisibilityProvider } from '@/components/system/description-text';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

describe('TooltipContent', () => {
  test('renders generic tooltip content even when optional help text is hidden', async () => {
    render(
      <DescriptionTextVisibilityProvider visible={false}>
        <TooltipProvider>
          <Tooltip defaultOpen>
            <TooltipTrigger asChild>
              <button type="button">Interval</button>
            </TooltipTrigger>
            <TooltipContent>Apr 10, 2026</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </DescriptionTextVisibilityProvider>,
    );

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Apr 10, 2026');
  });
});

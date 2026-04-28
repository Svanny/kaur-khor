import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DescriptionTextVisibilityProvider } from '@/components/system/description-text';
import { HelpTooltip } from '@/components/system/help-tooltip';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.hash}`}</div>;
}

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

  test('renders above dialog surfaces', async () => {
    render(
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger asChild>
            <button type="button">Delivery fee help</button>
          </TooltipTrigger>
          <TooltipContent>Delivery rules</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    await screen.findByRole('tooltip');
    expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveClass('z-[120]');
  });

  test('renders helper tooltip copy with a More link and right-up icon', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <DescriptionTextVisibilityProvider visible>
          <HelpTooltip
            content="Explains pressure signals."
            helpHref="/settings/help#pressure-move-now"
            label="Pressure"
          />
        </DescriptionTextVisibilityProvider>
      </MemoryRouter>,
    );

    await user.hover(screen.getByRole('button', { name: 'Pressure help' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Explains pressure signals.');
    const moreLink = screen.getAllByRole('link', { name: 'More help for Pressure' })[0];
    expect(moreLink).toHaveAttribute('href', '/settings/help#pressure-move-now');
    expect(moreLink.querySelector('svg')).toBeInTheDocument();
  });

  test('navigates More links through the router instead of falling back home', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/work']}>
        <DescriptionTextVisibilityProvider visible>
          <Routes>
            <Route
              element={(
                <>
                  <HelpTooltip
                    content="The parsed customer request before it is attached to a ticket."
                    helpHref="/settings/help#automation-intake-request"
                    label="Request"
                  />
                  <LocationProbe />
                </>
              )}
              path="/work"
            />
            <Route
              element={(
                <>
                  <div>Help destination</div>
                  <LocationProbe />
                </>
              )}
              path="/settings/help"
            />
            <Route element={<div>Home destination</div>} path="/" />
          </Routes>
        </DescriptionTextVisibilityProvider>
      </MemoryRouter>,
    );

    await user.hover(screen.getByRole('button', { name: 'Request help' }));
    await user.click((await screen.findAllByRole('link', { name: 'More help for Request' }))[0]);

    expect(screen.getByText('Help destination')).toBeInTheDocument();
    expect(screen.queryByText('Home destination')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/settings/help#automation-intake-request');
  });
});

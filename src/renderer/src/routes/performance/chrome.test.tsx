import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PerformanceRightRailBlock, PerformanceSectionShell } from './chrome';

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    showExplanatoryTooltips: true,
  }),
}));

describe('PerformanceSectionShell', () => {
  it('renders header controls below the title block when provided', () => {
    render(
      <PerformanceSectionShell
        helpHref="/settings/help#automation-live-intake"
        title="Automation intake"
        tooltip="Tooltip copy"
        headerControls={<div>Header controls</div>}
      >
        <div>Section body</div>
      </PerformanceSectionShell>,
    );

    expect(screen.getByText('Automation intake')).toBeInTheDocument();
    expect(screen.getByText('Header controls')).toBeInTheDocument();
    expect(screen.getByText('Section body')).toBeInTheDocument();
  });

  it('hides section chrome when empty hiding is enabled without body content', () => {
    const { container } = render(
      <PerformanceSectionShell
        hideWhenEmpty
        helpHref="/settings/help#automation-live-intake"
        title="Automation intake"
        tooltip="Tooltip copy"
      >
        {null}
      </PerformanceSectionShell>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe('PerformanceRightRailBlock', () => {
  it('hides rail block chrome when empty hiding is enabled without body content', () => {
    const { container } = render(
      <PerformanceRightRailBlock
        hideWhenEmpty
        helpHref="/settings/help#automation-live-intake"
        title="Automation intake"
        tooltip="Tooltip copy"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PerformanceSectionShell } from './chrome';

describe('PerformanceSectionShell', () => {
  it('renders header controls below the title block when provided', () => {
    render(
      <PerformanceSectionShell
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
});

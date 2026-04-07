import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { DescriptionTextVisibilityProvider } from '@/components/system/description-text';
import { TextInputField } from './form-fields';

describe('TextInputField', () => {
  test('keeps required helper text visible when optional help is hidden', () => {
    render(
      <DescriptionTextVisibilityProvider visible={false}>
        <TextInputField helper="Enter the current landed cost per unit." id="cost" label="Cost" />
      </DescriptionTextVisibilityProvider>,
    );

    expect(screen.getByText('Enter the current landed cost per unit.')).toBeInTheDocument();
  });

  test('replaces helper text with the error message when invalid', () => {
    render(
      <TextInputField
        error="Cost must be zero or more."
        helper="Enter the current landed cost per unit."
        id="cost"
        label="Cost"
      />,
    );

    expect(screen.getByText('Cost must be zero or more.')).toBeInTheDocument();
    expect(screen.queryByText('Enter the current landed cost per unit.')).not.toBeInTheDocument();
  });
});

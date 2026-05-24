import type * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { NumberStepperInput } from './number-stepper-input';

function renderStepper(
  props: Partial<React.ComponentProps<typeof NumberStepperInput>> = {},
) {
  const values: string[] = [];
  const onChange = vi.fn((event: React.ChangeEvent<HTMLInputElement>) => {
    values.push(event.target.value);
  });
  render(
    <NumberStepperInput
      aria-label="Units in stock"
      min="0"
      step="1"
      value="2"
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange, values };
}

describe('NumberStepperInput', () => {
  test('increments and decrements unit values by 1', () => {
    const { values } = renderStepper();

    fireEvent.click(screen.getByRole('button', { name: 'Increment Units in stock' }));
    expect(values.at(-1)).toBe('3');

    fireEvent.click(screen.getByRole('button', { name: 'Decrement Units in stock' }));
    expect(values.at(-1)).toBe('1');
  });

  test('uses decimal precision from the configured step', () => {
    const { values } = renderStepper({ 'aria-label': 'Expected time of arrival', step: '0.01', value: '1.23' });

    fireEvent.click(screen.getByRole('button', { name: 'Increment Expected time of arrival' }));

    expect(values.at(-1)).toBe('1.24');
  });

  test('uses 0.1 precision for ETA uncertainty', () => {
    const { values } = renderStepper({ 'aria-label': 'Custom uncertainty days', step: '0.1', value: '1.2' });

    fireEvent.click(screen.getByRole('button', { name: 'Increment Custom uncertainty days' }));

    expect(values.at(-1)).toBe('1.3');
  });

  test('supports currency step sizes', () => {
    const { values } = renderStepper({ 'aria-label': 'Cost per unit', step: '0.1', value: '4' });

    fireEvent.click(screen.getByRole('button', { name: 'Increment Cost per unit' }));
    expect(values.at(-1)).toBe('4.1');
  });

  test('supports KHR and exchange-rate step sizes', () => {
    const khr = renderStepper({ 'aria-label': 'KHR price', step: '100', value: '4000' });
    fireEvent.click(screen.getByRole('button', { name: 'Increment KHR price' }));
    expect(khr.values.at(-1)).toBe('4100');

    const exchange = renderStepper({ 'aria-label': 'Exchange rate', step: '10', value: '4000' });
    fireEvent.click(screen.getByRole('button', { name: 'Increment Exchange rate' }));
    expect(exchange.values.at(-1)).toBe('4010');
  });

  test('clamps decrement at min', () => {
    const { values } = renderStepper({ min: '0', value: '0' });

    fireEvent.click(screen.getByRole('button', { name: 'Decrement Units in stock' }));

    expect(values.at(-1) ?? '0').toBe('0');
  });

  test('starts empty fields from placeholder, min, or zero', () => {
    const { values } = renderStepper({ placeholder: '8', value: '' });

    fireEvent.click(screen.getByRole('button', { name: 'Increment Units in stock' }));

    expect(values.at(-1)).toBe('9');
  });

  test('parses comma-formatted values before stepping', () => {
    const { values } = renderStepper({ step: '10', value: '4,000' });

    fireEvent.click(screen.getByRole('button', { name: 'Increment Units in stock' }));

    expect(values.at(-1)).toBe('4010');
  });

  test('uses text input so drafts are not browser-normalized while typing', () => {
    renderStepper({ value: '1e309' });

    const input = screen.getByLabelText('Units in stock');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('1e309');
  });

  test('falls back to a finite step when the step prop is dirty', () => {
    const { values } = renderStepper({ step: 'Infinity', value: '2' });

    fireEvent.click(screen.getByRole('button', { name: 'Increment Units in stock' }));

    expect(values.at(-1)).toBe('3');
  });

  test('disables buttons when the input is disabled or read only', () => {
    renderStepper({ disabled: true });
    expect(screen.getByRole('button', { name: 'Increment Units in stock' })).toBeDisabled();

    renderStepper({ 'aria-label': 'Readonly stock', readOnly: true });
    expect(screen.getByRole('button', { name: 'Increment Readonly stock' })).toBeDisabled();
  });
});

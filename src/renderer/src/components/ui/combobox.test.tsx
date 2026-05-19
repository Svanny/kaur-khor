import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Combobox } from './combobox';

describe('Combobox', () => {
  it('reopens suggestions when the user types after closing them', () => {
    const handleChange = vi.fn();
    render(
      <Combobox
        aria-label="Choose item"
        onChange={handleChange}
        options={[{ label: 'Blue scarf', value: 'blue-scarf' }]}
        value="Blue"
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Choose item' });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.change(input, { target: { value: 'Blue s' } });

    expect(handleChange).toHaveBeenCalledWith('Blue s');
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not point aria-activedescendant at a missing option when there are no results', () => {
    render(
      <Combobox
        aria-label="Choose item"
        onChange={vi.fn()}
        options={[{ label: 'Blue scarf', value: 'blue-scarf' }]}
        value="missing"
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Choose item' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(screen.getByText('No results found.')).toBeInTheDocument();
  });

  it('emits the selected label through onChange for mouse and keyboard selection', () => {
    const handleChange = vi.fn();
    const handleSelect = vi.fn();
    const { rerender } = render(
      <Combobox
        aria-label="Choose item"
        onChange={handleChange}
        onSelectOption={handleSelect}
        options={[{ label: 'Blue scarf', value: 'blue-scarf' }]}
        value=""
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Choose item' });
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole('option', { name: 'Blue scarf' }));

    expect(handleChange).toHaveBeenCalledWith('Blue scarf');
    expect(handleSelect).toHaveBeenCalledWith({ label: 'Blue scarf', value: 'blue-scarf' });

    handleChange.mockClear();
    handleSelect.mockClear();
    rerender(
      <Combobox
        aria-label="Choose item"
        onChange={handleChange}
        onSelectOption={handleSelect}
        options={[{ label: 'Green scarf', value: 'green-scarf' }]}
        value=""
      />,
    );

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith('Green scarf');
    expect(handleSelect).toHaveBeenCalledWith({ label: 'Green scarf', value: 'green-scarf' });
  });
});

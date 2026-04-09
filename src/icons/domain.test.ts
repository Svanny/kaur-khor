import { describe, expect, test } from 'vitest';
import {
  getRegimeIcon,
  overviewDrawerBandIcons,
  overviewTaskActionIcons,
  overviewTaskFilterIcons,
  rankingEntryTypeIcons,
} from './domain';

describe('domain icon mappings', () => {
  test('covers all overview task action keys', () => {
    expect(Object.keys(overviewTaskActionIcons).sort()).toEqual([
      'follow_up',
      'log_order',
      'receive',
      'remind_tomorrow',
      'review',
      'start_update',
      'update_eta',
    ]);
  });

  test('covers all overview filter keys', () => {
    expect(Object.keys(overviewTaskFilterIcons).sort()).toEqual([
      'all',
      'awaiting_receipt',
      'follow_up_today',
      'ready_to_receive',
      'received_today',
      'to_order',
    ]);
  });

  test('covers all overview drawer band ids', () => {
    expect(Object.keys(overviewDrawerBandIcons).sort()).toEqual([
      'next_steps',
      'note',
      'optional_learning',
      'order_shape',
      'preview',
      'real_life',
      'receipt_details',
      'timing',
    ]);
  });

  test('covers all ranking entry types', () => {
    expect(Object.keys(rankingEntryTypeIcons).sort()).toEqual(['service', 'sku']);
  });

  test('does not reuse icons across different semantic maps except the intentional package reuse', () => {
    const semanticMaps = [
      overviewTaskActionIcons,
      overviewTaskFilterIcons,
      overviewDrawerBandIcons,
      rankingEntryTypeIcons,
    ];
    const iconNames = semanticMaps
      .flatMap((map) => Object.values(map))
      .filter((value): value is Exclude<typeof value, null> => value != null)
      .map((Icon) => Icon.displayName ?? Icon.name);
    const duplicateNames = iconNames.filter((name, index) => iconNames.indexOf(name) !== index);

    expect(duplicateNames).toEqual(['ClipboardList', 'Package']);
  });

  test('uses the shared neutral icon for the normal regime', () => {
    const Icon = getRegimeIcon('normal');

    expect(Icon.displayName ?? Icon.name).toBe('Circle');
  });
});

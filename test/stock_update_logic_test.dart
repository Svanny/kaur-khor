import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banji/security/security_limits.dart';
import 'package:banji/views/inventory_views.dart';

void main() {
  const baseSku = SkuItem(
    id: 'sku-logic',
    name: 'Logic SKU',
    itemPictureIcon: Icons.inventory_2_outlined,
    description: 'desc',
    unitsInStock: 10,
    costPerUnit: 4,
    soldAsProduct: false,
    productPrice: null,
  );

  test(
    'changes mode stores deltas and total mode uses same source of truth',
    () {
      var draft = StockDraft.fromSku(baseSku);
      draft = draft.adjustCount(
        mode: StockInputMode.changes,
        increment: false,
        step: 5,
      );

      expect(draft.countDelta, -5);
      expect(draft.effectiveCount, 5);

      draft = draft.adjustCount(
        mode: StockInputMode.total,
        increment: true,
        step: 1,
      );

      expect(draft.effectiveCount, 6);
      expect(draft.countDelta, -4);
    },
  );

  test('total mode count and cost never drop below zero', () {
    var draft = StockDraft.fromSku(baseSku);
    draft = draft.adjustCount(
      mode: StockInputMode.total,
      increment: false,
      step: 25,
    );
    draft = draft.adjustUnitCost(
      mode: StockInputMode.total,
      increment: false,
      step: 10,
    );

    expect(draft.effectiveCount, 0);
    expect(draft.effectiveUnitCost, 0);
    expect(draft.countDelta, -10);
    expect(draft.costDelta, -4);
  });

  test(
    'changes mode cost delta can be negative but effective cost is clamped',
    () {
      var draft = StockDraft.fromSku(baseSku);
      draft = draft.adjustUnitCost(
        mode: StockInputMode.changes,
        increment: false,
        step: 1,
      );
      expect(draft.costDelta, -1);
      expect(draft.effectiveUnitCost, 3);

      draft = draft.adjustUnitCost(
        mode: StockInputMode.changes,
        increment: false,
        step: 10,
      );
      expect(draft.costDelta, -4);
      expect(draft.effectiveUnitCost, 0);
      expect(draft.effectiveTotalValue, 0);
    },
  );

  test('count and cost clamp to security maxima', () {
    var draft = StockDraft.fromSku(baseSku);
    draft = draft.adjustCount(
      mode: StockInputMode.changes,
      increment: true,
      step: SecurityLimits.inventoryUnitsInStockMax * 5,
    );
    expect(draft.effectiveCount, SecurityLimits.inventoryUnitsInStockMax);

    draft = StockDraft.fromSku(baseSku);
    draft = draft.adjustUnitCost(
      mode: StockInputMode.total,
      increment: true,
      step: SecurityLimits.monetaryAmountMax * 2,
    );
    expect(draft.effectiveUnitCost, SecurityLimits.monetaryAmountMax);

    draft = StockDraft.fromSku(baseSku);
    draft = draft.adjustUnitCost(
      mode: StockInputMode.changes,
      increment: true,
      step: SecurityLimits.monetaryAmountMax * 2,
    );
    expect(draft.effectiveUnitCost, SecurityLimits.monetaryAmountMax);
  });

  test('increment presets map to expected count and cost steps', () {
    expect(IncrementPreset.small.countStep, 1);
    expect(IncrementPreset.small.costStep, 0.25);
    expect(IncrementPreset.medium.countStep, 5);
    expect(IncrementPreset.medium.costStep, 0.5);
    expect(IncrementPreset.big.countStep, 20);
    expect(IncrementPreset.big.costStep, 1);
  });

  test('reset clears current draft deltas only', () {
    var draft = StockDraft.fromSku(baseSku);
    draft = draft.adjustCount(
      mode: StockInputMode.changes,
      increment: true,
      step: 5,
    );
    draft = draft.adjustUnitCost(
      mode: StockInputMode.changes,
      increment: false,
      step: 1.25,
    );

    final reset = draft.reset();
    expect(reset.countDelta, 0);
    expect(reset.costDelta, 0);
    expect(reset.effectiveCount, baseSku.unitsInStock);
    expect(reset.effectiveUnitCost, baseSku.costPerUnit);
  });

  test('applyToSku maps effective values to updated sku', () {
    var draft = StockDraft.fromSku(baseSku);
    draft = draft.adjustCount(
      mode: StockInputMode.changes,
      increment: false,
      step: 2,
    );
    draft = draft.adjustUnitCost(
      mode: StockInputMode.changes,
      increment: true,
      step: 0.75,
    );

    final updated = draft.applyToSku(baseSku);
    expect(updated.unitsInStock, 8);
    expect(updated.costPerUnit, 4.75);
    expect(updated.name, baseSku.name);
  });
}

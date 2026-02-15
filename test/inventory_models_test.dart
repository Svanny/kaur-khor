import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banji/views/inventory_views.dart';

void main() {
  test('SkuItem totalValue computes from decimal pieces and bulk', () {
    const sku = SkuItem(
      id: 'sku-001',
      name: 'SKU 001',
      itemPictureIcon: Icons.inventory_2_outlined,
      description: 'desc',
      pieces: 10.5,
      bulk: 2,
      piecesPerBulk: 12.0,
      costPerPiece: 4.5,
      costPerBulk: 40,
      soldAsProduct: false,
      productPrice: null,
    );

    expect(sku.totalValue, 127.25);
  });

  test('SkuItem copyWith updates fields and can clear product price', () {
    const sku = SkuItem(
      id: 'sku-001',
      name: 'SKU 001',
      itemPictureIcon: Icons.inventory_2_outlined,
      description: 'desc',
      pieces: 10.0,
      bulk: 2,
      piecesPerBulk: 12.0,
      costPerPiece: 4.5,
      costPerBulk: 40,
      soldAsProduct: true,
      productPrice: 25,
    );

    final updated = sku.copyWith(
      name: 'SKU 001 Updated',
      soldAsProduct: false,
      clearProductPrice: true,
    );

    expect(updated.name, 'SKU 001 Updated');
    expect(updated.soldAsProduct, isFalse);
    expect(updated.productPrice, isNull);
    expect(updated.id, sku.id);
  });

  test('ServiceItem copyWith keeps old data and applies overrides', () {
    const service = ServiceItem(
      id: 'service-001',
      name: 'Service 001',
      itemPictureIcon: Icons.person_outline,
      description: 'desc',
      price: 1200,
      skuIds: {'sku-001'},
    );

    final updated = service.copyWith(
      price: 1500,
      skuIds: {'sku-001', 'sku-002'},
    );

    expect(updated.id, service.id);
    expect(updated.name, service.name);
    expect(updated.price, 1500);
    expect(updated.skuIds, {'sku-001', 'sku-002'});
  });
}

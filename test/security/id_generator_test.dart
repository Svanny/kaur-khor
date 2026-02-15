import 'package:flutter_test/flutter_test.dart';

import 'package:banji/security/id_generator.dart';

void main() {
  test('newSkuId uses expected opaque format', () {
    final id = IdGenerator.newSkuId();
    expect(RegExp(r'^sku-[a-z0-9]{20}$').hasMatch(id), isTrue);
  });

  test('newServiceId uses expected opaque format', () {
    final id = IdGenerator.newServiceId();
    expect(RegExp(r'^service-[a-z0-9]{20}$').hasMatch(id), isTrue);
  });

  test('generated IDs are not timestamp-derived', () {
    final skuId = IdGenerator.newSkuId();
    final serviceId = IdGenerator.newServiceId();

    expect(RegExp(r'^sku-\d{10,}$').hasMatch(skuId), isFalse);
    expect(RegExp(r'^service-\d{10,}$').hasMatch(serviceId), isFalse);
  });

  test('collision resistance smoke test over large sample', () {
    final ids = <String>{};
    const count = 5000;

    for (var i = 0; i < count; i++) {
      ids.add(IdGenerator.newSkuId());
      ids.add(IdGenerator.newServiceId());
    }

    expect(ids.length, count * 2);
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banji/settings/currency_controller.dart';
import 'package:banji/theme/app_theme.dart';
import 'package:banji/views/inventory_views.dart';

void main() {
  const service001Id = 'service:service-001';

  Future<void> setPhoneViewport(
    WidgetTester tester, {
    Size size = const Size(430, 932),
  }) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = size;
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
  }

  Future<void> pumpRankingPage(
    WidgetTester tester, {
    InventoryController? inventoryController,
    Size size = const Size(430, 932),
  }) async {
    await setPhoneViewport(tester, size: size);
    final controller = inventoryController ?? InventoryController();
    final currencyController = CurrencyController();
    if (inventoryController == null) {
      addTearDown(controller.dispose);
    }
    addTearDown(currencyController.dispose);
    await tester.pumpWidget(
      AppInventoryScope(
        controller: controller,
        child: AppCurrencyScope(
          controller: currencyController,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: ProductRankingPage(key: UniqueKey()),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  List<String> orderedNames(WidgetTester tester) {
    const names = <String>[
      'Service #001',
      'Service #002',
      'SKU #001',
      'SKU #003',
    ];
    final pairs =
        names
            .map(
              (name) => (
                name: name,
                top: tester.getTopLeft(find.text(name).first).dy,
              ),
            )
            .toList(growable: false)
          ..sort((a, b) => a.top.compareTo(b.top));
    return pairs.map((pair) => pair.name).toList(growable: false);
  }

  Future<void> dragHandle(
    WidgetTester tester, {
    required String entryId,
    required Offset delta,
  }) async {
    await tester.drag(
      find.byKey(ValueKey('product-ranking-draggable-$entryId')),
      delta,
    );
    await tester.pumpAndSettle();
  }

  testWidgets('shows only services and sold-as-product SKUs', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    expect(find.text('Sales Ranking Update'), findsOneWidget);
    expect(find.text('Service #001'), findsOneWidget);
    expect(find.text('Service #002'), findsOneWidget);
    expect(find.text('SKU #001'), findsOneWidget);
    expect(find.text('SKU #003'), findsOneWidget);
    expect(find.text('SKU #002'), findsNothing);
    expect(find.text('SKU #004'), findsNothing);
    expect(find.text('Price'), findsOneWidget);
  });

  testWidgets('reorder updates order and rank numbers', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    expect(
      orderedNames(tester),
      equals(const ['Service #001', 'Service #002', 'SKU #001', 'SKU #003']),
    );

    await dragHandle(
      tester,
      entryId: service001Id,
      delta: const Offset(0, 260),
    );

    expect(
      orderedNames(tester),
      equals(const ['Service #002', 'SKU #001', 'SKU #003', 'Service #001']),
    );
    expect(
      find.byKey(const ValueKey('product-ranking-rank-slot-0')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('product-ranking-rank-slot-3')),
      findsOneWidget,
    );
    expect(find.text('1'), findsWidgets);
    expect(find.text('4'), findsWidgets);
  });

  testWidgets('header and table header stay fixed while list scrolls', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester, size: const Size(430, 560));

    final titleRectBefore = tester.getRect(
      find.byKey(const ValueKey('product-ranking-title')),
    );
    final tableRectBefore = tester.getRect(
      find.byKey(const ValueKey('product-ranking-table-header')),
    );

    await tester.drag(
      find.byKey(const ValueKey('product-ranking-list')),
      const Offset(0, -220),
    );
    await tester.pumpAndSettle();

    final titleRectAfter = tester.getRect(
      find.byKey(const ValueKey('product-ranking-title')),
    );
    final tableRectAfter = tester.getRect(
      find.byKey(const ValueKey('product-ranking-table-header')),
    );

    expect(
      (titleRectBefore.top - titleRectAfter.top).abs(),
      lessThanOrEqualTo(1),
    );
    expect(
      (tableRectBefore.top - tableRectAfter.top).abs(),
      lessThanOrEqualTo(1),
    );
  });

  testWidgets('cancel button resets order to initial state', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    await dragHandle(
      tester,
      entryId: service001Id,
      delta: const Offset(0, 260),
    );
    expect(
      orderedNames(tester),
      isNot(
        equals(const ['Service #001', 'Service #002', 'SKU #001', 'SKU #003']),
      ),
    );

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();

    expect(
      orderedNames(tester),
      equals(const ['Service #001', 'Service #002', 'SKU #001', 'SKU #003']),
    );
  });

  testWidgets('back with unsaved reorder can discard and pop', (
    WidgetTester tester,
  ) async {
    await setPhoneViewport(tester);
    final inventoryController = InventoryController();
    final currencyController = CurrencyController();
    addTearDown(inventoryController.dispose);
    addTearDown(currencyController.dispose);

    await tester.pumpWidget(
      AppInventoryScope(
        controller: inventoryController,
        child: AppCurrencyScope(
          controller: currencyController,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: Builder(
              builder: (context) {
                return Scaffold(
                  body: Center(
                    child: TextButton(
                      onPressed: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const ProductRankingPage(),
                          ),
                        );
                      },
                      child: const Text('Open Ranking'),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Open Ranking'));
    await tester.pumpAndSettle();
    await dragHandle(
      tester,
      entryId: service001Id,
      delta: const Offset(0, 260),
    );

    await tester.tap(find.byIcon(Icons.arrow_back).first);
    await tester.pumpAndSettle();
    expect(find.text('Unsaved changes'), findsOneWidget);

    await tester.tap(find.text('Discard'));
    await tester.pumpAndSettle();
    expect(find.text('Open Ranking'), findsOneWidget);
  });

  testWidgets('save action appears after reorder and opens view-all page', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    expect(find.byIcon(Icons.check), findsNothing);
    await dragHandle(
      tester,
      entryId: service001Id,
      delta: const Offset(0, 260),
    );
    expect(find.byIcon(Icons.check), findsOneWidget);

    await tester.tap(find.byIcon(Icons.check));
    await tester.pumpAndSettle();
    expect(find.text('All Items'), findsOneWidget);
  });

  testWidgets('reopening ranking starts from default order (no persistence)', (
    WidgetTester tester,
  ) async {
    await setPhoneViewport(tester);
    final inventoryController = InventoryController();
    addTearDown(inventoryController.dispose);

    await pumpRankingPage(tester, inventoryController: inventoryController);
    await dragHandle(
      tester,
      entryId: service001Id,
      delta: const Offset(0, 260),
    );
    expect(orderedNames(tester).first, isNot(equals('Service #001')));

    await pumpRankingPage(tester, inventoryController: inventoryController);
    expect(
      orderedNames(tester),
      equals(const ['Service #001', 'Service #002', 'SKU #001', 'SKU #003']),
    );
  });

  testWidgets('uses currency code in row prices', (WidgetTester tester) async {
    await setPhoneViewport(tester);
    final inventoryController = InventoryController();
    final currencyController = CurrencyController()
      ..switchCurrency(AppCurrency.khr);
    addTearDown(inventoryController.dispose);
    addTearDown(currencyController.dispose);

    await tester.pumpWidget(
      AppInventoryScope(
        controller: inventoryController,
        child: AppCurrencyScope(
          controller: currencyController,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            home: const ProductRankingPage(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('product-ranking-price-service:service-001')),
      findsOneWidget,
    );
    expect(find.textContaining('KHR'), findsWidgets);
  });
}

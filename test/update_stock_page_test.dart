import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banji/main.dart';
import 'package:banji/settings/currency_controller.dart';
import 'package:banji/theme/app_theme.dart';
import 'package:banji/views/inventory_views.dart';

void main() {
  Future<void> setPhoneViewport(WidgetTester tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 932);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
  }

  Future<InventoryController> pumpUpdateStockPage(WidgetTester tester) async {
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
            home: const UpdateStockPage(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return inventoryController;
  }

  testWidgets('receipt FAB opens update stock page from home', (
    WidgetTester tester,
  ) async {
    await setPhoneViewport(tester);
    await tester.pumpWidget(const BanjiApp());
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('home-overlay-receipt-button')));
    await tester.pumpAndSettle();

    expect(find.text("SKU's Stock Count Update"), findsOneWidget);
  });

  testWidgets('swipe changes selected SKU and reaches confirmation card', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    expect(
      find.byKey(const ValueKey('update-stock-indicator-0-active')),
      findsOneWidget,
    );

    await tester.fling(
      find.byKey(const ValueKey('update-stock-sku-card-0')),
      const Offset(0, 500),
      1200,
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('update-stock-indicator-1-active')),
      findsOneWidget,
    );

    await tester.fling(
      find.byKey(const ValueKey('update-stock-sku-card-1')),
      const Offset(0, 500),
      1200,
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('update-stock-indicator-2-active')),
      findsOneWidget,
    );

    await tester.fling(
      find.byKey(const ValueKey('update-stock-sku-card-2')),
      const Offset(0, 500),
      1200,
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('update-stock-confirmation-card')),
      findsOneWidget,
    );
  });

  testWidgets('increment dropdown changes active preset step size', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    await tester.tap(
      find.byKey(const ValueKey('update-stock-increment-toggle')),
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('update-stock-increment-options')),
      findsOneWidget,
    );

    await tester.tap(find.textContaining('Medium:'));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('update-stock-increment-options')),
      findsNothing,
    );

    await tester.tap(
      find.byKey(const ValueKey('update-stock-count-increment')),
    );
    await tester.pumpAndSettle();

    final countValue = tester.widget<Text>(
      find.byKey(const ValueKey('update-stock-count-value')),
    );
    expect(countValue.data, '+5');
  });

  testWidgets('changes and total toggle preserves same state', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    await tester.tap(
      find.byKey(const ValueKey('update-stock-count-decrement')),
    );
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<Text>(find.byKey(const ValueKey('update-stock-count-value')))
          .data,
      '-1',
    );

    await tester.tap(find.text('Total'));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<Text>(find.byKey(const ValueKey('update-stock-count-value')))
          .data,
      '263',
    );

    await tester.tap(find.text('Changes'));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<Text>(find.byKey(const ValueKey('update-stock-count-value')))
          .data,
      '-1',
    );
  });

  testWidgets('save all updates shared inventory and opens view all', (
    WidgetTester tester,
  ) async {
    final inventoryController = await pumpUpdateStockPage(tester);

    await tester.tap(
      find.byKey(const ValueKey('update-stock-count-decrement')),
    );
    await tester.pumpAndSettle();

    await tester.fling(
      find.byKey(const ValueKey('update-stock-sku-card-0')),
      const Offset(0, 500),
      1200,
    );
    await tester.pumpAndSettle();
    await tester.fling(
      find.byKey(const ValueKey('update-stock-sku-card-1')),
      const Offset(0, 500),
      1200,
    );
    await tester.pumpAndSettle();
    await tester.fling(
      find.byKey(const ValueKey('update-stock-sku-card-2')),
      const Offset(0, 500),
      1200,
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('update-stock-save-all')));
    await tester.pumpAndSettle();

    expect(find.text('All Items'), findsOneWidget);
    expect(
      inventoryController.value.skus
          .firstWhere((sku) => sku.id == 'sku-001')
          .unitsInStock,
      263,
    );
    expect(find.text('Units in Stock: 263'), findsOneWidget);
  });
}

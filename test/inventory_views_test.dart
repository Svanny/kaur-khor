import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banji/theme/app_theme.dart';
import 'package:banji/views/inventory_views.dart';

void main() {
  Future<void> pumpInventory(WidgetTester tester) async {
    final inventoryController = InventoryController();
    addTearDown(inventoryController.dispose);
    await tester.pumpWidget(
      AppInventoryScope(
        controller: inventoryController,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light(),
          home: const ViewAllPage(),
        ),
      ),
    );
    await tester.pump();
  }

  void toggleChip(WidgetTester tester, String label) {
    final chip = tester.widget<FilterChip>(
      find.widgetWithText(FilterChip, label),
    );
    chip.onSelected?.call(false);
  }

  testWidgets('ViewAllPage initial layout has no render exceptions', (
    WidgetTester tester,
  ) async {
    await pumpInventory(tester);

    expect(find.text('All Items'), findsOneWidget);
    expect(find.widgetWithText(FilterChip, 'SKUs'), findsOneWidget);
    expect(find.widgetWithText(FilterChip, 'Services'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Filter toggles animate repeatedly without layout errors', (
    WidgetTester tester,
  ) async {
    await pumpInventory(tester);

    for (var i = 0; i < 4; i++) {
      toggleChip(tester, 'Services');
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 260));
      expect(tester.takeException(), isNull);

      toggleChip(tester, 'SKUs');
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 260));
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('Scrolling list with thumbnails does not throw', (
    WidgetTester tester,
  ) async {
    await pumpInventory(tester);

    await tester.drag(find.byType(ListView), const Offset(0, -350));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banji/theme/app_theme.dart';
import 'package:banji/views/inventory_views.dart';

void main() {
  Future<void> setPhoneViewport(WidgetTester tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 932);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
  }

  Future<void> pumpViewAll(WidgetTester tester) async {
    await setPhoneViewport(tester);
    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        home: const ViewAllPage(),
      ),
    );
    await tester.pumpAndSettle();
  }

  FilterChip chipByLabel(WidgetTester tester, String label) {
    return tester.widget<FilterChip>(find.widgetWithText(FilterChip, label));
  }

  Future<void> openCard(WidgetTester tester, String title) async {
    final card = find.widgetWithText(Card, title).first;
    await tester.ensureVisible(card);
    await tester.tap(card);
    await tester.pumpAndSettle();
  }

  testWidgets(
    'ViewAllPage renders cards and filter chips with expected state',
    (WidgetTester tester) async {
      await pumpViewAll(tester);

      expect(find.text('All Items'), findsOneWidget);
      expect(find.text('Services'), findsNWidgets(2));
      expect(find.text('SKUs'), findsNWidgets(2));
      expect(find.text('Service #001'), findsOneWidget);
      expect(find.text('Service #002'), findsOneWidget);
      expect(find.text('SKU #001'), findsOneWidget);
      expect(find.text('SKU #002'), findsOneWidget);
      expect(find.text('SKU #003'), findsOneWidget);

      final skuChip = chipByLabel(tester, 'SKUs');
      final serviceChip = chipByLabel(tester, 'Services');
      expect(skuChip.selected, isTrue);
      expect(serviceChip.selected, isTrue);
      expect(skuChip.showCheckmark, isTrue);
      expect(serviceChip.showCheckmark, isTrue);
      expect(skuChip.checkmarkColor, AppThemeTokens.textPrimary);
      expect(serviceChip.checkmarkColor, AppThemeTokens.textPrimary);
      expect(skuChip.avatar, isNull);
      expect(serviceChip.avatar, isNull);
      expect(skuChip.side, BorderSide.none);
      expect(serviceChip.side, BorderSide.none);
      expect(skuChip.elevation, AppThemeTokens.elevation1);
      expect(serviceChip.elevation, AppThemeTokens.elevation1);
    },
  );

  testWidgets('filter chips collapse sections with built-in checkmarks', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);

    await tester.tap(find.widgetWithText(FilterChip, 'Services'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 260));

    expect(find.text('Service #001'), findsNothing);
    expect(find.text('Service #002'), findsNothing);
    final serviceChip = chipByLabel(tester, 'Services');
    expect(serviceChip.selected, isFalse);
    expect(serviceChip.showCheckmark, isTrue);

    await tester.tap(find.widgetWithText(FilterChip, 'SKUs'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 260));

    expect(find.text('SKU #001'), findsNothing);
    expect(find.text('SKU #002'), findsNothing);
    expect(find.text('SKU #003'), findsNothing);
    final skuChip = chipByLabel(tester, 'SKUs');
    expect(skuChip.selected, isFalse);
    expect(skuChip.showCheckmark, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('search filters both service and sku cards', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);

    await tester.enterText(find.byType(TextField), '002');
    await tester.pump();

    expect(find.text('Service #001'), findsNothing);
    expect(find.text('SKU #001'), findsNothing);
    expect(find.text('Service #002'), findsOneWidget);
    expect(find.text('SKU #002'), findsOneWidget);
  });

  testWidgets('tapping cards opens service and sku detail pages', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);

    await openCard(tester, 'Service #001');
    expect(find.text('SKUs Used'), findsOneWidget);
    expect(find.text('Price'), findsAtLeastNWidgets(1));

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
    expect(find.text('All Items'), findsOneWidget);

    await openCard(tester, 'SKU #001');
    await tester.scrollUntilVisible(
      find.text('Sold as a Product?'),
      220,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Sold as a Product?'), findsOneWidget);
    expect(find.text('Cost / Piece'), findsAtLeastNWidgets(1));
  });

  testWidgets('add SKU flow requires description and appends new card', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add SKU'));
    await tester.pumpAndSettle();

    FilledButton saveButton = tester.widget<FilledButton>(
      find.byType(FilledButton),
    );
    expect(saveButton.onPressed, isNull);

    await tester.enterText(find.byType(TextField).at(1), 'New SKU description');
    await tester.pump();

    saveButton = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(saveButton.onPressed, isNotNull);

    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'NEW');
    await tester.pump();
    expect(find.text('SKU #NEW'), findsOneWidget);
  });

  testWidgets('add Service flow requires SKU selection and saves selection', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add Service'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byType(TextField).at(1),
      'New Service description',
    );
    await tester.pump();

    FilledButton saveButton = tester.widget<FilledButton>(
      find.byType(FilledButton),
    );
    expect(saveButton.onPressed, isNull);

    await tester.scrollUntilVisible(
      find.text('Tap to choose SKUs'),
      220,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Tap to choose SKUs'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), '001');
    await tester.pump();
    expect(find.text('SKU #001'), findsOneWidget);
    expect(find.text('SKU #002'), findsNothing);

    await tester.tap(find.widgetWithText(CheckboxListTile, 'SKU #001'));
    await tester.pump();
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    saveButton = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(saveButton.onPressed, isNotNull);
    expect(find.text('SKU #001'), findsOneWidget);

    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'NEW');
    await tester.pump();
    expect(find.text('Service #NEW'), findsOneWidget);
  });

  testWidgets('editing existing SKU updates card content in list', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);

    await openCard(tester, 'SKU #001');

    await tester.enterText(find.byType(TextField).first, 'SKU #001 - Updated');
    await tester.pump();
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();

    expect(find.text('SKU #001 - Updated'), findsOneWidget);
  });

  testWidgets('SkuDetailPage toggles product price field with sold state', (
    WidgetTester tester,
  ) async {
    const sku = SkuItem(
      id: 'sku-test',
      name: 'SKU Test',
      itemPictureIcon: Icons.inventory_2_outlined,
      description: 'desc',
      pieces: 1,
      bulk: 1,
      piecesPerBulk: 1,
      costPerPiece: 1,
      costPerBulk: 1,
      soldAsProduct: false,
      productPrice: null,
    );

    await setPhoneViewport(tester);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: const SkuDetailPage(initialSku: sku),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('Sold as a Product?'),
      220,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Sold as a Product?'));
    await tester.pump();
    var productField = tester.widget<TextField>(find.byType(TextField).last);
    expect(productField.enabled, isTrue);

    await tester.tap(find.text('Sold as a Product?'));
    await tester.pump();
    productField = tester.widget<TextField>(find.byType(TextField).last);
    expect(productField.enabled, isFalse);
  });
}

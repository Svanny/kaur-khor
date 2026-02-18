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
    expect(
      find.byKey(const ValueKey('product-ranking-header-name-icon')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('product-ranking-header-price-icon')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('product-ranking-leaderboard-icon')),
      findsOneWidget,
    );
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

    await tester.tap(find.byIcon(Icons.refresh));
    await tester.pumpAndSettle();

    expect(
      orderedNames(tester),
      equals(const ['Service #001', 'Service #002', 'SKU #001', 'SKU #003']),
    );
  });

  testWidgets('reset runs cubic fade on row texts before restoring order', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    await dragHandle(
      tester,
      entryId: service001Id,
      delta: const Offset(0, 260),
    );

    await tester.tap(find.byIcon(Icons.refresh));
    await tester.pump();

    final fadingName = tester.widget<AnimatedOpacity>(
      find.byKey(
        const ValueKey('product-ranking-text-fade-name-service:service-001'),
      ),
    );
    expect(fadingName.opacity, 0);
    expect(fadingName.curve, Curves.easeInOutCubic);

    await tester.pump(const Duration(milliseconds: 220));
    final restoredName = tester.widget<AnimatedOpacity>(
      find.byKey(
        const ValueKey('product-ranking-text-fade-name-service:service-001'),
      ),
    );
    expect(restoredName.opacity, 1);
    await tester.pumpAndSettle();
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
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Sales ranking updates discarded.'), findsNothing);
    await tester.pumpAndSettle();
    expect(find.text('Open Ranking'), findsOneWidget);
    expect(find.text('Sales ranking updates discarded.'), findsOneWidget);
  });

  testWidgets('back always prompts for save confirmation', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    await tester.tap(find.byIcon(Icons.arrow_back).first);
    await tester.pumpAndSettle();

    expect(find.text('Unsaved changes'), findsOneWidget);
  });

  testWidgets('save action uses dedicated save dialog before view-all', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    expect(find.byIcon(Icons.refresh), findsOneWidget);
    expect(find.byIcon(Icons.check), findsOneWidget);

    await tester.tap(find.byIcon(Icons.check));
    await tester.pumpAndSettle();
    expect(find.text('Save ranking updates?'), findsOneWidget);
    expect(find.text('Back to edit'), findsOneWidget);

    await tester.tap(find.text('Confirm'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Sales ranking updates saved.'), findsNothing);
    await tester.pumpAndSettle();
    expect(find.text('All Items'), findsOneWidget);
    expect(find.text('Sales ranking updates saved.'), findsOneWidget);
  });

  testWidgets('save dialog back to edit keeps ranking page open', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    await tester.tap(find.byIcon(Icons.check));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Back to edit'));
    await tester.pumpAndSettle();

    expect(find.text('Sales Ranking Update'), findsOneWidget);
    expect(find.text('All Items'), findsNothing);
  });

  testWidgets('save dialog uses shared confirmation spacing', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    await tester.tap(find.byIcon(Icons.check));
    await tester.pumpAndSettle();

    final popupPadding = tester.widget<Padding>(
      find
          .ancestor(
            of: find.text('Save ranking updates?'),
            matching: find.byType(Padding),
          )
          .first,
    );
    expect(
      popupPadding.padding,
      const EdgeInsets.all(AppThemeTokens.popupInset),
    );

    final secondaryButton = tester.widget<TextButton>(
      find.widgetWithText(TextButton, 'Back to edit'),
    );
    expect(
      secondaryButton.style?.padding?.resolve(const <WidgetState>{}),
      const EdgeInsets.symmetric(
        horizontal: AppThemeTokens.buttonPaddingX,
        vertical: AppThemeTokens.buttonPaddingY,
      ),
    );

    final primaryButton = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Confirm'),
    );
    expect(
      primaryButton.style?.padding?.resolve(const <WidgetState>{}),
      const EdgeInsets.symmetric(
        horizontal: AppThemeTokens.buttonPaddingX,
        vertical: AppThemeTokens.buttonPaddingY,
      ),
    );
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
    expect(
      find.byKey(
        const ValueKey('product-ranking-price-currency-service:service-001'),
      ),
      findsOneWidget,
    );
    expect(find.text('KHR'), findsWidgets);
  });

  testWidgets('amount column uses grouped format #,###.##', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    expect(find.text('2,200.00'), findsOneWidget);
    expect(find.text('1,200.00'), findsOneWidget);
    expect(find.text('16.00'), findsOneWidget);
  });

  testWidgets('name and price column alignment follows header geometry', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    final nameHeaderColumnRect = tester.getRect(
      find.byKey(const ValueKey('product-ranking-name-header-column')),
    );
    final nameHeaderGroupRect = tester.getRect(
      find.byKey(const ValueKey('product-ranking-name-header-group')),
    );
    expect(
      (nameHeaderColumnRect.center.dx - nameHeaderGroupRect.center.dx).abs(),
      lessThanOrEqualTo(1.5),
    );

    final priceHeaderColumnRect = tester.getRect(
      find.byKey(const ValueKey('product-ranking-price-header-column')),
    );

    final firstRowPriceColumnRect = tester.getRect(
      find.byKey(
        const ValueKey('product-ranking-price-column-service:service-001'),
      ),
    );
    expect(
      (priceHeaderColumnRect.width - firstRowPriceColumnRect.width).abs(),
      lessThanOrEqualTo(1.0),
    );

    final headerPriceText = tester.widget<Text>(
      find.descendant(
        of: find.byKey(const ValueKey('product-ranking-table-header')),
        matching: find.text('Price'),
      ),
    );
    final rowPriceText = tester.widget<Text>(
      find.byKey(const ValueKey('product-ranking-price-service:service-001')),
    );
    expect(headerPriceText.textAlign, TextAlign.center);
    expect(rowPriceText.textAlign, TextAlign.right);
  });

  testWidgets('price header group remains centered within price column', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    final columnRect = tester.getRect(
      find.byKey(const ValueKey('product-ranking-price-header-column')),
    );
    final groupRect = tester.getRect(
      find.byKey(const ValueKey('product-ranking-price-header-group')),
    );
    expect(
      (columnRect.center.dx - groupRect.center.dx).abs(),
      lessThanOrEqualTo(1.5),
    );
  });

  testWidgets('price rows are non-bold and row divider exists', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    final servicePrice = tester.widget<Text>(
      find.byKey(const ValueKey('product-ranking-price-service:service-001')),
    );
    final skuPrice = tester.widget<Text>(
      find.byKey(const ValueKey('product-ranking-price-sku:sku-001')),
    );
    expect(servicePrice.style?.fontWeight, FontWeight.w500);
    expect(skuPrice.style?.fontWeight, FontWeight.w500);

    expect(
      find.byKey(
        const ValueKey('product-ranking-row-divider-service:service-001'),
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('product-ranking-row-divider-sku:sku-001')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('product-ranking-header-divider')),
      findsOneWidget,
    );
  });

  testWidgets('currency is on its own right-aligned row', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    final amountText = tester.widget<Text>(
      find.byKey(const ValueKey('product-ranking-price-service:service-001')),
    );
    final currencyText = tester.widget<Text>(
      find.byKey(
        const ValueKey('product-ranking-price-currency-service:service-001'),
      ),
    );
    expect(amountText.textAlign, TextAlign.right);
    expect(currencyText.textAlign, TextAlign.right);
    expect(
      find.byKey(
        const ValueKey('product-ranking-amount-column-service:service-001'),
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(
        const ValueKey('product-ranking-currency-column-service:service-001'),
      ),
      findsOneWidget,
    );
    expect(currencyText.data, isNotNull);
    expect(currencyText.data!.isNotEmpty, isTrue);
  });

  testWidgets('header divider aligns with row divider', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    final headerDividerRect = tester.getRect(
      find.byKey(const ValueKey('product-ranking-header-divider')),
    );
    final rowDividerRect = tester.getRect(
      find.byKey(
        const ValueKey('product-ranking-row-divider-service:service-001'),
      ),
    );
    expect(
      (headerDividerRect.center.dx - rowDividerRect.center.dx).abs(),
      lessThanOrEqualTo(1.5),
    );
  });

  testWidgets('rank markers use pill radius', (WidgetTester tester) async {
    await pumpRankingPage(tester);

    final rankContainer = tester.widget<Container>(
      find
          .descendant(
            of: find.byKey(const ValueKey('product-ranking-rank-slot-0')),
            matching: find.byType(Container),
          )
          .first,
    );
    final decoration = rankContainer.decoration as BoxDecoration?;
    final radius = decoration?.borderRadius as BorderRadius?;
    expect(radius?.topLeft.x, AppThemeTokens.radiusPill);
  });

  testWidgets('header icon size and gap follow attached-label rules', (
    WidgetTester tester,
  ) async {
    await pumpRankingPage(tester);

    final headerLabel = tester.widget<Text>(
      find.descendant(
        of: find.byKey(const ValueKey('product-ranking-table-header')),
        matching: find.text('Name'),
      ),
    );
    final fontSize =
        headerLabel.style?.fontSize ?? AppThemeTokens.fontSizeBodyLarge;
    final expectedIconSize = AppThemeTokens.attachedLabelIconSize(fontSize);
    final expectedGap = AppThemeTokens.attachedLabelIconGap(expectedIconSize);

    final nameIconRect = tester.getRect(
      find.byKey(const ValueKey('product-ranking-header-name-icon')),
    );
    final nameTextRect = tester.getRect(
      find.descendant(
        of: find.byKey(const ValueKey('product-ranking-table-header')),
        matching: find.text('Name'),
      ),
    );
    expect(nameIconRect.height, closeTo(expectedIconSize, 0.6));
    expect(nameTextRect.left - nameIconRect.right, closeTo(expectedGap, 1.0));
  });
}

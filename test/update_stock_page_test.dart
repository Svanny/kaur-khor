import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_card_swiper/flutter_card_swiper.dart';

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

  Future<InventoryController> pumpUpdateStockPage(
    WidgetTester tester, {
    InventoryState? initialState,
  }) async {
    await setPhoneViewport(tester);
    final inventoryController = InventoryController(initialState: initialState);
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
            home: UpdateStockPage(key: UniqueKey()),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return inventoryController;
  }

  Rect indicatorRect(WidgetTester tester, int index) {
    final activeFinder = find.byKey(
      ValueKey('update-stock-indicator-$index-active'),
    );
    if (activeFinder.evaluate().isNotEmpty) {
      return tester.getRect(activeFinder);
    }
    return tester.getRect(
      find.byKey(ValueKey('update-stock-indicator-$index-inactive')),
    );
  }

  double averageIndicatorGap(WidgetTester tester, int count) {
    if (count < 2) {
      return 0;
    }
    var totalGap = 0.0;
    for (var index = 0; index < count - 1; index++) {
      final currentRect = indicatorRect(tester, index);
      final nextRect = indicatorRect(tester, index + 1);
      totalGap += nextRect.top - currentRect.bottom;
    }
    return totalGap / (count - 1);
  }

  InventoryState inventoryStateWithSkuCount(int count) {
    final skus = List.generate(count, (index) {
      final number = (index + 1).toString().padLeft(3, '0');
      return SkuItem(
        id: 'sku-$number',
        name: 'SKU #$number',
        itemPictureIcon: Icons.inventory_2_outlined,
        description: 'Generated SKU $number',
        unitsInStock: 100 + index.toDouble(),
        costPerUnit: 5 + index.toDouble(),
        soldAsProduct: true,
        productPrice: 10 + index.toDouble(),
      );
    });
    return InventoryState(skus: skus, services: const <ServiceItem>[]);
  }

  testWidgets('receipt FAB opens update stock page from home', (
    WidgetTester tester,
  ) async {
    await setPhoneViewport(tester);
    await tester.pumpWidget(const BanjiApp());
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('home-overlay-receipt-button')));
    await tester.pumpAndSettle();

    expect(find.text("SKUs' Stock Update"), findsOneWidget);
  });

  testWidgets(
    'swipe up advances, swipe down goes back, and confirmation returns to card',
    (WidgetTester tester) async {
      await pumpUpdateStockPage(tester);

      expect(
        find.byKey(const ValueKey('update-stock-indicator-0-active')),
        findsOneWidget,
      );

      await tester.fling(
        find.byKey(const ValueKey('update-stock-sku-card-0')),
        const Offset(0, -500),
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
        find.byKey(const ValueKey('update-stock-indicator-0-active')),
        findsOneWidget,
      );

      await tester.fling(
        find.byKey(const ValueKey('update-stock-sku-card-0')),
        const Offset(0, -500),
        1200,
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('update-stock-indicator-1-active')),
        findsOneWidget,
      );

      await tester.fling(
        find.byKey(const ValueKey('update-stock-sku-card-1')),
        const Offset(0, -500),
        1200,
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('update-stock-indicator-2-active')),
        findsOneWidget,
      );

      await tester.fling(
        find.byKey(const ValueKey('update-stock-sku-card-2')),
        const Offset(0, -500),
        1200,
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('update-stock-confirmation-card')),
        findsOneWidget,
      );

      await tester.fling(
        find.byKey(const ValueKey('update-stock-confirmation-card')),
        const Offset(0, 500),
        1200,
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('update-stock-sku-card-2')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('update-stock-indicator-2-active')),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'card stack shows two preview cards beneath active and hides on confirmation',
    (WidgetTester tester) async {
      await pumpUpdateStockPage(tester);

      final activeCardFinder = find.byKey(
        const ValueKey('update-stock-sku-card-0'),
      );
      final secondCardFinder = find.byKey(
        const ValueKey('update-stock-sku-card-preview-1'),
      );
      final thirdCardFinder = find.byKey(
        const ValueKey('update-stock-sku-card-preview-2'),
      );
      final fourthCardFinder = find.byKey(
        const ValueKey('update-stock-sku-card-preview-3'),
      );

      expect(secondCardFinder, findsOneWidget);
      expect(thirdCardFinder, findsOneWidget);
      expect(fourthCardFinder, findsNothing);
      expect(
        find.ancestor(of: activeCardFinder, matching: find.byType(CardSwiper)),
        findsOneWidget,
      );

      final activeRect = tester.getRect(activeCardFinder);
      final secondRect = tester.getRect(secondCardFinder);
      final thirdRect = tester.getRect(thirdCardFinder);

      expect(secondRect.top, greaterThan(activeRect.top));
      expect(thirdRect.top, greaterThan(secondRect.top));
      expect(secondRect.width, lessThan(activeRect.width));
      expect(thirdRect.width, lessThan(secondRect.width));

      await tester.fling(activeCardFinder, const Offset(0, -500), 1200);
      await tester.pumpAndSettle();
      await tester.fling(
        find.byKey(const ValueKey('update-stock-sku-card-1')),
        const Offset(0, -500),
        1200,
      );
      await tester.pumpAndSettle();
      await tester.fling(
        find.byKey(const ValueKey('update-stock-sku-card-2')),
        const Offset(0, -500),
        1200,
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(const ValueKey('update-stock-confirmation-card')),
        findsOneWidget,
      );
      expect(activeCardFinder, findsNothing);
      expect(secondCardFinder, findsNothing);
      expect(thirdCardFinder, findsNothing);
    },
  );

  testWidgets('preloads first three SKU cards offstage', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    expect(
      find.byKey(const ValueKey('update-stock-preload-sku-card-0')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('update-stock-preload-sku-card-1')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('update-stock-preload-sku-card-2')),
      findsNothing,
    );

    expect(
      find.byKey(
        const ValueKey('update-stock-preload-sku-card-0'),
        skipOffstage: false,
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(
        const ValueKey('update-stock-preload-sku-card-1'),
        skipOffstage: false,
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(
        const ValueKey('update-stock-preload-sku-card-2'),
        skipOffstage: false,
      ),
      findsOneWidget,
    );
  });

  testWidgets(
    'indicator rail spans track with uniform spacing and mapped colors',
    (WidgetTester tester) async {
      await pumpUpdateStockPage(tester);

      final trackRect = tester.getRect(
        find.byKey(const ValueKey('update-stock-indicator-track')),
      );
      final firstRect = indicatorRect(tester, 0);
      final secondRect = indicatorRect(tester, 1);
      final thirdRect = indicatorRect(tester, 2);

      expect((firstRect.top - trackRect.top).abs(), lessThanOrEqualTo(1.0));
      expect(
        (thirdRect.bottom - trackRect.bottom).abs(),
        lessThanOrEqualTo(1.0),
      );

      final gap01 = secondRect.top - firstRect.bottom;
      final gap12 = thirdRect.top - secondRect.bottom;
      expect((gap01 - gap12).abs(), lessThanOrEqualTo(1.0));
      final titleRect = tester.getRect(find.text("SKUs' Stock Update"));
      final incrementRect = tester.getRect(
        find.byKey(const ValueKey('update-stock-increment-toggle')),
      );
      expect((firstRect.top - titleRect.top).abs(), lessThanOrEqualTo(1.0));
      expect(
        (thirdRect.bottom - incrementRect.top).abs(),
        lessThanOrEqualTo(1.0),
      );
      final edgeRight =
          (430 * AppThemeTokens.screenEdgePaddingWidthFactor).clamp(
            AppThemeTokens.screenEdgePaddingMin,
            AppThemeTokens.screenEdgePaddingMax,
          ) /
          2;
      expect((430 - trackRect.right - edgeRight).abs(), lessThanOrEqualTo(1.0));

      final activeIndicator = tester.widget<AnimatedContainer>(
        find.byKey(const ValueKey('update-stock-indicator-0-active')),
      );
      final inactiveIndicator = tester.widget<AnimatedContainer>(
        find.byKey(const ValueKey('update-stock-indicator-1-inactive')),
      );
      final activeDecoration = activeIndicator.decoration as BoxDecoration;
      final inactiveDecoration = inactiveIndicator.decoration as BoxDecoration;

      expect(
        activeDecoration.color,
        equals(AppThemeTokens.stockIndicatorSelected),
      );
      expect(
        inactiveDecoration.color,
        equals(AppThemeTokens.stockIndicatorUnselected),
      );
    },
  );

  testWidgets('indicator spacing shrinks when SKU count increases', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);
    final gapFor3Skus = averageIndicatorGap(tester, 3);

    await pumpUpdateStockPage(
      tester,
      initialState: inventoryStateWithSkuCount(6),
    );
    final gapFor6Skus = averageIndicatorGap(tester, 6);

    expect(gapFor6Skus, lessThan(gapFor3Skus));
  });

  testWidgets('SKU title stays centered while reset icon sits beside it', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    final cardFinder = find.byKey(const ValueKey('update-stock-sku-card-0'));
    final titleFinder = find.descendant(
      of: cardFinder,
      matching: find.text('SKU #001'),
    );
    final resetIconFinder = find.byKey(
      const ValueKey('update-stock-reset-current'),
    );

    final cardRect = tester.getRect(cardFinder);
    final titleRect = tester.getRect(titleFinder);
    final resetIconRect = tester.getRect(resetIconFinder);

    expect(
      (titleRect.center.dx - cardRect.center.dx).abs(),
      lessThanOrEqualTo(1),
    );
    expect(resetIconRect.left, greaterThan(titleRect.right));
    expect(
      resetIconRect.left - titleRect.right,
      lessThanOrEqualTo(AppThemeTokens.space4),
    );
    expect(
      find.descendant(
        of: resetIconFinder,
        matching: find.byIcon(Icons.refresh),
      ),
      findsOneWidget,
    );
    final flipTransform = tester.widget<Transform>(
      find.descendant(of: resetIconFinder, matching: find.byType(Transform)),
    );
    expect(flipTransform.transform.storage[0], equals(-1.0));
  });

  testWidgets('increment dropdown changes active preset step size', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);
    final triggerFinder = find.byKey(
      const ValueKey('update-stock-increment-toggle'),
    );
    final initialTriggerWidth = tester.getSize(triggerFinder).width;
    expect(
      find.descendant(
        of: triggerFinder,
        matching: find.byType(AnimatedContainer),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: triggerFinder,
        matching: find.byType(AnimatedSwitcher),
      ),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey('update-stock-increment-toggle')),
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('update-stock-increment-options')),
      findsOneWidget,
    );
    final incrementTable = tester.widget<Table>(
      find.descendant(
        of: find.byKey(const ValueKey('update-stock-increment-options')),
        matching: find.byType(Table),
      ),
    );
    final columnWidths = incrementTable.columnWidths;
    expect(columnWidths?[2], isA<FixedColumnWidth>());
    expect(columnWidths?[1], isA<FixedColumnWidth>());
    expect(columnWidths?[3], isA<FixedColumnWidth>());
    final separatorColumnWidth = (columnWidths?[2] as FixedColumnWidth).value;
    final countColumnWidth = (columnWidths?[1] as FixedColumnWidth).value;
    final costColumnWidth = (columnWidths?[3] as FixedColumnWidth).value;
    expect(separatorColumnWidth, lessThan(countColumnWidth));
    expect(separatorColumnWidth, lessThan(costColumnWidth));
    final menuRect = tester.getRect(
      find.byKey(const ValueKey('update-stock-increment-options')),
    );
    expect(menuRect.left, greaterThanOrEqualTo(AppThemeTokens.space4));
    expect(menuRect.right, lessThanOrEqualTo(430 - AppThemeTokens.space4));
    expect(find.text('Small:'), findsOneWidget);
    expect(find.text('± 1'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('update-stock-increment-separator-small')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('update-stock-increment-separator-medium')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('update-stock-increment-separator-big')),
      findsOneWidget,
    );
    expect(find.text('± \$0.25'), findsOneWidget);
    expect(
      tester.widget<Text>(find.text('Small:')).textAlign,
      equals(TextAlign.left),
    );
    expect(
      tester.widget<Text>(find.text('± 1')).textAlign,
      equals(TextAlign.center),
    );
    expect(
      tester.widget<Text>(find.text('± \$0.25')).textAlign,
      equals(TextAlign.center),
    );
    expect(find.byIcon(Icons.check_rounded), findsOneWidget);

    await tester.tap(
      find.byKey(const ValueKey('update-stock-increment-row-medium')),
    );
    await tester.pumpAndSettle();
    final mediumTriggerWidth = tester.getSize(triggerFinder).width;
    expect(
      find.byKey(const ValueKey('update-stock-increment-options')),
      findsNothing,
    );
    expect(mediumTriggerWidth, greaterThan(initialTriggerWidth));

    await tester.tap(
      find.byKey(const ValueKey('update-stock-increment-toggle')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('update-stock-increment-row-big')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Increments · Big'), findsOneWidget);

    await tester.tap(
      find.byKey(const ValueKey('update-stock-increment-toggle')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('update-stock-increment-row-medium')),
    );
    await tester.pump();
    expect(find.text('Increments · Big'), findsOneWidget);
    expect(find.text('Increments · Medium'), findsNothing);
    await tester.pump(const Duration(milliseconds: 180));
    expect(find.text('Increments · Medium'), findsOneWidget);
    await tester.pumpAndSettle();

    await tester.tap(
      find.byKey(const ValueKey('update-stock-count-increment')),
    );
    await tester.pumpAndSettle();

    final countValue = tester.widget<Text>(
      find.byKey(const ValueKey('update-stock-count-value')),
    );
    expect(countValue.data, '+5');

    await tester.tap(
      find.byKey(const ValueKey('update-stock-increment-toggle')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('update-stock-increment-row-small')),
    );
    await tester.pumpAndSettle();
    final finalSmallTriggerWidth = tester.getSize(triggerFinder).width;
    expect(finalSmallTriggerWidth, lessThan(mediumTriggerWidth));
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

  testWidgets('cost in Changes mode is unsigned and + still increases value', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    final initialCost = tester
        .widget<Text>(find.byKey(const ValueKey('update-stock-cost-value')))
        .data;
    expect(initialCost, equals('0 USD'));

    await tester.tap(find.byKey(const ValueKey('update-stock-cost-increment')));
    await tester.pumpAndSettle();

    final incrementedCost = tester
        .widget<Text>(find.byKey(const ValueKey('update-stock-cost-value')))
        .data;
    expect(incrementedCost, equals('0.25 USD'));
    expect(incrementedCost, isNot(startsWith('+')));
    expect(incrementedCost, isNot(startsWith('-')));
  });

  testWidgets('cost change stays non-negative in Changes mode', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    await tester.tap(find.byKey(const ValueKey('update-stock-cost-decrement')));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<Text>(find.byKey(const ValueKey('update-stock-cost-value')))
          .data,
      equals('0 USD'),
    );

    await tester.tap(find.byKey(const ValueKey('update-stock-cost-increment')));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<Text>(find.byKey(const ValueKey('update-stock-cost-value')))
          .data,
      equals('0.25 USD'),
    );

    await tester.tap(find.byKey(const ValueKey('update-stock-cost-decrement')));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<Text>(find.byKey(const ValueKey('update-stock-cost-value')))
          .data,
      equals('0 USD'),
    );

    await tester.tap(find.byKey(const ValueKey('update-stock-cost-decrement')));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<Text>(find.byKey(const ValueKey('update-stock-cost-value')))
          .data,
      equals('0 USD'),
    );
  });

  testWidgets(
    'trend arrows reflect baseline deltas for total, count, and cost',
    (WidgetTester tester) async {
      await pumpUpdateStockPage(tester);

      expect(
        find.byKey(const ValueKey('update-stock-total-value-trend-up')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('update-stock-total-value-trend-down')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('update-stock-count-label-trend-up')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('update-stock-count-label-trend-down')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('update-stock-cost-label-trend-up')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('update-stock-cost-label-trend-down')),
        findsNothing,
      );

      await tester.tap(
        find.byKey(const ValueKey('update-stock-count-increment')),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('update-stock-count-label-trend-up')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('update-stock-total-value-trend-up')),
        findsOneWidget,
      );
      expect(
        tester
            .widget<Icon>(
              find.byKey(const ValueKey('update-stock-count-label-trend-up')),
            )
            .color,
        equals(AppThemeTokens.success),
      );
      expect(
        tester
            .widget<Icon>(
              find.byKey(const ValueKey('update-stock-total-value-trend-up')),
            )
            .color,
        equals(AppThemeTokens.success),
      );
      expect(
        find.ancestor(
          of: find.byKey(const ValueKey('update-stock-total-value-trend-up')),
          matching: find.byType(AnimatedSwitcher),
        ),
        findsWidgets,
      );

      await tester.tap(
        find.byKey(const ValueKey('update-stock-count-decrement')),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('update-stock-count-label-trend-up')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('update-stock-count-label-trend-down')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('update-stock-total-value-trend-up')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('update-stock-total-value-trend-down')),
        findsNothing,
      );

      await tester.tap(
        find.byKey(const ValueKey('update-stock-count-decrement')),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('update-stock-count-label-trend-down')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('update-stock-total-value-trend-down')),
        findsOneWidget,
      );
      expect(
        tester
            .widget<Icon>(
              find.byKey(const ValueKey('update-stock-count-label-trend-down')),
            )
            .color,
        equals(AppThemeTokens.error),
      );
      expect(
        tester
            .widget<Icon>(
              find.byKey(const ValueKey('update-stock-total-value-trend-down')),
            )
            .color,
        equals(AppThemeTokens.error),
      );

      await tester.tap(
        find.byKey(const ValueKey('update-stock-reset-current')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Total'));
      await tester.pumpAndSettle();

      await tester.tap(
        find.byKey(const ValueKey('update-stock-cost-increment')),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('update-stock-cost-label-trend-up')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('update-stock-total-value-trend-up')),
        findsOneWidget,
      );
      expect(
        tester
            .widget<Icon>(
              find.byKey(const ValueKey('update-stock-cost-label-trend-up')),
            )
            .color,
        equals(AppThemeTokens.success),
      );

      await tester.tap(
        find.byKey(const ValueKey('update-stock-cost-decrement')),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('update-stock-cost-decrement')),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('update-stock-cost-label-trend-down')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('update-stock-total-value-trend-down')),
        findsOneWidget,
      );
      expect(
        tester
            .widget<Icon>(
              find.byKey(const ValueKey('update-stock-cost-label-trend-down')),
            )
            .color,
        equals(AppThemeTokens.error),
      );

      expect(
        find.byKey(const ValueKey('update-stock-count-value-trend-up')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('update-stock-count-value-trend-down')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('update-stock-cost-value-trend-up')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('update-stock-cost-value-trend-down')),
        findsNothing,
      );
    },
  );

  testWidgets('stepper value text is bigger and action icons are bold', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    const expectedFontSize =
        AppThemeTokens.fontSizeBodyLarge + AppThemeTokens.unit;
    final countValue = tester.widget<Text>(
      find.byKey(const ValueKey('update-stock-count-value')),
    );
    final costValue = tester.widget<Text>(
      find.byKey(const ValueKey('update-stock-cost-value')),
    );
    expect(countValue.style?.fontSize, equals(expectedFontSize));
    expect(costValue.style?.fontSize, equals(expectedFontSize));

    Icon iconIn(Key key) {
      return tester.widget<Icon>(
        find.descendant(of: find.byKey(key), matching: find.byType(Icon)),
      );
    }

    expect(
      iconIn(const ValueKey('update-stock-count-decrement')).weight,
      equals(AppThemeTokens.fontWeightBold),
    );
    expect(
      iconIn(const ValueKey('update-stock-count-increment')).weight,
      equals(AppThemeTokens.fontWeightBold),
    );
    expect(
      iconIn(const ValueKey('update-stock-cost-decrement')).weight,
      equals(AppThemeTokens.fontWeightBold),
    );
    expect(
      iconIn(const ValueKey('update-stock-cost-increment')).weight,
      equals(AppThemeTokens.fontWeightBold),
    );
    final countLabelIconFinder = find.byKey(
      const ValueKey('update-stock-count-label-icon'),
    );
    final costLabelIconFinder = find.byKey(
      const ValueKey('update-stock-cost-label-icon'),
    );
    expect(countLabelIconFinder, findsOneWidget);
    expect(costLabelIconFinder, findsOneWidget);

    final countValueRect = tester.getRect(
      find.byKey(const ValueKey('update-stock-count-value-pill')),
    );
    final costValueRect = tester.getRect(
      find.byKey(const ValueKey('update-stock-cost-value-pill')),
    );
    final countValueTextRect = tester.getRect(
      find.byKey(const ValueKey('update-stock-count-value')),
    );
    final costValueTextRect = tester.getRect(
      find.byKey(const ValueKey('update-stock-cost-value')),
    );
    final countLabelRect = tester.getRect(find.text('Count'));
    final costLabelRect = tester.getRect(find.text('Cost'));
    final countLabelIconRect = tester.getRect(countLabelIconFinder);
    final costLabelIconRect = tester.getRect(costLabelIconFinder);
    expect(
      (countValueTextRect.center.dx - countValueRect.center.dx).abs(),
      lessThanOrEqualTo(1.0),
    );
    expect(
      (countValueTextRect.center.dy - countValueRect.center.dy).abs(),
      lessThanOrEqualTo(1.0),
    );
    expect(
      (costValueTextRect.center.dx - costValueRect.center.dx).abs(),
      lessThanOrEqualTo(1.0),
    );
    expect(
      (costValueTextRect.center.dy - costValueRect.center.dy).abs(),
      lessThanOrEqualTo(1.0),
    );
    expect(
      (countLabelRect.center.dx - countValueRect.center.dx).abs(),
      lessThanOrEqualTo(1.0),
    );
    expect(
      (costLabelRect.center.dx - costValueRect.center.dx).abs(),
      lessThanOrEqualTo(1.0),
    );
    expect(
      countLabelIconRect.right,
      lessThanOrEqualTo(countLabelRect.left + 1),
    );
    expect(costLabelIconRect.right, lessThanOrEqualTo(costLabelRect.left + 1));
    expect(
      countLabelRect.left - countLabelIconRect.right,
      lessThanOrEqualTo(AppThemeTokens.space2),
    );
    expect(
      costLabelRect.left - costLabelIconRect.right,
      lessThanOrEqualTo(AppThemeTokens.space2),
    );
  });

  testWidgets(
    'cost input is disabled with tooltip when count change is negative in Changes mode',
    (WidgetTester tester) async {
      await pumpUpdateStockPage(tester);
      final enabledCostPillSize = tester.getSize(
        find.byKey(const ValueKey('update-stock-cost-value-pill')),
      );

      await tester.tap(
        find.byKey(const ValueKey('update-stock-count-decrement')),
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<Text>(
              find.byKey(const ValueKey('update-stock-count-value')),
            )
            .data,
        '-1',
      );

      final costBefore = tester
          .widget<Text>(find.byKey(const ValueKey('update-stock-cost-value')))
          .data;
      await tester.tap(
        find.byKey(const ValueKey('update-stock-cost-increment')),
      );
      await tester.pumpAndSettle();
      final costAfter = tester
          .widget<Text>(find.byKey(const ValueKey('update-stock-cost-value')))
          .data;
      expect(costAfter, costBefore);
      final disabledCostText = tester.widget<Text>(
        find.byKey(const ValueKey('update-stock-cost-value')),
      );
      expect(
        disabledCostText.style?.color,
        equals(AppThemeTokens.disabledForeground),
      );
      final disabledCostPill = tester.widget<Container>(
        find.byKey(const ValueKey('update-stock-cost-value-pill')),
      );
      final disabledCostPillSize = tester.getSize(
        find.byKey(const ValueKey('update-stock-cost-value-pill')),
      );
      expect(disabledCostPillSize.height, equals(enabledCostPillSize.height));
      final disabledCostPillDecoration =
          disabledCostPill.decoration as BoxDecoration;
      expect(
        disabledCostPillDecoration.color,
        equals(AppThemeTokens.disabledBackground),
      );

      await tester.tap(
        find.byKey(const ValueKey('update-stock-cost-value-pill')),
      );
      await tester.pump();
      expect(
        find.text('Cannot enter cost if change is negative.'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'cost input is disabled with tooltip when Total count drops below previous total',
    (WidgetTester tester) async {
      await pumpUpdateStockPage(tester);

      await tester.tap(find.text('Total'));
      await tester.pumpAndSettle();
      final enabledCostPillSize = tester.getSize(
        find.byKey(const ValueKey('update-stock-cost-value-pill')),
      );
      await tester.tap(
        find.byKey(const ValueKey('update-stock-count-decrement')),
      );
      await tester.pumpAndSettle();

      final costBefore = tester
          .widget<Text>(find.byKey(const ValueKey('update-stock-cost-value')))
          .data;
      await tester.tap(
        find.byKey(const ValueKey('update-stock-cost-increment')),
      );
      await tester.pumpAndSettle();
      final costAfter = tester
          .widget<Text>(find.byKey(const ValueKey('update-stock-cost-value')))
          .data;
      expect(costAfter, costBefore);
      final disabledCostText = tester.widget<Text>(
        find.byKey(const ValueKey('update-stock-cost-value')),
      );
      expect(
        disabledCostText.style?.color,
        equals(AppThemeTokens.disabledForeground),
      );
      final disabledCostPill = tester.widget<Container>(
        find.byKey(const ValueKey('update-stock-cost-value-pill')),
      );
      final disabledCostPillSize = tester.getSize(
        find.byKey(const ValueKey('update-stock-cost-value-pill')),
      );
      expect(disabledCostPillSize.height, equals(enabledCostPillSize.height));
      final disabledCostPillDecoration =
          disabledCostPill.decoration as BoxDecoration;
      expect(
        disabledCostPillDecoration.color,
        equals(AppThemeTokens.disabledBackground),
      );

      await tester.tap(
        find.byKey(const ValueKey('update-stock-cost-value-pill')),
      );
      await tester.pump();
      expect(
        find.text('Cannot enter cost if change is negative.'),
        findsOneWidget,
      );
    },
  );

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
      const Offset(0, -500),
      1200,
    );
    await tester.pumpAndSettle();
    await tester.fling(
      find.byKey(const ValueKey('update-stock-sku-card-1')),
      const Offset(0, -500),
      1200,
    );
    await tester.pumpAndSettle();
    await tester.fling(
      find.byKey(const ValueKey('update-stock-sku-card-2')),
      const Offset(0, -500),
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
    expect(find.text('263 units in stock'), findsOneWidget);
  });
}

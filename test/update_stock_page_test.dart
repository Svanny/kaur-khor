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

  TextField stepperField(WidgetTester tester, String key) {
    return tester.widget<TextField>(find.byKey(ValueKey(key)));
  }

  String stepperValueText(WidgetTester tester, String key) {
    return stepperField(tester, key).controller?.text ?? '';
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

  testWidgets('stock update title renders without boundary mask divider', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    expect(
      find.byKey(const ValueKey('update-stock-title-boundary-mask')),
      findsNothing,
    );
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
      expect(
        find.byKey(const ValueKey('update-stock-indicator-1-active')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('update-stock-indicator-0-active')),
        findsOneWidget,
      );

      await tester.fling(
        find.byKey(const ValueKey('update-stock-sku-card-2')),
        const Offset(0, -500),
        1200,
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('update-stock-indicator-3-active')),
        findsOneWidget,
      );

      await tester.fling(
        find.byKey(const ValueKey('update-stock-sku-card-3')),
        const Offset(0, -500),
        1200,
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('update-stock-confirmation-card')),
        findsOneWidget,
      );
      for (
        var index = 0;
        index < InventoryState.initial().skus.length;
        index++
      ) {
        expect(
          find.byKey(ValueKey('update-stock-indicator-$index-active')),
          findsOneWidget,
        );
      }

      await tester.fling(
        find.byKey(const ValueKey('update-stock-confirmation-card')),
        const Offset(0, 500),
        1200,
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('update-stock-sku-card-3')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('update-stock-indicator-3-active')),
        findsOneWidget,
      );
    },
  );

  testWidgets('confirmation card is rendered as a deck card', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

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

    await tester.fling(
      find.byKey(const ValueKey('update-stock-sku-card-3')),
      const Offset(0, -500),
      1200,
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('update-stock-sku-card-3')), findsNothing);
    expect(
      find.byKey(const ValueKey('update-stock-confirmation-card')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('update-stock-sku-card-stack-4')),
      findsOneWidget,
    );
  });

  testWidgets(
    'vertical swipe card view shows active card and hides cards on confirmation',
    (WidgetTester tester) async {
      await pumpUpdateStockPage(tester);

      final activeCardFinder = find.byKey(
        const ValueKey('update-stock-sku-card-0'),
      );
      final secondCardFinder = find.byKey(
        const ValueKey('update-stock-sku-card-1'),
      );
      final thirdCardFinder = find.byKey(
        const ValueKey('update-stock-sku-card-2'),
      );
      final fourthCardFinder = find.byKey(
        const ValueKey('update-stock-sku-card-3'),
      );

      expect(secondCardFinder, findsNothing);
      expect(thirdCardFinder, findsNothing);
      expect(fourthCardFinder, findsNothing);

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
      await tester.fling(
        find.byKey(const ValueKey('update-stock-sku-card-3')),
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
      find.byKey(const ValueKey('update-stock-preload-sku-card-3')),
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
    expect(
      find.byKey(
        const ValueKey('update-stock-preload-sku-card-3'),
        skipOffstage: false,
      ),
      findsNothing,
    );
  });

  testWidgets(
    'indicator rail spans track with uniform spacing and mapped colors',
    (WidgetTester tester) async {
      await pumpUpdateStockPage(tester);
      final skuCount = InventoryState.initial().skus.length;

      final trackRect = tester.getRect(
        find.byKey(const ValueKey('update-stock-indicator-track')),
      );
      final firstRect = indicatorRect(tester, 0);
      final lastRect = indicatorRect(tester, skuCount - 1);

      expect((firstRect.top - trackRect.top).abs(), lessThanOrEqualTo(1.0));
      expect(
        (lastRect.bottom - trackRect.bottom).abs(),
        lessThanOrEqualTo(1.0),
      );

      for (var index = 0; index < skuCount - 2; index++) {
        final currentRect = indicatorRect(tester, index);
        final nextRect = indicatorRect(tester, index + 1);
        final afterNextRect = indicatorRect(tester, index + 2);
        final currentGap = nextRect.top - currentRect.bottom;
        final nextGap = afterNextRect.top - nextRect.bottom;
        expect((currentGap - nextGap).abs(), lessThanOrEqualTo(1.0));
      }
      final cardRect = tester.getRect(
        find.byKey(const ValueKey('update-stock-sku-card-0')),
      );
      final incrementRect = tester.getRect(
        find.byKey(const ValueKey('update-stock-increment-toggle')),
      );
      expect((firstRect.top - cardRect.top).abs(), lessThanOrEqualTo(1.0));
      expect(
        (lastRect.bottom - incrementRect.top).abs(),
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
    final defaultSkuCount = InventoryState.initial().skus.length;
    final gapForDefaultSkus = averageIndicatorGap(tester, defaultSkuCount);

    await pumpUpdateStockPage(
      tester,
      initialState: inventoryStateWithSkuCount(6),
    );
    final gapFor6Skus = averageIndicatorGap(tester, 6);

    expect(gapFor6Skus, lessThan(gapForDefaultSkus));
  });

  testWidgets('indicator pill state transitions animate on selection change', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    await tester.fling(
      find.byKey(const ValueKey('update-stock-sku-card-0')),
      const Offset(0, -500),
      1200,
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 110));

    expect(
      find.byKey(const ValueKey('update-stock-indicator-0-active')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('update-stock-indicator-0-inactive')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('update-stock-indicator-1-active')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('update-stock-indicator-1-inactive')),
      findsOneWidget,
    );

    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('update-stock-indicator-0-active')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('update-stock-indicator-0-inactive')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('update-stock-indicator-1-active')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('update-stock-indicator-1-inactive')),
      findsNothing,
    );
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
    AnimatedRotation toggleArrow() {
      return tester.widget<AnimatedRotation>(
        find.descendant(
          of: triggerFinder,
          matching: find.byType(AnimatedRotation),
        ),
      );
    }

    expect(toggleArrow().turns, equals(0.5));

    await tester.tap(
      find.byKey(const ValueKey('update-stock-increment-toggle')),
    );
    await tester.pumpAndSettle();
    expect(toggleArrow().turns, equals(0));
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

    expect(stepperValueText(tester, 'update-stock-count-value'), '+5');

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
    final toggleFinder = find.byKey(
      const ValueKey('update-stock-changes-total-toggle'),
    );
    expect(toggleFinder, findsOneWidget);

    Text toggleLabel(String label) {
      return tester.widget<Text>(
        find.descendant(of: toggleFinder, matching: find.text(label)).first,
      );
    }

    expect(
      toggleLabel('Changes').style?.fontSize,
      equals(AppThemeTokens.fontSizeBodyMedium),
    );
    expect(
      toggleLabel('Total').style?.fontSize,
      equals(AppThemeTokens.fontSizeBodyMedium),
    );

    final toggleLabelPadding = find.descendant(
      of: toggleFinder,
      matching: find.byWidgetPredicate((widget) {
        if (widget is! Padding) {
          return false;
        }
        return widget.padding ==
            const EdgeInsets.symmetric(
              horizontal: AppThemeTokens.inventoryChipPadX,
            );
      }),
    );
    expect(toggleLabelPadding, findsAtLeastNWidgets(2));

    await tester.tap(
      find.byKey(const ValueKey('update-stock-count-decrement')),
    );
    await tester.pumpAndSettle();
    expect(stepperValueText(tester, 'update-stock-count-value'), '-1');

    await tester.tap(find.text('Total'));
    await tester.pumpAndSettle();
    expect(stepperValueText(tester, 'update-stock-count-value'), '263');

    await tester.tap(find.text('Changes'));
    await tester.pumpAndSettle();
    expect(stepperValueText(tester, 'update-stock-count-value'), '-1');
  });

  testWidgets('stepper value fields are editable and unfocus on outside tap', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    const numberKeyboard = TextInputType.numberWithOptions(
      decimal: true,
      signed: true,
    );
    expect(
      stepperField(tester, 'update-stock-count-value').keyboardType,
      equals(numberKeyboard),
    );
    expect(
      stepperField(tester, 'update-stock-cost-value').keyboardType,
      equals(numberKeyboard),
    );

    final countValueFinder = find.byKey(
      const ValueKey('update-stock-count-value'),
    );
    await tester.tap(countValueFinder);
    await tester.pump();
    await tester.enterText(countValueFinder, '7');
    await tester.tap(find.text("SKUs' Stock Update"));
    await tester.pumpAndSettle();

    expect(stepperValueText(tester, 'update-stock-count-value'), '+7');
    final hasFocusedEditableText = tester
        .widgetList<EditableText>(find.byType(EditableText))
        .any((editableText) => editableText.focusNode.hasFocus);
    expect(hasFocusedEditableText, isFalse);

    final costValueFinder = find.byKey(
      const ValueKey('update-stock-cost-value'),
    );
    await tester.tap(costValueFinder);
    await tester.pump();
    await tester.enterText(costValueFinder, '-1.5');
    await tester.tap(
      find.byKey(const ValueKey('update-stock-count-value-pill')),
    );
    await tester.pumpAndSettle();

    expect(stepperValueText(tester, 'update-stock-cost-value'), '-1.5 USD');
  });

  testWidgets('editable values clamp to security numeric limits', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    await tester.tap(find.text('Total'));
    await tester.pumpAndSettle();

    final countValueFinder = find.byKey(
      const ValueKey('update-stock-count-value'),
    );
    await tester.tap(countValueFinder);
    await tester.pump();
    await tester.enterText(countValueFinder, '999999999999');
    await tester.tap(find.text("SKUs' Stock Update"));
    await tester.pumpAndSettle();
    expect(find.text('Change is too high!'), findsOneWidget);
    expect(
      stepperValueText(tester, 'update-stock-count-value'),
      equals('1000000'),
    );
    final highWarningTooltip = tester.widget<Tooltip>(
      find.byWidgetPredicate(
        (widget) =>
            widget is Tooltip && widget.message == 'Change is too high!',
      ),
    );
    final highWarningDecoration =
        highWarningTooltip.decoration as BoxDecoration?;
    expect(highWarningDecoration?.color, equals(AppThemeTokens.warning));

    final costValueFinder = find.byKey(
      const ValueKey('update-stock-cost-value'),
    );
    await tester.tap(costValueFinder);
    await tester.pump();
    await tester.enterText(costValueFinder, '999999999999');
    await tester.tap(find.text("SKUs' Stock Update"));
    await tester.pumpAndSettle();
    expect(find.text('Change is too high!'), findsOneWidget);
    expect(
      stepperValueText(tester, 'update-stock-cost-value'),
      equals('1000000000 USD'),
    );
  });

  testWidgets('editable input shows warning tooltip for non-numeric text', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    final initialCost = stepperValueText(tester, 'update-stock-cost-value');
    final costValueFinder = find.byKey(
      const ValueKey('update-stock-cost-value'),
    );
    await tester.tap(costValueFinder);
    await tester.pump();
    await tester.enterText(costValueFinder, 'abc');
    await tester.tap(find.text("SKUs' Stock Update"));
    await tester.pumpAndSettle();

    expect(find.text('Only numbers!'), findsOneWidget);
    expect(stepperValueText(tester, 'update-stock-cost-value'), initialCost);
    final warningTooltip = tester.widget<Tooltip>(
      find.byWidgetPredicate(
        (widget) => widget is Tooltip && widget.message == 'Only numbers!',
      ),
    );
    final warningDecoration = warningTooltip.decoration as BoxDecoration?;
    expect(warningDecoration?.color, equals(AppThemeTokens.warning));
  });

  testWidgets('cost in Changes mode is unsigned and + still increases value', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    final initialCost = stepperValueText(tester, 'update-stock-cost-value');
    expect(initialCost, equals('0 USD'));

    await tester.tap(find.byKey(const ValueKey('update-stock-cost-increment')));
    await tester.pumpAndSettle();

    final incrementedCost = stepperValueText(tester, 'update-stock-cost-value');
    expect(incrementedCost, equals('0.25 USD'));
    expect(incrementedCost, isNot(startsWith('+')));
    expect(incrementedCost, isNot(startsWith('-')));
  });

  testWidgets('cost change can go negative in Changes mode', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    await tester.tap(find.byKey(const ValueKey('update-stock-cost-decrement')));
    await tester.pumpAndSettle();
    expect(
      stepperValueText(tester, 'update-stock-cost-value'),
      equals('-0.25 USD'),
    );

    await tester.tap(find.byKey(const ValueKey('update-stock-cost-increment')));
    await tester.pumpAndSettle();
    expect(
      stepperValueText(tester, 'update-stock-cost-value'),
      equals('0 USD'),
    );

    await tester.tap(find.byKey(const ValueKey('update-stock-cost-decrement')));
    await tester.pumpAndSettle();
    expect(
      stepperValueText(tester, 'update-stock-cost-value'),
      equals('-0.25 USD'),
    );

    await tester.tap(find.byKey(const ValueKey('update-stock-cost-decrement')));
    await tester.pumpAndSettle();
    expect(
      stepperValueText(tester, 'update-stock-cost-value'),
      equals('-0.5 USD'),
    );
  });

  testWidgets('cost decrement shows clamp tooltip when already at zero floor', (
    WidgetTester tester,
  ) async {
    const zeroCostState = InventoryState(
      skus: <SkuItem>[
        SkuItem(
          id: 'sku-zero-cost',
          name: 'Zero Cost SKU',
          itemPictureIcon: Icons.inventory_2_outlined,
          description: 'Generated SKU',
          unitsInStock: 10,
          costPerUnit: 0,
          soldAsProduct: true,
          productPrice: 10,
        ),
      ],
      services: <ServiceItem>[],
    );

    await pumpUpdateStockPage(tester, initialState: zeroCostState);

    expect(
      stepperValueText(tester, 'update-stock-cost-value'),
      equals('0 USD'),
    );

    await tester.tap(find.byKey(const ValueKey('update-stock-cost-decrement')));
    await tester.pump();

    expect(find.text('Cost cannot go below zero'), findsOneWidget);
    expect(
      stepperValueText(tester, 'update-stock-cost-value'),
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
        equals(AppThemeTokens.error),
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
        equals(AppThemeTokens.success),
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
    final countValue = stepperField(tester, 'update-stock-count-value');
    final costValue = stepperField(tester, 'update-stock-cost-value');
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
    final countLabelRect = tester.getRect(
      find.descendant(
        of: find.byKey(const ValueKey('update-stock-count-label')),
        matching: find.text('Count'),
      ),
    );
    final costLabelRect = tester.getRect(
      find.descendant(
        of: find.byKey(const ValueKey('update-stock-cost-label')),
        matching: find.text('Cost'),
      ),
    );
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
    'cost input remains editable when count change is negative in Changes mode',
    (WidgetTester tester) async {
      await pumpUpdateStockPage(tester);

      await tester.tap(
        find.byKey(const ValueKey('update-stock-count-decrement')),
      );
      await tester.pumpAndSettle();
      expect(stepperValueText(tester, 'update-stock-count-value'), '-1');

      final costBefore = stepperValueText(tester, 'update-stock-cost-value');
      await tester.tap(
        find.byKey(const ValueKey('update-stock-cost-increment')),
      );
      await tester.pumpAndSettle();
      final costAfter = stepperValueText(tester, 'update-stock-cost-value');
      expect(costAfter, isNot(equals(costBefore)));

      await tester.tap(
        find.byKey(const ValueKey('update-stock-cost-value-pill')),
      );
      await tester.pump();
      expect(
        find.text('Cannot enter cost if change is negative.'),
        findsNothing,
      );
    },
  );

  testWidgets(
    'cost input remains editable when Total count drops below previous total',
    (WidgetTester tester) async {
      await pumpUpdateStockPage(tester);

      await tester.tap(find.text('Total'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('update-stock-count-decrement')),
      );
      await tester.pumpAndSettle();

      final costBefore = stepperValueText(tester, 'update-stock-cost-value');
      await tester.tap(
        find.byKey(const ValueKey('update-stock-cost-increment')),
      );
      await tester.pumpAndSettle();
      final costAfter = stepperValueText(tester, 'update-stock-cost-value');
      expect(costAfter, isNot(equals(costBefore)));

      await tester.tap(
        find.byKey(const ValueKey('update-stock-cost-value-pill')),
      );
      await tester.pump();
      expect(
        find.text('Cannot enter cost if change is negative.'),
        findsNothing,
      );
    },
  );

  testWidgets('save all updates shared inventory and opens ranking page', (
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
    await tester.fling(
      find.byKey(const ValueKey('update-stock-sku-card-3')),
      const Offset(0, -500),
      1200,
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('update-stock-save-all')));
    await tester.pumpAndSettle();

    expect(find.text('Sales Ranking Update'), findsOneWidget);
    expect(
      inventoryController.value.skus
          .firstWhere((sku) => sku.id == 'sku-001')
          .unitsInStock,
      263,
    );
  });

  testWidgets(
    'back arrow with changes confirms save and shows bottom message',
    (WidgetTester tester) async {
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
                              builder: (_) => const UpdateStockPage(),
                            ),
                          );
                        },
                        child: const Text('Open Stock Update'),
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

      await tester.tap(find.text('Open Stock Update'));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('update-stock-count-decrement')),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('update-stock-back')));
      await tester.pumpAndSettle();
      expect(find.text('Unsaved changes'), findsOneWidget);

      await tester.tap(find.text('Confirm'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.text('Stock updates saved.'), findsNothing);
      await tester.pumpAndSettle();
      expect(find.text('Open Stock Update'), findsOneWidget);
      expect(find.text('Stock updates saved.'), findsOneWidget);
      expect(
        inventoryController.value.skus
            .firstWhere((sku) => sku.id == 'sku-001')
            .unitsInStock,
        263,
      );
    },
  );

  testWidgets('back arrow with changes can discard and shows bottom message', (
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
                            builder: (_) => const UpdateStockPage(),
                          ),
                        );
                      },
                      child: const Text('Open Stock Update'),
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

    await tester.tap(find.text('Open Stock Update'));
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('update-stock-count-decrement')),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('update-stock-back')));
    await tester.pumpAndSettle();
    expect(find.text('Unsaved changes'), findsOneWidget);

    await tester.tap(find.text('Discard'));
    await tester.pumpAndSettle();
    expect(find.text('Open Stock Update'), findsOneWidget);
    expect(find.text('Stock updates discarded.'), findsOneWidget);
    expect(
      inventoryController.value.skus
          .firstWhere((sku) => sku.id == 'sku-001')
          .unitsInStock,
      264,
    );
  });

  testWidgets('back arrow always prompts confirmation even without changes', (
    WidgetTester tester,
  ) async {
    await pumpUpdateStockPage(tester);

    await tester.tap(find.byKey(const ValueKey('update-stock-back')));
    await tester.pumpAndSettle();

    expect(find.text('Unsaved changes'), findsOneWidget);
  });
}

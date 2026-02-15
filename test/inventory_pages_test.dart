import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_svg/flutter_svg.dart';

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

  Finder textFieldByHint(String hintText) {
    return find.byWidgetPredicate(
      (widget) =>
          widget is TextField && widget.decoration?.hintText == hintText,
    );
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

    await tester.tap(find.byIcon(Icons.arrow_back).first);
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

  testWidgets('service detail action buttons appear only after edits', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'Service #001');

    expect(find.byIcon(Icons.close), findsNothing);
    expect(find.byIcon(Icons.check), findsNothing);

    await tester.enterText(
      find.byType(TextField).at(0),
      'Service #001 Updated',
    );
    await tester.pump();

    expect(find.byIcon(Icons.close), findsOneWidget);
    expect(find.byIcon(Icons.check), findsOneWidget);
  });

  testWidgets('service detail disabled check border uses error color', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'Service #001');

    await tester.enterText(find.byType(TextField).at(2), '1200a');
    await tester.pump();

    final saveButton = tester.widget<FilledButton>(
      find.widgetWithIcon(FilledButton, Icons.check),
    );
    final side = saveButton.style?.side?.resolve({WidgetState.disabled});

    expect(saveButton.onPressed, isNull);
    expect(side?.color, AppThemeTokens.error);
    expect(side?.width, 2);
  });

  testWidgets(
    'tapping outside selected text field unfocuses and keeps validation logic',
    (WidgetTester tester) async {
      await pumpViewAll(tester);
      await openCard(tester, 'Service #001');

      final priceField = find.byType(TextField).at(2);
      await tester.tap(priceField);
      await tester.pump();

      await tester.enterText(priceField, '1200a');
      await tester.pump();

      final priceEditableBefore = tester.widget<EditableText>(
        find.descendant(of: priceField, matching: find.byType(EditableText)),
      );
      expect(priceEditableBefore.focusNode.hasFocus, isTrue);

      await tester.tap(find.text('SKUs Used'));
      await tester.pump();

      final priceEditableAfter = tester.widget<EditableText>(
        find.descendant(of: priceField, matching: find.byType(EditableText)),
      );
      expect(priceEditableAfter.focusNode.hasFocus, isFalse);

      final priceTextField = tester.widget<TextField>(priceField);
      final priceBorder =
          priceTextField.decoration?.enabledBorder as OutlineInputBorder?;
      expect(priceBorder?.borderSide.color, AppThemeTokens.error);

      final saveButton = tester.widget<FilledButton>(
        find.widgetWithIcon(FilledButton, Icons.check),
      );
      expect(saveButton.onPressed, isNull);
    },
  );

  testWidgets('service detail X cancels edits and stays on page', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'Service #001');

    await tester.enterText(
      find.byType(TextField).at(0),
      'Service #001 Updated',
    );
    await tester.pump();
    expect(find.byIcon(Icons.close), findsOneWidget);

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();

    expect(find.byType(ServiceDetailPage), findsOneWidget);
    final nameField = tester.widget<TextField>(find.byType(TextField).at(0));
    expect(nameField.controller?.text, 'Service #001');
    expect(find.byIcon(Icons.close), findsNothing);
    expect(find.byIcon(Icons.check), findsNothing);
  });

  testWidgets('service detail back prompt discard exits without saving', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'Service #001');

    await tester.enterText(
      find.byType(TextField).at(0),
      'Service #001 Unsaved',
    );
    await tester.pump();

    await tester.tap(find.byIcon(Icons.arrow_back).first);
    await tester.pumpAndSettle();

    expect(find.text('Unsaved changes'), findsOneWidget);
    await tester.tap(find.text('Discard'));
    await tester.pumpAndSettle();

    expect(find.text('All Items'), findsOneWidget);
    expect(find.text('Service #001'), findsOneWidget);
    expect(find.text('Service #001 Unsaved'), findsNothing);
  });

  testWidgets('service unsaved popup shows content immediately', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'Service #001');

    await tester.enterText(
      find.byType(TextField).at(0),
      'Service #001 Unsaved',
    );
    await tester.pump();

    await tester.tap(find.byIcon(Icons.arrow_back).first);
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.text('Unsaved changes'), findsOneWidget);
    expect(find.textContaining('You have unsaved changes'), findsOneWidget);
    expect(find.text('Discard'), findsOneWidget);
    expect(find.text('Confirm'), findsOneWidget);
  });

  testWidgets('service unsaved overlay action labels use larger text size', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'Service #001');

    await tester.enterText(
      find.byType(TextField).at(0),
      'Service #001 Unsaved',
    );
    await tester.pump();

    await tester.tap(find.byIcon(Icons.arrow_back).first);
    await tester.pumpAndSettle();

    final discardText = tester.widget<Text>(find.text('Discard'));
    final confirmText = tester.widget<Text>(find.text('Confirm'));

    expect(discardText.style?.fontSize, AppThemeTokens.fontSizeBodyLarge);
    expect(confirmText.style?.fontSize, AppThemeTokens.fontSizeBodyLarge);
  });

  testWidgets(
    'service unsaved overlay uses app theme button and frame styles',
    (WidgetTester tester) async {
      await pumpViewAll(tester);
      await openCard(tester, 'Service #001');

      await tester.enterText(
        find.byType(TextField).at(0),
        'Service #001 Unsaved',
      );
      await tester.pump();

      await tester.tap(find.byIcon(Icons.arrow_back).first);
      await tester.pumpAndSettle();

      final popupContainer = tester.widget<Container>(
        find
            .ancestor(
              of: find.text('Unsaved changes'),
              matching: find.byWidgetPredicate(
                (widget) =>
                    widget is Container &&
                    widget.decoration is BoxDecoration &&
                    (widget.decoration as BoxDecoration).color ==
                        AppThemeTokens.surface,
              ),
            )
            .first,
      );
      final popupDecoration = popupContainer.decoration! as BoxDecoration;
      expect(popupDecoration.border, isNull);

      final discardButton = tester.widget<TextButton>(
        find.widgetWithText(TextButton, 'Discard'),
      );
      expect(
        discardButton.style?.padding?.resolve(const <WidgetState>{}),
        const EdgeInsets.symmetric(
          horizontal: AppThemeTokens.buttonPaddingX,
          vertical: AppThemeTokens.buttonPaddingY,
        ),
      );

      final confirmButton = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Confirm'),
      );
      expect(
        confirmButton.style?.padding?.resolve(const <WidgetState>{}),
        const EdgeInsets.symmetric(
          horizontal: AppThemeTokens.buttonPaddingX,
          vertical: AppThemeTokens.buttonPaddingY,
        ),
      );
      final confirmText = tester.widget<Text>(
        find.descendant(
          of: find.widgetWithText(FilledButton, 'Confirm'),
          matching: find.text('Confirm'),
        ),
      );
      expect(confirmText.style?.color, AppThemeTokens.white);
    },
  );

  testWidgets('tapping outside unsaved overlay dismisses and keeps edits', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'Service #001');

    await tester.enterText(
      find.byType(TextField).at(0),
      'Service #001 Unsaved',
    );
    await tester.pump();

    await tester.tap(find.byIcon(Icons.arrow_back).first);
    await tester.pumpAndSettle();
    expect(find.text('Unsaved changes'), findsOneWidget);

    await tester.tapAt(const Offset(16, 16));
    await tester.pumpAndSettle();

    expect(find.byType(ServiceDetailPage), findsOneWidget);
    expect(find.text('Unsaved changes'), findsNothing);
    expect(find.byIcon(Icons.close), findsOneWidget);
    expect(find.byIcon(Icons.check), findsOneWidget);
    final nameField = tester.widget<TextField>(find.byType(TextField).at(0));
    expect(nameField.controller?.text, 'Service #001 Unsaved');
  });

  testWidgets('service detail back prompt confirm saves and exits', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'Service #001');

    await tester.enterText(find.byType(TextField).at(0), 'Service One');
    await tester.pump();

    await tester.tap(find.byIcon(Icons.arrow_back).first);
    await tester.pumpAndSettle();

    expect(find.text('Unsaved changes'), findsOneWidget);
    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();

    expect(find.text('All Items'), findsOneWidget);
    expect(find.text('Service One'), findsOneWidget);
  });

  testWidgets(
    'invalid unsaved popup uses discard/go back and highlights bad fields',
    (WidgetTester tester) async {
      await pumpViewAll(tester);
      await openCard(tester, 'Service #001');

      await tester.enterText(find.byType(TextField).at(0), '');
      await tester.enterText(find.byType(TextField).at(2), '1200a');
      await tester.pump();

      await tester.tap(find.byIcon(Icons.arrow_back).first);
      await tester.pumpAndSettle();
      expect(find.text('Invalid fields'), findsOneWidget);
      expect(
        find.textContaining('Price field must be a valid number'),
        findsOneWidget,
      );
      expect(find.textContaining('Please fix'), findsNothing);
      expect(find.widgetWithText(TextButton, 'Discard'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Go Back'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Confirm'), findsNothing);

      final nameField = tester.widget<TextField>(find.byType(TextField).at(0));
      final nameBorder =
          nameField.decoration?.enabledBorder as OutlineInputBorder?;
      expect(nameBorder?.borderSide.color, AppThemeTokens.error);

      final priceField = tester.widget<TextField>(find.byType(TextField).at(2));
      final priceBorder =
          priceField.decoration?.enabledBorder as OutlineInputBorder?;
      expect(priceBorder?.borderSide.color, AppThemeTokens.error);

      await tester.tap(find.text('Go Back'));
      await tester.pumpAndSettle();
      expect(find.byType(ServiceDetailPage), findsOneWidget);
      expect(find.text('Invalid fields'), findsNothing);
    },
  );

  testWidgets('sku detail action buttons appear only after edits', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'SKU #001');

    expect(find.byIcon(Icons.close), findsNothing);
    expect(find.byIcon(Icons.check), findsNothing);

    await tester.enterText(find.byType(TextField).at(0), 'SKU #001 Updated');
    await tester.pump();

    expect(find.byIcon(Icons.close), findsOneWidget);
    expect(find.byIcon(Icons.check), findsOneWidget);
  });

  testWidgets('sku detail X cancels edits and stays on page', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'SKU #001');

    await tester.enterText(find.byType(TextField).at(0), 'SKU #001 Updated');
    await tester.pump();

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();

    expect(find.byType(SkuDetailPage), findsOneWidget);
    final nameField = tester.widget<TextField>(find.byType(TextField).at(0));
    expect(nameField.controller?.text, 'SKU #001');
    expect(find.byIcon(Icons.close), findsNothing);
    expect(find.byIcon(Icons.check), findsNothing);
  });

  testWidgets('sku detail back prompt discard exits without saving', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'SKU #001');

    await tester.enterText(find.byType(TextField).at(0), 'SKU #001 Unsaved');
    await tester.pump();

    await tester.tap(find.byIcon(Icons.arrow_back).first);
    await tester.pumpAndSettle();

    expect(find.text('Unsaved changes'), findsOneWidget);
    await tester.tap(find.text('Discard'));
    await tester.pumpAndSettle();

    expect(find.text('All Items'), findsOneWidget);
    expect(find.text('SKU #001'), findsOneWidget);
    expect(find.text('SKU #001 Unsaved'), findsNothing);
  });

  testWidgets('sku detail back prompt confirm saves and exits', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'SKU #001');

    await tester.enterText(find.byType(TextField).at(0), 'SKU One');
    await tester.pump();

    await tester.tap(find.byIcon(Icons.arrow_back).first);
    await tester.pumpAndSettle();

    expect(find.text('Unsaved changes'), findsOneWidget);
    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();

    expect(find.text('All Items'), findsOneWidget);
    expect(find.text('SKU One'), findsOneWidget);
  });

  testWidgets('invalid sku unsaved popup shows go back and field errors', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'SKU #001');

    await tester.scrollUntilVisible(
      find.text('Cost / Piece'),
      220,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(textFieldByHint('e.g. 4.50'), '4a');
    await tester.pump();

    await tester.tap(find.byIcon(Icons.arrow_back).first);
    await tester.pumpAndSettle();

    expect(find.text('Invalid fields'), findsOneWidget);
    expect(
      find.textContaining('Cost / Piece field must be a valid number'),
      findsOneWidget,
    );
    expect(find.widgetWithText(TextButton, 'Discard'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Go Back'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Confirm'), findsNothing);
  });

  testWidgets('sku detail monetary fields reflect selected app currency', (
    WidgetTester tester,
  ) async {
    const sku = SkuItem(
      id: 'sku-currency',
      name: 'SKU Currency',
      itemPictureIcon: Icons.inventory_2_outlined,
      description: 'desc',
      pieces: 12,
      bulk: 2,
      piecesPerBulk: 6,
      costPerPiece: 5,
      costPerBulk: 40,
      soldAsProduct: false,
      productPrice: null,
    );
    final currencyController = CurrencyController()
      ..switchCurrency(AppCurrency.khr);

    await setPhoneViewport(tester);
    await tester.pumpWidget(
      AppCurrencyScope(
        controller: currencyController,
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const SkuDetailPage(initialSku: sku),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('Cost / Piece'),
      220,
      scrollable: find.byType(Scrollable).first,
    );
    final costPieceField = tester.widget<TextField>(
      textFieldByHint('e.g. 4.50'),
    );
    final costPieceSuffix = costPieceField.decoration?.suffix as Padding;
    expect((costPieceSuffix.child as Text).data, 'KHR');

    await tester.scrollUntilVisible(
      find.text('Product Price'),
      220,
      scrollable: find.byType(Scrollable).first,
    );
    final costBulkField = tester.widget<TextField>(
      textFieldByHint('e.g. 40.00'),
    );
    final costBulkSuffix = costBulkField.decoration?.suffix as Padding;
    expect((costBulkSuffix.child as Text).data, 'KHR');

    await tester.tap(find.text('Sold as a Product?'));
    await tester.pump();
    final productPriceField = tester.widget<TextField>(
      textFieldByHint('e.g. 12.00'),
    );
    final productPriceSuffix = productPriceField.decoration?.suffix as Padding;
    expect((productPriceSuffix.child as Text).data, 'KHR');
  });

  testWidgets('sku detail total value is right aligned', (
    WidgetTester tester,
  ) async {
    const sku = SkuItem(
      id: 'sku-total-align',
      name: 'SKU Total Align',
      itemPictureIcon: Icons.inventory_2_outlined,
      description: 'desc',
      pieces: 120,
      bulk: 12,
      piecesPerBulk: 12,
      costPerPiece: 5,
      costPerBulk: 58,
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
      find.text('Total Value'),
      220,
      scrollable: find.byType(Scrollable).first,
    );

    final totalValueText = tester.widget<Text>(find.text('1.3k USD'));
    expect(totalValueText.textAlign, TextAlign.end);
  });

  testWidgets('sku detail invalid monetary field shows red border on blur', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'SKU #001');

    await tester.scrollUntilVisible(
      find.text('Cost / Piece'),
      220,
      scrollable: find.byType(Scrollable).first,
    );

    final costPieceField = textFieldByHint('e.g. 4.50');
    await tester.enterText(costPieceField, '4a');
    await tester.pump();
    await tester.scrollUntilVisible(
      find.text('Cost / Bulk'),
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Cost / Bulk'));
    await tester.pump();

    final saveButton = tester.widget<FilledButton>(
      find.widgetWithIcon(FilledButton, Icons.check),
    );
    expect(saveButton.onPressed, isNull);
    final side = saveButton.style?.side?.resolve({WidgetState.disabled});
    expect(side?.color, AppThemeTokens.error);

    final priceTextField = tester.widget<TextField>(costPieceField);
    final border =
        priceTextField.decoration?.enabledBorder as OutlineInputBorder?;
    expect(border?.borderSide.color, AppThemeTokens.error);
  });

  testWidgets('add SKU flow requires description and appends new card', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);

    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add SKU'));
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.check), findsNothing);

    await tester.enterText(find.byType(TextField).at(1), 'New SKU description');
    await tester.pump();

    FilledButton saveButton = tester.widget<FilledButton>(
      find.widgetWithIcon(FilledButton, Icons.check),
    );
    expect(saveButton.onPressed, isNotNull);

    await tester.tap(find.widgetWithIcon(FilledButton, Icons.check));
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
    expect(find.byIcon(Icons.close), findsNothing);
    expect(find.byIcon(Icons.check), findsNothing);

    final selectorCard = tester.widget<Card>(
      find.ancestor(
        of: find.widgetWithText(CheckboxListTile, 'SKU #001'),
        matching: find.byType(Card),
      ),
    );
    expect(selectorCard.margin, EdgeInsets.zero);
    final selectorShape = selectorCard.shape as RoundedRectangleBorder;
    expect(
      selectorShape.borderRadius,
      const BorderRadius.all(Radius.circular(AppThemeTokens.radiusMd)),
    );
    final skuTile = tester.widget<CheckboxListTile>(
      find.widgetWithText(CheckboxListTile, 'SKU #001'),
    );
    expect(skuTile.contentPadding, isNull);
    expect(skuTile.checkboxScaleFactor, 1.0);

    await tester.tap(find.widgetWithText(CheckboxListTile, 'SKU #001'));
    await tester.pump();
    expect(find.byIcon(Icons.close), findsOneWidget);
    expect(find.byIcon(Icons.check), findsOneWidget);
    expect(
      find.ancestor(
        of: find.widgetWithIcon(OutlinedButton, Icons.close),
        matching: find.byWidgetPredicate(
          (widget) =>
              widget is SizedBox && widget.width == 40 && widget.height == 40,
        ),
      ),
      findsOneWidget,
    );
    expect(
      find.ancestor(
        of: find.widgetWithIcon(FilledButton, Icons.check),
        matching: find.byWidgetPredicate(
          (widget) =>
              widget is SizedBox && widget.width == 40 && widget.height == 40,
        ),
      ),
      findsOneWidget,
    );
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

  testWidgets('detail pages no longer show Item Picture field section', (
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
    const service = ServiceItem(
      id: 'service-test',
      name: 'Service Test',
      itemPictureIcon: Icons.person_outline,
      description: 'desc',
      price: 1,
      skuIds: {'sku-test'},
    );

    await setPhoneViewport(tester);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: const SkuDetailPage(initialSku: sku),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Item Picture *'), findsNothing);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: const ServiceDetailPage(
          initialService: service,
          availableSkus: [sku],
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Item Picture *'), findsNothing);
  });

  testWidgets('media carousel auto-scrolls to item picture after 10 seconds', (
    WidgetTester tester,
  ) async {
    const sku = SkuItem(
      id: 'sku-carousel',
      name: 'SKU Carousel',
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

    expect(
      find.text(
        'Chart graphing updates +\nest. (banded) values\n\nand picture for the other',
      ),
      findsOneWidget,
    );

    await tester.pump(const Duration(seconds: 10));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Chart graphing updates +\nest. (banded) values\n\nand picture for the other',
      ),
      findsNothing,
    );
    expect(find.byIcon(Icons.inventory_2_outlined), findsOneWidget);
  });

  testWidgets('tapping carousel dots changes media slide', (
    WidgetTester tester,
  ) async {
    const sku = SkuItem(
      id: 'sku-carousel-dots',
      name: 'SKU Carousel Dots',
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

    expect(
      find.text(
        'Chart graphing updates +\nest. (banded) values\n\nand picture for the other',
      ),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const ValueKey('media-carousel-dot-1')));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Chart graphing updates +\nest. (banded) values\n\nand picture for the other',
      ),
      findsNothing,
    );
    expect(find.byIcon(Icons.inventory_2_outlined), findsOneWidget);

    await tester.pump(const Duration(seconds: 9));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.inventory_2_outlined), findsOneWidget);

    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Chart graphing updates +\nest. (banded) values\n\nand picture for the other',
      ),
      findsOneWidget,
    );
  });

  testWidgets('media carousel has edit icon button and tapping is a no-op', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'Service #001');

    final filterIcon = find.byIcon(Icons.filter_alt_outlined);
    expect(filterIcon, findsOneWidget);
    await tester.tap(filterIcon);
    await tester.pump();
    expect(tester.takeException(), isNull);

    await tester.pump(const Duration(seconds: 10));
    await tester.pumpAndSettle();

    final editSquareAsset = find.byWidgetPredicate(
      (widget) =>
          widget is SvgPicture &&
          widget.bytesLoader is SvgAssetLoader &&
          (widget.bytesLoader as SvgAssetLoader).assetName ==
              'icons/edit_square_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg',
    );
    expect(editSquareAsset, findsOneWidget);

    await tester.tap(editSquareAsset);
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.byType(ServiceDetailPage), findsOneWidget);
  });

  testWidgets('service detail selected SKU chips use item-card chip styling', (
    WidgetTester tester,
  ) async {
    await pumpViewAll(tester);
    await openCard(tester, 'Service #001');

    final chip = tester.widget<Chip>(find.widgetWithText(Chip, 'SKU #001'));

    expect(chip.backgroundColor, AppThemeTokens.chipBackground);
    expect(chip.side, BorderSide.none);
    expect(chip.materialTapTargetSize, MaterialTapTargetSize.shrinkWrap);
    expect(chip.visualDensity, VisualDensity.compact);
    expect(
      chip.padding,
      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    );

    final shape = chip.shape as RoundedRectangleBorder;
    expect(
      shape.borderRadius,
      const BorderRadius.all(Radius.circular(AppThemeTokens.radiusPill)),
    );
  });

  testWidgets(
    'service detail frames are aligned and reserve price currency space',
    (WidgetTester tester) async {
      const skuOne = SkuItem(
        id: 'sku-001',
        name: 'SKU #001',
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
      const skuTwo = SkuItem(
        id: 'sku-002',
        name: 'SKU #002',
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
      const service = ServiceItem(
        id: 'service-001',
        name: 'Service #001',
        itemPictureIcon: Icons.person_outline,
        description: 'Basic package for recurring customers.',
        price: 1200,
        skuIds: {'sku-001', 'sku-002'},
      );

      await setPhoneViewport(tester);
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: const ServiceDetailPage(
            initialService: service,
            availableSkus: [skuOne, skuTwo],
          ),
        ),
      );
      await tester.pumpAndSettle();

      final mediaRect = tester.getRect(find.byType(Card).at(0));
      final skuUsedRect = tester.getRect(find.byType(Card).at(1));
      final nameRect = tester.getRect(find.byType(TextField).at(0));
      final descriptionRect = tester.getRect(find.byType(TextField).at(1));
      final priceRect = tester.getRect(find.byType(TextField).at(2));
      final nameLabelRect = tester.getRect(find.text('Name').first);
      final descriptionLabelRect = tester.getRect(
        find.text('Description').first,
      );

      const epsilon = 0.01;
      expect(
        (mediaRect.left - nameRect.left).abs(),
        lessThanOrEqualTo(epsilon),
      );
      expect(
        (skuUsedRect.left - nameRect.left).abs(),
        lessThanOrEqualTo(epsilon),
      );
      expect(
        (descriptionRect.left - nameRect.left).abs(),
        lessThanOrEqualTo(epsilon),
      );
      expect(
        (priceRect.left - nameRect.left).abs(),
        lessThanOrEqualTo(epsilon),
      );

      expect(
        (mediaRect.width - nameRect.width).abs(),
        lessThanOrEqualTo(epsilon),
      );
      expect(
        (skuUsedRect.width - nameRect.width).abs(),
        lessThanOrEqualTo(epsilon),
      );
      expect(
        (descriptionRect.width - nameRect.width).abs(),
        lessThanOrEqualTo(epsilon),
      );
      expect(
        (priceRect.width - nameRect.width).abs(),
        lessThanOrEqualTo(epsilon),
      );
      expect(find.text('USD'), findsOneWidget);

      final labelToBoxGap = nameRect.top - nameLabelRect.bottom;
      final frameToFrameGap = descriptionLabelRect.top - nameRect.bottom;
      expect(frameToFrameGap, greaterThan(labelToBoxGap));
    },
  );

  testWidgets('service detail price row reflects selected app currency', (
    WidgetTester tester,
  ) async {
    const sku = SkuItem(
      id: 'sku-001',
      name: 'SKU #001',
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
    const service = ServiceItem(
      id: 'service-001',
      name: 'Service #001',
      itemPictureIcon: Icons.person_outline,
      description: 'Basic package for recurring customers.',
      price: 1200,
      skuIds: {'sku-001'},
    );

    final currencyController = CurrencyController()
      ..switchCurrency(AppCurrency.khr);

    await setPhoneViewport(tester);
    await tester.pumpWidget(
      AppCurrencyScope(
        controller: currencyController,
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const ServiceDetailPage(
            initialService: service,
            availableSkus: [sku],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('KHR'), findsOneWidget);
  });

  testWidgets('name and description counters update live and enforce limits', (
    WidgetTester tester,
  ) async {
    const sku = SkuItem(
      id: 'sku-limit-test',
      name: 'SKU',
      itemPictureIcon: Icons.inventory_2_outlined,
      description: 'Desc',
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

    expect(find.text('3/80'), findsOneWidget);
    expect(find.text('4/250'), findsOneWidget);

    final nameField = tester.widget<TextField>(find.byType(TextField).at(0));
    final descriptionField = tester.widget<TextField>(
      find.byType(TextField).at(1),
    );
    final namePadding = nameField.decoration?.contentPadding as EdgeInsets?;
    final descriptionPadding =
        descriptionField.decoration?.contentPadding as EdgeInsets?;

    expect(nameField.decoration?.suffix, isNotNull);
    expect(descriptionPadding, isNotNull);
    expect(descriptionPadding!.left, AppThemeTokens.inputPaddingX);
    expect(descriptionPadding.right, AppThemeTokens.inputPaddingX);
    if (namePadding != null) {
      expect(namePadding.left, AppThemeTokens.inputPaddingX);
      expect(namePadding.right, AppThemeTokens.inputPaddingX);
      expect(namePadding.bottom, AppThemeTokens.inputPaddingY);
    }
    expect(
      descriptionPadding.bottom,
      greaterThan(AppThemeTokens.inputPaddingY),
    );

    await tester.enterText(find.byType(TextField).at(0), 'Hello');
    await tester.pump();
    expect(find.text('5/80'), findsOneWidget);

    await tester.enterText(find.byType(TextField).at(0), 'A' * 150);
    await tester.pump();
    expect(find.text('80/80'), findsOneWidget);

    await tester.enterText(find.byType(TextField).at(1), 'B' * 1100);
    await tester.pump();
    expect(find.text('250/250'), findsOneWidget);
  });
}

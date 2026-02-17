import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banji/main.dart';
import 'package:banji/theme/app_theme.dart';

void main() {
  Future<void> setPhoneViewport(WidgetTester tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 932);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
  }

  Future<void> pumpApp(WidgetTester tester) async {
    await setPhoneViewport(tester);
    await tester.pumpWidget(const BanjiApp());
    await tester.pumpAndSettle();
  }

  testWidgets('home shows dashboard sections and top actions', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    expect(find.text('banji'), findsOneWidget);
    expect(find.text('Key Metrics'), findsOneWidget);
    expect(find.text('Performance'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Recent Activity'),
      240,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Recent Activity'), findsOneWidget);
    expect(find.byIcon(Icons.format_list_bulleted), findsOneWidget);
    expect(find.byIcon(Icons.settings), findsOneWidget);
    expect(find.byIcon(Icons.receipt_long_rounded), findsOneWidget);
  });

  testWidgets('home overlay receipt action is rendered as a rounded button', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    final receiptButtonFinder = find.byKey(
      const ValueKey('home-overlay-receipt-button'),
    );
    final receiptButton = tester.widget<FloatingActionButton>(
      receiptButtonFinder,
    );
    final homeScaffold = tester.widget<Scaffold>(find.byType(Scaffold).first);
    expect(
      homeScaffold.floatingActionButtonLocation,
      AppThemeTokens.primaryFabLocation,
    );
    expect(receiptButton.shape, isA<CircleBorder>());
    expect(
      tester.getSize(receiptButtonFinder),
      const Size(
        AppThemeTokens.primaryFabDiameter,
        AppThemeTokens.primaryFabDiameter,
      ),
    );
    final receiptIcon = tester.widget<Icon>(
      find.descendant(
        of: receiptButtonFinder,
        matching: find.byIcon(Icons.receipt_long_rounded),
      ),
    );
    expect(receiptIcon.size, AppThemeTokens.primaryFabIconSize);
  });

  testWidgets('home list action opens View All and back returns home', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    await tester.tap(find.byIcon(Icons.format_list_bulleted));
    await tester.pumpAndSettle();

    expect(find.text('All Items'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();

    expect(find.text('Key Metrics'), findsOneWidget);
  });

  testWidgets('settings language and currency controls update UI', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();
    expect(find.text('Settings'), findsOneWidget);

    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Khmer (ខ្មែរ)').last);
    await tester.pumpAndSettle();

    expect(find.text('ការកំណត់'), findsOneWidget);
    expect(find.text('ភាសា'), findsOneWidget);

    await tester.tap(find.text('ដុល្លា (\$)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('រៀល (៛)').last);
    await tester.pumpAndSettle();

    expect(find.text('រៀល (៛)'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();

    expect(find.text('សូចនាករសំខាន់ៗ'), findsOneWidget);
  });

  testWidgets('settings language dropdown keeps horizontal anchor alignment', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();
    expect(find.text('Settings'), findsOneWidget);

    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();

    final menuRect = tester.getRect(
      find.byKey(const ValueKey('settings-language-menu')),
    );
    expect(menuRect.left, greaterThanOrEqualTo(AppThemeTokens.space4));
    expect(menuRect.right, lessThanOrEqualTo(430 - AppThemeTokens.space4));
  });

  testWidgets('settings backup and logout actions are tappable', (
    WidgetTester tester,
  ) async {
    await pumpApp(tester);

    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(IconButton).last);
    await tester.pump();
    await tester.tap(find.text('Logout'), warnIfMissed: false);
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });
}

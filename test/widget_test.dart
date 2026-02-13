import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banji/main.dart';
import 'package:banji/views/settings_view.dart';

void main() {
  testWidgets('Banji app renders home dashboard shell', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const BanjiApp());

    expect(find.text('banji'), findsOneWidget);
    expect(find.text('Key Metrics'), findsOneWidget);
    expect(find.byIcon(Icons.settings), findsOneWidget);
  });

  testWidgets('switching language updates UI immediately', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const BanjiApp());

    await tester.tap(find.byIcon(Icons.settings));
    await tester.pumpAndSettle();

    await tester.tap(find.text('English').first);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Khmer (ខ្មែរ)').first);
    await tester.pumpAndSettle();

    expect(find.text('ការកំណត់'), findsOneWidget);
    expect(find.text('ភាសា'), findsOneWidget);

    Navigator.of(tester.element(find.byType(SettingsView))).pop();
    await tester.pumpAndSettle();

    expect(find.text('សូចនាករសំខាន់ៗ'), findsOneWidget);
  });
}

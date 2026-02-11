import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banji/main.dart';

void main() {
  testWidgets('Banji app renders home dashboard shell',
      (WidgetTester tester) async {
    await tester.pumpWidget(const BanjiApp());

    expect(find.text('banji'), findsOneWidget);
    expect(find.text('Key Metrics'), findsOneWidget);
    expect(find.byIcon(Icons.settings), findsOneWidget);
  });
}

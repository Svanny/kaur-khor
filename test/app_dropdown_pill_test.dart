import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banji/theme/app_theme.dart';
import 'package:banji/widgets/app_dropdown_pill.dart';

void main() {
  const triggerKey = ValueKey('dropdown-trigger');
  const menuKey = ValueKey('dropdown-menu');

  Future<void> setViewport(
    WidgetTester tester, {
    Size size = const Size(900, 700),
  }) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = size;
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
  }

  testWidgets(
    'dropdown remains aligned to trigger when local media query width differs from root overlay',
    (tester) async {
      await setViewport(tester);
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: Row(
              children: [
                const SizedBox(width: 420),
                SizedBox(
                  width: 300,
                  child: MediaQuery(
                    data: const MediaQueryData(size: Size(300, 700)),
                    child: Align(
                      alignment: Alignment.topRight,
                      child: AppDropdownPill<String>(
                        triggerKey: triggerKey,
                        menuKey: menuKey,
                        value: 'English',
                        options: const ['English', 'Khmer (ខ្មែរ)'],
                        labelBuilder: (value) => value,
                        onChanged: (_) {},
                        menuXAlignment: AppDropdownXAlignment.right,
                        menuYAlignment: AppDropdownYAlignment.bottom,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );

      await tester.tap(find.byKey(triggerKey));
      await tester.pumpAndSettle();

      final triggerRect = tester.getRect(find.byKey(triggerKey));
      final menuRect = tester.getRect(find.byKey(menuKey));
      final selectedTextRect = tester.getRect(find.text('English').last);
      expect(menuRect.left, greaterThanOrEqualTo(AppThemeTokens.space4));
      expect(menuRect.right, lessThanOrEqualTo(900 - AppThemeTokens.space4));
      expect(
        selectedTextRect.right,
        lessThanOrEqualTo(triggerRect.right + AppThemeTokens.space4),
      );
    },
  );

  testWidgets(
    'dropdown horizontal clamp stays correct when target subtree is scaled',
    (tester) async {
      await setViewport(tester);
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: Align(
              alignment: Alignment.topRight,
              child: SizedBox(
                width: 200,
                child: Transform.scale(
                  scale: 0.8,
                  alignment: Alignment.topRight,
                  child: Align(
                    alignment: Alignment.topRight,
                    child: AppDropdownPill<String>(
                      triggerKey: triggerKey,
                      value: 'English',
                      options: const ['English', 'Khmer (ខ្មែរ)'],
                      labelBuilder: (value) => value,
                      onChanged: (_) {},
                      menuXAlignment: AppDropdownXAlignment.center,
                      menuYAlignment: AppDropdownYAlignment.bottom,
                      minMenuWidth: 500,
                      maxMenuWidth: 500,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.byKey(triggerKey));
      await tester.pumpAndSettle();

      final checkIconRect = tester.getRect(find.byIcon(Icons.check_rounded));
      expect(
        checkIconRect.right,
        lessThanOrEqualTo(900 - AppThemeTokens.space4),
      );
    },
  );

  testWidgets('dropdown clamps oversized menu within viewport margins', (
    tester,
  ) async {
    await setViewport(tester, size: const Size(320, 700));
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: Align(
            alignment: Alignment.topRight,
            child: AppDropdownPill<String>(
              triggerKey: triggerKey,
              menuKey: menuKey,
              value: 'English',
              options: const ['English', 'Khmer (ខ្មែរ)'],
              labelBuilder: (value) => value,
              onChanged: (_) {},
              menuXAlignment: AppDropdownXAlignment.right,
              menuYAlignment: AppDropdownYAlignment.bottom,
              minMenuWidth: 600,
              maxMenuWidth: 600,
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.byKey(triggerKey));
    await tester.pumpAndSettle();

    final menuRect = tester.getRect(find.byKey(menuKey));
    expect(menuRect.left, greaterThanOrEqualTo(AppThemeTokens.space4));
    expect(menuRect.right, lessThanOrEqualTo(320 - AppThemeTokens.space4));
  });
}

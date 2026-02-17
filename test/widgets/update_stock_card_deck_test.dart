import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banji/widgets/update_stock_card_deck.dart';

void main() {
  Future<void> setPhoneViewport(WidgetTester tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 932);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
  }

  Future<void> pumpDeckHarness(
    WidgetTester tester, {
    required int cardsCount,
    int initialIndex = 0,
  }) async {
    await setPhoneViewport(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: _DeckHarness(cardsCount: cardsCount, initialIndex: initialIndex),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('swipe up advances and swipe down restores previous card', (
    tester,
  ) async {
    await pumpDeckHarness(tester, cardsCount: 6);

    await tester.fling(
      find.byKey(const ValueKey('front-0')),
      const Offset(0, -500),
      1200,
    );
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<Text>(find.byKey(const ValueKey('deck-current-index')))
          .data,
      'current:1',
    );

    await tester.fling(
      find.byKey(const ValueKey('front-1')),
      const Offset(0, 500),
      1200,
    );
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<Text>(find.byKey(const ValueKey('deck-current-index')))
          .data,
      'current:0',
    );
  });

  testWidgets('swipe up on the last card triggers end callback', (
    tester,
  ) async {
    await pumpDeckHarness(tester, cardsCount: 1);

    await tester.fling(
      find.byKey(const ValueKey('front-0')),
      const Offset(0, -500),
      1200,
    );
    await tester.pumpAndSettle();

    expect(
      tester
          .widget<Text>(find.byKey(const ValueKey('deck-current-index')))
          .data,
      'current:0',
    );
    expect(
      tester.widget<Text>(find.byKey(const ValueKey('deck-end-count'))).data,
      'end:1',
    );
  });

  testWidgets('downward swipe on first card does not change index', (
    tester,
  ) async {
    await pumpDeckHarness(tester, cardsCount: 4);

    await tester.fling(
      find.byKey(const ValueKey('front-0')),
      const Offset(0, 500),
      1200,
    );
    await tester.pumpAndSettle();

    expect(
      tester
          .widget<Text>(find.byKey(const ValueKey('deck-current-index')))
          .data,
      'current:0',
    );
  });

  testWidgets('preload cache keeps exactly three cards around current index', (
    tester,
  ) async {
    await pumpDeckHarness(tester, cardsCount: 6);

    expect(
      find.byKey(const ValueKey('preload-0'), skipOffstage: false),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('preload-1'), skipOffstage: false),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('preload-2'), skipOffstage: false),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('preload-3'), skipOffstage: false),
      findsNothing,
    );

    await tester.fling(
      find.byKey(const ValueKey('front-0')),
      const Offset(0, -500),
      1200,
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('preload-0'), skipOffstage: false),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('preload-1'), skipOffstage: false),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('preload-2'), skipOffstage: false),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('preload-3'), skipOffstage: false),
      findsNothing,
    );

    await tester.fling(
      find.byKey(const ValueKey('front-1')),
      const Offset(0, -500),
      1200,
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('preload-1'), skipOffstage: false),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('preload-2'), skipOffstage: false),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('preload-3'), skipOffstage: false),
      findsOneWidget,
    );
  });

  testWidgets('with less than three cards it preloads only available cards', (
    tester,
  ) async {
    await pumpDeckHarness(tester, cardsCount: 2);

    expect(
      find.byKey(const ValueKey('preload-0'), skipOffstage: false),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('preload-1'), skipOffstage: false),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('preload-2'), skipOffstage: false),
      findsNothing,
    );
  });
}

class _DeckHarness extends StatefulWidget {
  const _DeckHarness({required this.cardsCount, required this.initialIndex});

  final int cardsCount;
  final int initialIndex;

  @override
  State<_DeckHarness> createState() => _DeckHarnessState();
}

class _DeckHarnessState extends State<_DeckHarness> {
  late int _currentIndex = widget.initialIndex;
  int _endCount = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text(
            'current:$_currentIndex',
            key: const ValueKey('deck-current-index'),
          ),
          Text('end:$_endCount', key: const ValueKey('deck-end-count')),
          Expanded(
            child: UpdateStockCardDeck(
              cardsCount: widget.cardsCount,
              currentIndex: _currentIndex,
              swiperKey: const ValueKey('deck-swiper'),
              animationDuration: const Duration(milliseconds: 220),
              preloadKeyPrefix: 'preload-',
              stackCardKeyPrefix: 'stack-',
              downOverlayKeyPrefix: 'overlay-',
              downBackEjectKeyPrefix: 'eject-',
              backfillKeyPrefix: 'backfill-',
              onCurrentIndexChanged: (index) {
                setState(() => _currentIndex = index);
              },
              onReachedEndForward: () {
                setState(() => _endCount += 1);
              },
              cardBuilder: (context, index) => Container(
                key: ValueKey('front-$index'),
                color: Colors.blueGrey,
                alignment: Alignment.center,
                child: Text('front-$index'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

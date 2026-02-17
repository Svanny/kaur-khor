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

  Finder keyPrefixFinder(String prefix, {bool skipOffstage = true}) {
    return find.byWidgetPredicate((widget) {
      final key = widget.key;
      return key is ValueKey<String> && key.value.startsWith(prefix);
    }, skipOffstage: skipOffstage);
  }

  Future<void> pumpDeckHarness(
    WidgetTester tester, {
    required int cardsCount,
    int initialIndex = 0,
    int maxStackCards = 3,
    double boundaryFogOffsetFromDeckTop = 0,
  }) async {
    await setPhoneViewport(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: _DeckHarness(
          cardsCount: cardsCount,
          initialIndex: initialIndex,
          maxStackCards: maxStackCards,
          boundaryFogOffsetFromDeckTop: boundaryFogOffsetFromDeckTop,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('shows at most three stacked cards', (tester) async {
    await pumpDeckHarness(tester, cardsCount: 6);

    expect(find.byKey(const ValueKey('front-0')), findsOneWidget);
    expect(find.byKey(const ValueKey('front-1')), findsOneWidget);
    expect(find.byKey(const ValueKey('front-2')), findsOneWidget);
    expect(find.byKey(const ValueKey('front-3')), findsNothing);
  });

  testWidgets('boundary fog mask appears only during upward drag', (
    tester,
  ) async {
    await pumpDeckHarness(tester, cardsCount: 6);

    expect(
      find.byKey(const ValueKey('update-stock-boundary-fog-mask')),
      findsNothing,
    );
    expect(find.byType(ShaderMask), findsNothing);

    final gesture = await tester.startGesture(
      tester.getCenter(find.byKey(const ValueKey('front-0'))),
    );
    var overlaySeen = false;
    for (var i = 0; i < 6; i += 1) {
      await gesture.moveBy(const Offset(0, -20));
      await tester.pump();
      if (find
          .byKey(const ValueKey('update-stock-boundary-fog-mask'))
          .evaluate()
          .isNotEmpty) {
        overlaySeen = true;
        break;
      }
    }
    expect(overlaySeen, isTrue);

    await gesture.up();
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('update-stock-boundary-fog-mask')),
      findsNothing,
    );
  });

  testWidgets('boundary fog respects top offset before showing', (
    tester,
  ) async {
    await pumpDeckHarness(
      tester,
      cardsCount: 6,
      boundaryFogOffsetFromDeckTop: -16,
    );

    final gesture = await tester.startGesture(
      tester.getCenter(find.byKey(const ValueKey('front-0'))),
    );
    await gesture.moveBy(const Offset(0, -10));
    await tester.pump();
    expect(
      find.byKey(const ValueKey('update-stock-boundary-fog-mask')),
      findsNothing,
    );

    var fogSeen = false;
    for (var i = 0; i < 8; i += 1) {
      await gesture.moveBy(const Offset(0, -8));
      await tester.pump();
      if (find
          .byKey(const ValueKey('update-stock-boundary-fog-mask'))
          .evaluate()
          .isNotEmpty) {
        fogSeen = true;
        break;
      }
    }
    expect(fogSeen, isTrue);

    await gesture.up();
    await tester.pumpAndSettle();
  });

  testWidgets(
    'preloads exactly current and next two, including after restore',
    (tester) async {
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
        findsNothing,
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
        findsOneWidget,
      );

      await tester.fling(
        find.byKey(const ValueKey('front-1')),
        const Offset(0, 500),
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
    },
  );

  testWidgets('swipe up advances and swipe down restores in LIFO order', (
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
      const Offset(0, -500),
      1200,
    );
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<Text>(find.byKey(const ValueKey('deck-current-index')))
          .data,
      'current:2',
    );

    await tester.fling(
      find.byKey(const ValueKey('front-2')),
      const Offset(0, 500),
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

  testWidgets('swipe up at end triggers callback and does not advance', (
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

  testWidgets('swipe down with empty history keeps index unchanged', (
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

  testWidgets('new third card gets backfill fade wrapper on forward swipe', (
    tester,
  ) async {
    await pumpDeckHarness(tester, cardsCount: 6);

    await tester.fling(
      find.byKey(const ValueKey('front-0')),
      const Offset(0, -500),
      1200,
    );
    await tester.pumpAndSettle();
    expect(keyPrefixFinder('backfill-3-'), findsOneWidget);

    await tester.fling(
      find.byKey(const ValueKey('front-1')),
      const Offset(0, -500),
      1200,
    );
    await tester.pumpAndSettle();
    expect(keyPrefixFinder('backfill-4-'), findsOneWidget);
  });

  testWidgets(
    'when cardsCount is less than three it only builds available cards',
    (tester) async {
      await pumpDeckHarness(tester, cardsCount: 2);

      expect(find.byKey(const ValueKey('front-0')), findsOneWidget);
      expect(find.byKey(const ValueKey('front-1')), findsOneWidget);
      expect(find.byKey(const ValueKey('front-2')), findsNothing);

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
    },
  );
}

class _DeckHarness extends StatefulWidget {
  const _DeckHarness({
    required this.cardsCount,
    required this.initialIndex,
    required this.maxStackCards,
    required this.boundaryFogOffsetFromDeckTop,
  });

  final int cardsCount;
  final int initialIndex;
  final int maxStackCards;
  final double boundaryFogOffsetFromDeckTop;

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
              maxStackCards: widget.maxStackCards,
              preloadKeyPrefix: 'preload-',
              stackCardKeyPrefix: 'stack-',
              downOverlayKeyPrefix: 'overlay-',
              downBackEjectKeyPrefix: 'eject-',
              backfillKeyPrefix: 'backfill-',
              boundaryFogOffsetFromDeckTop: widget.boundaryFogOffsetFromDeckTop,
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

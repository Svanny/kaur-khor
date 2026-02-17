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

  List<String> cornerLayerKeys(WidgetTester tester) {
    final layerStack = tester.widget<Stack>(
      find.byKey(const ValueKey('update-stock-corner-layer-stack')),
    );
    return layerStack.children
        .map((child) => child.key)
        .whereType<ValueKey>()
        .map((key) => '${key.value}')
        .toList(growable: false);
  }

  Future<void> pumpDeckHarness(
    WidgetTester tester, {
    required int cardsCount,
    int initialIndex = 0,
    int maxStackCards = 3,
    double boundaryFogOffsetFromDeckTop = 0,
    double? boundaryFogEndOffsetFromDeckTop,
  }) async {
    await setPhoneViewport(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: _DeckHarness(
          cardsCount: cardsCount,
          initialIndex: initialIndex,
          maxStackCards: maxStackCards,
          boundaryFogOffsetFromDeckTop: boundaryFogOffsetFromDeckTop,
          boundaryFogEndOffsetFromDeckTop: boundaryFogEndOffsetFromDeckTop,
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

  testWidgets('layer paint order stays A>B>C>D (front to back)', (
    tester,
  ) async {
    await pumpDeckHarness(tester, cardsCount: 6);

    // At rest: only C(back), B(front among stack layers).
    expect(
      cornerLayerKeys(tester),
      orderedEquals(<String>['update-stock-layer-c', 'update-stock-layer-b']),
    );

    final gesture = await tester.startGesture(
      tester.getCenter(find.byKey(const ValueKey('front-0'))),
    );
    for (var i = 0; i < 4; i += 1) {
      await gesture.moveBy(const Offset(0, -20));
      await tester.pump();
    }

    // During upward drag: D(back), C, B(front among stack layers).
    final duringDragKeys = cornerLayerKeys(tester);
    expect(duringDragKeys.last, 'update-stock-layer-b');
    expect(duringDragKeys[duringDragKeys.length - 2], 'update-stock-layer-c');
    if (duringDragKeys.length >= 3) {
      expect(duringDragKeys.first, 'update-stock-layer-d');
    }

    await gesture.up();
    await tester.pumpAndSettle();

    final settledKeys = cornerLayerKeys(tester);
    expect(settledKeys.last, 'update-stock-layer-b');
    expect(settledKeys[settledKeys.length - 2], 'update-stock-layer-c');
    if (settledKeys.length >= 3) {
      expect(settledKeys.first, 'update-stock-layer-d');
    }
  });

  testWidgets('boundary overlay appears only during upward drag', (
    tester,
  ) async {
    await pumpDeckHarness(tester, cardsCount: 6);

    expect(
      find.byKey(const ValueKey('update-stock-boundary-blur-overlay')),
      findsNothing,
    );

    final gesture = await tester.startGesture(
      tester.getCenter(find.byKey(const ValueKey('front-0'))),
    );
    var overlaySeen = false;
    for (var i = 0; i < 6; i += 1) {
      await gesture.moveBy(const Offset(0, -20));
      await tester.pump();
      if (find
          .byKey(const ValueKey('update-stock-boundary-blur-overlay'))
          .evaluate()
          .isNotEmpty) {
        overlaySeen = true;
        break;
      }
    }
    expect(overlaySeen, isTrue);
    final fogOverlay = tester.widget<Positioned>(
      find.byKey(const ValueKey('update-stock-boundary-blur-overlay')),
    );
    expect(fogOverlay.height, greaterThan(0));
    final fogOverlayFill = tester.widget<ColoredBox>(
      find.descendant(
        of: find.byKey(const ValueKey('update-stock-boundary-blur-overlay')),
        matching: find.byType(ColoredBox),
      ),
    );
    expect(fogOverlayFill.color.a, 1);

    await gesture.up();
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('update-stock-boundary-blur-overlay')),
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
      find.byKey(const ValueKey('update-stock-boundary-blur-overlay')),
      findsNothing,
    );

    var fogSeen = false;
    for (var i = 0; i < 8; i += 1) {
      await gesture.moveBy(const Offset(0, -8));
      await tester.pump();
      if (find
          .byKey(const ValueKey('update-stock-boundary-blur-overlay'))
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

  testWidgets('boundary fog supports a custom start/end span', (tester) async {
    await pumpDeckHarness(
      tester,
      cardsCount: 6,
      boundaryFogOffsetFromDeckTop: -220,
      boundaryFogEndOffsetFromDeckTop: -16,
    );

    final gesture = await tester.startGesture(
      tester.getCenter(find.byKey(const ValueKey('front-0'))),
    );
    await gesture.moveBy(const Offset(0, -10));
    await tester.pump();
    expect(
      find.byKey(const ValueKey('update-stock-boundary-blur-overlay')),
      findsNothing,
    );

    var fogSeen = false;
    for (var i = 0; i < 8; i += 1) {
      await gesture.moveBy(const Offset(0, -8));
      await tester.pump();
      if (find
          .byKey(const ValueKey('update-stock-boundary-blur-overlay'))
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

  testWidgets('downward drag pulls previous card from ether preview', (
    tester,
  ) async {
    await pumpDeckHarness(tester, cardsCount: 6);

    await tester.fling(
      find.byKey(const ValueKey('front-0')),
      const Offset(0, -500),
      1200,
    );
    await tester.pumpAndSettle();

    expect(keyPrefixFinder('update-stock-down-ether-preview-'), findsNothing);

    final gesture = await tester.startGesture(
      tester.getCenter(find.byKey(const ValueKey('front-1'))),
    );
    var previewSeen = false;
    for (var i = 0; i < 8; i += 1) {
      await gesture.moveBy(const Offset(0, 8));
      await tester.pump();
      if (keyPrefixFinder(
        'update-stock-down-ether-preview-0',
      ).evaluate().isNotEmpty) {
        previewSeen = true;
        break;
      }
    }
    expect(previewSeen, isTrue);

    await gesture.up();
    await tester.pumpAndSettle();
  });

  testWidgets(
    'preloads current/next cards and keeps restorable previous card ready',
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
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('preload-4'), skipOffstage: false),
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
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('preload-4'), skipOffstage: false),
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
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('preload-4'), skipOffstage: false),
        findsNothing,
      );
    },
  );

  testWidgets(
    'upward drag never pulls stacked cards past their next resting slot',
    (tester) async {
      await pumpDeckHarness(tester, cardsCount: 6);

      final activeRectInitial = tester.getRect(
        find.byKey(const ValueKey('front-0')),
      );
      final secondRectInitial = tester.getRect(
        find.byKey(const ValueKey('front-1')),
      );

      final gesture = await tester.startGesture(
        tester.getCenter(find.byKey(const ValueKey('front-0'))),
      );

      for (var i = 0; i < 6; i += 1) {
        await gesture.moveBy(const Offset(0, -15));
        await tester.pump();

        final secondRect = tester.getRect(
          find.byKey(const ValueKey('front-1')),
        );
        final thirdRect = tester.getRect(find.byKey(const ValueKey('front-2')));

        expect(secondRect.top, greaterThanOrEqualTo(activeRectInitial.top - 1));
        expect(thirdRect.top, greaterThanOrEqualTo(secondRectInitial.top - 1));
      }

      await gesture.up();
      await tester.pumpAndSettle();
    },
  );

  testWidgets(
    'corner slots settle B/C/D into A/B/C resting positions after forward swipe',
    (tester) async {
      await pumpDeckHarness(tester, cardsCount: 6);

      final bRectBefore = tester.getRect(find.byKey(const ValueKey('front-1')));
      final cRectBefore = tester.getRect(find.byKey(const ValueKey('front-2')));

      await tester.fling(
        find.byKey(const ValueKey('front-0')),
        const Offset(0, -500),
        1200,
      );
      await tester.pumpAndSettle();

      final bRectAfter = tester.getRect(find.byKey(const ValueKey('front-1')));
      final cRectAfter = tester.getRect(find.byKey(const ValueKey('front-2')));
      final dRectAfter = tester.getRect(find.byKey(const ValueKey('front-3')));

      expect(bRectAfter.top, lessThanOrEqualTo(bRectBefore.top + 1.0));
      expect(cRectAfter.top, lessThanOrEqualTo(cRectBefore.top + 1.0));
      expect(bRectAfter.top, lessThanOrEqualTo(cRectAfter.top));
      expect(cRectAfter.top, lessThanOrEqualTo(dRectAfter.top));
    },
  );

  testWidgets(
    'corner slots are strict inverse after one up and one down swipe',
    (tester) async {
      await pumpDeckHarness(tester, cardsCount: 6);

      final aRectInitial = tester.getRect(
        find.byKey(const ValueKey('front-0')),
      );
      final bRectInitial = tester.getRect(
        find.byKey(const ValueKey('front-1')),
      );
      final cRectInitial = tester.getRect(
        find.byKey(const ValueKey('front-2')),
      );

      await tester.fling(
        find.byKey(const ValueKey('front-0')),
        const Offset(0, -500),
        1200,
      );
      await tester.pumpAndSettle();

      await tester.fling(
        find.byKey(const ValueKey('front-1')),
        const Offset(0, 500),
        1200,
      );
      await tester.pumpAndSettle();

      final aRectFinal = tester.getRect(find.byKey(const ValueKey('front-0')));
      final bRectFinal = tester.getRect(find.byKey(const ValueKey('front-1')));
      final cRectFinal = tester.getRect(find.byKey(const ValueKey('front-2')));

      expect((aRectFinal.top - aRectInitial.top).abs(), lessThanOrEqualTo(1.0));
      expect(
        (aRectFinal.left - aRectInitial.left).abs(),
        lessThanOrEqualTo(1.0),
      );
      expect((bRectFinal.top - bRectInitial.top).abs(), lessThanOrEqualTo(1.0));
      expect(
        (bRectFinal.left - bRectInitial.left).abs(),
        lessThanOrEqualTo(1.0),
      );
      expect((cRectFinal.top - cRectInitial.top).abs(), lessThanOrEqualTo(1.0));
      expect(
        (cRectFinal.left - cRectInitial.left).abs(),
        lessThanOrEqualTo(1.0),
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
    required this.boundaryFogEndOffsetFromDeckTop,
  });

  final int cardsCount;
  final int initialIndex;
  final int maxStackCards;
  final double boundaryFogOffsetFromDeckTop;
  final double? boundaryFogEndOffsetFromDeckTop;

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
              boundaryFogEndOffsetFromDeckTop:
                  widget.boundaryFogEndOffsetFromDeckTop,
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

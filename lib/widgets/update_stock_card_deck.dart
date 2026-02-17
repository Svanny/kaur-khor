import 'dart:async';
import 'dart:math' as math;

import 'package:banji/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_card_swiper/flutter_card_swiper.dart';

class UpdateStockCardDeck extends StatefulWidget {
  const UpdateStockCardDeck({
    required this.cardsCount,
    required this.currentIndex,
    required this.cardBuilder,
    required this.onCurrentIndexChanged,
    required this.onReachedEndForward,
    required this.animationDuration,
    required this.swiperKey,
    this.maxStackCards = 3,
    this.preloadKeyPrefix = 'update-stock-preload-sku-card-',
    this.stackCardKeyPrefix = 'update-stock-sku-card-stack-',
    this.downOverlayKeyPrefix = 'update-stock-down-restore-overlay-',
    this.downBackEjectKeyPrefix = 'update-stock-down-back-eject-overlay-',
    this.backfillKeyPrefix = 'update-stock-backfill-preview-',
    this.boundaryFogOffsetFromDeckTop = 0,
    this.boundaryFogEndOffsetFromDeckTop,
    super.key,
  });

  final int cardsCount;
  final int currentIndex;
  final IndexedWidgetBuilder cardBuilder;
  final ValueChanged<int> onCurrentIndexChanged;
  final VoidCallback onReachedEndForward;
  final Duration animationDuration;
  final int maxStackCards;
  final Key swiperKey;
  final String preloadKeyPrefix;
  final String stackCardKeyPrefix;
  final String downOverlayKeyPrefix;
  final String downBackEjectKeyPrefix;
  final String backfillKeyPrefix;
  final double boundaryFogOffsetFromDeckTop;
  final double? boundaryFogEndOffsetFromDeckTop;

  @override
  State<UpdateStockCardDeck> createState() => _UpdateStockCardDeckState();
}

class _UpdateStockCardDeckState extends State<UpdateStockCardDeck> {
  static const int _swipeThreshold = 30;
  static const double _downwardProgressDamping = 2;
  static const bool _debugBoundaryBlurLogs = false;
  static const bool _debugCardDLogs = true;
  static const bool _debugCardDProgressLogs = true;

  final CardSwiperController _cardSwiperController = CardSwiperController();
  final List<int> _dismissedHistory = <int>[];

  int _previewGeneration = 0;
  int? _recentBackfillIndex;
  bool _isUpwardDragActive = false;
  bool _holdBoundaryFogForSwipeOut = false;
  int? _skipMoveToIndex;
  int _boundaryHoldReleaseGeneration = 0;
  Timer? _boundaryHoldReleaseTimer;
  String? _lastBoundaryBlurDebugSignature;
  String? _lastCardDDebugSignature;
  String? _lastCardDProgressDebugSignature;
  Size? _lastDeckSize;
  int _lastVerticalOffsetPercentage = 0;

  @override
  void didUpdateWidget(covariant UpdateStockCardDeck oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.currentIndex != oldWidget.currentIndex) {
      if (_skipMoveToIndex == widget.currentIndex) {
        _skipMoveToIndex = null;
        _scheduleBoundaryHoldRelease();
        return;
      }
      _holdBoundaryFogForSwipeOut = false;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) {
          return;
        }
        _cardSwiperController.moveTo(widget.currentIndex);
      });
    }
  }

  @override
  void dispose() {
    _boundaryHoldReleaseTimer?.cancel();
    _cardSwiperController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.cardsCount <= 0) {
      return const SizedBox.shrink();
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        _buildPreloadedCards(),
        CardSwiper(
          key: widget.swiperKey,
          controller: _cardSwiperController,
          cardsCount: widget.cardsCount,
          initialIndex: widget.currentIndex,
          duration: widget.animationDuration,
          padding: EdgeInsets.zero,
          maxAngle: 0,
          threshold: _swipeThreshold,
          scale: 1,
          isLoop: false,
          numberOfCardsDisplayed: 1,
          backCardOffset: Offset.zero,
          allowedSwipeDirection: const AllowedSwipeDirection.only(
            up: true,
            down: true,
          ),
          onSwipe: (previousIndex, currentIndex, direction) {
            return _onSwipe(
              previousIndex: previousIndex,
              currentIndex: currentIndex,
              direction: direction,
            );
          },
          onSwipeDirectionChange: (_, verticalDirection) {
            final isUpward = verticalDirection == CardSwiperDirection.top;
            if (_isUpwardDragActive == isUpward) {
              return;
            }
            setState(() => _isUpwardDragActive = isUpward);
          },
          cardBuilder: (context, index, _, verticalOffsetPercentage) {
            _lastVerticalOffsetPercentage = verticalOffsetPercentage;
            return _buildDeckCard(
              context: context,
              index: index,
              verticalOffsetPercentage: verticalOffsetPercentage,
            );
          },
        ),
      ],
    );
  }

  bool _onSwipe({
    required int previousIndex,
    required int? currentIndex,
    required CardSwiperDirection direction,
  }) {
    if (direction == CardSwiperDirection.top) {
      if (_debugCardDLogs) {
        debugPrint(
          '[UpdateStockCardDeck][swipe-top] prev=$previousIndex curr=$currentIndex '
          'verticalPct=$_lastVerticalOffsetPercentage',
        );
      }
      final isAtLastCard = previousIndex >= widget.cardsCount - 1;
      if (isAtLastCard) {
        _setBoundaryFogSwipeHold(false);
        widget.onReachedEndForward();
        return false;
      }
      if (currentIndex == null) {
        _setBoundaryFogSwipeHold(false);
        return false;
      }
      if (!_canCommitForwardSwipe()) {
        _setBoundaryFogSwipeHold(false);
        return false;
      }
      _setBoundaryFogSwipeHold(true);
      _skipMoveToIndex = currentIndex;
      _recentBackfillIndex = currentIndex + 2;
      if (_debugCardDLogs) {
        debugPrint(
          '[UpdateStockCardDeck][swipe-top-commit] newCurrent=$currentIndex '
          'recentBackfill=$_recentBackfillIndex',
        );
      }
      _dismissedHistory.add(previousIndex);
      _previewGeneration += 1;
      widget.onCurrentIndexChanged(currentIndex);
      return true;
    }

    if (direction == CardSwiperDirection.bottom) {
      if (_debugCardDLogs) {
        debugPrint(
          '[UpdateStockCardDeck][swipe-bottom] prev=$previousIndex curr=$currentIndex '
          'history=${_dismissedHistory.length}',
        );
      }
      _setBoundaryFogSwipeHold(false);
      if (_dismissedHistory.isEmpty) {
        return false;
      }
      final restoreIndex = _dismissedHistory.removeLast();
      _previewGeneration += 1;
      widget.onCurrentIndexChanged(restoreIndex);
      return false;
    }

    return false;
  }

  bool _canCommitForwardSwipe() {
    if (_lastDeckSize == null) {
      return true;
    }
    final dragOffsetY = (_lastVerticalOffsetPercentage * _swipeThreshold) / 100;
    final deckBottom = _lastDeckSize!.height;
    final aFrame = _frameForDepth(0, _lastDeckSize!);
    final animatedBottomLeft = aFrame.corners.bottomLeft.dy + dragOffsetY;
    final animatedBottomRight = aFrame.corners.bottomRight.dy + dragOffsetY;
    if (_debugCardDLogs) {
      debugPrint(
        '[UpdateStockCardDeck][commit-check] dragY=${dragOffsetY.toStringAsFixed(2)} '
        'aBottomL=${animatedBottomLeft.toStringAsFixed(2)} '
        'aBottomR=${animatedBottomRight.toStringAsFixed(2)} '
        'deckBottom=${deckBottom.toStringAsFixed(2)}',
      );
    }
    // Commit only once A is moving upward in the deck frame.
    return animatedBottomLeft < deckBottom && animatedBottomRight < deckBottom;
  }

  void _scheduleBoundaryHoldRelease() {
    final generation = ++_boundaryHoldReleaseGeneration;
    _boundaryHoldReleaseTimer?.cancel();
    _boundaryHoldReleaseTimer = Timer(widget.animationDuration, () {
      if (!mounted || generation != _boundaryHoldReleaseGeneration) {
        return;
      }
      _setBoundaryFogSwipeHold(false);
      _cardSwiperController.moveTo(widget.currentIndex);
    });
  }

  void _setBoundaryFogSwipeHold(bool hold) {
    if (_holdBoundaryFogForSwipeOut == hold) {
      return;
    }
    setState(() => _holdBoundaryFogForSwipeOut = hold);
  }

  Widget _buildDeckCard({
    required BuildContext context,
    required int index,
    required int verticalOffsetPercentage,
  }) {
    final isFrontCard = index == widget.currentIndex;
    if (!isFrontCard) {
      return const SizedBox.shrink();
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        _lastDeckSize = constraints.biggest;
        final deckSize = constraints.biggest;
        final slotMap = _slotMapForDeckSize(deckSize);
        final frontCard = RepaintBoundary(
          key: ValueKey('update-stock-front-cache-$index'),
          child: widget.cardBuilder(context, index),
        );
        final dragOffsetY = (verticalOffsetPercentage * _swipeThreshold) / 100;
        final upwardProgress = _upwardProgress(verticalOffsetPercentage);
        final downwardProgress = _downwardProgress(verticalOffsetPercentage);
        final hasRestore = _dismissedHistory.isNotEmpty;

        final foreground = downwardProgress > 0 && hasRestore
            ? const SizedBox.shrink()
            : _buildFrontCardWithBoundaryBlur(
                context: context,
                child: frontCard,
                verticalOffsetPercentage: verticalOffsetPercentage,
              );

        return Stack(
          fit: StackFit.expand,
          clipBehavior: Clip.none,
          children: [
            Transform.translate(
              // CardSwiper translates the full front card; offset that out so
              // corner-linked stack follows only slot interpolation.
              offset: Offset(0, -dragOffsetY),
              child: Stack(
                key: const ValueKey('update-stock-corner-layer-stack'),
                fit: StackFit.expand,
                clipBehavior: Clip.none,
                children: _buildCornerLinkedStack(
                  context: context,
                  deckSize: deckSize,
                  slots: slotMap,
                  upwardProgress: upwardProgress,
                  downwardProgress: downwardProgress,
                ),
              ),
            ),
            foreground,
          ],
        );
      },
    );
  }

  List<Widget> _buildCornerLinkedStack({
    required BuildContext context,
    required Size deckSize,
    required _DeckSlotMap slots,
    required double upwardProgress,
    required double downwardProgress,
  }) {
    if (downwardProgress > 0 && _dismissedHistory.isNotEmpty) {
      return _buildDownwardCornerStack(
        context: context,
        deckSize: deckSize,
        slots: slots,
        progress: downwardProgress,
      );
    }
    return _buildUpwardCornerStack(
      context: context,
      deckSize: deckSize,
      slots: slots,
      progress: upwardProgress,
    );
  }

  List<Widget> _buildUpwardCornerStack({
    required BuildContext context,
    required Size deckSize,
    required _DeckSlotMap slots,
    required double progress,
  }) {
    final layers = <Widget>[];
    final bIndex = widget.currentIndex + 1;
    final cIndex = widget.currentIndex + 2;
    final dIndex = widget.currentIndex + 3;
    if (_debugCardDLogs) {
      final signature = [
        'g=$_previewGeneration',
        'curr=${widget.currentIndex}',
        'b=$bIndex',
        'c=$cIndex',
        'd=$dIndex',
        'cards=${widget.cardsCount}',
        'progress=${progress.toStringAsFixed(3)}',
        'hold=$_holdBoundaryFogForSwipeOut',
        'up=$_isUpwardDragActive',
      ].join(' | ');
      if (signature != _lastCardDDebugSignature) {
        _lastCardDDebugSignature = signature;
        debugPrint('[UpdateStockCardDeck][layer-up] $signature');
      }
    }

    if (dIndex < widget.cardsCount) {
      layers.add(
        KeyedSubtree(
          key: const ValueKey('update-stock-layer-d'),
          child: TweenAnimationBuilder<double>(
            tween: Tween<double>(begin: 0, end: progress.clamp(0.0, 1.0)),
            duration: const Duration(milliseconds: 48),
            curve: Curves.linear,
            builder: (context, smoothedProgress, _) {
              if (_debugCardDProgressLogs) {
                final sig = [
                  'd=$dIndex',
                  'raw=${progress.toStringAsFixed(3)}',
                  'smooth=${smoothedProgress.toStringAsFixed(3)}',
                  'gen=$_previewGeneration',
                  'curr=${widget.currentIndex}',
                ].join(' | ');
                if (sig != _lastCardDProgressDebugSignature) {
                  _lastCardDProgressDebugSignature = sig;
                  debugPrint('[UpdateStockCardDeck][layer-d-progress] $sig');
                }
              }
              return Opacity(
                opacity: smoothedProgress.clamp(0.0, 1.0),
                child: _buildCornerLinkedCard(
                  context: context,
                  index: dIndex,
                  frameFrom: slots.incomingBack,
                  frameTo: slots.third,
                  deckSize: deckSize,
                  keyPrefix: widget.backfillKeyPrefix,
                  generation: _previewGeneration,
                  progress: smoothedProgress,
                ),
              );
            },
          ),
        ),
      );
    }

    if (cIndex < widget.cardsCount) {
      final cKeyPrefix = cIndex == _recentBackfillIndex
          ? widget.backfillKeyPrefix
          : widget.stackCardKeyPrefix;
      layers.add(
        KeyedSubtree(
          key: const ValueKey('update-stock-layer-c'),
          child: _buildCornerLinkedCard(
            context: context,
            index: cIndex,
            frameFrom: slots.third,
            frameTo: slots.second,
            deckSize: deckSize,
            keyPrefix: cKeyPrefix,
            generation: _previewGeneration,
            progress: progress,
          ),
        ),
      );
    }

    if (bIndex < widget.cardsCount) {
      layers.add(
        KeyedSubtree(
          key: const ValueKey('update-stock-layer-b'),
          child: _buildCornerLinkedCard(
            context: context,
            index: bIndex,
            frameFrom: slots.second,
            frameTo: slots.front,
            deckSize: deckSize,
            keyPrefix: widget.stackCardKeyPrefix,
            generation: _previewGeneration,
            progress: progress,
          ),
        ),
      );
    }

    return layers;
  }

  List<Widget> _buildDownwardCornerStack({
    required BuildContext context,
    required Size deckSize,
    required _DeckSlotMap slots,
    required double progress,
  }) {
    final layers = <Widget>[];
    final restoreIndex = _dismissedHistory.last;
    final currentIndex = widget.currentIndex;
    final nextIndex = currentIndex + 1;
    final nextNextIndex = currentIndex + 2;

    if (nextNextIndex < widget.cardsCount) {
      layers.add(
        Opacity(
          key: const ValueKey('update-stock-layer-d'),
          opacity: (1 - progress).clamp(0.0, 1.0),
          child: _buildCornerLinkedCard(
            context: context,
            index: nextNextIndex,
            frameFrom: slots.third,
            frameTo: slots.incomingBack,
            deckSize: deckSize,
            keyPrefix: widget.stackCardKeyPrefix,
            generation: _previewGeneration,
            progress: progress,
          ),
        ),
      );
    }

    if (nextIndex < widget.cardsCount) {
      layers.add(
        KeyedSubtree(
          key: const ValueKey('update-stock-layer-c'),
          child: _buildCornerLinkedCard(
            context: context,
            index: nextIndex,
            frameFrom: slots.second,
            frameTo: slots.third,
            deckSize: deckSize,
            keyPrefix: widget.stackCardKeyPrefix,
            generation: _previewGeneration,
            progress: progress,
          ),
        ),
      );
    }

    layers.add(
      KeyedSubtree(
        key: const ValueKey('update-stock-layer-b'),
        child: _buildCornerLinkedCard(
          context: context,
          index: currentIndex,
          frameFrom: slots.front,
          frameTo: slots.second,
          deckSize: deckSize,
          keyPrefix: widget.stackCardKeyPrefix,
          generation: _previewGeneration,
          progress: progress,
        ),
      ),
    );

    layers.add(
      _buildCornerLinkedCard(
        context: context,
        index: restoreIndex,
        frameFrom: slots.incomingTop,
        frameTo: slots.front,
        deckSize: deckSize,
        keyPrefix: widget.downOverlayKeyPrefix,
        generation: _previewGeneration,
        progress: progress,
        overrideKey: 'update-stock-down-ether-preview-$restoreIndex',
      ),
    );

    return layers;
  }

  Widget _buildCornerLinkedCard({
    required BuildContext context,
    required int index,
    required _SlotFrame frameFrom,
    required _SlotFrame frameTo,
    required Size deckSize,
    required String keyPrefix,
    required int generation,
    required double progress,
    String? overrideKey,
  }) {
    final frame = _lerpFrame(frameFrom, frameTo, progress.clamp(0.0, 1.0));
    final matrix = _transformForFrame(frame, deckSize);
    final keyValue = overrideKey ?? '$keyPrefix$index-g$generation';
    return IgnorePointer(
      child: Transform(
        transform: matrix,
        alignment: Alignment.topLeft,
        child: KeyedSubtree(
          key: ValueKey(keyValue),
          child: RepaintBoundary(child: widget.cardBuilder(context, index)),
        ),
      ),
    );
  }

  double _upwardProgress(int verticalOffsetPercentage) {
    if (_holdBoundaryFogForSwipeOut) {
      return 1;
    }
    if (!_isUpwardDragActive) {
      return 0;
    }
    return ((-verticalOffsetPercentage) / 100).clamp(0.0, 1.0).toDouble();
  }

  double _downwardProgress(int verticalOffsetPercentage) {
    if (_dismissedHistory.isEmpty) {
      return 0;
    }
    if (verticalOffsetPercentage <= 0) {
      return 0;
    }
    // Downward restore felt over-sensitive; damp to match upward feel.
    return (verticalOffsetPercentage / (100 * _downwardProgressDamping))
        .clamp(0.0, 1.0)
        .toDouble();
  }

  _DeckSlotMap _slotMapForDeckSize(Size deckSize) {
    return _DeckSlotMap(
      front: _frameForDepth(0, deckSize),
      second: _frameForDepth(1, deckSize),
      third: _frameForDepth(2, deckSize),
      incomingBack: _frameForDepth(3, deckSize),
      incomingTop: _frameForDepth(0, deckSize).shift(const Offset(0, -1)),
    ).scaledIncomingTop(deckSize.height);
  }

  _SlotFrame _frameForDepth(int depth, Size deckSize) {
    final scale = switch (depth) {
      <= 0 => 1.0,
      1 => AppThemeTokens.stockCardStackScale1,
      2 => AppThemeTokens.stockCardStackScale2,
      _ => math.max(
        0.82,
        AppThemeTokens.stockCardStackScale2 -
            (AppThemeTokens.stockCardStackScale1 -
                AppThemeTokens.stockCardStackScale2),
      ),
    };

    final top = switch (depth) {
      <= 0 => 0.0,
      1 => AppThemeTokens.stockCardStackPeekOffset1,
      2 => AppThemeTokens.stockCardStackPeekOffset2,
      _ =>
        AppThemeTokens.stockCardStackPeekOffset2 +
            (AppThemeTokens.stockCardStackPeekOffset2 -
                AppThemeTokens.stockCardStackPeekOffset1),
    };

    final width = deckSize.width * scale;
    final height = deckSize.height * scale;
    final left = (deckSize.width - width) / 2;
    final rect = Rect.fromLTWH(left, top, width, height);
    return _SlotFrame(rect);
  }

  Matrix4 _transformForFrame(_SlotFrame frame, Size deckSize) {
    final scaleX = frame.rect.width / deckSize.width;
    final scaleY = frame.rect.height / deckSize.height;
    if (_debugCardDLogs && scaleX > 0 && scaleY > 0) {
      final sig = [
        'left=${frame.rect.left.toStringAsFixed(2)}',
        'top=${frame.rect.top.toStringAsFixed(2)}',
        'w=${frame.rect.width.toStringAsFixed(2)}',
        'h=${frame.rect.height.toStringAsFixed(2)}',
        'sx=${scaleX.toStringAsFixed(4)}',
        'sy=${scaleY.toStringAsFixed(4)}',
      ].join(' | ');
      debugPrint('[UpdateStockCardDeck][frame-xform] $sig');
    }
    return Matrix4.identity()
      ..translate(frame.rect.left, frame.rect.top)
      ..scale(scaleX, scaleY);
  }

  _SlotFrame _lerpFrame(_SlotFrame a, _SlotFrame b, double t) {
    return _SlotFrame(Rect.lerp(a.rect, b.rect, t) ?? a.rect);
  }

  Widget _buildFrontCardWithBoundaryBlur({
    required BuildContext context,
    required Widget child,
    required int verticalOffsetPercentage,
  }) {
    if (!_isUpwardDragActive && !_holdBoundaryFogForSwipeOut) {
      return child;
    }

    final dragOffsetY = (verticalOffsetPercentage * _swipeThreshold) / 100;
    late final double blurStartY;
    late final double blurEndY;
    late final double concealEdgeY;

    if (widget.boundaryFogEndOffsetFromDeckTop case final blurEndOffset?) {
      blurStartY = widget.boundaryFogOffsetFromDeckTop - dragOffsetY;
      blurEndY = blurEndOffset - dragOffsetY;
      if (math.max(blurStartY, blurEndY) <= 0 && !_holdBoundaryFogForSwipeOut) {
        return child;
      }
      concealEdgeY = math.max(blurStartY, blurEndY);
    } else {
      blurStartY = widget.boundaryFogOffsetFromDeckTop - dragOffsetY;
      if (blurStartY <= 0 && !_holdBoundaryFogForSwipeOut) {
        return child;
      }
      blurEndY = blurStartY;
      concealEdgeY = blurStartY;
    }

    if (_debugBoundaryBlurLogs) {
      final signature = [
        'upDrag=$_isUpwardDragActive',
        'hold=$_holdBoundaryFogForSwipeOut',
        'verticalPct=$verticalOffsetPercentage',
        'dragY=${dragOffsetY.toStringAsFixed(2)}',
        'blurStartY=${blurStartY.toStringAsFixed(2)}',
        'blurEndY=${blurEndY.toStringAsFixed(2)}',
        'concealEdgeY=${concealEdgeY.toStringAsFixed(2)}',
      ].join(' | ');
      if (signature != _lastBoundaryBlurDebugSignature) {
        _lastBoundaryBlurDebugSignature = signature;
        debugPrint('[UpdateStockCardDeck][boundary-blur] $signature');
      }
    }

    final concealHeight = concealEdgeY.clamp(0.0, double.infinity).toDouble();
    if (concealHeight <= 0) {
      return child;
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        child,
        Positioned(
          key: const ValueKey('update-stock-boundary-blur-overlay'),
          top: 0,
          left: 0,
          right: 0,
          height: concealHeight,
          child: ColoredBox(color: Theme.of(context).scaffoldBackgroundColor),
        ),
      ],
    );
  }

  Widget _buildPreloadedCards() {
    final preloadIndices = _preloadCardIndices().toList(growable: false);
    return IgnorePointer(
      child: Stack(
        fit: StackFit.expand,
        children: [
          for (final index in preloadIndices)
            Offstage(
              offstage: true,
              child: RepaintBoundary(
                key: ValueKey('${widget.preloadKeyPrefix}$index'),
                child: widget.cardBuilder(context, index),
              ),
            ),
        ],
      ),
    );
  }

  Iterable<int> _preloadCardIndices() sync* {
    final indices = <int>{};
    for (var i = 0; i <= widget.maxStackCards; i += 1) {
      final index = widget.currentIndex + i;
      if (index < widget.cardsCount) {
        indices.add(index);
      }
    }
    if (_dismissedHistory case [..., final lastDismissed]) {
      indices.add(lastDismissed);
    }
    yield* indices;
  }
}

class _CornerSet {
  const _CornerSet({
    required this.topLeft,
    required this.topRight,
    required this.bottomRight,
    required this.bottomLeft,
  });

  final Offset topLeft;
  final Offset topRight;
  final Offset bottomRight;
  final Offset bottomLeft;
}

class _SlotFrame {
  const _SlotFrame(this.rect);

  final Rect rect;

  _CornerSet get corners => _CornerSet(
    topLeft: rect.topLeft,
    topRight: rect.topRight,
    bottomRight: rect.bottomRight,
    bottomLeft: rect.bottomLeft,
  );

  _SlotFrame shift(Offset offset) => _SlotFrame(rect.shift(offset));
}

class _DeckSlotMap {
  const _DeckSlotMap({
    required this.front,
    required this.second,
    required this.third,
    required this.incomingBack,
    required this.incomingTop,
  });

  final _SlotFrame front;
  final _SlotFrame second;
  final _SlotFrame third;
  final _SlotFrame incomingBack;
  final _SlotFrame incomingTop;

  _DeckSlotMap scaledIncomingTop(double deckHeight) {
    return _DeckSlotMap(
      front: front,
      second: second,
      third: third,
      incomingBack: incomingBack,
      incomingTop: front.shift(Offset(0, -deckHeight)),
    );
  }
}

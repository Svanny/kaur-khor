part of '../views/inventory_views.dart';

class _MediaPlaceholderCard extends StatefulWidget {
  const _MediaPlaceholderCard({required this.itemPictureIcon});

  final IconData itemPictureIcon;

  @override
  State<_MediaPlaceholderCard> createState() => _MediaPlaceholderCardState();
}

class _MediaPlaceholderCardState extends State<_MediaPlaceholderCard> {
  static const int _pageCount = 2;
  static const Duration _autoScrollEvery = Duration(seconds: 10);
  static const Duration _pageAnimationDuration = Duration(milliseconds: 350);
  static const String _editSquareAsset =
      'icons/edit_square_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg';

  late final PageController _pageController;
  Timer? _autoScrollTimer;
  int _activePage = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    _restartAutoScrollTimer();
  }

  @override
  void dispose() {
    _autoScrollTimer?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  void _advancePage() {
    if (!mounted || !_pageController.hasClients) {
      return;
    }
    final nextPage = (_activePage + 1) % _pageCount;
    _pageController.animateToPage(
      nextPage,
      duration: _pageAnimationDuration,
      curve: Curves.easeInOutCubic,
    );
  }

  void _restartAutoScrollTimer() {
    _autoScrollTimer?.cancel();
    _autoScrollTimer = Timer(_autoScrollEvery, _advancePage);
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: SizedBox(
        height: 260,
        child: Stack(
          children: [
            Positioned.fill(
              child: PageView(
                controller: _pageController,
                onPageChanged: (index) {
                  setState(() => _activePage = index);
                  _restartAutoScrollTimer();
                },
                children: [
                  Stack(
                    children: [
                      Center(
                        child: Text(
                          'Chart graphing updates +\nest. (banded) values\n\nand picture for the other',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyLarge
                              ?.copyWith(color: AppThemeTokens.textSecondary),
                        ),
                      ),
                      Positioned(
                        top: AppThemeTokens.mediaOverlayInset,
                        right: AppThemeTokens.mediaOverlayInset,
                        child: IconButton(
                          onPressed: () {},
                          padding: EdgeInsets.zero,
                          tooltip: 'Filter chart',
                          icon: const Icon(Icons.filter_alt_outlined),
                        ),
                      ),
                    ],
                  ),
                  Stack(
                    children: [
                      Center(
                        child: Container(
                          width: AppThemeTokens.unit * 36,
                          height: AppThemeTokens.unit * 36,
                          decoration: BoxDecoration(
                            color: AppThemeTokens.accentDarker,
                            borderRadius: BorderRadius.circular(
                              AppThemeTokens.radiusMd,
                            ),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(
                              AppThemeTokens.cardInlineGap,
                            ),
                            child: _ItemPictureGlyph(
                              widget.itemPictureIcon,
                              fill: true,
                              color: AppThemeTokens.white,
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        top: AppThemeTokens.mediaOverlayInset,
                        right: AppThemeTokens.mediaOverlayInset,
                        child: IconButton(
                          onPressed: () {},
                          padding: EdgeInsets.zero,
                          tooltip: 'Edit picture',
                          icon: SvgPicture.asset(
                            _editSquareAsset,
                            width: 24,
                            height: 24,
                            colorFilter: const ColorFilter.mode(
                              AppThemeTokens.textPrimary,
                              BlendMode.srcIn,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: AppThemeTokens.mediaDotsBottomInset,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(_pageCount * 2 - 1, (index) {
                  if (index.isOdd) {
                    return const SizedBox(width: AppThemeTokens.mediaDotGap);
                  }
                  final dotIndex = index ~/ 2;
                  return _CarouselDot(
                    key: ValueKey('media-carousel-dot-$dotIndex'),
                    active: _activePage == dotIndex,
                    onTap: () {
                      _restartAutoScrollTimer();
                      if (!_pageController.hasClients) {
                        return;
                      }
                      if (_activePage == dotIndex) {
                        return;
                      }
                      _pageController.animateToPage(
                        dotIndex,
                        duration: _pageAnimationDuration,
                        curve: Curves.easeInOutCubic,
                      );
                    },
                  );
                }),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CarouselDot extends StatelessWidget {
  const _CarouselDot({super.key, required this.active, required this.onTap});

  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: active ? AppThemeTokens.primary : AppThemeTokens.border,
        ),
      ),
    );
  }
}

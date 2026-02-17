import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../l10n/generated/app_localizations.dart';
import '../theme/app_theme.dart';
import 'inventory_views.dart';
import 'settings_view.dart';

class HomeView extends StatelessWidget {
  const HomeView({super.key});

  static const double _logoAspectRatio = 1000 / 1000;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final edgePadding = AppThemeTokens.screenEdgePadding(context);
    const logoHeight = AppThemeTokens.fontSizeTitleMedium * 1.4;
    final contentPadding = EdgeInsets.fromLTRB(
      edgePadding.left,
      AppThemeTokens.sectionGap,
      edgePadding.right,
      edgePadding.bottom,
    );

    return Scaffold(
      floatingActionButtonLocation: AppThemeTokens.primaryFabLocation,
      floatingActionButton: FloatingActionButton(
        key: const ValueKey('home-overlay-receipt-button'),
        onPressed: () {
          Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => const UpdateStockPage()),
          );
        },
        shape: const CircleBorder(),
        child: const Icon(Icons.receipt_long_rounded),
      ),
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              height: logoHeight,
              child: AspectRatio(
                aspectRatio: _logoAspectRatio,
                child: SvgPicture.asset('icons/logo.svg', fit: BoxFit.contain),
              ),
            ),
            const SizedBox(width: AppThemeTokens.sectionGapCompact),
            Text(l10n.appBrand),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const ViewAllPage()),
              );
            },
            icon: const Icon(Icons.format_list_bulleted),
          ),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.download_rounded),
          ),
          IconButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const SettingsView()),
              );
            },
            icon: const Icon(Icons.settings),
          ),
        ],
      ),
      body: ListView(
        padding: contentPadding,
        children: [
          _SectionTitle(l10n.homeKeyMetrics),
          const SizedBox(height: AppThemeTokens.cardContentGap),
          const _MetricGrid(),
          const SizedBox(height: AppThemeTokens.sectionGapLarge),
          _SectionTitle(l10n.homePerformance),
          const SizedBox(height: AppThemeTokens.cardContentGap),
          const _ChartPlaceholder(),
          const SizedBox(height: AppThemeTokens.sectionGapLarge),
          _SectionTitle(l10n.homeRecentActivity),
          const SizedBox(height: AppThemeTokens.cardContentGap),
          const _ActivityList(),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title);

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: Theme.of(
        context,
      ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
    );
  }
}

class _MetricGrid extends StatelessWidget {
  const _MetricGrid();

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      itemCount: 4,
      shrinkWrap: true,
      primary: false,
      padding: EdgeInsets.zero,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: AppThemeTokens.cardContentGap,
        mainAxisSpacing: AppThemeTokens.cardContentGap,
        childAspectRatio: 1.7,
      ),
      itemBuilder: (_, __) => const _Card(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _BarPlaceholder(width: 72, height: 10),
            SizedBox(height: AppThemeTokens.cardContentGap),
            _BarPlaceholder(width: 120, height: 20),
          ],
        ),
      ),
    );
  }
}

class _ChartPlaceholder extends StatelessWidget {
  const _ChartPlaceholder();

  @override
  Widget build(BuildContext context) {
    return const _Card(
      child: AspectRatio(
        aspectRatio: 16 / 9,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            _BarPlaceholder(width: double.infinity, height: 6),
            SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                _BarPlaceholder(width: 20, height: 70),
                _BarPlaceholder(width: 20, height: 130),
                _BarPlaceholder(width: 20, height: 100),
                _BarPlaceholder(width: 20, height: 150),
                _BarPlaceholder(width: 20, height: 90),
                _BarPlaceholder(width: 20, height: 120),
              ],
            ),
            SizedBox(height: AppThemeTokens.cardContentGap),
          ],
        ),
      ),
    );
  }
}

class _ActivityList extends StatelessWidget {
  const _ActivityList();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        5,
        (index) => const Padding(
          padding: EdgeInsets.only(bottom: AppThemeTokens.cardContentGap),
          child: _Card(
            child: Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: AppThemeTokens.accentLighter,
                ),
                SizedBox(width: AppThemeTokens.cardContentGap),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _BarPlaceholder(width: 160, height: 10),
                      SizedBox(height: AppThemeTokens.sectionGapCompact),
                      _BarPlaceholder(width: 100, height: 10),
                    ],
                  ),
                ),
                SizedBox(width: AppThemeTokens.sectionGapCompact),
                _BarPlaceholder(width: 44, height: 10),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppThemeTokens.cardInset),
      decoration: BoxDecoration(
        color: AppThemeTokens.surface,
        borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
        border: Border.all(color: AppThemeTokens.border),
        boxShadow: const [
          BoxShadow(
            color: AppThemeTokens.shadow,
            blurRadius: AppThemeTokens.elevation1Blur,
            offset: Offset(0, AppThemeTokens.elevation1OffsetY),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _BarPlaceholder extends StatelessWidget {
  const _BarPlaceholder({required this.width, required this.height});

  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppThemeTokens.barBackground,
        borderRadius: BorderRadius.circular(AppThemeTokens.sectionGapCompact),
      ),
    );
  }
}

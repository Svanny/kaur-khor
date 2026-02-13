import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppThemeTokens {
  // Base palette
  static const Color primary = Color(0xFFBC8053);
  static const Color secondary = Color(0xFFC0CC8D);
  static const Color background = Color(0xFFE8E3E0);
  static const Color surface = Color(0xFFF1EEEC);
  static const Color border = Color(0xFFD1CBC7);
  static const Color textPrimary = Color(0xFF1F0D00);
  static const Color textSecondary = Color(0xFF4A3A2A);
  static const Color white = Color(0xFFFFFFFF);

  // Semantic colors
  static const Color error = Color(0xFFB3523C);
  static const Color warning = Color(0xFFEC964C);
  static const Color success = Color(0xFF386341);

  // Accent and state colors
  static const Color accentLighter = Color(0xFFC0CC8D);
  static const Color accentDarker = Color(0xFF6D8D4E);
  static const Color chipBackground = Color(0xFFC0CC8D);
  static const Color chipSelected = Color(0xFF99C768);
  static const Color navIndicator = Color(0xFF99C768);
  static const Color badgeBackground = Color(0xFFC0CC8D);
  static const Color barBackground = Color(0xFFC0CC8D);
  static const Color disabledBackground = Color(0xFFD4D4D4);
  static const Color disabledForeground = Color(0xFF737373);

  // Base unit scale (4pt)
  static const double unit = 4;

  // Typography (Perfect Fourth scale)
  static const String fontFamily = 'Noto Sans Oriya';
  static const double fontSizeHeadlineSmall = 37.92;
  static const double fontSizeTitleLarge = 28.44;
  static const double fontSizeTitleMedium = 21.33;
  static const double fontSizeBodyLarge = 4 * unit;
  static const double fontSizeBodyMedium = 3 * unit;
  static const double fontWeightRegular = 400;
  static const double fontWeightMedium = 500;
  static const double fontWeightSemibold = 600;
  static const double fontWeightBold = 700;
  static const double lineHeightBodyLarge = 1.45;
  static const double lineHeightBodyMedium = 1.4;
  static const double letterSpacingHeadline = -0.2;
  static const double iconSizeMedium = 6 * unit;

  // Shape and spacing
  static const double radiusMd = 3 * unit;
  static const double radiusPill = 999;
  static const double radiusNavItem = 2.5 * unit;
  static const double space1 = 1 * unit; // 4
  static const double space2 = 2 * unit; // 8
  static const double space3 = 3 * unit; // 12
  static const double space4 = 4 * unit; // 16
  static const double space6 = 6 * unit; // 24
  static const double space8 = 8 * unit; // 32

  // Component paddings
  static const double buttonPaddingX = space4;
  static const double buttonPaddingY = space3;
  static const double inputPaddingX = 3.5 * unit;
  static const double inputPaddingY = space3;
  static const double chipPaddingX = space3;
  static const double chipPaddingY = space2;
  static const double dropdownCheckSpacing = space6;
  static const double navItemPaddingX = space3;
  static const double navItemPaddingY = 2.5 * unit;
  static const double screenEdgePaddingMin = space4;
  static const double screenEdgePaddingMax = space8;
  static const double screenEdgePaddingWidthFactor = 0.04;
  static const double screenEdgePaddingVerticalMin = space4;
  static const double dividerThickness = unit / 4;
  static const double dividerSpace = unit / 4;

  // Elevation
  static const double elevation1 = unit / 4;
  static const double elevation1OffsetY = unit / 4;
  static const double elevation1Blur = unit / 2;
  static const Color shadow = Color(0x1A1F0D00);

  static EdgeInsets screenEdgePadding(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final safeAreaInsets = MediaQuery.viewPaddingOf(context);
    final horizontal = (size.width * screenEdgePaddingWidthFactor).clamp(
      screenEdgePaddingMin,
      screenEdgePaddingMax,
    );

    return EdgeInsets.fromLTRB(
      math.max(horizontal, safeAreaInsets.left),
      math.max(screenEdgePaddingVerticalMin, safeAreaInsets.top),
      math.max(horizontal, safeAreaInsets.right),
      math.max(screenEdgePaddingVerticalMin, safeAreaInsets.bottom),
    );
  }
}

class AppTheme {
  static ThemeData light() {
    const colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppThemeTokens.primary,
      onPrimary: AppThemeTokens.white,
      secondary: AppThemeTokens.secondary,
      onSecondary: AppThemeTokens.white,
      error: AppThemeTokens.error,
      onError: AppThemeTokens.white,
      surface: AppThemeTokens.surface,
      onSurface: AppThemeTokens.textPrimary,
    );

    const baseTextTheme = TextTheme(
      headlineSmall: TextStyle(
        fontSize: AppThemeTokens.fontSizeHeadlineSmall,
        fontWeight: FontWeight.w600,
        color: AppThemeTokens.textPrimary,
        letterSpacing: AppThemeTokens.letterSpacingHeadline,
      ),
      titleLarge: TextStyle(
        fontSize: AppThemeTokens.fontSizeTitleLarge,
        fontWeight: FontWeight.w600,
        color: AppThemeTokens.textPrimary,
      ),
      titleMedium: TextStyle(
        fontSize: AppThemeTokens.fontSizeTitleMedium,
        fontWeight: FontWeight.w600,
        color: AppThemeTokens.textPrimary,
      ),
      bodyLarge: TextStyle(
        fontSize: AppThemeTokens.fontSizeBodyLarge,
        fontWeight: FontWeight.w400,
        color: AppThemeTokens.textPrimary,
        height: AppThemeTokens.lineHeightBodyLarge,
      ),
      bodyMedium: TextStyle(
        fontSize: AppThemeTokens.fontSizeBodyMedium,
        fontWeight: FontWeight.w400,
        color: AppThemeTokens.textSecondary,
        height: AppThemeTokens.lineHeightBodyMedium,
      ),
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppThemeTokens.background,
      textTheme: GoogleFonts.notoSansOriyaTextTheme(baseTextTheme),
      fontFamily: GoogleFonts.notoSansOriya().fontFamily,
    );

    return base.copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: AppThemeTokens.background,
        surfaceTintColor: Colors.transparent,
        elevation: AppThemeTokens.elevation1,
        shadowColor: AppThemeTokens.shadow,
        scrolledUnderElevation: AppThemeTokens.elevation1,
        centerTitle: false,
        titleTextStyle: GoogleFonts.notoSansOriya(
          fontSize: AppThemeTokens.fontSizeTitleMedium,
          fontWeight: FontWeight.w600,
          color: AppThemeTokens.textPrimary,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppThemeTokens.surface,
        elevation: AppThemeTokens.elevation1,
        shadowColor: AppThemeTokens.shadow,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
          side: const BorderSide(color: AppThemeTokens.border),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          elevation: AppThemeTokens.elevation1,
          shadowColor: AppThemeTokens.shadow,
          backgroundColor: AppThemeTokens.primary,
          foregroundColor: AppThemeTokens.white,
          disabledBackgroundColor: AppThemeTokens.disabledBackground,
          disabledForegroundColor: AppThemeTokens.disabledForeground,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
          ),
          padding: const EdgeInsets.symmetric(
            horizontal: AppThemeTokens.buttonPaddingX,
            vertical: AppThemeTokens.buttonPaddingY,
          ),
          textStyle: GoogleFonts.notoSansOriya(
            fontWeight: FontWeight.w600,
            fontSize: AppThemeTokens.fontSizeBodyMedium,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style:
            OutlinedButton.styleFrom(
              foregroundColor: AppThemeTokens.textPrimary,
              disabledForegroundColor: AppThemeTokens.disabledForeground,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
              ),
              padding: const EdgeInsets.symmetric(
                horizontal: AppThemeTokens.buttonPaddingX,
                vertical: AppThemeTokens.buttonPaddingY,
              ),
              textStyle: GoogleFonts.notoSansOriya(
                fontWeight: FontWeight.w600,
                fontSize: AppThemeTokens.fontSizeBodyMedium,
              ),
            ).copyWith(
              side: WidgetStateProperty.resolveWith((states) {
                if (states.contains(WidgetState.disabled)) {
                  return const BorderSide(
                    color: AppThemeTokens.disabledBackground,
                  );
                }
                return const BorderSide(color: AppThemeTokens.border);
              }),
            ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppThemeTokens.surface,
        hintStyle: GoogleFonts.notoSansOriya(
          color: AppThemeTokens.textSecondary,
          fontSize: AppThemeTokens.fontSizeBodyLarge,
          height: AppThemeTokens.lineHeightBodyLarge,
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppThemeTokens.inputPaddingX,
          vertical: AppThemeTokens.inputPaddingY,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
          borderSide: const BorderSide(color: AppThemeTokens.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
          borderSide: const BorderSide(color: AppThemeTokens.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
          borderSide: const BorderSide(color: AppThemeTokens.primary),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: AppThemeTokens.border,
        thickness: AppThemeTokens.dividerThickness,
        space: AppThemeTokens.dividerSpace,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppThemeTokens.chipBackground,
        selectedColor: AppThemeTokens.chipSelected,
        disabledColor: AppThemeTokens.disabledBackground,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
          side: BorderSide.none,
        ),
        labelStyle: GoogleFonts.notoSansOriya(
          color: AppThemeTokens.textPrimary,
          fontSize: AppThemeTokens.fontSizeBodyMedium,
          fontWeight: FontWeight.w500,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppThemeTokens.surface,
        indicatorColor: AppThemeTokens.navIndicator,
        surfaceTintColor: Colors.transparent,
        elevation: AppThemeTokens.elevation1,
        shadowColor: AppThemeTokens.shadow,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final isSelected = states.contains(WidgetState.selected);
          return GoogleFonts.notoSansOriya(
            color: isSelected
                ? AppThemeTokens.textPrimary
                : AppThemeTokens.textSecondary,
            fontSize: AppThemeTokens.fontSizeBodyMedium,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
          );
        }),
      ),
    );
  }
}

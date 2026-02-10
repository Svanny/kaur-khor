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

  // Typography (Perfect Fourth scale)
  static const String fontFamily = 'Noto Sans Oriya';
  static const double fontSizeHeadlineSmall = 37.92;
  static const double fontSizeTitleLarge = 28.44;
  static const double fontSizeTitleMedium = 21.33;
  static const double fontSizeBodyLarge = 16;
  static const double fontSizeBodyMedium = 12;
  static const double fontWeightRegular = 400;
  static const double fontWeightMedium = 500;
  static const double fontWeightSemibold = 600;
  static const double fontWeightBold = 700;
  static const double lineHeightBodyLarge = 1.45;
  static const double lineHeightBodyMedium = 1.4;
  static const double letterSpacingHeadline = -0.2;

  // Shape and spacing
  static const double radiusMd = 12;
  static const double radiusPill = 999;
  static const double radiusNavItem = 10;
  static const double space1 = 4;
  static const double space2 = 8;
  static const double space3 = 12;
  static const double space4 = 16;
  static const double space6 = 24;
  static const double space8 = 32;

  // Component paddings
  static const double buttonPaddingX = 16;
  static const double buttonPaddingY = 12;
  static const double inputPaddingX = 14;
  static const double inputPaddingY = 12;
  static const double chipPaddingX = 12;
  static const double chipPaddingY = 8;
  static const double navItemPaddingX = 12;
  static const double navItemPaddingY = 10;

  // Elevation
  static const double elevation1 = 1;
  static const double elevation1OffsetY = 1;
  static const double elevation1Blur = 2;
  static const Color shadow = Color(0x1A1F0D00);
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
        style: OutlinedButton.styleFrom(
          foregroundColor: AppThemeTokens.textPrimary,
          side: const BorderSide(color: AppThemeTokens.border),
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
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppThemeTokens.surface,
        hintStyle: GoogleFonts.notoSansOriya(
          color: AppThemeTokens.textSecondary,
          fontSize: AppThemeTokens.fontSizeBodyMedium,
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
        thickness: 1,
        space: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppThemeTokens.chipBackground,
        selectedColor: AppThemeTokens.chipSelected,
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

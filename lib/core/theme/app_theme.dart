import 'package:flutter/material.dart';
import 'package:tangent/core/theme/app_colors.dart';
import 'package:tangent/core/theme/app_typography.dart';

enum AppThemeMode { light, dark, amoled, system }

abstract final class AppTheme {
  static ThemeData resolve({
    required AppThemeMode mode,
    required Brightness platformBrightness,
  }) {
    final colours = switch (mode) {
      AppThemeMode.light => AppColors.light,
      AppThemeMode.dark => AppColors.blackboard,
      AppThemeMode.amoled => AppColors.amoled,
      AppThemeMode.system => platformBrightness == Brightness.dark ? AppColors.blackboard : AppColors.light,
    };
    AppColors.activeDark = colours.dark;
    return build(colours);
  }

  static ThemeData build(AppColors c) {
    final scheme = ColorScheme(
      brightness: c.dark ? Brightness.dark : Brightness.light,
      primary: AppColors.mari,
      onPrimary: AppColors.mariInk,
      secondary: c.ink,
      onSecondary: c.chalk,
      error: AppColors.bad,
      onError: AppColors.white,
      surface: c.chalk,
      onSurface: c.ink,
      onSurfaceVariant: c.ink3,
      surfaceContainerLowest: c.paper,
      surfaceContainerLow: c.paper,
      surfaceContainer: c.paper2,
      surfaceContainerHigh: c.paper2,
      outline: c.line2,
      outlineVariant: c.line,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: c.chalk,
      canvasColor: c.chalk,
      textTheme: AppTypography.textTheme(c),
      fontFamily: kSans,
      extensions: [c],
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,
      hoverColor: c.line,
      dividerTheme: DividerThemeData(color: c.line, space: 1, thickness: 1),
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: c.ink,
        selectionColor: AppColors.mari.withValues(alpha: .35),
        selectionHandleColor: AppColors.mari,
      ),
      datePickerTheme: DatePickerThemeData(
        backgroundColor: c.paper,
        headerBackgroundColor: c.ink,
        headerForegroundColor: c.chalk,
        todayBorder: BorderSide(color: c.ink),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: c.ink),
    );
  }
}

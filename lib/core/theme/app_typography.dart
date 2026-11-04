import 'package:flutter/material.dart';
import 'package:gradeon/core/theme/app_colors.dart';

/// Anek Latin + Anek Devanagari (one family, three languages). The width axis
/// carries the hierarchy: wide and heavy for numbers and headings.
const kSans = 'AnekLatin';
const kDeva = 'AnekDevanagari';
const kMono = 'IBMPlexMono';

TextStyle anek(
  double size,
  double weight, {
  double width = 100,
  double height = 1.45,
  double em = 0,
  Color? color,
  bool tabular = false,
}) {
  return TextStyle(
    fontFamily: kSans,
    fontFamilyFallback: const [kDeva],
    fontSize: size,
    fontWeight: FontWeight.values[((weight / 100).round() - 1).clamp(0, 8)],
    fontVariations: [FontVariation('wght', weight), FontVariation('wdth', width)],
    height: height,
    letterSpacing: em * size,
    color: color,
    fontFeatures: tabular ? const [FontFeature.tabularFigures()] : null,
  );
}

/// The type scale from the canvas, resolved against the current tokens.
class AppType {
  const AppType(this.c);

  final AppColors c;

  TextStyle get dx => anek(68, 780, width: 125, height: .86, em: -.025, color: c.ink, tabular: true);
  TextStyle get dl => anek(48, 760, width: 122, height: .9, em: -.02, color: c.ink, tabular: true);
  TextStyle get h1 => anek(34, 730, width: 118, height: 1, em: -.018, color: c.ink);
  TextStyle get h2 => anek(24, 690, width: 112, height: 1.08, em: -.01, color: c.ink);
  TextStyle get h3 => anek(19, 650, width: 108, height: 1.15, color: c.ink);
  TextStyle get t => anek(16.5, 600, width: 103, height: 1.25, color: c.ink);
  TextStyle get b => anek(15.5, 420, color: c.ink);
  TextStyle get s => anek(14, 450, height: 1.38, color: c.ink2);
  TextStyle get cap => anek(13, 520, height: 1.3, color: c.ink3);
  TextStyle get o => anek(11.5, 700, width: 118, height: 1, em: .1, color: c.ink3);
  TextStyle get mono => TextStyle(
    fontFamily: kMono,
    fontSize: 12.5,
    fontWeight: FontWeight.w500,
    height: 1.3,
    color: c.ink3,
  );
  TextStyle get label => anek(16, 650, width: 108, height: 1, color: c.ink);
}

abstract final class AppTypography {
  static TextTheme textTheme(AppColors c) {
    final t = AppType(c);
    return TextTheme(
      displayLarge: t.dx,
      displayMedium: t.dl,
      displaySmall: t.h1,
      headlineLarge: t.h1,
      headlineMedium: t.h2,
      headlineSmall: t.h3,
      titleLarge: t.h3,
      titleMedium: t.t,
      titleSmall: t.t.copyWith(fontSize: 15),
      bodyLarge: t.b,
      bodyMedium: t.b,
      bodySmall: t.cap,
      labelLarge: t.label,
      labelMedium: t.cap,
      labelSmall: t.o,
    );
  }
}

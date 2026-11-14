import 'package:flutter/material.dart';
import 'package:tangent/core/theme/app_colors.dart';

/// Anek Latin + Anek Devanagari (one family, three languages), the type the app had before Tangent Hue: the width axis
/// carries the hierarchy, wide and heavy for numbers and headings. Hue's roles and sizes stay.
const kSans = 'AnekLatin';
const kDeva = 'AnekDevanagari';
const kMono = 'IBMPlexMono';

/// The one way to make a text style. Screens never call it: they use a role from [AppText] or `context.type`
/// (`test/design_rules_test.dart` fails otherwise). Shared widgets may, to size text to their own geometry.
TextStyle hueText(
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

/// The type roles, from largest to smallest. Each fixes size, weight, width and tracking; a screen picks a role and
/// may only set its colour, tabular figures, or a tighter line height for text inside a fixed box.
abstract final class AppText {
  /// Hero numerals (attendance %, the home clock).
  static TextStyle dx({Color? color, double height = .86}) => hueText(68, 780, width: 125, height: height, em: -.025, color: color, tabular: true);

  /// Large numerals on cards.
  static TextStyle dl({Color? color, double height = .9}) => hueText(48, 760, width: 122, height: height, em: -.02, color: color, tabular: true);

  /// Page titles.
  static TextStyle h1({Color? color, double height = 1}) => hueText(34, 730, width: 118, height: height, em: -.018, color: color);

  /// Section titles and big amounts.
  static TextStyle h2({Color? color, double height = 1.08, bool tabular = false}) => hueText(24, 690, width: 112, height: height, em: -.01, color: color, tabular: tabular);

  /// Numbers inside cards and rows (counts, amounts, marks).
  static TextStyle num({Color? color, double height = 1}) => hueText(22, 740, width: 112, height: height, em: -.01, color: color, tabular: true);

  /// Card titles.
  static TextStyle h3({Color? color, double height = 1.15}) => hueText(19, 650, width: 108, height: height, color: color);

  /// Titles of rows and sheets.
  static TextStyle t({Color? color, double height = 1.25}) => hueText(16.5, 600, width: 103, height: height, color: color);

  /// Button labels.
  static TextStyle label({Color? color, double height = 1}) => hueText(16, 650, width: 108, height: height, color: color);

  /// Body text.
  static TextStyle b({Color? color, double height = 1.45, bool tabular = false}) => hueText(15.5, 420, height: height, color: color, tabular: tabular);

  /// Small titles: settings rows, list rows, sheet headings.
  static TextStyle ts({Color? color, double height = 1.25, bool tabular = false}) => hueText(15, 620, width: 103, height: height, color: color, tabular: tabular);

  /// Strong small text: chips, inline values.
  static TextStyle chip({Color? color, double height = 1.2, bool tabular = false}) => hueText(14, 650, width: 104, height: height, color: color, tabular: tabular);

  /// Secondary text under a title.
  static TextStyle s({Color? color, double height = 1.38, bool tabular = false}) => hueText(14, 450, height: height, color: color, tabular: tabular);

  /// Captions and meta.
  static TextStyle cap({Color? color, double height = 1.3, bool tabular = false}) => hueText(13, 520, height: height, color: color, tabular: tabular);

  /// Strong captions: a value or a name inside meta.
  static TextStyle capB({Color? color, double height = 1.3, bool tabular = false}) => hueText(13, 650, width: 104, height: height, color: color, tabular: tabular);

  /// Stamps (1 DAY, WED, NOT MARKED): uppercase, tracked.
  static TextStyle stamp({Color? color, double height = 1}) => hueText(12, 760, width: 118, height: height, em: .09, color: color);

  /// Overlines above sections: uppercase, tracked.
  static TextStyle o({Color? color, double height = 1}) => hueText(11, 700, width: 118, height: height, em: .1, color: color);

  /// Badges, dock labels, axis ticks.
  static TextStyle tiny({Color? color, double height = 1, bool tabular = false}) => hueText(11, 650, width: 106, height: height, color: color, tabular: tabular);

  /// Times and codes.
  static TextStyle mono({Color? color, double height = 1.3}) =>
      TextStyle(fontFamily: kMono, fontSize: 12, fontWeight: FontWeight.w500, height: height, color: color);
}

/// The type roles resolved against the current colours (`context.type`).
class AppType {
  const AppType(this.c);

  final AppColors c;

  TextStyle get dx => AppText.dx(color: c.ink);
  TextStyle get dl => AppText.dl(color: c.ink);
  TextStyle get h1 => AppText.h1(color: c.ink);
  TextStyle get h2 => AppText.h2(color: c.ink);
  TextStyle get num => AppText.num(color: c.ink);
  TextStyle get h3 => AppText.h3(color: c.ink);
  TextStyle get t => AppText.t(color: c.ink);
  TextStyle get label => AppText.label(color: c.ink);
  TextStyle get b => AppText.b(color: c.ink);
  TextStyle get ts => AppText.ts(color: c.ink);
  TextStyle get chip => AppText.chip(color: c.ink);
  TextStyle get s => AppText.s(color: c.ink2);
  TextStyle get cap => AppText.cap(color: c.ink3);
  TextStyle get capB => AppText.capB(color: c.ink2);
  TextStyle get stamp => AppText.stamp(color: c.ink3);
  TextStyle get o => AppText.o(color: c.ink3);
  TextStyle get tiny => AppText.tiny(color: c.ink3);
  TextStyle get mono => AppText.mono(color: c.ink3);
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
      titleSmall: t.ts,
      bodyLarge: t.b,
      bodyMedium: t.b,
      bodySmall: t.cap,
      labelLarge: t.label,
      labelMedium: t.cap,
      labelSmall: t.o,
    );
  }
}

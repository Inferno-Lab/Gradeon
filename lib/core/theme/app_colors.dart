import 'package:flutter/material.dart';
import 'package:gradeon/core/theme/app_palette_defaults.dart';

/// A subject's spectrum colour: the solid, the text on it, its soft fill, and the ink that reads on the fill.
class SubjectColor {
  const SubjectColor(this.fill, this.on, {required this.soft, required this.ink});

  final Color fill;
  final Color on;
  final Color soft;
  final Color ink;
}

/// The palette in use: Gradeon Hue's colours for the default seed, or the school's from the server (`/v1/brand` →
/// `palette`, worked out from its brand colour by `packages/contracts/src/hue.ts`).
abstract final class AppPalette {
  static Map<String, Map<String, Color>> _modes = appPaletteDefaults;

  /// Bumped whenever the palette changes, so the app rebuilds its themes.
  static final version = ValueNotifier<int>(0);

  static Color of(String mode, String key) => _modes[mode]?[key] ?? appPaletteDefaults[mode]![key]!;

  /// Takes `{light: {key: '#RRGGBB(AA)'}, dark: {...}, amoled: {...}}`; anything missing or malformed keeps the default.
  static void apply(Map<String, dynamic>? json) {
    if (json == null) return;
    final next = <String, Map<String, Color>>{};
    for (final mode in appPaletteDefaults.keys) {
      final given = json[mode];
      next[mode] = {
        for (final e in appPaletteDefaults[mode]!.entries)
          e.key: given is Map ? parseHex('${given[e.key]}') ?? e.value : e.value,
      };
    }
    _modes = next;
    version.value++;
  }

  /// `#RRGGBB` or `#RRGGBBAA` (CSS order) as a Flutter colour.
  static Color? parseHex(String hex) {
    if (!RegExp(r'^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$').hasMatch(hex)) return null;
    final h = hex.substring(1);
    final alpha = h.length == 8 ? h.substring(6) : 'FF';
    return Color(int.parse('$alpha${h.substring(0, 6)}', radix: 16));
  }

  /// White or the theme's darkest ink, whichever reads better on [ground].
  static Color on(Color ground) => ground.computeLuminance() > 0.36 ? of('light', 't1') : const Color(0xFFFFFFFF);
}

/// Gradeon Hue's colours for one theme (light, dark, AMOLED), all from [AppPalette], so a school's colour reaches every
/// screen. The frame (header, tab bar) is [deep]; "you are here" is [bright]; actions are [brand]; panels are [paper] on
/// [chalk]; status is ok, warn ([late]), bad and info; things are named by the spectrum ([subject]).
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.chalk,
    required this.paper,
    required this.paper2,
    required this.paper3,
    required this.ink,
    required this.ink2,
    required this.ink3,
    required this.line,
    required this.line2,
    required this.scrim,
    required this.shadow,
    required this.deep,
    required this.deep2,
    required this.deep3,
    required this.hero,
    required this.onDeep,
    required this.onDeep2,
    required this.bright,
    required this.onBright,
    required this.brand,
    required this.onBrand,
    required this.mariText,
    required this.mariSoft,
    required this.okSoft,
    required this.okText,
    required this.badSoft,
    required this.badText,
    required this.lateSoft,
    required this.lateText,
    required this.infoSoft,
    required this.infoText,
    required this.dark,
  });

  factory AppColors.of(String mode) {
    Color p(String key) => AppPalette.of(mode, key);
    return AppColors(
      chalk: p('bg'),
      paper: p('s1'),
      paper2: p('s2'),
      paper3: p('s3'),
      ink: p('t1'),
      ink2: p('t2'),
      ink3: p('t3'),
      line: p('line'),
      line2: p('line2'),
      scrim: p('scrim'),
      shadow: p('deep').withValues(alpha: mode == 'light' ? .14 : .5),
      deep: p('deep'),
      deep2: p('deep2'),
      deep3: p('deep3'),
      hero: p('hero'),
      onDeep: p('on-deep'),
      onDeep2: p('on-deep2'),
      bright: p('bright'),
      onBright: p('on-bright'),
      brand: p('brand'),
      onBrand: p('on-brand'),
      mariText: p('brand-ink'),
      mariSoft: p('brand-soft'),
      okSoft: p('ok-s'),
      okText: p('ok-i'),
      badSoft: p('bad-s'),
      badText: p('bad-i'),
      lateSoft: p('warn-s'),
      lateText: p('warn-i'),
      infoSoft: p('info-s'),
      infoText: p('info-i'),
      dark: mode != 'light',
    );
  }

  /// The ground behind everything (Hue `bg`).
  final Color chalk;

  /// Panels and cards (Hue `s1`), wells (`s2`) and deeper wells (`s3`).
  final Color paper;
  final Color paper2;
  final Color paper3;
  final Color ink;
  final Color ink2;
  final Color ink3;
  final Color line;
  final Color line2;
  final Color scrim;

  /// Under floating things only (sheets, toasts, the tab bar).
  final Color shadow;

  /// The school's deep colour: the header and the tab bar; [hero] is the headline card.
  final Color deep;
  final Color deep2;
  final Color deep3;
  final Color hero;
  final Color onDeep;
  final Color onDeep2;

  /// "You are here": the active tab, the one number that matters.
  final Color bright;
  final Color onBright;

  /// Actions.
  final Color brand;
  final Color onBrand;

  /// Brand as text and its soft fill.
  final Color mariText;
  final Color mariSoft;
  final Color okSoft;
  final Color okText;
  final Color badSoft;
  final Color badText;
  final Color lateSoft;
  final Color lateText;
  final Color infoSoft;
  final Color infoText;
  final bool dark;

  // Solid colours for fills that carry their own text ([mariInk], [white] or [AppPalette.on]).
  static Color get mari => AppPalette.of('light', 'brand');
  static Color get mariInk => AppPalette.of('light', 'on-brand');
  static Color get ok => AppPalette.of('light', 'ok');
  static Color get bad => AppPalette.of('light', 'bad');
  static Color get late => AppPalette.of('light', 'warn');
  static Color get info => AppPalette.of('light', 'info');
  static Color get off => AppPalette.of('light', 't3');

  static const white = Color(0xFFFFFFFF);

  // A subject's spectrum colour, the same as the admin's (packages/contracts subjectColour).
  static const _subjectSpectrum = {
    'maths': 'blue', 'mathematics': 'blue', 'science': 'green', 'english': 'red', 'hindi': 'pink', 'social': 'teal',
    'computer': 'indigo', 'computers': 'indigo', 'art': 'cyan', 'pe': 'lime', 'physical': 'lime', 'music': 'violet',
  };
  static const _subjectIds = ['maths', 'science', 'english', 'hindi', 'social', 'computer', 'art', 'pe', 'music'];

  static Map<String, SubjectColor> get subjects => {for (final id in _subjectIds) id: subject(id)};

  static SubjectColor subject(String id) => spectrum(_subjectSpectrum[id.toLowerCase().split(' ').first] ?? 'teal');

  /// One of the twelve spectrum colours (rose … pink): solid, soft fill and ink, light theme.
  static SubjectColor spectrum(String colour) {
    final fill = AppPalette.of('light', 'sp.$colour.c');
    return SubjectColor(fill, AppPalette.on(fill), soft: AppPalette.of('light', 'sp.$colour.cs'), ink: AppPalette.of('light', 'sp.$colour.ci'));
  }

  /// House colours used for student avatars.
  static List<Color> get houses => [for (final c in ['green', 'blue', 'pink', 'amber']) AppPalette.of('light', 'sp.$c.c')];

  /// The same theme as it reads on the deep colour (the Hue header): surfaces become deep2 and deep3, text the deep
  /// colour's own, actions bright. Whatever sits in the header picks these up through `context.app`.
  AppColors get onDeepSide => AppColors(
    chalk: deep, paper: deep2, paper2: deep2, paper3: deep3, ink: onDeep, ink2: onDeep2, ink3: onDeep2, line: deep3, line2: deep3,
    scrim: scrim, shadow: shadow, deep: deep, deep2: deep2, deep3: deep3, hero: hero, onDeep: onDeep, onDeep2: onDeep2,
    bright: bright, onBright: onBright, brand: bright, onBrand: onBright, mariText: bright, mariSoft: deep2,
    okSoft: okSoft, okText: okText, badSoft: badSoft, badText: badText, lateSoft: lateSoft, lateText: lateText,
    infoSoft: infoSoft, infoText: infoText, dark: true,
  );

  // Getters, not constants: the palette can change while the app runs.
  // ignore: prefer_constructors_over_static_methods
  static AppColors get light => AppColors.of('light');
  // ignore: prefer_constructors_over_static_methods
  static AppColors get blackboard => AppColors.of('dark');
  // ignore: prefer_constructors_over_static_methods
  static AppColors get amoled => AppColors.of('amoled');

  @override
  AppColors copyWith({Color? chalk, Color? paper, Color? paper2}) => AppColors(
    chalk: chalk ?? this.chalk,
    paper: paper ?? this.paper,
    paper2: paper2 ?? this.paper2,
    paper3: paper3,
    ink: ink,
    ink2: ink2,
    ink3: ink3,
    line: line,
    line2: line2,
    scrim: scrim,
    shadow: shadow,
    deep: deep,
    deep2: deep2,
    deep3: deep3,
    hero: hero,
    onDeep: onDeep,
    onDeep2: onDeep2,
    bright: bright,
    onBright: onBright,
    brand: brand,
    onBrand: onBrand,
    mariText: mariText,
    mariSoft: mariSoft,
    okSoft: okSoft,
    okText: okText,
    badSoft: badSoft,
    badText: badText,
    lateSoft: lateSoft,
    lateText: lateText,
    infoSoft: infoSoft,
    infoText: infoText,
    dark: dark,
  );

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    Color m(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppColors(
      chalk: m(chalk, other.chalk),
      paper: m(paper, other.paper),
      paper2: m(paper2, other.paper2),
      paper3: m(paper3, other.paper3),
      ink: m(ink, other.ink),
      ink2: m(ink2, other.ink2),
      ink3: m(ink3, other.ink3),
      line: m(line, other.line),
      line2: m(line2, other.line2),
      scrim: m(scrim, other.scrim),
      shadow: m(shadow, other.shadow),
      deep: m(deep, other.deep),
      deep2: m(deep2, other.deep2),
      deep3: m(deep3, other.deep3),
      hero: m(hero, other.hero),
      onDeep: m(onDeep, other.onDeep),
      onDeep2: m(onDeep2, other.onDeep2),
      bright: m(bright, other.bright),
      onBright: m(onBright, other.onBright),
      brand: m(brand, other.brand),
      onBrand: m(onBrand, other.onBrand),
      mariText: m(mariText, other.mariText),
      mariSoft: m(mariSoft, other.mariSoft),
      okSoft: m(okSoft, other.okSoft),
      okText: m(okText, other.okText),
      badSoft: m(badSoft, other.badSoft),
      badText: m(badText, other.badText),
      lateSoft: m(lateSoft, other.lateSoft),
      lateText: m(lateText, other.lateText),
      infoSoft: m(infoSoft, other.infoSoft),
      infoText: m(infoText, other.infoText),
      dark: t < 0.5 ? dark : other.dark,
    );
  }
}

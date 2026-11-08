import 'package:flutter/material.dart';
import 'package:gradeon/core/theme/app_palette_defaults.dart';

/// Subject pigment ("notebook cover") and the colour that reads on top of it.
class SubjectColor {
  const SubjectColor(this.fill, this.on);

  final Color fill;
  final Color on;
}

/// The palette in use: the design's defaults, or the school's from the console (`/v1/brand` → `palette`).
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

  /// White or the near-black ink, whichever reads better on [ground].
  static Color on(Color ground) =>
      ground.computeLuminance() > 0.36 ? const Color(0xFF1A1A1C) : const Color(0xFFFFFFFF);
}

/// Chalk & Glass tokens. Light is chalk, dark is blackboard, AMOLED is true black. Every colour comes from [AppPalette],
/// so a school's colours from the console reach every screen.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.chalk,
    required this.paper,
    required this.paper2,
    required this.ink,
    required this.ink2,
    required this.ink3,
    required this.line,
    required this.line2,
    required this.scrim,
    required this.shadow,
    required this.mariText,
    required this.mariSoft,
    required this.okSoft,
    required this.badSoft,
    required this.badText,
    required this.lateSoft,
    required this.lateText,
    required this.dark,
  });

  factory AppColors.of(String mode) {
    Color p(String key) => AppPalette.of(mode, key);
    return AppColors(
      chalk: p('chalk'),
      paper: p('paper'),
      paper2: p('paper2'),
      ink: p('ink'),
      ink2: p('ink2'),
      ink3: p('ink3'),
      line: p('line'),
      line2: p('line2'),
      scrim: p('scrim'),
      shadow: p('shadow'),
      mariText: p('mariText'),
      mariSoft: p('mariSoft'),
      okSoft: p('okSoft'),
      badSoft: p('badSoft'),
      badText: p('badText'),
      lateSoft: p('lateSoft'),
      lateText: p('lateText'),
      dark: mode != 'light',
    );
  }

  final Color chalk;
  final Color paper;
  final Color paper2;
  final Color ink;
  final Color ink2;
  final Color ink3;
  final Color line;
  final Color line2;
  final Color scrim;

  /// Under floating controls (dock, top buttons, sheets).
  final Color shadow;
  final Color mariText;
  final Color mariSoft;
  final Color okSoft;
  final Color badSoft;

  /// Bad as text: brighter on dark grounds, where the pigment fails contrast.
  final Color badText;
  final Color lateSoft;

  /// Late as text: darker on paper in light, brighter in dark.
  final Color lateText;
  final bool dark;

  // Colours that are the same in every theme.
  static Color get mari => AppPalette.of('light', 'mari');
  static Color get mariInk => AppPalette.of('light', 'mariInk');
  static Color get ok => AppPalette.of('light', 'ok');
  static Color get bad => AppPalette.of('light', 'bad');
  static Color get late => AppPalette.of('light', 'late');
  static Color get off => AppPalette.of('light', 'off');

  /// Text on a solid state or pigment fill; [AppPalette.on] picks it for any colour.
  static const white = Color(0xFFFFFFFF);

  static const _subjectIds = ['maths', 'science', 'english', 'hindi', 'social', 'computer', 'art', 'pe', 'music'];

  static Map<String, SubjectColor> get subjects => {for (final id in _subjectIds) id: subject(id)};

  static SubjectColor subject(String id) {
    final fill = AppPalette.of('light', _subjectIds.contains(id) ? 'subject.$id' : 'subject.other');
    return SubjectColor(fill, AppPalette.on(fill));
  }

  /// House colours used for student avatars.
  static List<Color> get houses => [for (var i = 1; i <= 4; i++) AppPalette.of('light', 'house.$i')];

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
    ink: ink,
    ink2: ink2,
    ink3: ink3,
    line: line,
    line2: line2,
    scrim: scrim,
    shadow: shadow,
    mariText: mariText,
    mariSoft: mariSoft,
    okSoft: okSoft,
    badSoft: badSoft,
    badText: badText,
    lateSoft: lateSoft,
    lateText: lateText,
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
      ink: m(ink, other.ink),
      ink2: m(ink2, other.ink2),
      ink3: m(ink3, other.ink3),
      line: m(line, other.line),
      line2: m(line2, other.line2),
      scrim: m(scrim, other.scrim),
      shadow: m(shadow, other.shadow),
      mariText: m(mariText, other.mariText),
      mariSoft: m(mariSoft, other.mariSoft),
      okSoft: m(okSoft, other.okSoft),
      badSoft: m(badSoft, other.badSoft),
      badText: m(badText, other.badText),
      lateSoft: m(lateSoft, other.lateSoft),
      lateText: m(lateText, other.lateText),
      dark: t < 0.5 ? dark : other.dark,
    );
  }
}

import 'package:flutter/material.dart';

/// Subject pigment ("notebook cover") and the colour that reads on top of it.
class SubjectColor {
  const SubjectColor(this.fill, this.on);

  final Color fill;
  final Color on;
}

/// Chalk & Glass tokens. Light is chalk, dark is blackboard, AMOLED is true black.
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
    required this.mariText,
    required this.mariSoft,
    required this.okSoft,
    required this.badSoft,
    required this.lateSoft,
    required this.glassTint,
    required this.glassTintStrong,
    required this.glassShadow,
    required this.glassRim,
    required this.dark,
  });

  final Color chalk;
  final Color paper;
  final Color paper2;
  final Color ink;
  final Color ink2;
  final Color ink3;
  final Color line;
  final Color line2;
  final Color scrim;
  final Color mariText;
  final Color mariSoft;
  final Color okSoft;
  final Color badSoft;
  final Color lateSoft;
  final Color glassTint;
  final Color glassTintStrong;
  final Color glassShadow;
  final Color glassRim;
  final bool dark;

  static const mari = Color(0xFFF2A007);
  static const mariInk = Color(0xFF2B1C00);
  static const ok = Color(0xFF23784A);
  static const bad = Color(0xFFC23B2A);
  static const late = Color(0xFFB06F00);
  static const off = Color(0xFF6F7A76);
  static const white = Color(0xFFFFFFFF);

  /// Bright red used for text on dark grounds, where #C23B2A fails contrast.
  Color get badText => dark ? const Color(0xFFFF8A78) : bad;

  /// Late as text, on paper or on lateSoft: #B06F00 is only 3.49:1 on lateSoft in light, so text is darker there and brighter in dark.
  Color get lateText => dark ? const Color(0xFFF6BA45) : const Color(0xFF8F5400);

  static const subjects = <String, SubjectColor>{
    'maths': SubjectColor(Color(0xFF2F5BD3), white),
    'science': SubjectColor(Color(0xFF23784A), white),
    'english': SubjectColor(Color(0xFFC23B2A), white),
    'hindi': SubjectColor(Color(0xFFB8306F), white),
    'social': SubjectColor(Color(0xFF1C6F80), white),
    'computer': SubjectColor(Color(0xFF5E3A9C), white),
    'art': SubjectColor(Color(0xFF7CC4E8), Color(0xFF0C2633)),
    'pe': SubjectColor(Color(0xFF9BC53D), Color(0xFF1B2A05)),
    'music': SubjectColor(Color(0xFFB8306F), white),
  };

  static SubjectColor subject(String id) =>
      subjects[id] ?? const SubjectColor(Color(0xFF56635E), white);

  /// House colours used for student avatars.
  static const houses = [
    Color(0xFF23784A),
    Color(0xFF2F5BD3),
    Color(0xFFB8306F),
    Color(0xFFE0A81E),
  ];

  static const light = AppColors(
    chalk: Color(0xFFEEF0EC),
    paper: Color(0xFFFBFCF9),
    paper2: Color(0xFFF3F5F1),
    ink: Color(0xFF10201B),
    ink2: Color(0xFF36443F),
    ink3: Color(0xFF56635E),
    line: Color(0x1710201B),
    line2: Color(0x2B10201B),
    scrim: Color(0x570A1411),
    mariText: Color(0xFF8A5600),
    mariSoft: Color(0xFFFCEBC4),
    okSoft: Color(0xFFDCEFE3),
    badSoft: Color(0xFFF8DED9),
    lateSoft: Color(0xFFFBEBCB),
    glassTint: Color(0x5CFFFFFF),
    glassTintStrong: Color(0x99FBFCF9),
    glassShadow: Color(0x3310201B),
    glassRim: Color(0x73FFFFFF),
    dark: false,
  );

  static const blackboard = AppColors(
    chalk: Color(0xFF0D1814),
    paper: Color(0xFF14231E),
    paper2: Color(0xFF1A2C26),
    ink: Color(0xFFE8EFEA),
    ink2: Color(0xFFBCC8C2),
    ink3: Color(0xFF93A29B),
    line: Color(0x17E8EFEA),
    line2: Color(0x2BE8EFEA),
    scrim: Color(0x80000000),
    mariText: Color(0xFFF6BA45),
    mariSoft: Color(0xFF3A2B0C),
    okSoft: Color(0xFF173A28),
    badSoft: Color(0xFF41201B),
    lateSoft: Color(0xFF3B2C0F),
    glassTint: Color(0x661C1C1E),
    glassTintStrong: Color(0x8C1C1C1E),
    glassShadow: Color(0x66000000),
    glassRim: Color(0x38FFFFFF),
    dark: true,
  );

  static final amoled = blackboard.copyWith(
    chalk: const Color(0xFF000000),
    paper: const Color(0xFF0B110F),
    paper2: const Color(0xFF111916),
  );

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
    mariText: mariText,
    mariSoft: mariSoft,
    okSoft: okSoft,
    badSoft: badSoft,
    lateSoft: lateSoft,
    glassTint: glassTint,
    glassTintStrong: glassTintStrong,
    glassShadow: glassShadow,
    glassRim: glassRim,
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
      mariText: m(mariText, other.mariText),
      mariSoft: m(mariSoft, other.mariSoft),
      okSoft: m(okSoft, other.okSoft),
      badSoft: m(badSoft, other.badSoft),
      lateSoft: m(lateSoft, other.lateSoft),
      glassTint: m(glassTint, other.glassTint),
      glassTintStrong: m(glassTintStrong, other.glassTintStrong),
      glassShadow: m(glassShadow, other.glassShadow),
      glassRim: m(glassRim, other.glassRim),
      dark: t < 0.5 ? dark : other.dark,
    );
  }
}

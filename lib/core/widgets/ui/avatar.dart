import 'package:flutter/material.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';

class Avatar extends StatelessWidget {
  const Avatar(this.name, {this.size = 40, this.background, this.foreground, this.ring, this.initials, super.key});

  final String name;
  final double size;
  final Color? background;
  final Color? foreground;
  final Color? ring;

  /// Overrides the letters, e.g. to tell siblings with one surname apart.
  final String? initials;

  static String initialsOf(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    final letters = parts.take(2).map((p) => p.characters.first.toUpperCase()).join();
    return letters.isEmpty ? '?' : letters;
  }

  /// Initials that tell siblings apart: a later child whose initials clash
  /// with an earlier one's uses the first two letters of their first name.
  static String siblingInitials(String name, List<String> family) {
    final mine = initialsOf(name);
    final i = family.indexOf(name);
    final clash = family.take(i < 0 ? family.length : i).any((n) => initialsOf(n) == mine);
    final first = name.trim().split(RegExp(r'\s+')).first;
    return clash && first.length > 1 ? first.substring(0, 2).toUpperCase() : mine;
  }

  /// Stable house colour for a person, so the same student always looks the same.
  static Color houseFor(String seed) => AppColors.houses[seed.hashCode.abs() % 4];

  @override
  Widget build(BuildContext context) {
    final bg = background ?? houseFor(name);
    final fg = foreground ?? (bg == AppColors.houses[3] ? AppColors.mariInk : AppColors.white);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: bg,
        shape: BoxShape.circle,
        boxShadow: ring == null
            ? null
            : // Later shadows paint on top, so the outer ring goes first.
              [BoxShadow(color: ring!, spreadRadius: 4.5), BoxShadow(color: context.app.chalk, spreadRadius: 2.5)],
      ),
      child: Text(
        initials ?? initialsOf(name),
        style: anek(size * .35, 700, width: 112, height: 1, em: .02, color: fg),
      ),
    );
  }
}

/// The school's mark: its logo letters in its brand colour (console: Identity and branding), with letters that read on it.
class SchoolMark extends StatelessWidget {
  const SchoolMark({this.size = 28, super.key});

  final double size;

  @override
  Widget build(BuildContext context) {
    final bg = AppConfig.schoolColor ?? context.app.ink;
    final fg = bg.computeLuminance() > .36 ? AppColors.mariInk : AppColors.white;
    return Avatar(AppConfig.schoolName, size: size, background: bg, foreground: fg, initials: AppConfig.schoolMark);
  }
}

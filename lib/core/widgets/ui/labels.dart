import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/ui/controls.dart';

/// Short labels printed on notebook covers.
const subjectAbbr = {
  'maths': 'MA',
  'science': 'SCI',
  'english': 'EN',
  'hindi': 'HI',
  'social': 'SST',
  'computer': 'CS',
  'art': 'ART',
  'pe': 'PE',
  'music': 'MU',
};

String subjectName(String id) => 'subject.$id'.tr;

/// Uppercase tracked label ("THURSDAY · 15 OCTOBER").
class Overline extends StatelessWidget {
  const Overline(this.text, {this.color, super.key});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    style: context.type.o.copyWith(color: color),
    maxLines: 1,
    overflow: TextOverflow.ellipsis,
  );
}

/// Rubber-stamp status label.
class Stamp extends StatelessWidget {
  const Stamp(this.text, {required this.color, this.size = 11, super.key});

  final String text;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(8, 6, 8, 4),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(6),
      border: Border.all(color: color, width: 1.6),
    ),
    child: Text(
      text.toUpperCase(),
      maxLines: 1,
      style: anek(size, 760, width: 118, height: 1, em: .09, color: color),
    ),
  );
}

class Dot extends StatelessWidget {
  const Dot(this.color, {this.size = 8, super.key});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
  );
}

/// Live indicator: a dot breathing between full and 35% opacity every 2.2s.
class PulseDot extends StatefulWidget {
  const PulseDot(this.color, {super.key});

  final Color color;

  @override
  State<PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<PulseDot> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: AppMotion.loop);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (context.reduceMotion) {
      _c.value = 0;
    } else if (!_c.isAnimating) {
      _c.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
    opacity: Tween<double>(begin: 1, end: .35).chain(CurveTween(curve: kLoop)).animate(_c),
    child: Dot(widget.color),
  );
}

class Chip2 extends StatelessWidget {
  const Chip2(
    this.label, {
    this.on = false,
    this.onTap,
    this.icon,
    this.dot,
    this.background,
    this.foreground,
    this.height = 36,
    super.key,
  });

  final String label;
  final bool on;
  final VoidCallback? onTap;
  final IconData? icon;
  final Color? dot;
  final Color? background;
  final Color? foreground;
  final double height;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final fg = foreground ?? (on ? c.chalk : c.ink2);
    return Pressable(
      onTap: onTap,
      scale: .95,
      child: AnimatedContainer(
        duration: AppMotion.t2,
        curve: kEase,
        height: height,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: background ?? (on ? c.ink : c.paper),
          borderRadius: BorderRadius.circular(height / 2),
          border: on || background != null ? null : Border.all(color: c.line2),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (dot != null) ...[Dot(dot!), const SizedBox(width: 6)],
            if (icon != null) ...[Icon(icon, size: 15, color: fg), const SizedBox(width: 6)],
            Flexible(
              child: Text(
                label.tr,
                style: AppText.chip(color: fg, height: 1),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

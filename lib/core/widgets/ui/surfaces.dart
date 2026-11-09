import 'package:flutter/material.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/ui/controls.dart';

/// Dashed rule (receipt slips, exam sittings).
class DashedLine extends StatelessWidget {
  const DashedLine({this.color, this.dash = 6, this.gap = 4, this.thickness = 1.5, super.key});

  final Color? color;
  final double dash;
  final double gap;
  final double thickness;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) => Row(
      children: [
        for (var i = 0; i < box.maxWidth ~/ (dash + gap); i++)
          Container(
            width: dash,
            height: thickness,
            margin: EdgeInsets.only(right: gap),
            color: color ?? context.app.line2,
          ),
      ],
    ),
  );
}

class Hr extends StatelessWidget {
  const Hr({this.indent = 0, super.key});

  final double indent;

  @override
  Widget build(BuildContext context) => Container(
    height: 1,
    margin: EdgeInsets.only(left: indent),
    color: context.app.line,
  );
}

/// Solid content card: paper with a hairline ring, never glass.
class EduCard extends StatelessWidget {
  const EduCard({
    required this.child,
    this.padding = EdgeInsets.zero,
    this.color,
    this.radius = AppRadius.card,
    this.ring,
    this.onTap,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final double radius;
  final Color? ring;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final body = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? context.app.paper,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: ring ?? context.app.line, width: ring == null ? 1 : 2),
      ),
      clipBehavior: Clip.antiAlias,
      child: child,
    );
    if (onTap == null) return body;
    return Pressable(onTap: onTap, child: body);
  }
}

/// Diagonal hatching for breaks and holidays.
class Hatch extends StatelessWidget {
  const Hatch({this.child, this.radius = BorderRadius.zero, this.background, super.key});

  final Widget? child;
  final BorderRadius radius;
  final Color? background;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: radius,
    child: CustomPaint(
      painter: HatchPainter(context.app.line2, background ?? Colors.transparent),
      child: child,
    ),
  );
}

class HatchPainter extends CustomPainter {
  HatchPainter(this.color, this.background);

  final Color color;
  final Color background;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = background);
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;
    // 135deg stripes every 7px, like the CSS repeating-linear-gradient.
    for (var x = -size.height; x < size.width + size.height; x += 7) {
      canvas.drawLine(Offset(x, size.height), Offset(x + size.height, 0), paint);
    }
  }

  @override
  bool shouldRepaint(HatchPainter old) => old.color != color || old.background != background;
}

/// Bottom-sheet grab handle.
class Grab extends StatelessWidget {
  const Grab({super.key});

  @override
  Widget build(BuildContext context) => Center(
    child: Container(
      width: 40,
      height: 5,
      margin: const EdgeInsets.only(top: 10),
      decoration: BoxDecoration(color: context.app.line2, borderRadius: BorderRadius.circular(2)),
    ),
  );
}

/// Phone content column: 20px gutters, capped width on big screens.
class Gutter extends StatelessWidget {
  const Gutter({required this.child, this.top = 0, this.bottom = 0, super.key});

  final Widget child;
  final double top;
  final double bottom;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(20, top, 20, bottom),
    child: child,
  );
}

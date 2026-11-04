import 'package:flutter/material.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';

/// Kept so existing call sites can still ask for a thicker control (a thumb).
enum GlassKind { sheet, lens }

/// Solid floating surface. The name stays so every bar, sheet and button
/// keeps its call site; nothing here blurs or refracts the page behind it.
class Glass extends StatelessWidget {
  const Glass({
    this.child,
    this.radius = 22,
    this.kind = GlassKind.sheet,
    this.tint,
    this.padding,
    this.width,
    this.height,
    this.shadow = true,
    this.onPigment = false,
    super.key,
  });

  final Widget? child;
  final double radius;
  final GlassKind kind;
  final Color? tint;
  final EdgeInsetsGeometry? padding;
  final double? width;
  final double? height;
  final bool shadow;

  /// Sits on a photo or a subject colour. The fill is the brand ink so white
  /// icons and labels stay readable. On the page, the fill is paper.
  final bool onPigment;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final thick = kind == GlassKind.lens;
    final given = tint;
    final fill = given != null && given.a >= .95
        ? given
        : onPigment
        ? const Color(0xFF10201B)
        : c.paper;
    return Container(
      width: width,
      height: height,
      padding: padding,
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(radius),
        border: thick ? Border.all(color: onPigment ? const Color(0x33FFFFFF) : c.line2) : null,
        boxShadow: shadow
            ? [
                BoxShadow(
                  color: c.dark ? const Color(0x66000000) : const Color(0x2410201B),
                  blurRadius: thick ? 10 : 18,
                  spreadRadius: thick ? 0 : -6,
                  offset: Offset(0, thick ? 2 : 8),
                ),
              ]
            : null,
      ),
      child: child,
    );
  }
}

/// Round icon button (44px), the house top-bar control.
class GlassIconButton extends StatelessWidget {
  const GlassIconButton({
    required this.icon,
    required this.onTap,
    required this.label,
    this.color,
    this.size = 44,
    this.badge = false,
    this.onPigment,
    super.key,
  });

  /// Defaults to true for white icons: they sit on the solid ink fill.
  final bool? onPigment;
  final IconData icon;
  final VoidCallback? onTap;
  final String label;
  final Color? color;
  final double size;
  final bool badge;

  @override
  Widget build(BuildContext context) {
    return GlassPress(
      onTap: onTap,
      label: label,
      child: Glass(
        width: size,
        height: size,
        radius: size / 2,
        onPigment: onPigment ?? color == AppColors.white,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Icon(icon, size: 22, color: color ?? context.app.ink),
            if (badge)
              const Positioned(
                top: 8,
                right: 9,
                child: SizedBox.square(
                  dimension: 9,
                  child: DecoratedBox(
                    decoration: BoxDecoration(color: Color(0xFFC23B2A), shape: BoxShape.circle),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Scales to 0.97 on press. It is its own accessibility node (a button) so it
/// never merges into the header around it; icon-only controls pass [label].
class GlassPress extends StatefulWidget {
  const GlassPress({required this.child, this.onTap, this.label, super.key});

  final Widget child;
  final VoidCallback? onTap;
  final String? label;

  @override
  State<GlassPress> createState() => _GlassPressState();
}

class _GlassPressState extends State<GlassPress> {
  var _down = false;

  @override
  Widget build(BuildContext context) {
    final down = _down && !context.reduceMotion;
    return Semantics(
      container: true,
      button: true,
      enabled: widget.onTap != null,
      label: widget.label,
      excludeSemantics: widget.label != null,
      onTap: widget.onTap,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        onTapDown: widget.onTap == null ? null : (_) => setState(() => _down = true),
        onTapUp: widget.onTap == null ? null : (_) => setState(() => _down = false),
        onTapCancel: widget.onTap == null ? null : () => setState(() => _down = false),
        child: AnimatedContainer(
          duration: down ? const Duration(milliseconds: 100) : AppDurations.medium,
          curve: down ? Curves.easeOut : kSpring,
          transformAlignment: Alignment.center,
          transform: Matrix4.diagonal3Values(down ? .97 : 1, down ? .97 : 1, 1),
          child: widget.child,
        ),
      ),
    );
  }
}

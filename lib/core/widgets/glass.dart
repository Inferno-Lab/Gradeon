import 'package:flutter/material.dart';
import 'package:tangent/core/theme/app_colors.dart';
import 'package:tangent/core/theme/tokens.dart';
import 'package:tangent/core/utils/extensions.dart';

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
        ? c.deep2
        : c.paper;
    return Container(
      width: width,
      height: height,
      padding: padding,
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(radius),
        border: thick ? Border.all(color: onPigment ? AppColors.white.withValues(alpha: 0.2) : c.line2) : null,
        boxShadow: shadow
            ? [
                BoxShadow(
                  color: c.shadow,
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

/// Round icon button (44px) for the top of a page, which is the school's deep colour in Tangent Hue.
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
    final c = context.app;
    // Tangent Hue's round button on the deep colour (`.pib.ond`): a solid deep2 disc, no shadow; the dot is bright.
    return GlassPress(
      onTap: onTap,
      label: label,
      child: SizedBox.square(
        dimension: size,
        child: DecoratedBox(
          decoration: BoxDecoration(color: c.deep2, shape: BoxShape.circle),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Icon(icon, size: 22, color: c.onDeep),
              if (badge)
                Positioned(
                  top: 10,
                  right: 11,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(color: c.bright, shape: BoxShape.circle, border: Border.all(color: c.deep2, width: 2)),
                  ),
                ),
            ],
          ),
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
          duration: down ? AppMotion.press : AppMotion.spring,
          curve: down ? kEase : kSpring,
          transformAlignment: Alignment.center,
          transform: Matrix4.diagonal3Values(down ? .97 : 1, down ? .97 : 1, 1),
          child: widget.child,
        ),
      ),
    );
  }
}

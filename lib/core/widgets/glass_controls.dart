import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/haptics.dart';
import 'package:gradeon/core/widgets/glass.dart';

/// Glass segmented control with a droplet that stretches as it slides.
class GlassSegmented extends StatefulWidget {
  const GlassSegmented({
    required this.labels,
    required this.index,
    required this.onChanged,
    this.height = 56,
    this.onPigment = false,
    this.droplet,
    this.dropletText,
    this.fontSize = 15,
    this.semanticLabel,
    super.key,
  });

  final List<String> labels;
  final int index;
  final ValueChanged<int> onChanged;
  final double height;

  /// Sits over a pigment: unselected labels turn white with a soft shadow.
  final bool onPigment;

  /// Solid droplet colour; null means a clear glass lens.
  final Color? droplet;
  final Color? dropletText;
  final double fontSize;
  final String? semanticLabel;

  @override
  State<GlassSegmented> createState() => _GlassSegmentedState();
}

class _GlassSegmentedState extends State<GlassSegmented> {
  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final still = context.reduceMotion;
    final pad = widget.height >= 52 ? 5.0 : 4.0;
    final dropH = widget.height - pad * 2;
    return Semantics(
      label: widget.semanticLabel,
      container: true,
      child: Glass(
        height: widget.height,
        radius: widget.height / 2,
        onPigment: widget.onPigment,
        child: LayoutBuilder(
          builder: (context, box) {
            final slot = (box.maxWidth - pad * 2) / widget.labels.length;
            final dropletColor = widget.droplet;
            return Stack(
              children: [
                AnimatedPositioned(
                  duration: still ? Duration.zero : AppMotion.t4,
                  curve: kSpring,
                  left: pad + math.max(0, widget.index) * slot,
                  top: pad,
                  width: slot,
                  height: dropH,
                  // index -1: nothing chosen yet, so no droplet.
                  child: AnimatedOpacity(
                    duration: AppMotion.t2,
                    opacity: widget.index < 0 ? 0 : 1,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: dropletColor ?? (widget.onPigment ? AppColors.white : c.ink),
                        borderRadius: BorderRadius.circular(dropH / 2),
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: pad),
                  child: Row(
                    children: [
                      for (var i = 0; i < widget.labels.length; i++) Expanded(child: _segment(context, i)),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _segment(BuildContext context, int i) {
    final c = context.app;
    final on = i == widget.index;
    final Color color;
    if (on) {
      color = widget.dropletText ?? (widget.onPigment ? AppColors.light.ink : (c.dark ? c.chalk : c.paper));
    } else {
      color = widget.onPigment ? AppColors.white : c.ink3;
    }
    return Semantics(
      button: true,
      selected: on,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () {
          if (on) return;
          Haptics.selection();
          widget.onChanged(i);
        },
        child: SizedBox(
          height: widget.height,
          child: Center(
            child: Text(
              widget.labels[i].tr,
              maxLines: 1,
              overflow: TextOverflow.fade,
              softWrap: false,
              style: hueText(widget.fontSize, on ? 720 : (widget.onPigment ? 650 : 560), height: 1, color: color).copyWith(
                shadows: widget.onPigment && !on
                    ? [Shadow(color: AppColors.amoled.chalk.withValues(alpha: 0.4), blurRadius: 6, offset: const Offset(0, 1))]
                    : null,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Switch: solid track, glass thumb that swells into a lens while pressed.
class GlassSwitch extends StatefulWidget {
  const GlassSwitch({
    required this.value,
    required this.onChanged,
    required this.label,
    this.onColor,
    super.key,
  });

  final bool value;
  final ValueChanged<bool>? onChanged;
  final String label;
  final Color? onColor;

  @override
  State<GlassSwitch> createState() => _GlassSwitchState();
}

class _GlassSwitchState extends State<GlassSwitch> {
  var _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final on = widget.value;
    final still = context.reduceMotion;
    return Semantics(
      toggled: on,
      label: widget.label.tr,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) => setState(() => _pressed = false),
        onTapCancel: () => setState(() => _pressed = false),
        onTap: widget.onChanged == null
            ? null
            : () {
                Haptics.selection();
                widget.onChanged!(!on);
              },
        child: SizedBox(
          width: 64,
          height: 44,
          child: Center(
            child: AnimatedContainer(
              duration: AppMotion.t2,
              curve: kEase,
              width: 64,
              height: 32,
              decoration: BoxDecoration(
                color: on ? (widget.onColor ?? c.ink) : c.ink.withValues(alpha: .18),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Stack(
                children: [
                  AnimatedPositioned(
                    duration: still ? Duration.zero : AppMotion.spring,
                    curve: kSpring,
                    left: on ? 21 : 2,
                    top: 2,
                    width: 41,
                    height: 28,
                    child: AnimatedScale(
                      scale: _pressed && !still ? .96 : 1,
                      duration: AppMotion.t2,
                      curve: kSpring,
                      child: Glass(
                        kind: GlassKind.lens,
                        radius: 14,
                        // Dark thumb on the light "on" track at night, white thumb everywhere else.
                        tint: on && c.dark ? c.chalk : AppColors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Slider with a glass thumb. [value] is 0..1; [divisions] snaps it.
class GlassSlider extends StatefulWidget {
  const GlassSlider({
    required this.value,
    required this.onChanged,
    required this.label,
    this.describe,
    this.divisions,
    this.fill,
    this.onChangeEnd,
    this.thumbChild,
    this.thumbWidth = 48,
    super.key,
  });

  final double value;
  final ValueChanged<double> onChanged;
  final ValueChanged<double>? onChangeEnd;
  final String label;
  /// Spoken value for a slider position; defaults to a percentage.
  final String Function(double value)? describe;
  final int? divisions;
  final Color? fill;
  final Widget? thumbChild;
  final double thumbWidth;

  @override
  State<GlassSlider> createState() => _GlassSliderState();
}

class _GlassSliderState extends State<GlassSlider> {
  var _dragging = false;

  double _snap(double v) {
    final clamped = v.clamp(0.0, 1.0);
    final d = widget.divisions;
    if (d == null || d <= 0) return clamped;
    return (clamped * d).round() / d;
  }

  void _update(double dx, double width) {
    final travel = width - widget.thumbWidth;
    final next = _snap((dx - widget.thumbWidth / 2) / travel);
    if (next != widget.value) {
      if (widget.divisions != null) unawaited(HapticFeedback.selectionClick());
      widget.onChanged(next);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final step = 1 / (widget.divisions ?? 10);
    final up = _snap((widget.value + step).clamp(0, 1));
    final down = _snap((widget.value - step).clamp(0, 1));
    String say(double v) => widget.describe?.call(v) ?? '${(v * 100).round()}%';
    return Semantics(
      slider: true,
      label: widget.label.tr,
      // Every action needs its resulting value, or semantics asserts.
      value: say(widget.value),
      increasedValue: say(up),
      decreasedValue: say(down),
      onIncrease: () => widget.onChanged(up),
      onDecrease: () => widget.onChanged(down),
      child: LayoutBuilder(
        builder: (context, box) {
          final width = box.maxWidth;
          final left = (width - widget.thumbWidth) * widget.value;
          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onHorizontalDragStart: (d) {
              setState(() => _dragging = true);
              _update(d.localPosition.dx, width);
            },
            onHorizontalDragUpdate: (d) => _update(d.localPosition.dx, width),
            onHorizontalDragEnd: (_) {
              setState(() => _dragging = false);
              widget.onChangeEnd?.call(widget.value);
            },
            onTapUp: (d) {
              _update(d.localPosition.dx, width);
              widget.onChangeEnd?.call(widget.value);
            },
            child: SizedBox(
              height: 44,
              child: Stack(
                alignment: Alignment.centerLeft,
                children: [
                  Container(
                    height: 8,
                    decoration: BoxDecoration(color: c.paper2, borderRadius: BorderRadius.circular(2)),
                  ),
                  Container(
                    width: left + widget.thumbWidth / 2,
                    height: 8,
                    decoration: BoxDecoration(color: widget.fill ?? c.ink, borderRadius: BorderRadius.circular(2)),
                  ),
                  AnimatedPositioned(
                    duration: _dragging || context.reduceMotion ? Duration.zero : AppMotion.spring,
                    curve: kSpring,
                    left: left,
                    top: 5,
                    width: widget.thumbWidth,
                    height: 34,
                    child: AnimatedScale(
                      scale: _dragging && !context.reduceMotion ? 1.08 : 1,
                      duration: AppMotion.t2,
                      child: Glass(
                        kind: GlassKind.lens,
                        radius: 18,
                        tint: AppColors.white.withValues(alpha: 0.5),
                        child: widget.thumbChild == null ? null : Center(child: widget.thumbChild),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

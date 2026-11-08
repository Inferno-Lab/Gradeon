import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/schedule.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/academics.dart';

/// Today's periods as pigment blocks, time-proportional, with a thick glass
/// lens over "now". Dragging the lens scrubs the day.
class DayRibbon extends StatefulWidget {
  const DayRibbon({
    required this.periods,
    this.height = 236,
    this.pxPerMinute = 2.4,
    this.draggable = true,
    this.onScrub,
    this.blockLabel,
    this.blockDetail,
    this.blockAccent,
    this.showLabel = true,
    this.leftInset = 0,
    this.now,
    super.key,
  });

  final List<PeriodSlot> periods;
  final double height;
  final double pxPerMinute;
  final bool draggable;

  /// Minute of day under the lens (null when it is back on "now").
  final ValueChanged<int?>? onScrub;
  final String Function(PeriodSlot)? blockLabel;
  final String? Function(PeriodSlot)? blockDetail;
  final bool Function(PeriodSlot)? blockAccent;
  final bool showLabel;

  /// Space reserved on the left (tablet rail) before blocks start.
  final double leftInset;

  /// Fixed clock for tests and screenshots.
  final int? now;

  @override
  State<DayRibbon> createState() => DayRibbonState();
}

class DayRibbonState extends State<DayRibbon> {
  double? _markerX;

  /// Width of the draggable strip around the now marker.
  static const _grab = 56.0;
  var _dragging = false;

  void backToNow() {
    setState(() => _markerX = null);
    widget.onScrub?.call(null);
  }

  @override
  Widget build(BuildContext context) {
    final periods = widget.periods;
    if (periods.isEmpty) return SizedBox(height: widget.height);
    final start = minutesOf(periods.first.start);
    final end = minutesOf(periods.last.end);
    final now = (widget.now ?? nowMinutes()).clamp(start, end);
    final k = widget.pxPerMinute;
    return LayoutBuilder(
      builder: (context, box) {
        final w = box.maxWidth;
        final total = (end - start) * k;
        // Centre "now" when the day is wider than the screen; never leave a gap.
        final avail = w - widget.leftInset;
        var offset = widget.leftInset + avail / 2 - (now - start) * k;
        if (total > avail) {
          offset = offset.clamp(w - total, widget.leftInset);
        } else {
          offset = widget.leftInset + (avail - total) / 2;
        }
        double xOf(int minute) => offset + (minute - start) * k;
        final nowX = xOf(now);
        final markerX = (_markerX ?? nowX).clamp(_grab / 2, w - _grab / 2);
        final minute = (start + (markerX - offset) / k).round().clamp(start, end);
        final scrubbing = _markerX != null && (minute - now).abs() > 2;

        return SizedBox(
          height: widget.height,
          child: Stack(
            children: [
              for (final p in periods) _block(context, p, xOf, now),
              Positioned(
                left: markerX - _grab / 2,
                top: 0,
                width: _grab,
                height: widget.height,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onHorizontalDragStart: widget.draggable ? (_) => setState(() => _dragging = true) : null,
                  onHorizontalDragUpdate: widget.draggable
                      ? (d) {
                          setState(() => _markerX = (markerX + d.delta.dx).clamp(_grab / 2, w - _grab / 2));
                          final m = (start + ((_markerX! - offset) / k)).round().clamp(start, end);
                          widget.onScrub?.call((m - now).abs() <= 2 ? null : m);
                        }
                      : null,
                  onHorizontalDragEnd: widget.draggable ? (_) => setState(() => _dragging = false) : null,
                  child: Semantics(
                    slider: widget.draggable,
                    label: 'home.scrub'.tr,
                    value: clockOf(minute),
                    child: _NowMarker(
                      label: widget.showLabel ? (scrubbing ? 'home.scrub_label' : 'home.now_label').tr : null,
                      time: clockOf(minute),
                      lifted: _dragging && !context.reduceMotion,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _block(BuildContext context, PeriodSlot p, double Function(int) xOf, int now) {
    final c = context.app;
    final a = minutesOf(p.start);
    final b = minutesOf(p.end);
    final left = xOf(a);
    final width = (b - a) * widget.pxPerMinute - 3;
    final past = b <= now;
    const radius = BorderRadius.vertical(bottom: Radius.circular(20));
    if (p.subject == 'free') {
      // A teacher's free period: hatch, labelled at the foot like a class.
      Widget free = Hatch(
        radius: radius,
        background: c.paper2,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 8, 14),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.end,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('teacher.free'.tr, maxLines: 1, style: anek(13, 720, width: 104, height: 1, color: c.ink3)),
              const SizedBox(height: 3),
              Text(clockOf(a), style: context.type.mono.copyWith(fontSize: 11, color: c.ink3)),
            ],
          ),
        ),
      );
      if (past) free = Opacity(opacity: c.dark ? .6 : .55, child: free);
      return Positioned(left: left, top: 0, width: width, height: widget.height, child: free);
    }
    if (p.kind != PeriodKind.klass) {
      return Positioned(
        left: left,
        top: 0,
        width: width,
        height: widget.height,
        child: Hatch(
          radius: radius,
          background: c.paper2,
          child: Center(
            child: RotatedBox(
              quarterTurns: 3,
              child: Text(
                (p.kind == PeriodKind.recess ? 'timetable.recess' : 'timetable.break').tr.toUpperCase(),
                maxLines: 1,
                style: anek(11, 700, height: 1, em: .12, color: c.ink3),
              ),
            ),
          ),
        ),
      );
    }
    final pigment = AppColors.subject(p.subject);
    final detail = widget.blockDetail?.call(p);
    Widget block = Container(
      decoration: BoxDecoration(
        color: pigment.fill,
        borderRadius: radius,
      ),
      foregroundDecoration: widget.blockAccent?.call(p) ?? false
          ? BoxDecoration(
              border: Border(bottom: BorderSide(color: AppColors.mari, width: 5)),
              borderRadius: radius,
            )
          : null,
      padding: const EdgeInsets.fromLTRB(10, 0, 8, 14),
      alignment: Alignment.bottomLeft,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.blockLabel?.call(p) ?? 'subject_short.${p.subject}'.tr,
            maxLines: 1,
            overflow: TextOverflow.clip,
            softWrap: false,
            style: anek(17, 720, width: 104, height: 1, color: pigment.on),
          ),
          if (detail != null) ...[
            const SizedBox(height: 4),
            Text(
              detail,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: anek(12.5, 520, height: 1.1, color: pigment.on.withValues(alpha: .88)),
            ),
          ],
          const SizedBox(height: 3),
          Text(
            clockOf(a),
            style: context.type.mono.copyWith(fontSize: 11, color: pigment.on.withValues(alpha: .85)),
          ),
        ],
      ),
    );
    // Past periods lose colour but keep full strength: fading them too left white text washed out on a pale card.
    if (past) block = ColorFiltered(colorFilter: const ColorFilter.matrix(_desaturate), child: block);
    return Positioned(left: left, top: 0, width: width, height: widget.height, child: block);
  }
}

// saturate(.35)
const _desaturate = <double>[
  .4825, .4649, .0526, 0, 0, //
  .1382, .8148, .0470, 0, 0, //
  .1382, .4649, .3969, 0, 0, //
  0, 0, 0, 1, 0,
];

/// Hour marks under the ribbon (9:00, 10:00, 11:00).
class RibbonScale extends StatelessWidget {
  const RibbonScale({required this.periods, this.pxPerMinute = 2.4, this.now, this.leftInset = 0, super.key});

  final List<PeriodSlot> periods;
  final double pxPerMinute;
  final int? now;
  final double leftInset;

  @override
  Widget build(BuildContext context) {
    if (periods.isEmpty) return const SizedBox(height: 16);
    final start = minutesOf(periods.first.start);
    final end = minutesOf(periods.last.end);
    final nowM = (now ?? nowMinutes()).clamp(start, end);
    return LayoutBuilder(
      builder: (context, box) {
        final w = box.maxWidth;
        final total = (end - start) * pxPerMinute;
        final avail = w - leftInset;
        var offset = leftInset + avail / 2 - (nowM - start) * pxPerMinute;
        offset = total > avail ? offset.clamp(w - total, leftInset) : leftInset + (avail - total) / 2;
        final style = context.type.mono.copyWith(fontSize: 10.5);
        return SizedBox(
          height: 16,
          child: Stack(
            children: [
              for (var h = (start ~/ 60) + 1; h * 60 <= end; h++)
                if (offset + (h * 60 - start) * pxPerMinute - 4 < w - 30)
                  Positioned(
                    left: offset + (h * 60 - start) * pxPerMinute - 4,
                    child: Text(clockOf(h * 60), style: style),
                  ),
            ],
          ),
        );
      },
    );
  }
}

/// A marigold line through the day with a small label: where "now" (or the
/// scrubbed time) sits. Solid, not glass, so it never competes with the blocks.
class _NowMarker extends StatelessWidget {
  const _NowMarker({required this.time, required this.lifted, this.label});

  final String? label;
  final String time;
  final bool lifted;

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.topCenter,
      children: [
        Positioned.fill(
          child: Center(
            child: Container(
              width: 3,
              decoration: BoxDecoration(
                color: AppColors.mari,
                borderRadius: BorderRadius.circular(2),
                boxShadow: const [BoxShadow(color: Color(0x4010201B), blurRadius: 4)],
              ),
            ),
          ),
        ),
        Positioned(
          bottom: 10,
          child: AnimatedScale(
            scale: lifted ? 1.08 : 1,
            duration: AppDurations.fast,
            curve: kSpring,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.mari,
                borderRadius: BorderRadius.circular(10),
                boxShadow: const [BoxShadow(color: Color(0x4010201B), blurRadius: 8, offset: Offset(0, 2))],
              ),
              child: Text(
                [?label, time].join(' · '),
                maxLines: 1,
                style: anek(10.5, 760, height: 1.1, color: AppColors.mariInk, tabular: true),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

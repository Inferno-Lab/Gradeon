import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/empty_art.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/sheets.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/features/dashboard/views/dashboard_view.dart';
import 'package:gradeon/features/exams_results/controllers/results_controller.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class ResultsView extends GetView<ResultsController> {
  const ResultsView({super.key});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      controller.examIndex.value;
      final result = controller.result;
      final inset = MediaQuery.paddingOf(context);
      final heroH = 203.0 + inset.top;
      final onHero = result == null ? null : AppColors.white;
      return PageFrame(
        leading: BackGlass(color: onHero),
        actions: [
          if (controller.exams.isNotEmpty)
            GlassPress(
              onTap: () => unawaited(_pickExam(context)),
              child: Glass(
                height: 44,
                width: 150,
                radius: 24,
                onPigment: true,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Flexible(
                      child: Text(
                        controller.exam?.name ?? '',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.ts(color: onHero ?? context.app.ink, height: 1).copyWith(shadows: _shadow),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Icon(PhosphorIconsBold.caretDown, size: 13, color: onHero ?? context.app.ink),
                  ],
                ),
              ),
            ),
          GlassIconButton(
            icon: PhosphorIconsRegular.downloadSimple,
            label: 'results.download'.tr,
            color: onHero,
            onTap: () => ToastHelper.show('results.downloaded', kind: ToastKind.success),
          ),
        ],
        topPadding: 0,
        padContent: false,
        onRefresh: controller.load,
        children: [
          if (result == null)
            Padding(
              padding: EdgeInsets.fromLTRB(20, inset.top + 70, 20, 0),
              child: ViewStateView(
                state: controller.state.value,
                onRetry: controller.load,
                errorKey: controller.errorMessage.value,
                emptyArt: EmptyArt.columns,
                emptyHint: 'results.empty_hint',
                emptyTitle: 'results.none_title',
                emptyBody: 'results.none',
                child: const SizedBox.shrink(),
              ),
            )
          else ...[
            _Columns(result: result, height: heroH),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Align(
                alignment: Alignment.centerRight,
                child: Text(
                  'results.out_of'.trp({'n': '${result.subjects.firstOrNull?.maxMarks ?? 0}'}),
                  style: context.type.tiny,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: _Summary(controller: controller, result: result),
            ),
          ],
        ],
      );
    });
  }

  Future<void> _pickExam(BuildContext context) => showSheet<void>(
    SheetBody(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 16),
          Text('results.pick_exam'.tr, style: context.type.h2),
          const SizedBox(height: 12),
          for (var i = 0; i < controller.exams.length; i++)
            Pressable(
              onTap: () {
                controller.examIndex.value = i;
                Get.back<void>();
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Row(
                  children: [
                    Expanded(child: Text(controller.exams[i].name, style: context.type.t)),
                    Text(
                      '${controller.resultFor(controller.exams[i])?.overallPercent.round() ?? 0}%',
                      style: context.type.cap,
                    ),
                    const SizedBox(width: 12),
                    if (i == controller.examIndex.value)
                      Icon(PhosphorIconsBold.check, size: 18, color: context.app.ink),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 16),
        ],
      ),
    ),
  );
}

final _shadow = [Shadow(color: AppColors.amoled.chalk.withValues(alpha: 0.3), blurRadius: 6, offset: const Offset(0, 1))];

class _Columns extends StatelessWidget {
  const _Columns({required this.result, required this.height});

  final ExamResult result;
  final double height;

  @override
  Widget build(BuildContext context) {
    final marks = [...result.subjects]..sort((a, b) => (b.marks / b.maxMarks).compareTo(a.marks / a.maxMarks));
    return SizedBox(
      height: height,
      child: LayoutBuilder(
        builder: (context, box) {
          final n = marks.length;
          final w = (box.maxWidth - 4 - (n - 1) * 3) / n;
          return Stack(
            children: [
              for (var i = 0; i < n; i++)
                _Column(
                  mark: marks[i],
                  left: 2 + i * (w + 3),
                  width: w,
                  maxHeight: height - 6,
                  delay: i,
                ),
            ],
          );
        },
      ),
    );
  }
}

class _Column extends StatelessWidget {
  const _Column({
    required this.mark,
    required this.left,
    required this.width,
    required this.maxHeight,
    required this.delay,
  });

  final SubjectMark mark;
  final double left;
  final double width;
  final double maxHeight;
  final int delay;

  @override
  Widget build(BuildContext context) {
    final pigment = AppColors.subject(mark.subject);
    final pct = mark.marks / mark.maxMarks * 100;
    // Scale from 60% so differences between strong subjects stay visible.
    final h = math.max(64, ((pct - 60) / 40).clamp(0, 1) * (maxHeight - 64) + 64).toDouble();
    return Positioned(
      left: left,
      top: 0,
      width: width,
      height: h,
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: context.reduceMotion ? 1 : .2, end: 1),
        duration: AppMotion.t4 + AppMotion.stagger * delay,
        curve: kSpring,
        builder: (context, t, child) => Transform(
          alignment: Alignment.topCenter,
          transform: Matrix4.diagonal3Values(1, t, 1),
          child: child,
        ),
        child: Semantics(
          label: '${subjectName(mark.subject)} ${mark.marks} / ${mark.maxMarks}',
          child: Container(
            decoration: BoxDecoration(
              color: pigment.fill,
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12)),
            ),
            padding: const EdgeInsets.only(bottom: 12),
            alignment: Alignment.bottomCenter,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${mark.marks}', style: AppText.h3(color: pigment.on, height: 1)),
                const SizedBox(height: 2),
                Text(
                  subjectAbbr[mark.subject] ?? '',
                  style: AppText.o(color: pigment.on.withValues(alpha: .9)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.controller, required this.result});

  final ResultsController controller;
  final ExamResult result;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final prev = controller.previous;
    final trend = result.trend;
    final changes = controller.changes.take(3).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Rise(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              BigNumber(value: '${result.overallPercent.round()}', unit: '%', size: 68),
              const SizedBox(width: 12),
              Flexible(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Stamp('results.grade'.trp({'g': result.grade}), color: AppColors.ok),
                      const SizedBox(height: 6),
                      Text(
                        'results.rank'.trp({'rank': '${result.rank}', 'total': '${result.totalStudents}'}),
                        style: AppText.capB(color: c.ink3, height: 1.2),
                      ),
                    ],
                  ),
                ),
              ),
              const Spacer(),
              if (trend.length > 1)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: SizedBox(
                    width: 90,
                    height: 46,
                    child: Semantics(
                      label: 'results.trend'.trp({'v': trend.map((t) => '${t.percent.round()}').join(', ')}),
                      child: CustomPaint(painter: _Spark(trend.map((t) => t.percent).toList(), c.ink, c.chalk)),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        if (trend.length > 1)
          Rise(
            index: 1,
            child: Text(
              _trendLine(trend),
              style: context.type.s,
            ),
          ),
        if (changes.isNotEmpty && prev != null) ...[
          Rise(
            index: 2,
            child: SectionLabel('results.changed_since'.trp({'exam': controller.previousExam?.name ?? ''})),
          ),
          Rise(
            index: 3,
            child: EduCard(
              child: Column(
                children: [
                  for (var i = 0; i < changes.length; i++) ...[
                    if (i > 0) const Hr(indent: 68),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      child: Row(
                        children: [
                          Cover(subject: changes[i].$1.subject),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  subjectName(changes[i].$1.subject) +
                                      (i == 0 && changes[i].$2 > 0
                                          ? ' · ${'results.biggest_gain'.tr}'
                                          : changes[i].$2 < 0 && changes.where((x) => x.$2 < 0).length == 1
                                          ? ' · ${'results.only_dip'.tr}'
                                          : ''),
                                  style: context.type.t,
                                ),
                                Text(
                                  '${changes[i].$1.marks} / ${changes[i].$1.maxMarks} · ${changes[i].$1.grade}',
                                  style: context.type.cap,
                                ),
                              ],
                            ),
                          ),
                          Text(
                            changes[i].$2 > 0
                                ? '+${changes[i].$2}'
                                : changes[i].$2 == 0
                                ? '0'
                                : '−${changes[i].$2.abs()}',
                            style: AppText.t(color: changes[i].$2 >= 0 ? AppColors.ok : c.badText, height: 1),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  String _trendLine(List<TrendPoint> trend) {
    final last = trend.last;
    final earlier = trend.reversed.skip(1).toList();
    final parts = earlier
        .map((t) => 'results.trend_part'.trp({'p': '${t.percent.round()}', 'label': t.label}))
        .join(' ${'common.and'.tr} ');
    final up = last.percent >= trend[trend.length - 2].percent;
    return (up ? 'results.up_from' : 'results.down_from').trp({'parts': parts});
  }
}

class _Spark extends CustomPainter {
  _Spark(this.values, this.ink, this.chalk);

  final List<double> values;
  final Color ink;
  final Color chalk;

  @override
  void paint(Canvas canvas, Size size) {
    final lo = values.reduce(math.min) - 2;
    final hi = values.reduce(math.max) + 2;
    Offset at(int i) => Offset(
      4 + (size.width - 8) * i / (values.length - 1),
      size.height - 8 - (size.height - 16) * (values[i] - lo) / (hi - lo),
    );
    final path = Path()..moveTo(at(0).dx, at(0).dy);
    for (var i = 1; i < values.length; i++) {
      path.lineTo(at(i).dx, at(i).dy);
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = ink
        ..strokeWidth = 2.5
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    for (var i = 0; i < values.length - 1; i++) {
      canvas.drawCircle(at(i), 3, Paint()..color = ink);
    }
    final last = at(values.length - 1);
    canvas
      ..drawCircle(last, 4, Paint()..color = AppColors.mari)
      ..drawCircle(
        last,
        4,
        Paint()
          ..color = ink
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
  }

  @override
  bool shouldRepaint(_Spark old) => old.values != values || old.ink != ink;
}

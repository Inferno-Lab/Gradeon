import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:tangent/core/theme/app_typography.dart';
import 'package:tangent/core/theme/tokens.dart';
import 'package:tangent/core/utils/extensions.dart';
import 'package:tangent/core/widgets/empty_kit.dart';
import 'package:tangent/core/widgets/glass.dart';
import 'package:tangent/core/widgets/page.dart';
import 'package:tangent/core/widgets/sheets.dart';
import 'package:tangent/core/widgets/states.dart';
import 'package:tangent/core/widgets/toast.dart';
import 'package:tangent/core/widgets/ui.dart';
import 'package:tangent/data/models/academics.dart';
import 'package:tangent/features/exams_results/controllers/results_controller.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class ResultsView extends GetView<ResultsController> {
  const ResultsView({super.key});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      controller.examIndex.value;
      final result = controller.result;
      return PageFrame(
        leading: const BackGlass(),
        actions: [
          if (controller.exams.isNotEmpty)
            GlassPress(
              onTap: () => unawaited(_pickExam(context)),
              child: Glass(
                height: 44,
                radius: 22,
                onPigment: true,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(controller.exam?.name ?? '', maxLines: 1, style: AppText.ts(color: context.app.onDeep, height: 1)),
                    const SizedBox(width: 6),
                    Icon(PhosphorIconsBold.caretDown, size: 13, color: context.app.onDeep),
                  ],
                ),
              ),
            ),
          GlassIconButton(
            icon: PhosphorIconsRegular.downloadSimple,
            label: 'results.download'.tr,
            onTap: () => ToastHelper.show('results.downloaded', kind: ToastKind.success),
          ),
        ],
        onRefresh: controller.load,
        children: [
          // As the ParentResults board: the score as a ring with marks and rank on the school's deep colour.
          Builder(
            builder: (context) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const PageTitle('results.title'),
                if (result != null) ...[const SizedBox(height: 16), _Score(controller: controller, result: result)],
              ],
            ),
          ),
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyArt: EmptyArt.results,
            emptyHint: 'results.empty_hint',
            emptyTitle: 'results.none_title',
            emptyBody: 'results.none',
            child: result == null ? const SizedBox.shrink() : _Body(controller: controller, result: result),
          ),
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

class _Score extends StatelessWidget {
  const _Score({required this.controller, required this.result});

  final ResultsController controller;
  final ExamResult result;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final marks = result.subjects.fold<int>(0, (s, m) => s + m.marks);
    final max = result.subjects.fold<int>(0, (s, m) => s + m.maxMarks);
    final trend = result.trend;
    final change = trend.length > 1 ? (trend.last.percent - trend[trend.length - 2].percent).round() : null;
    final pct = result.overallPercent;
    return Row(
      children: [
        Semantics(
          label: '${pct.round()}%',
          child: SizedBox.square(
            dimension: 104,
            child: CustomPaint(
              painter: _Ring(pct / 100, track: c.deep3, fill: c.bright),
              child: Center(child: Text('${pct.round()}%', style: context.type.h3)),
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(controller.exam?.name ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.capB),
              const SizedBox(height: 4),
              Text('results.of_marks'.trp({'n': '$marks', 'max': '$max'}), style: context.type.h2),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  _Tag('results.rank'.trp({'rank': '${result.rank}', 'total': '${result.totalStudents}'}), color: c.ink),
                  if (change != null && change != 0)
                    _Tag(
                      (change > 0 ? 'results.up_n' : 'results.down_n').trp({'n': '${change.abs()}'}),
                      color: change > 0 ? c.bright : c.ink2,
                      icon: change > 0 ? PhosphorIconsBold.trendUp : PhosphorIconsBold.trendDown,
                    ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.text, {required this.color, this.icon});

  final String text;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(color: context.app.deep2, borderRadius: BorderRadius.circular(AppRadius.xs)),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[Icon(icon, size: 14, color: color), const SizedBox(width: 4)],
        Text(text, style: context.type.capB.copyWith(color: color)),
      ],
    ),
  );
}

class _Ring extends CustomPainter {
  _Ring(this.value, {required this.track, required this.fill});

  final double value;
  final Color track;
  final Color fill;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromCircle(center: size.center(Offset.zero), radius: size.width / 2 - 10);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round;
    canvas
      ..drawArc(rect, 0, math.pi * 2, false, paint..color = track)
      ..drawArc(rect, -math.pi / 2, math.pi * 2 * value.clamp(0, 1), false, paint..color = fill);
  }

  @override
  bool shouldRepaint(_Ring old) => old.value != value || old.fill != fill || old.track != track;
}

class _Body extends StatelessWidget {
  const _Body({required this.controller, required this.result});

  final ResultsController controller;
  final ExamResult result;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final prev = controller.previous;
    final changes = controller.changes.take(3).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Rise(
          child: EduCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('results.by_subject'.tr, style: context.type.h3),
                for (final m in result.subjects) ...[
                  const SizedBox(height: 12),
                  Semantics(
                    label: '${subjectName(m.subject)} ${m.marks} / ${m.maxMarks}',
                    excludeSemantics: true,
                    child: Row(
                      children: [
                        SizedBox(
                          width: 116,
                          child: Text(subjectName(m.subject), maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.b),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(AppRadius.xs),
                            child: SizedBox(
                              height: 10,
                              child: Stack(
                                children: [
                                  Positioned.fill(child: ColoredBox(color: c.paper3)),
                                  FractionallySizedBox(
                                    alignment: Alignment.centerLeft,
                                    heightFactor: 1,
                                    widthFactor: (m.marks / m.maxMarks).clamp(0, 1).toDouble(),
                                    child: DecoratedBox(
                                      decoration: BoxDecoration(
                                        color: c.subjectFor(m.subject).fill,
                                        borderRadius: BorderRadius.circular(AppRadius.xs),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        SizedBox(
                          width: 52,
                          child: Text('${m.marks}/${m.maxMarks}', textAlign: TextAlign.right, style: context.type.ts),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        if (changes.isNotEmpty && prev != null) ...[
          Rise(index: 1, child: SectionLabel('results.changed_since'.trp({'exam': controller.previousExam?.name ?? ''}))),
          Rise(
            index: 2,
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
                                  style: context.type.s,
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
                            style: AppText.t(color: changes[i].$2 >= 0 ? c.okText : c.badText, height: 1),
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
}

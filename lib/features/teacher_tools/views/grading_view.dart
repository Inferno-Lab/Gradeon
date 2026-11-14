import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/haptics.dart';
import 'package:gradeon/core/widgets/empty_kit.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/glass_controls.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/features/teacher_tools/controllers/teacher_controller.dart';
import 'package:gradeon/features/teacher_tools/views/teacher_action_bar.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:gradeon/core/utils/clock.dart';

// The answer sheet is drawn as paper: warm white, pencil and blue pen, all from the school's palette.
Color get _sheet => Color.lerp(AppColors.light.paper, AppColors.mari, .04)!;
Color get _pencil => Color.lerp(AppColors.light.ink, AppColors.late, .3)!;
Color get _pen => Color.lerp(AppColors.subject('maths').fill, AppColors.light.ink, .55)!;

class GradingView extends GetView<GradingController> {
  const GradingView({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Obx(() {
      controller.state.value;
      final items = controller.items;
      final queue = controller.queue;
      return PageFrame(
        leading: const BackGlass(),
        actions: [if (items.isNotEmpty) Chip2('teacher.oldest_first'.tr)],
        onRefresh: controller.load,
        edgeBar: true,
        bottomBar: queue.isEmpty
            ? null
            : TeacherActionBar(
                sub: 'teacher.next_in_queue'.tr,
                text: Text(
                  controller.names[queue.first.$2.studentId] ?? '',
                ),
                action: 'teacher.start_grading',
                onPressed: () => openGradeSheet(controller, 0),
              ),
        children: [
          Rise(child: Builder(builder: (context) => Text('teacher.to_grade_n'.trp({'n': '${controller.total}'}), style: context.type.h1))),
          const SizedBox(height: 16),
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyArt: EmptyArt.grading,
            emptyTitle: 'teacher.nothing_to_grade',
            emptyBody: 'teacher.nothing_to_grade_body',
            child: Column(
              children: [
                for (final (i, g) in items.indexed) ...[
                  if (i > 0) const SizedBox(height: 12),
                  Rise(
                    index: i + 1,
                    child: i == 0
                        ? _GradingCard(item: g, controller: controller)
                        : EduCard(
                            onTap: () => openGradeSheet(controller, queue.indexWhere((q) => q.$1 == g)),
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              children: [
                                Cover(subject: g.homework.subject),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(g.homework.title, style: context.type.t),
                                      Text(
                                        '${g.schoolClass == null ? '' : '${classLabel(g.schoolClass!)} · '}${'teacher.n_waiting'.trp({'n': '${g.waiting.length}'})}',
                                        style: context.type.cap,
                                      ),
                                    ],
                                  ),
                                ),
                                Icon(PhosphorIconsRegular.caretRight, size: 16, color: c.ink3),
                              ],
                            ),
                          ),
                  ),
                ],
              ],
            ),
          ),
        ],
      );
    });
  }
}

class _GradingCard extends StatelessWidget {
  const _GradingCard({required this.item, required this.controller});

  final GradingItem item;
  final GradingController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final h = item.homework;
    final total = h.submissions.length;
    final graded = item.graded;
    final waiting = item.waiting.length;
    final queue = controller.queue;
    final shown = item.waiting.take(3).toList();
    return EduCard(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Cover(subject: h.subject),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(h.title, style: context.type.t),
                    Text(
                      [
                        if (item.schoolClass != null) classLabel(item.schoolClass!),
                        'teacher.due_on'.trp({'date': DateFormat('EEE d MMM').format(h.dueOn)}),
                        'teacher.n_marks'.trn(h.maxMarks),
                      ].join(' · '),
                      style: context.type.cap,
                    ),
                  ],
                ),
              ),
              Stamp(
                'teacher.n_left'.trp({'n': '$waiting'}),
                color: c.dark ? AppColors.blackboard.mariText : AppColors.late,
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 8,
            child: Row(
              children: [
                if (graded > 0)
                  Expanded(
                    flex: graded,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.ok,
                        borderRadius: BorderRadius.horizontal(
                          left: const Radius.circular(2),
                          right: Radius.circular(waiting == 0 ? 4 : 0),
                        ),
                      ),
                    ),
                  ),
                if (graded > 0 && waiting > 0) const SizedBox(width: 2),
                if (waiting > 0)
                  Expanded(
                    flex: waiting,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.late,
                        borderRadius: BorderRadius.horizontal(
                          left: Radius.circular(graded == 0 ? 4 : 0),
                          right: const Radius.circular(2),
                        ),
                      ),
                    ),
                  ),
                if (total - graded - waiting > 0) ...[
                  const SizedBox(width: 2),
                  Expanded(
                    flex: total - graded - waiting,
                    child: Hatch(radius: BorderRadius.circular(2), child: const SizedBox.expand()),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'teacher.progress'.trp({
              'graded': '$graded',
              'waiting': '$waiting',
              'sent': '${item.submitted}',
              'total': '$total',
            }),
            style: context.type.cap,
          ),
          const SizedBox(height: 10),
          for (final (i, s) in shown.indexed) ...[
            Container(
              height: 1,
              margin: EdgeInsets.only(left: i == 0 ? 0 : 32),
              color: c.line,
            ),
            Pressable(
              onTap: () =>
                  openGradeSheet(controller, queue.indexWhere((q) => q.$1 == item && q.$2.studentId == s.studentId)),
              scale: .985,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Row(
                  children: [
                    const _Page(),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(controller.names[s.studentId] ?? s.studentId, style: context.type.t),
                          Text(
                            [sentLabel(s.submittedAt), if (s.fileName != null) s.fileName!].join(' · '),
                            style: context.type.cap,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    Text(agoLabel(s.submittedAt), style: context.type.cap),
                  ],
                ),
              ),
            ),
          ],
          if (waiting > shown.length)
            Padding(
              padding: const EdgeInsets.fromLTRB(0, 6, 0, 10),
              child: Text('teacher.n_more'.trp({'n': '${waiting - shown.length}'}), style: context.type.cap),
            ),
        ],
      ),
    );
  }
}

class _Page extends StatelessWidget {
  const _Page();

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 33,
    height: 41,
    child: Stack(
      children: [
        Positioned(
          left: 3,
          top: 3,
          child: Container(
            width: 30,
            height: 38,
            decoration: BoxDecoration(
              color: _sheet,
              borderRadius: BorderRadius.circular(2),
              border: Border.all(color: context.app.line2),
            ),
          ),
        ),
        Container(
          width: 30,
          height: 38,
          decoration: BoxDecoration(
            color: _sheet,
            borderRadius: BorderRadius.circular(2),
            border: Border.all(color: context.app.line2),
          ),
        ),
      ],
    ),
  );
}

/// Grade one submission: the page on top, marks and notes below.
class GradeSheetView extends StatefulWidget {
  const GradeSheetView({required this.controller, required this.start, super.key});

  final GradingController controller;
  final int start;

  @override
  State<GradeSheetView> createState() => _GradeSheetViewState();
}

class _GradeSheetViewState extends State<GradeSheetView> {
  static const _notes = ['teacher.note_neat', 'teacher.note_all', 'teacher.note_check', 'teacher.note_see_me'];

  late List<(GradingItem, HomeworkSubmission)> _queue = widget.controller.queue;
  late int _i = widget.start.clamp(0, _queue.isEmpty ? 0 : _queue.length - 1);
  final _feedback = TextEditingController();
  final _chips = <String>{};
  var _marks = 0;
  var _saving = false;

  @override
  void initState() {
    super.initState();
    _reset();
  }

  void _reset() {
    if (_queue.isEmpty) return;
    final h = _queue[_i].$1.homework;
    _marks = (h.maxMarks * .8).round();
    _chips.clear();
    _feedback.clear();
  }

  @override
  void dispose() {
    _feedback.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || _queue.isEmpty) return;
    final (g, s) = _queue[_i];
    setState(() => _saving = true);
    final note = [..._chips.map((k) => k.tr), if (_feedback.text.trim().isNotEmpty) _feedback.text.trim()].join('. ');
    final ok = await widget.controller.grade(
      homework: g.homework,
      studentId: s.studentId,
      marks: _marks,
      feedback: note,
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (!ok) return;
    Haptics.medium();
    final rest = [..._queue]..removeAt(_i);
    if (rest.isEmpty) {
      Get.back<void>();
      ToastHelper.show('teacher.all_graded', kind: ToastKind.success);
      return;
    }
    ToastHelper.show('teacher.graded', kind: ToastKind.success);
    setState(() {
      _queue = rest;
      _i = _i.clamp(0, rest.length - 1);
      _reset();
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final inset = MediaQuery.paddingOf(context);
    if (_queue.isEmpty) {
      return const PageFrame(
        leading: BackGlass(),
        children: [EmptyState(art: EmptyArt.grading, title: 'teacher.nothing_to_grade', body: 'teacher.nothing_to_grade_body')],
      );
    }
    final (g, s) = _queue[_i];
    final h = g.homework;
    final name = widget.controller.names[s.studentId] ?? s.studentId;
    final next = _queue.length > 1 ? _queue[(_i + 1) % _queue.length] : null;
    final grade = GradingController.gradeFor(_marks, h.maxMarks);
    final ratio = h.maxMarks == 0 ? 0.0 : _marks / h.maxMarks;
    final tone = ratio >= .7
        ? AppColors.ok
        : ratio >= .5
        ? AppColors.late
        : AppColors.bad;
    final paperH = 230 + inset.top;
    return Scaffold(
      backgroundColor: c.paper,
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: paperH + 40,
            child: ColoredBox(
              color: _pencil,
              child: Center(
                child: Transform.rotate(
                  angle: -.0175,
                  child: Container(
                    width: 310,
                    margin: EdgeInsets.only(top: inset.top + 40),
                    padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
                    decoration: BoxDecoration(
                      color: _sheet,
                      boxShadow: [
                        BoxShadow(color: AppColors.amoled.chalk.withValues(alpha: 0.6), blurRadius: 40, spreadRadius: -20, offset: const Offset(0, 20)),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(h.title, style: AppText.capB(color: _pen)),
                        const SizedBox(height: 4),
                        Text(
                          s.fileName ?? 'teacher.no_file'.tr,
                          style: context.type.mono.copyWith(color: _pen),
                        ),
                        for (final w in const [.9, .72, .84, .66, .88, .58])
                          FractionallySizedBox(
                            widthFactor: w,
                            child: Container(
                              height: 2,
                              margin: const EdgeInsets.only(top: 16),
                              decoration: BoxDecoration(
                                color: AppColors.subject('maths').fill.withValues(alpha: 0.5),
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            left: 16,
            right: 16,
            top: inset.top + 8,
            child: Row(
              children: [
                const BackGlass(color: AppColors.white),
                const Spacer(),
                Glass(
                  height: 44,
                  width: 130,
                  onPigment: true,
                  child: Center(
                    child: Text(
                      'teacher.n_of'.trp({'i': '${_i + 1}', 'n': '${_queue.length}'}),
                      style: AppText.chip(color: AppColors.white, height: 1, tabular: true),
                    ),
                  ),
                ),
                const Spacer(),
                GlassIconButton(
                  icon: PhosphorIconsRegular.caretRight,
                  label: 'teacher.skip'.tr,
                  color: AppColors.white,
                  onTap: _queue.length < 2
                      ? null
                      : () => setState(() {
                          _i = (_i + 1) % _queue.length;
                          _reset();
                        }),
                ),
              ],
            ),
          ),
          Positioned.fill(
            top: paperH,
            child: Container(
              decoration: BoxDecoration(
                color: c.paper,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                border: Border(top: BorderSide(color: c.line)),
              ),
              child: ListView(
                padding: EdgeInsets.fromLTRB(20, 20, 20, inset.bottom + 120),
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(name, style: context.type.t),
                            Text('${h.title} · ${sentLabel(s.submittedAt)}', style: context.type.cap),
                          ],
                        ),
                      ),
                      Stamp('$grade · $_marks/${h.maxMarks}', color: tone),
                    ],
                  ),
                  const SizedBox(height: 24),
                  GlassSlider(
                    value: h.maxMarks == 0 ? 0 : _marks / h.maxMarks,
                    divisions: h.maxMarks,
                    label: 'teacher.marks'.tr,
                    describe: (v) => '${(v * h.maxMarks).round()}',
                    fill: tone,
                    thumbWidth: 60,
                    thumbChild: Text('$_marks', style: AppText.ts(color: c.ink, height: 1, tabular: true)),
                    onChanged: (v) => setState(() => _marks = (v * h.maxMarks).round()),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('0', style: context.type.tiny),
                      Text('${h.maxMarks ~/ 2}', style: context.type.tiny),
                      Text('${h.maxMarks}', style: context.type.tiny),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Padding(
                    padding: const EdgeInsets.only(left: 4, bottom: 8),
                    child: Text('teacher.quick_notes'.tr, style: AppText.capB(color: c.ink2, height: 1.2)),
                  ),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final n in _notes)
                        Chip2(
                          n,
                          on: _chips.contains(n),
                          onTap: () => setState(() => _chips.contains(n) ? _chips.remove(n) : _chips.add(n)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Field(controller: _feedback, hint: 'teacher.feedback_hint', minHeight: 52, maxLines: 3),
                ],
              ),
            ),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: (MediaQuery.viewInsetsOf(context).bottom > 0
                ? MediaQuery.viewInsetsOf(context).bottom + 12
                : 28 + inset.bottom),
            child: TeacherActionBar(
              text: Text(
                _queue.length - 1 == 0
                    ? 'teacher.last_one'.tr
                    : 'teacher.left_after'.trp({'n': '${_queue.length - 1}'}),
                style: AppText.capB(color: c.ink3),
              ),
              action: next == null
                  ? 'teacher.save'
                  : 'teacher.save_next'.trp({
                      'name': (widget.controller.names[next.$2.studentId] ?? '').split(' ').first,
                    }),
              loading: _saving,
              onPressed: _saving ? null : () => unawaited(_save()),
            ),
          ),
        ],
      ),
    );
  }
}

// ───────────────────────────── Marks entry ─────────────────────────────

String agoLabel(DateTime? t) {
  if (t == null) return '';
  final days = DateUtils.dateOnly(Clock.now()).difference(DateUtils.dateOnly(t)).inDays;
  if (days <= 0) return 'common.today'.tr.toLowerCase();
  return days == 1 ? 'teacher.one_day'.tr : 'teacher.n_days'.trn(days);
}

String sentLabel(DateTime? t) {
  if (t == null) return '';
  return DateUtils.isSameDay(t, Clock.now())
      ? 'teacher.sent_today'.trp({'time': DateFormat('H:mm').format(t)})
      : 'teacher.sent_on'.trp({'date': DateFormat('EEE d MMM').format(t)});
}

void openGradeSheet(GradingController controller, int index) => unawaited(
  Get.to<void>(
    () => GradeSheetView(controller: controller, start: index),
    transition: Transition.downToUp,
  ),
);

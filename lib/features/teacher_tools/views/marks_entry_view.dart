import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/empty_art.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/student.dart';
import 'package:gradeon/features/teacher_tools/controllers/teacher_controller.dart';
import 'package:gradeon/features/teacher_tools/views/teacher_action_bar.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class MarksEntryView extends StatefulWidget {
  const MarksEntryView({super.key});

  @override
  State<MarksEntryView> createState() => _MarksEntryViewState();
}

class _MarksEntryViewState extends State<MarksEntryView> {
  MarksEntryController get controller => Get.find<MarksEntryController>();
  final _input = TextEditingController();
  final _focus = FocusNode();

  @override
  void dispose() {
    _input.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _edit(Student s) {
    controller.active.value = s.id;
    final v = controller.values[s.id];
    _input.text = v == null ? '' : (v == MarksEntryController.absentMark ? 'Ab' : '$v');
    _input.selection = TextSelection(baseOffset: 0, extentOffset: _input.text.length);
    _focus.requestFocus();
  }

  void _commit(String text) {
    final id = controller.active.value;
    if (id == null) return;
    final t = text.trim().toLowerCase();
    if (t.isEmpty) {
      controller.put(id, null);
    } else if (t == 'ab' || t == 'a') {
      controller.put(id, MarksEntryController.absentMark);
    } else {
      final n = int.tryParse(t);
      if (n == null || n < 0 || n > MarksEntryController.maxMarks) {
        ToastHelper.show(
          'teacher.marks_range'.trp({'max': '${MarksEntryController.maxMarks}'}),
          kind: ToastKind.error,
        );
        return;
      }
      controller.put(id, n);
    }
  }

  void _next() {
    _commit(_input.text);
    final n = controller.nextEmpty;
    if (n == null) {
      _focus.unfocus();
      ToastHelper.show('teacher.marks_complete', kind: ToastKind.success);
      return;
    }
    _edit(n);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Obx(() {
      controller.values.length;
      final cls = controller.schoolClass;
      final active = controller.active.value;
      final next = controller.nextEmpty;
      final avg = controller.average;
      final high = controller.highest;
      return PageFrame(
        leading: const BackGlass(),
        actions: [
          Chip2('teacher.marks_chip'.trp({'max': '${MarksEntryController.maxMarks}'})),
        ],
        bottomBar: controller.students.isEmpty
            ? null
            : TeacherActionBar(
                sub: controller.saving.value ? 'teacher.saving'.tr : 'teacher.saved_typing'.tr,
                text: Text(
                  next == null ? 'teacher.all_entered'.tr : 'teacher.next_name'.trp({'name': next.name}),
                  style: context.type.ts,
                ),
                action: 'teacher.next',
                kind: BtnKind.ink,
                icon: PhosphorIconsRegular.arrowBendDownLeft,
                onPressed: next == null && active == null ? null : _next,
              ),
        children: [
          Builder(builder: (context) => Text(
            cls == null ? 'teacher.marks'.tr : 'teacher.marks_title'.trp({'class': classLabel(cls)}),
            style: context.type.h2,
          )),
          const SizedBox(height: 12),
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyArt: EmptyArt.attendance,
            emptyTitle: 'teacher.no_students',
            emptyBody: 'teacher.no_students_body',
            child: Column(
              children: [
                _SubjectBar(
                  controller: controller,
                  onPick: (id) {
                    _focus.unfocus();
                    unawaited(controller.pickSubject(id));
                  },
                ),
                const SizedBox(height: 12),
                EduCard(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    children: [
                      _Stat(value: avg == null ? '—' : avg.toStringAsFixed(1), label: 'teacher.average'),
                      _Stat(value: high == null ? '—' : '$high', label: 'teacher.highest'),
                      _Stat(
                        value: '${controller.missing}',
                        label: 'teacher.to_enter',
                        color: controller.missing > 0 ? (c.dark ? AppColors.blackboard.mariText : AppColors.late) : null,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                EduCard(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Column(
                    children: [
                      for (final s in controller.students)
                        _MarkRow(
                          student: s,
                          value: controller.values[s.id],
                          active: active == s.id,
                          input: _input,
                          focus: _focus,
                          onTap: () => _edit(s),
                          onSubmit: (_) => _next(),
                          onChanged: _commit,
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    });
  }
}

class _SubjectBar extends StatelessWidget {
  const _SubjectBar({required this.controller, required this.onPick});

  final MarksEntryController controller;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Semantics(
      label: 'teacher.subject'.tr,
      container: true,
      child: Glass(
        height: 48,
        radius: 24,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.all(4),
          child: Row(
            children: [
              for (final id in controller.subjects)
                Semantics(
                  selected: controller.subject.value == id,
                  button: true,
                  child: Pressable(
                    onTap: () => onPick(id),
                    child: AnimatedContainer(
                      duration: AppMotion.t3,
                      height: 40,
                      constraints: const BoxConstraints(minWidth: 72),
                      alignment: Alignment.center,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      decoration: BoxDecoration(
                        color: controller.subject.value == id ? AppColors.subject(id).fill : Colors.transparent,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        subjectName(id),
                        style: AppText.chip(
                          height: 1,
                          color: controller.subject.value == id ? AppColors.subject(id).on : c.ink3,
                        ),
                      ),
                    ),),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label, this.color});

  final String value;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Column(
      children: [
        Text(value, style: AppText.num(color: color ?? context.app.ink)),
        const SizedBox(height: 2),
        Text(label.tr, style: context.type.cap),
      ],
    ),
  );
}

class _MarkRow extends StatelessWidget {
  const _MarkRow({
    required this.student,
    required this.value,
    required this.active,
    required this.input,
    required this.focus,
    required this.onTap,
    required this.onSubmit,
    required this.onChanged,
  });

  final Student student;
  final int? value;
  final bool active;
  final TextEditingController input;
  final FocusNode focus;
  final VoidCallback onTap;
  final ValueChanged<String> onSubmit;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final absent = value == MarksEntryController.absentMark;
    return Semantics(
      button: !active,
      label:
          '${student.name}, ${value == null
              ? 'teacher.no_marks'.tr
              : absent
              ? 'teacher.absent'.tr
              : '$value'}',
      child: Pressable(
        onTap: active ? null : onTap,
        child: AnimatedContainer(
          duration: AppMotion.t2,
          color: active ? c.mariSoft : Colors.transparent,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              SizedBox(
                width: 26,
                child: Text(student.rollNo, style: context.type.mono.copyWith(color: c.ink3)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(student.name, style: context.type.t, maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
              Container(
                width: 64,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: active ? c.paper : c.paper2,
                  borderRadius: BorderRadius.circular(12),
                  border: active ? Border.all(color: c.ink, width: 2) : null,
                ),
                child: active
                    ? TextField(
                        controller: input,
                        focusNode: focus,
                        autofocus: true,
                        textAlign: TextAlign.center,
                        keyboardType: const TextInputType.numberWithOptions(),
                        textInputAction: TextInputAction.next,
                        inputFormatters: [
                          FilteringTextInputFormatter.allow(RegExp('[0-9aAbB]')),
                          LengthLimitingTextInputFormatter(3),
                        ],
                        onSubmitted: onSubmit,
                        onChanged: onChanged,
                        style: AppText.t(color: c.ink, height: 1),
                        cursorColor: c.ink,
                        decoration: const InputDecoration(
                          isCollapsed: true,
                          filled: false,
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                        ),
                      )
                    : Text(
                        value == null
                            ? '—'
                            : absent
                            ? 'Ab'
                            : '$value',
                        style: value == null
                            ? AppText.s(color: c.ink3, height: 1)
                            : AppText.t(color: absent ? c.badText : c.ink, height: 1),
                      ),
              ),
            ],
          ),
        ),),
    );
  }
}

// ───────────────────────────── Post a notice ─────────────────────────────

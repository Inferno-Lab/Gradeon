import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/features/teacher_tools/controllers/teacher_controller.dart';
import 'package:gradeon/features/teacher_tools/views/teacher_action_bar.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class AssignHomeworkView extends GetView<AssignHomeworkController> {
  const AssignHomeworkView({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Obx(() {
      final classId = controller.classId.value;
      final due = controller.due.value;
      final days = controller.days;
      final clash = due == null ? const <String>[] : controller.dueByDay[DateUtils.dateOnly(due)] ?? const <String>[];
      final cls = controller.classes.where((x) => x.id == classId).firstOrNull;
      return PageFrame(
        leading: const BackGlass(close: true),
        actions: [
          AnimatedOpacity(
            opacity: controller.draftSaved.value ? 1 : 0,
            duration: AppMotion.t3,
            child: Text('teacher.draft_saved'.tr, style: AppText.capB(color: c.ink3)),
          ),
        ],
        topPadding: MediaQuery.paddingOf(context).top + 56,
        bottomBar: TeacherActionBar(
          text: Text(
            'teacher.reach'.trn(controller.roster.value),
            style: AppText.capB(color: c.ink3),
          ),
          action: 'teacher.assign',
          loading: controller.saving.value,
          onPressed: controller.saving.value ? null : () => unawaited(controller.submit()),
        ),
        children: [
          Text('teacher.new_homework'.tr, style: context.type.h2),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final x in controller.classes)
                      Chip2(classLabel(x), on: x.id == classId, onTap: () => unawaited(controller.pickClass(x.id))),
                  ],
                ),
              ),
              Cover(subject: controller.subject, width: 30, height: 38),
            ],
          ),
          const SizedBox(height: 16),
          Field(
            controller: controller.title,
            label: 'teacher.title',
            hint: 'teacher.title_hint',
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 12),
          Field(
            controller: controller.body,
            label: 'teacher.instructions',
            hint: 'teacher.instructions_hint',
            maxLines: 4,
            minHeight: 70,
            keyboard: TextInputType.multiline,
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text('teacher.due'.tr, style: AppText.capB(color: c.ink2, height: 1.2)),
          ),
          Row(
            children: [
              for (final (i, d) in days.indexed) ...[
                if (i > 0) const SizedBox(width: 6),
                Expanded(
                  child: Semantics(
                    button: true,
                    selected: due != null && DateUtils.isSameDay(d, due),
                    label: DateFormat('EEEE d MMMM').format(d),
                    excludeSemantics: true,
                    child: Pressable(
                      onTap: () => controller.due.value = d,
                      child: AnimatedContainer(
                        duration: AppMotion.t2,
                        height: 58,
                        decoration: BoxDecoration(
                          color: due != null && DateUtils.isSameDay(d, due) ? c.ink : c.paper,
                          borderRadius: BorderRadius.circular(14),
                          border: due != null && DateUtils.isSameDay(d, due) ? null : Border.all(color: c.line),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              '${d.day}',
                              style: AppText.t(color: due != null && DateUtils.isSameDay(d, due) ? c.chalk : c.ink, height: 1.1),
                            ),
                            Text(
                              DateFormat('EEE').format(d).toUpperCase(),
                              style: AppText.tiny(color: due != null && DateUtils.isSameDay(d, due)
                                    ? c.chalk.withValues(alpha: .7)
                                    : c.ink3, height: 1.1),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
          if (cls != null && due != null) ...[
            const SizedBox(height: 6),
            Text(
              clash.contains(controller.subject)
                  ? 'teacher.clash_same'.trp({
                      'subject': subjectName(controller.subject),
                      'class': classLabel(cls),
                    })
                  : clash.isEmpty
                  ? 'teacher.clash_none'.trp({'class': classLabel(cls)})
                  : 'teacher.clash_other'.trp({
                      'subject': subjectName(controller.subject),
                      'class': classLabel(cls),
                      'others': clash.toSet().map(subjectName).join(', '),
                    }),
              style: context.type.cap,
            ),
          ],
          const SizedBox(height: 12),
          EduCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                Expanded(child: Text('teacher.marks'.tr, style: context.type.t)),
                _Step(icon: PhosphorIconsRegular.minus, label: 'teacher.fewer', onTap: () => controller.step(-5)),
                SizedBox(
                  width: 44,
                  child: Text(
                    '${controller.marks.value}',
                    textAlign: TextAlign.center,
                    style: context.type.h3.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
                  ),
                ),
                _Step(icon: PhosphorIconsRegular.plus, label: 'teacher.more', onTap: () => controller.step(5)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 16,
            runSpacing: 8,
            children: [
              _Link(
                icon: PhosphorIconsRegular.camera,
                label: 'teacher.photo_board',
                onTap: () => unawaited(_pick(ImageSource.camera)),
              ),
              _Link(
                icon: PhosphorIconsRegular.paperclip,
                label: 'teacher.attach',
                onTap: () => unawaited(_pick(ImageSource.gallery)),
              ),
              for (final a in controller.attachments)
                Chip2(a, icon: PhosphorIconsRegular.x, height: 32, onTap: () => controller.attachments.remove(a)),
            ],
          ),
        ],
      );
    });
  }

  Future<void> _pick(ImageSource source) async {
    try {
      final file = await ImagePicker().pickImage(source: source, imageQuality: 75);
      if (file != null) controller.attachments.add(file.name);
    } on Exception {
      ToastHelper.show('teacher.attach_failed', kind: ToastKind.error);
    }
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: label.tr,
    excludeSemantics: true,
    child: Pressable(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(color: context.app.paper2, shape: BoxShape.circle),
        child: Icon(icon, size: 18, color: context.app.ink),
      ),
    ),
  );
}

class _Link extends StatelessWidget {
  const _Link({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18, color: context.app.ink2),
          const SizedBox(width: 6),
          Text(label.tr, style: AppText.capB(color: context.app.ink2)),
        ],
      ),
    ),
  );
}

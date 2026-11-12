import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/glass_controls.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/features/teacher_tools/controllers/teacher_controller.dart';
import 'package:gradeon/features/teacher_tools/views/teacher_action_bar.dart';

class PostNoticeView extends GetView<PostNoticeController> {
  const PostNoticeView({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final me = Get.find<AuthService>().user.value?.name ?? '';
    return Obx(() {
      controller.preview.value;
      final cls = controller.own == null ? '' : classLabel(controller.own!);
      final title = controller.title.text.trim();
      final body = controller.body.text.trim();
      final tone = switch (controller.category.value) {
        'exams' => c.badText,
        'fees' => c.dark ? AppColors.blackboard.mariText : AppColors.late,
        'holiday' || 'events' => AppColors.ok,
        _ => c.mariText,
      };
      return PageFrame(
        leading: const BackGlass(close: true),
        actions: [Text('teacher.preview_live'.tr, style: AppText.capB(color: c.ink3))],
        topPadding: MediaQuery.paddingOf(context).top + 56,
        bottomBar: TeacherActionBar(
          text: Text(
            'teacher.notified'.trn(controller.reach),
            style: AppText.capB(color: c.ink3),
          ),
          action: 'teacher.post',
          loading: controller.saving.value,
          onPressed: controller.saving.value ? null : () => unawaited(controller.submit()),
        ),
        children: [
          Builder(builder: (context) => Text('teacher.new_notice'.tr, style: context.type.h2)),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text('teacher.who'.tr, style: AppText.capB(color: c.ink2, height: 1.2)),
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final a in PostNoticeController.audiences)
                Chip2(
                  a == 'school' ? 'teacher.aud_school'.tr : 'teacher.aud_$a'.trp({'class': cls}),
                  on: controller.audience.value == a,
                  onTap: () => controller.audience.value = a,
                ),
            ],
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text('teacher.type'.tr, style: AppText.capB(color: c.ink2, height: 1.2)),
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final k in PostNoticeController.categories)
                Chip2('notices.cat_$k', on: controller.category.value == k, onTap: () => controller.category.value = k),
            ],
          ),
          const SizedBox(height: 12),
          Field(controller: controller.title, hint: 'teacher.notice_title', textInputAction: TextInputAction.next),
          const SizedBox(height: 10),
          Field(
            controller: controller.body,
            hint: 'teacher.notice_body',
            maxLines: 5,
            minHeight: 66,
            keyboard: TextInputType.multiline,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('teacher.pin'.tr, style: context.type.ts),
                    Text('teacher.pin_hint'.tr, style: context.type.cap),
                  ],
                ),
              ),
              GlassSwitch(
                value: controller.pinned.value,
                label: 'teacher.pin'.tr,
                onChanged: (v) => controller.pinned.value = v,
              ),
            ],
          ),
          SectionLabel('teacher.preview'.tr, top: 18),
          const SizedBox(height: 4),
          Transform.rotate(
            angle: context.reduceMotion ? 0 : -.0175,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                  decoration: BoxDecoration(
                    color: c.paper,
                    borderRadius: BorderRadius.circular(7),
                    border: Border.all(color: c.line),
                    boxShadow: [
                      BoxShadow(color: AppColors.light.ink.withValues(alpha: 0.45), blurRadius: 24, spreadRadius: -14, offset: const Offset(0, 10)),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Stamp('notices.cat_${controller.category.value}'.tr, color: tone, size: 10),
                      const SizedBox(height: 10),
                      Text(
                        title.isEmpty ? 'teacher.notice_title'.tr : title,
                        style: context.type.t.copyWith(color: title.isEmpty ? c.ink3 : null),
                      ),
                      if (body.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(body, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.s),
                      ],
                      const SizedBox(height: 6),
                      Text('$me · ${'teacher.now'.tr}', style: context.type.cap),
                    ],
                  ),
                ),
                Positioned(
                  top: -7,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: BoxDecoration(color: AppColors.subject('maths').fill, shape: BoxShape.circle),
                    ),
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

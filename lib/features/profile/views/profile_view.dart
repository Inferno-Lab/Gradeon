import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/school_config.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/features/profile/controllers/profile_controller.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

final _houseColors = {
  'Emerald': AppColors.ok,
  'Sapphire': AppColors.subject('maths').fill,
  'Ruby': AppColors.subject('hindi').fill,
  'Amber': AppColors.houses[3],
};

class ProfileView extends GetView<ProfileController> {
  const ProfileView({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthService>();
    return Obx(() {
      controller.state.value;
      final user = auth.user.value;
      final role = user?.role;
      final student = controller.student;
      final teacher = controller.teacher;
      return PageFrame(
        dockPage: true,
        topPadding: MediaQuery.paddingOf(context).top + 14,
        onRefresh: controller.load,
        children: [
          Row(
            children: [
              Expanded(child: Builder(builder: (context) => Text('profile.title'.tr, style: context.type.h1))),
              GlassIconButton(
                icon: PhosphorIconsRegular.slidersHorizontal,
                label: 'menu.settings'.tr,
                onTap: () => Get.toNamed<void>(AppRoutes.settings),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (student != null)
                  Rise(
                    child: _IdCard(
                      color: _houseColors[student.house] ?? Avatar.houseFor(student.name),
                      name: student.name,
                      photo: role == UserRole.student ? user?.avatarUrl : null,
                      facts: [
                        (
                          SchoolConfig.classWord.isEmpty ? 'profile.class'.tr : SchoolConfig.classWord,
                          '${controller.schoolClass?.name.replaceAll(RegExp('[^0-9]'), '') ?? ''} ${controller.schoolClass?.section ?? ''} · ${'fees.roll'.trp({'n': student.rollNo})}',
                        ),
                        ('profile.house'.tr, student.house),
                        ('profile.born'.tr, _dob(student.dob)),
                        ('profile.blood'.tr, student.bloodGroup),
                      ],
                      code:
                          'GIS-${controller.schoolClass?.name.replaceAll(RegExp('[^0-9]'), '') ?? ''}${controller.schoolClass?.section ?? ''}-${student.rollNo}',
                      onPhoto: role == UserRole.student ? () => unawaited(controller.editPhoto()) : null,
                    ),
                  )
                else if (teacher != null)
                  Rise(
                    child: _IdCard(
                      color: AppColors.subject(teacher.subject).fill,
                      name: teacher.name,
                      photo: user?.avatarUrl,
                      facts: [
                        ('profile.subject'.tr, subjectName(teacher.subject)),
                        (
                          'profile.classes'.tr,
                          controller.teaching
                              .map((c) => '${c.name.replaceAll(RegExp('[^0-9]'), '')} ${c.section}')
                              .join(', '),
                        ),
                        ('profile.phone'.tr, teacher.phone),
                        ('profile.role'.tr, 'profile.teacher'.tr),
                      ],
                      code: teacher.id.toUpperCase().replaceAll('_', '-'),
                      onPhoto: () => unawaited(controller.editPhoto()),
                    ),
                  ),
                Rise(index: 1, child: SectionLabel('profile.around'.tr, top: 20)),
                Rise(index: 2, child: _Tiles(teacher: role == UserRole.teacher)),
                if (student != null) ...[
                  const SizedBox(height: 12),
                  Rise(
                    index: 3,
                    child: EduCard(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        child: Row(
                          children: [
                            Avatar(
                              student.guardianName,
                              size: 32,
                              background: context.app.paper2,
                              foreground: context.app.ink,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    role == UserRole.parent && user?.name == student.guardianName
                                        ? '${student.guardianName} · ${'profile.you'.tr}'
                                        : '${student.guardianName} · ${'profile.guardian'.tr}',
                                    style: context.type.ts,
                                  ),
                                  Text(student.guardianPhone, style: context.type.cap),
                                ],
                              ),
                            ),
                          ],
                        ),
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

  static String _dob(String iso) {
    final d = DateTime.tryParse(iso);
    return d == null ? iso : DateFormat('d MMM y').format(d);
  }
}

class _IdCard extends StatelessWidget {
  const _IdCard({
    required this.color,
    required this.name,
    required this.facts,
    required this.code,
    this.photo,
    this.onPhoto,
  });

  final Color color;
  final String name;
  final String? photo;
  final List<(String, String)> facts;
  final String code;
  final VoidCallback? onPhoto;

  @override
  Widget build(BuildContext context) {
    final on = color == AppColors.houses[3] ? AppColors.mariInk : AppColors.white;
    final now = DateTime.now();
    final start = now.month >= 6 ? now.year : now.year - 1;
    TextStyle k() => AppText.o(color: on.withValues(alpha: .75), height: 1.2);
    final local = photo != null && photo!.isNotEmpty && !photo!.startsWith('http');
    final initials = Text(Avatar.initialsOf(name), style: AppText.h2(color: color, height: 1));
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(color: AppColors.light.ink.withValues(alpha: 0.7), blurRadius: 40, spreadRadius: -24, offset: const Offset(0, 20)),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            right: -68,
            top: -68,
            child: Container(
              width: 180,
              height: 180,
              decoration: BoxDecoration(color: AppColors.white.withValues(alpha: 0.08), shape: BoxShape.circle),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      AppConfig.schoolName.toUpperCase(),
                      style: k(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text('$start–${(start + 1) % 100}', style: k()),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 78,
                    height: 96,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: AppColors.light.paper, borderRadius: BorderRadius.circular(12)),
                    clipBehavior: Clip.antiAlias,
                    child: local
                        ? Image.file(
                            File(photo!),
                            fit: BoxFit.cover,
                            width: 78,
                            height: 96,
                            errorBuilder: (_, _, _) => initials,
                          )
                        : initials,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, style: context.type.h2.copyWith(color: on)),
                        const SizedBox(height: 10),
                        LayoutBuilder(
                          builder: (context, box) => Wrap(
                            spacing: 10,
                            runSpacing: 8,
                            children: [
                              for (final f in facts)
                                SizedBox(
                                  width: (box.maxWidth - 10) / 2,
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(f.$1.toUpperCase(), style: k()),
                                      const SizedBox(height: 2),
                                      Text(f.$2, style: AppText.ts(color: on), maxLines: 2),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Text(code, style: context.type.mono.copyWith(color: on.withValues(alpha: .85))),
                  ),
                  if (onPhoto != null)
                    GlassPress(
                      onTap: onPhoto,
                      child: Semantics(
                        button: true,
                        child: Glass(
                          height: 36,
                          width: 120,
                          radius: 18,
                          onPigment: on == AppColors.white,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(PhosphorIconsRegular.camera, size: 15, color: on),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(
                                  'profile.new_photo'.tr,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: AppText.capB(color: on, height: 1),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Tiles extends StatelessWidget {
  const _Tiles({required this.teacher});

  final bool teacher;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    SubjectColor s(String id) => AppColors.subject(id);
    // A tile only for a module the school has (console: Modules).
    const has = SchoolConfig.has;
    final tiles = <(IconData, String, String, Color, Color)>[
      if (!teacher && has('notices'))
        (PhosphorIconsRegular.megaphone, 'menu.notices', AppRoutes.notices, c.mariSoft, c.mariText),
      if (has('events'))
        (PhosphorIconsRegular.calendarBlank, 'menu.events', AppRoutes.events, s('science').fill, s('science').on),
      if (!teacher && has('transport'))
        (PhosphorIconsRegular.bus, 'menu.transport', AppRoutes.transport, s('social').fill, s('social').on),
      if (!teacher && has('library'))
        (PhosphorIconsRegular.bookOpen, 'menu.library', AppRoutes.library, s('computer').fill, s('computer').on),
      if (has('gallery')) (PhosphorIconsRegular.image, 'menu.gallery', AppRoutes.gallery, s('hindi').fill, s('hindi').on),
      if (!teacher)
        (PhosphorIconsRegular.calendarCheck, 'menu.leave', AppRoutes.leave, s('english').fill, s('english').on),
      if (teacher) (PhosphorIconsRegular.bell, 'menu.notifications', AppRoutes.notifications, c.mariSoft, c.mariText),
    ];
    return LayoutBuilder(
      builder: (context, box) {
        final w = (box.maxWidth - 16) / 3;
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final t in tiles)
              SizedBox(
                width: w,
                child: Semantics(
                  button: true,
                  label: t.$2.tr,
                  excludeSemantics: true,
                  child: Pressable(
                    onTap: () => Get.toNamed<void>(t.$3),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: c.paper,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: c.line),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 34,
                            height: 34,
                            decoration: BoxDecoration(color: t.$4, borderRadius: BorderRadius.circular(10)),
                            child: Icon(t.$1, size: 18, color: t.$5),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            t.$2.tr,
                            style: context.type.chip,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/haptics.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/student.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// Loads the parent's children once; shared by the capsule and the popover.
class ChildrenCache {
  static final _cache = <String, (Student, SchoolClass)>{};

  static Future<List<(Student, SchoolClass)>> load(List<String> ids) async {
    final directory = Get.find<DirectoryRepository>();
    final out = <(Student, SchoolClass)>[];
    for (final id in ids) {
      final hit = _cache[id];
      if (hit != null) {
        out.add(hit);
        continue;
      }
      final student = await directory.student(id);
      final cls = await directory.schoolClass(student.classId);
      out.add(_cache[id] = (student, cls));
    }
    return out;
  }
}

String shortClass(SchoolClass c) => '${c.name.replaceAll(RegExp('[^0-9]'), '')} ${c.section}';

/// Glass capsule with stacked child avatars. Tap to open the switcher,
/// swipe sideways to switch straight away.
class ChildCapsule extends StatefulWidget {
  const ChildCapsule({super.key});

  @override
  State<ChildCapsule> createState() => _ChildCapsuleState();
}

class _ChildCapsuleState extends State<ChildCapsule> {
  List<(Student, SchoolClass)> _kids = const [];
  final _anchor = GlobalKey();

  @override
  void initState() {
    super.initState();
    final ids = Get.find<AuthService>().user.value?.childIds ?? const [];
    unawaited(
      ChildrenCache.load(ids).then((kids) {
        if (mounted) setState(() => _kids = kids);
      }),
    );
  }

  Future<void> _switchBy(int step) async {
    if (_kids.length < 2) return;
    final auth = Get.find<AuthService>();
    final i = _kids.indexWhere((k) => k.$1.id == auth.activeStudentId.value);
    final next = _kids[(i + step) % _kids.length].$1.id;
    Haptics.selection();
    await auth.switchChild(next);
  }

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthService>();
    return Obx(() {
      final active = auth.activeStudentId.value;
      final current = _kids.where((k) => k.$1.id == active).firstOrNull ?? _kids.firstOrNull;
      final others = _kids.where((k) => k.$1.id != current?.$1.id).toList();
      final family = [for (final k in _kids) k.$1.name];
      final label = current == null ? '' : '${current.$1.name.split(' ').first} · ${shortClass(current.$2)}';
      return Semantics(
        button: true,
        label: 'home.viewing_child'.trp({'name': label}),
        child: GestureDetector(
          onHorizontalDragEnd: (d) => _switchBy((d.primaryVelocity ?? 0) < 0 ? 1 : -1),
          child: GlassPress(
            onTap: () => _open(context),
            child: Glass(
              key: _anchor,
              height: 44,
              padding: const EdgeInsets.only(left: 6, right: 12),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (current != null)
                    Avatar(
                      current.$1.name,
                      initials: Avatar.siblingInitials(current.$1.name, family),
                      size: 30,
                      background: AppColors.light.paper,
                      foreground: AppColors.light.ink,
                    ),
                  for (final k in others.take(1))
                    Transform.translate(
                      offset: const Offset(-10, 0),
                      child: Avatar(
                        k.$1.name,
                        initials: Avatar.siblingInitials(k.$1.name, family),
                        size: 30,
                        background: Color.lerp(AppColors.subject('hindi').fill, AppColors.light.paper, .8),
                        foreground: AppColors.subject('hindi').fill,
                      ),
                    ),
                  SizedBox(width: others.isEmpty ? 8 : 0),
                  Text(
                    label,
                    style: AppText.chip(color: context.app.ink, height: 1),
                  ),
                  const SizedBox(width: 4),
                  Icon(PhosphorIconsBold.caretDown, size: 13, color: context.app.ink),
                ],
              ),
            ),
          ),
        ),
      );
    });
  }

  Future<void> _open(BuildContext context) async {
    final box = _anchor.currentContext?.findRenderObject() as RenderBox?;
    final origin = box?.localToGlobal(Offset.zero) ?? const Offset(16, 52);
    await showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'common.close'.tr,
      barrierColor: Colors.transparent,
      transitionDuration: context.reduceMotion ? Duration.zero : AppMotion.t4,
      pageBuilder: (context, _, _) => _SwitcherPopover(kids: _kids, top: origin.dy + 52, left: origin.dx),
      transitionBuilder: (context, animation, _, child) {
        final t = CurvedAnimation(parent: animation, curve: kSpring, reverseCurve: kEase);
        return FadeTransition(
          opacity: animation,
          child: ScaleTransition(
            alignment: Alignment.topLeft,
            scale: Tween<double>(begin: .6, end: 1).animate(t),
            child: child,
          ),
        );
      },
    );
  }
}

class _SwitcherPopover extends StatelessWidget {
  const _SwitcherPopover({required this.kids, required this.top, required this.left});

  final List<(Student, SchoolClass)> kids;
  final double top;
  final double left;

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthService>();
    final c = context.app;
    final active = auth.activeStudentId.value;
    final colors = [AppColors.subject('maths').fill, AppColors.subject('hindi').fill];
    return Stack(
      children: [
        Positioned(
          left: left,
          top: top,
          width: 300,
          child: Material(
            type: MaterialType.transparency,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Glass(
                  radius: 999,
                  tint: c.dark ? AppColors.blackboard.paper.withValues(alpha: 0.95) : AppColors.light.paper.withValues(alpha: 0.97),
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (var i = 0; i < kids.length; i++)
                        _Option(
                          selected: kids[i].$1.id == active,
                          avatar: Avatar(
                            kids[i].$1.name,
                            initials: Avatar.siblingInitials(kids[i].$1.name, [for (final k in kids) k.$1.name]),
                            background: colors[i % 2],
                          ),
                          title: kids[i].$1.name,
                          subtitle: 'home.child_line'.trp({
                            'class': '${kids[i].$2.name} ${kids[i].$2.section}',
                            'roll': kids[i].$1.rollNo,
                          }),
                          onTap: () async {
                            Get.back<void>();
                            await auth.switchChild(kids[i].$1.id);
                          },
                        ),
                      Container(
                        height: 1,
                        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        color: c.line,
                      ),
                      _Option(
                        selected: false,
                        avatar: Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(color: c.paper2, shape: BoxShape.circle),
                          child: Icon(PhosphorIconsRegular.columns, size: 18, color: c.ink),
                        ),
                        title: 'home.both_side'.tr,
                        subtitle: 'home.both_side_sub'.tr,
                        onTap: () => Get.back<void>(),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: 280,
                  child: Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Text('home.swipe_tip'.tr, style: context.type.cap),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Option extends StatelessWidget {
  const _Option({
    required this.selected,
    required this.avatar,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final bool selected;
  final Widget avatar;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Semantics(
      selected: selected,
      button: true,
      child: Pressable(
        onTap: onTap,
        scale: .98,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? c.ink.withValues(alpha: .06) : Colors.transparent,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(
            children: [
              avatar,
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: context.type.t, maxLines: 1, overflow: TextOverflow.ellipsis),
                    Text(subtitle, style: context.type.cap, maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              if (selected) Icon(PhosphorIconsBold.check, size: 18, color: c.ink),
            ],
          ),
        ),
      ),
    );
  }
}

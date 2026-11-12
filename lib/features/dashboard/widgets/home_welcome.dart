import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/empty_kit.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/features/shell/shell_controller.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

List<(IconData, String, String, VoidCallback)> _firstSteps() => [
  (PhosphorIconsRegular.chatCircle, 'home.step_chat', 'home.step_chat_sub', () => ShellController.showTab('chat')),
  (PhosphorIconsRegular.identificationCard, 'home.step_profile', 'home.step_profile_sub', () => ShellController.showTab('profile')),
  (PhosphorIconsRegular.bellRinging, 'home.step_alerts', 'home.step_alerts_sub', () => Get.toNamed<void>(AppRoutes.settings)),
];

/// What Home shows before the school has put anything in: a welcome and three
/// first steps, so a new family lands on something useful, not an empty page.
class HomeWelcome extends StatelessWidget {
  const HomeWelcome({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final steps = _firstSteps();
    return EduCard(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Center(child: EmptyArtView(EmptyArt.home)),
          const SizedBox(height: 12),
          Text('home.welcome_title'.trp({'school': AppConfig.schoolName.split(' ').first}), style: context.type.h2),
          const SizedBox(height: 6),
          Text('home.welcome_body'.tr, style: context.type.b.copyWith(color: c.ink2)),
          const SizedBox(height: 12),
          Overline('home.first_steps'.tr),
          const SizedBox(height: 4),
          _StepList(steps: steps),
        ],
      ),
    );
  }
}

class _StepList extends StatelessWidget {
  const _StepList({required this.steps});

  final List<(IconData, String, String, VoidCallback)> steps;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Column(
      children: [
        for (final (i, s) in steps.indexed) ...[
          if (i > 0) const Hr(indent: 52),
          Pressable(
            onTap: s.$4,
            scale: .985,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: i == 0 ? context.app.brand : c.paper2,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(s.$1, size: 20, color: i == 0 ? context.app.onBrand : c.ink),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(s.$2.tr, style: context.type.ts),
                        Text(s.$3.tr, style: context.type.cap),
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
    );
  }
}

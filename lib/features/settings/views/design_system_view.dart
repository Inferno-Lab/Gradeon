import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/services/theme_service.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/glass_controls.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/datasources/mock_json_datasource.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// Developer page: live glass samples and switches for testing states.
class DesignSystemView extends StatefulWidget {
  const DesignSystemView({super.key});

  @override
  State<DesignSystemView> createState() => _DesignSystemViewState();
}

class _DesignSystemViewState extends State<DesignSystemView> {
  var _frameMs = 0.0;
  Timer? _tick;

  void _onTimings(List<FrameTiming> timings) {
    if (timings.isEmpty) return;
    final total = timings.fold<int>(0, (sum, t) => sum + t.totalSpan.inMicroseconds);
    _frameMs = total / timings.length / 1000;
  }

  @override
  void initState() {
    super.initState();
    SchedulerBinding.instance.addTimingsCallback(_onTimings);
    // The readout refreshes once a second; glass count is a plain counter.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    SchedulerBinding.instance.removeTimingsCallback(_onTimings);
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final theme = Get.find<ThemeService>();
    final hz = View.of(context).display.refreshRate.round();
    return PageFrame(
      leading: const BackGlass(),
      children: [
        Row(
          children: [
            Flexible(child: Text('dev.title'.tr, style: context.type.h2, maxLines: 1, overflow: TextOverflow.ellipsis)),
            const SizedBox(width: 10),
            Stamp('dev.developer'.tr, color: c.mariText),
          ],
        ),
        const SizedBox(height: 6),
        Text('dev.note'.tr, style: context.type.cap),
        const SizedBox(height: 16),
        ClipRRect(
          borderRadius: BorderRadius.circular(22),
          child: SizedBox(
            height: 150,
            child: Stack(
              children: [
                Positioned.fill(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final id in AppColors.subjects.keys)
                        Expanded(child: ColoredBox(color: AppColors.subject(id).fill)),
                    ],
                  ),
                ),
                Positioned(
                  left: 20,
                  top: 20,
                  child: GlassIconButton(
                    icon: PhosphorIconsRegular.magnifyingGlass,
                    label: 'dev.sample_button'.tr,
                    color: AppColors.white,
                    onTap: () {},
                  ),
                ),
                Positioned(
                  left: 76,
                  top: 20,
                  child: Glass(
                    width: 160,
                    height: 44,
                    onPigment: true,
                    child: Center(
                      child: Text('dev.sheet_glass'.tr, style: anek(15, 680, height: 1, color: AppColors.white)),
                    ),
                  ),
                ),
                const Positioned(
                  left: 20,
                  top: 80,
                  child: Glass(width: 120, height: 52, radius: 26, onPigment: true),
                ),
                Positioned(
                  left: 150,
                  top: 96,
                  child: Text(
                    'dev.lens_glass'.tr,
                    style: anek(13, 650, height: 1.2, color: AppColors.white).copyWith(
                      shadows: const [Shadow(color: Color(0x66000000), blurRadius: 6, offset: Offset(0, 1))],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        EduCard(
          child: Column(
            children: [
              Obx(
                () => _Row(
                  title: 'dev.quality',
                  hint: 'dev.quality_hint',
                  trailing: Chip2(
                    theme.reduceTransparency.value ? 'dev.q_off'.tr : 'dev.q_auto'.tr,
                    on: true,
                    height: 32,
                    onTap: () => theme.setReduceTransparency(value: !theme.reduceTransparency.value),
                  ),
                ),
              ),
              const Hr(),
              Obx(
                () => _Row(
                  title: 'dev.errors',
                  hint: 'dev.errors_hint',
                  trailing: GlassSwitch(
                    value: AppConfig.simulateErrors.value,
                    label: 'dev.errors'.tr,
                    onChanged: (v) => theme.setSimulateErrors(value: v),
                  ),
                ),
              ),
              const Hr(),
              Obx(
                () => _Row(
                  title: 'dev.empty',
                  hint: 'dev.empty_hint',
                  trailing: GlassSwitch(
                    value: AppConfig.emptyData.value,
                    label: 'dev.empty'.tr,
                    onChanged: (v) {
                      AppConfig.emptyData.value = v;
                      unawaited(Get.find<MockJsonDataSource>().reload());
                    },
                  ),
                ),
              ),
              const Hr(),
              Obx(
                () => _Row(
                  title: 'dev.slow',
                  hint: 'dev.slow_hint',
                  trailing: GlassSwitch(
                    value: AppConfig.slowNetwork.value,
                    label: 'dev.slow'.tr,
                    onChanged: (v) => AppConfig.slowNetwork.value = v,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'dev.readout'.trp({
            'ms': _frameMs.toStringAsFixed(1),
            'hz': '$hz',
          }),
          style: context.type.mono.copyWith(color: c.ink3),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.title, required this.hint, required this.trailing});

  final String title;
  final String hint;
  final Widget trailing;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title.tr, style: context.type.t.copyWith(fontSize: 15)),
              Text(hint.tr, style: context.type.cap),
            ],
          ),
        ),
        const SizedBox(width: 12),
        trailing,
      ],
    ),
  );
}

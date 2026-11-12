import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/storage_service.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// Progress of one beat. Spring curves overshoot; clamp so Opacity stays valid.
double _beat(double t, double from, double to, [Curve curve = kEase]) =>
    curve.transform(((t - from) / (to - from)).clamp(0.0, 1.0)).clamp(0.0, 1.0);

bool welcomePending() => !(Get.find<StorageService>().read<bool>(StorageKeys.welcomeSeen) ?? false);

Future<void> markWelcomeSeen() => Get.find<StorageService>().write(StorageKeys.welcomeSeen, true);

/// Full-screen welcome, shown once after the first sign-in. Same chalk language as splash.
class WelcomeOverlay extends StatefulWidget {
  const WelcomeOverlay({required this.onFinished, super.key});

  final VoidCallback onFinished;

  @override
  State<WelcomeOverlay> createState() => _WelcomeOverlayState();
}

class _WelcomeOverlayState extends State<WelcomeOverlay> with TickerProviderStateMixin {
  late final AnimationController _enter = AnimationController(
    vsync: this,
    duration: AppMotion.introStep,
  );
  late final AnimationController _exit = AnimationController(
    vsync: this,
    duration: AppMotion.t4,
  );
  late final AnimationController _breathe = AnimationController(
    vsync: this,
    duration: AppMotion.intro,
  );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (context.reduceMotion) {
        _enter.value = 1;
        return;
      }
      unawaited(_enter.forward().then((_) {
        if (mounted && !context.reduceMotion) unawaited(_breathe.repeat(reverse: true));
      }));
    });
  }

  @override
  void dispose() {
    _enter.dispose();
    _exit.dispose();
    _breathe.dispose();
    super.dispose();
  }

  Future<void> _continue() async {
    await markWelcomeSeen();
    if (!mounted) return;
    if (context.reduceMotion) {
      widget.onFinished();
      return;
    }
    await _exit.forward();
    if (mounted) widget.onFinished();
  }

  @override
  Widget build(BuildContext context) {
    final still = context.reduceMotion;
    final c = context.app;
    final name = (Get.find<AuthService>().user.value?.name ?? '').split(' ').first;
    final tips = [
      (PhosphorIconsRegular.chatCircle, 'home.step_chat'.tr),
      (PhosphorIconsRegular.identificationCard, 'home.step_profile'.tr),
      (PhosphorIconsRegular.bellRinging, 'home.step_alerts'.tr),
    ];
    return AnimatedBuilder(
      animation: Listenable.merge([_enter, _exit, _breathe]),
      builder: (context, _) {
        final t = still ? 1.0 : _enter.value;
        final out = still ? 0.0 : _exit.value;
        final breath = still || !_breathe.isAnimating ? 0.0 : kEase.transform(_breathe.value);

        final cells = _beat(t, 0, .55);
        final hello = _beat(t, .4, .62);
        final body = _beat(t, .5, .72);
        final chips = _beat(t, .6, .85);
        final cta = _beat(t, .72, .95, kSpring);

        final leave = (1 - out).clamp(0.0, 1.0);

        return Opacity(
          opacity: leave,
          child: Transform.translate(
            offset: Offset(0, 28 * out),
            child: Material(
              color: c.chalk,
              child: SafeArea(
                child: LayoutBuilder(
                  // A short phone (320x640) scrolls; taller ones keep the spaced layout.
                  builder: (context, box) => SingleChildScrollView(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(minHeight: box.maxHeight),
                      child: IntrinsicHeight(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(32, 24, 32, 32),
                          child: Column(
                            children: [
                              const Spacer(flex: 2),
                              // The SignIn board's cell art filling in on the school's deep colour.
                              Container(
                                padding: const EdgeInsets.all(20),
                                decoration: BoxDecoration(color: c.deep, borderRadius: BorderRadius.circular(AppRadius.sheet)),
                                child: Transform.scale(scale: 1 + .02 * breath, child: CellArt(rows: 4, reveal: cells, width: math.min(240, MediaQuery.sizeOf(context).width - 104))),
                              ),
                              const SizedBox(height: 24),
                              Opacity(
                                opacity: hello,
                                child: Transform.translate(
                                  offset: Offset(0, 18 * (1 - hello)),
                                  child: Text(
                                    'welcome.hello'.trp({'name': name.isEmpty ? AppConfig.appName : name}),
                                    textAlign: TextAlign.center,
                                    style: context.type.h1,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              Opacity(
                                opacity: body,
                                child: Transform.translate(
                                  offset: Offset(0, 14 * (1 - body)),
                                  child: Text(
                                    'welcome.body'.tr,
                                    textAlign: TextAlign.center,
                                    style: context.type.b.copyWith(color: c.ink2),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 24),
                              Opacity(
                                opacity: chips,
                                child: Transform.translate(
                                  offset: Offset(0, 16 * (1 - chips)),
                                  child: Column(
                                    children: [
                                      for (final (i, tip) in tips.indexed)
                                        Opacity(
                                          opacity: _beat(t, .6 + i * .05, .78 + i * .05),
                                          child: Padding(
                                            padding: EdgeInsets.only(bottom: i == tips.length - 1 ? 0 : 10),
                                            child: _TipChip(icon: tip.$1, label: tip.$2, highlight: i == 0),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                              const Spacer(flex: 3),
                              Opacity(
                                opacity: cta,
                                child: Transform.scale(
                                  scale: .9 + .1 * cta,
                                  child: SizedBox(
                                    width: double.infinity,
                                    child: Btn('welcome.continue', expand: true, onPressed: _continue),
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
              ),
            ),
          ),
        );
      },
    );
  }
}

class _TipChip extends StatelessWidget {
  const _TipChip({required this.icon, required this.label, required this.highlight});

  final IconData icon;
  final String label;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return EduCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: highlight ? context.app.brand : c.paper2,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 20, color: highlight ? context.app.onBrand : c.ink),
          ),
          const SizedBox(width: 12),
          Expanded(child: Text(label, style: context.type.ts)),
        ],
      ),
    );
  }
}

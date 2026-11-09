import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/features/auth/controllers/splash_controller.dart';

/// Progress of one beat inside the splash timeline.
double _beat(double t, double from, double to, [Curve curve = kEase]) =>
    curve.transform(((t - from) / (to - from)).clamp(0.0, 1.0));

/// Three notebooks fan open under a warm glow; the name and school rise after.
class SplashView extends GetView<SplashController> {
  const SplashView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.app.chalk,
      // Until the window has its final size the screen stays plain chalk, like
      // the native launch screen, so a first frame at transient metrics is never seen.
      body: const _SettledSize(child: _Mark()),
    );
  }
}

/// Shows [child] once the window size has stopped changing for a moment.
class _SettledSize extends StatefulWidget {
  const _SettledSize({required this.child});

  final Widget child;

  @override
  State<_SettledSize> createState() => _SettledSizeState();
}

class _SettledSizeState extends State<_SettledSize> with WidgetsBindingObserver {
  Timer? _timer;
  var _ready = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _wait();
  }

  @override
  void didChangeMetrics() {
    if (!_ready) _wait();
  }

  void _wait() {
    _timer?.cancel();
    _timer = Timer(AppMotion.t2, () {
      if (mounted) setState(() => _ready = true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _ready ? widget.child : const SizedBox.expand();
}

class _Mark extends StatefulWidget {
  const _Mark();

  @override
  State<_Mark> createState() => _MarkState();
}

class _MarkState extends State<_Mark> with TickerProviderStateMixin {
  late final AnimationController _enter = AnimationController(
    vsync: this,
    duration: AppMotion.introStep,
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
    _breathe.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final still = context.reduceMotion;
    final c = context.app;
    return AnimatedBuilder(
      animation: Listenable.merge([_enter, _breathe]),
      builder: (context, _) {
        final t = still ? 1.0 : _enter.value;
        final breath = still ? 0.0 : kEase.transform(_breathe.value);

        final glow = _beat(t, 0, .28);
        final stack = _beat(t, .06, .42, kSpring);
        final fan = _beat(t, .22, .62, kSpring);
        final name = _beat(t, .48, .72);
        final school = _beat(t, .58, .82);
        final tag = _beat(t, .72, .95);

        final glowScale = .72 + .28 * glow + .04 * breath * glow;
        final glowOpacity = (.5 + .12 * breath) * glow;

        return SizedBox.expand(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(flex: 5),
              SizedBox(
                width: 270,
                height: 230,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Opacity(
                      opacity: glowOpacity,
                      child: Transform.scale(
                        scale: glowScale,
                        child: Container(
                          width: 250,
                          height: 250,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: RadialGradient(
                              colors: [
                                AppColors.mari.withValues(alpha: .5),
                                AppColors.mari.withValues(alpha: 0),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    _Book(
                      subject: 'maths',
                      left: 32 + 48 * (1 - fan),
                      top: 24 + 36 * (1 - stack),
                      angle: -.26 * fan,
                      rise: stack,
                    ),
                    _Book(
                      subject: 'science',
                      left: 152 - 48 * (1 - fan),
                      top: 24 + 36 * (1 - stack),
                      angle: .26 * fan,
                      rise: stack,
                    ),
                    _Book(
                      subject: 'hindi',
                      left: 92,
                      top: 10 + 28 * (1 - stack),
                      angle: 0,
                      rise: stack,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Opacity(
                opacity: name,
                child: Transform.translate(
                  offset: Offset(0, 18 * (1 - name)),
                  child: Text(
                    AppConfig.appName,
                    textAlign: TextAlign.center,
                    style: AppText.dl(color: c.ink),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Opacity(
                opacity: school,
                child: Transform.translate(
                  offset: Offset(0, 12 * (1 - school)),
                  child: Text(
                    AppConfig.schoolName,
                    textAlign: TextAlign.center,
                    style: context.type.cap,
                  ),
                ),
              ),
              const Spacer(flex: 4),
              Opacity(
                opacity: tag,
                child: Transform.translate(
                  offset: Offset(0, 8 * (1 - tag)),
                  child: Text(
                    AppConfig.schoolTagline,
                    textAlign: TextAlign.center,
                    style: context.type.cap,
                  ),
                ),
              ),
              SizedBox(height: 44 + MediaQuery.paddingOf(context).bottom),
            ],
          ),
        );
      },
    );
  }
}

class _Book extends StatelessWidget {
  const _Book({
    required this.subject,
    required this.left,
    required this.top,
    required this.angle,
    required this.rise,
  });

  final String subject;
  final double left;
  final double top;
  final double angle;
  final double rise;

  @override
  Widget build(BuildContext context) {
    final r = rise.clamp(0.0, 1.0);
    return Positioned(
      left: left,
      top: top,
      child: Opacity(
        opacity: r,
        child: Transform.rotate(
          angle: angle,
          alignment: Alignment.bottomCenter,
          child: Transform.scale(
            scale: .86 + .14 * r,
            alignment: Alignment.bottomCenter,
            child: Container(
              width: 86,
              height: 168,
              decoration: BoxDecoration(
                color: AppColors.subject(subject).fill,
                borderRadius: const BorderRadius.horizontal(
                  left: Radius.circular(6),
                  right: Radius.circular(14),
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.light.ink.withValues(alpha: 0.4).withValues(alpha: .25 + .4 * r),
                    blurRadius: 18 + 14 * r,
                    spreadRadius: -12,
                    offset: Offset(0, 8 + 8 * r),
                  ),
                ],
              ),
              foregroundDecoration: spineDecoration,
            ),
          ),
        ),
      ),
    );
  }
}

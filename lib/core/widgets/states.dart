import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/services/connectivity_service.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/view_state.dart';
import 'package:gradeon/core/widgets/empty_kit.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class ViewStateView extends StatelessWidget {
  const ViewStateView({
    required this.state,
    required this.child,
    required this.onRetry,
    this.emptyTitle = 'empty.title',
    this.emptyBody = 'empty.body',
    this.emptyArt = EmptyArt.home,
    this.emptyActions = const [],
    this.emptyHint,
    this.errorKey,
    this.skeleton,
    super.key,
  });

  final ViewState state;
  final Widget child;
  final VoidCallback onRetry;
  final String emptyTitle;
  final String emptyBody;
  final EmptyArt emptyArt;
  final List<EmptyAction> emptyActions;
  final String? emptyHint;
  final String? errorKey;
  final Widget? skeleton;

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: context.reduceMotion ? Duration.zero : AppMotion.t2,
      child: switch (state) {
        ViewState.loading => KeyedSubtree(key: const ValueKey('loading'), child: skeleton ?? const SkeletonList()),
        ViewState.empty => EmptyState(
          key: const ValueKey('empty'),
          title: emptyTitle,
          body: emptyBody,
          art: emptyArt,
          actions: emptyActions,
          hint: emptyHint,
        ),
        ViewState.error => ErrorState(key: const ValueKey('error'), messageKey: errorKey, onRetry: onRetry),
        ViewState.success => KeyedSubtree(key: const ValueKey('ok'), child: child),
      },
    );
  }
}

/// A button under an empty state: the next thing the person can do.
class EmptyAction {
  const EmptyAction(this.label, {required this.onTap, this.icon, this.primary = false});

  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  final bool primary;
}

/// What a screen shows while it has nothing yet: a scene of what will be here,
/// what to expect, and something useful to do meanwhile.
class EmptyState extends StatelessWidget {
  const EmptyState({
    required this.title,
    required this.body,
    this.art = EmptyArt.home,
    this.actions = const [],
    this.hint,
    super.key,
  });

  final String title;
  final String body;
  final EmptyArt art;
  final List<EmptyAction> actions;

  /// A small note in a well, e.g. when to expect the content.
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 340),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              EmptyArtView(art),
              const SizedBox(height: 20),
              Text(title.tr, style: context.type.h2, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text(body.tr, style: context.type.b.copyWith(color: c.ink2), textAlign: TextAlign.center),
              if (hint != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(color: c.paper2, borderRadius: BorderRadius.circular(12)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(PhosphorIconsRegular.clockCountdown, size: 16, color: c.ink3),
                      const SizedBox(width: 8),
                      Flexible(child: Text(hint!.tr, style: context.type.cap)),
                    ],
                  ),
                ),
              ],
              if (actions.isNotEmpty) ...[
                const SizedBox(height: 20),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    for (final a in actions)
                      Btn(
                        a.label,
                        kind: a.primary ? BtnKind.primary : BtnKind.quiet,
                        icon: a.icon,
                        small: true,
                        onPressed: a.onTap,
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class ClosedNotebooks extends StatelessWidget {
  const ClosedNotebooks({super.key});

  @override
  Widget build(BuildContext context) {
    Widget book(String subject, double dx, double angle) => Transform.translate(
      offset: Offset(dx, 0),
      child: Transform.rotate(
        angle: angle,
        child: Container(
          width: 150,
          height: 22,
          decoration: BoxDecoration(
            color: AppColors.subject(subject).fill,
            borderRadius: BorderRadius.circular(2),
            boxShadow: [BoxShadow(color: AppColors.amoled.chalk.withValues(alpha: 0.18), offset: const Offset(0, -4), spreadRadius: -2)],
          ),
        ),
      ),
    );
    return Column(
      children: [
        book('hindi', 6, -.052),
        book('science', 0, .026),
        book('maths', 8, -.017),
        book('english', 2, .035),
      ],
    );
  }
}

class ErrorState extends StatelessWidget {
  const ErrorState({required this.onRetry, this.messageKey, super.key});

  final VoidCallback onRetry;
  final String? messageKey;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Overline('errors.title'.tr, color: context.app.badText),
          const SizedBox(height: 10),
          Text('errors.didnt_load'.tr, style: context.type.h2),
          const SizedBox(height: 8),
          Text((messageKey ?? 'errors.generic').tr, style: context.type.b.copyWith(color: context.app.ink2)),
          const SizedBox(height: 16),
          Btn('common.retry', kind: BtnKind.ink, icon: PhosphorIconsRegular.arrowClockwise, onPressed: onRetry),
        ],
      ),
    );
  }
}

/// Skeleton blocks share the glass light: one sweep travels across them all.
class SkeletonList extends StatelessWidget {
  const SkeletonList({this.rows = 3, super.key});

  final int rows;

  @override
  Widget build(BuildContext context) {
    return Sweep(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SkeletonBox(width: 150, height: 12),
          const SizedBox(height: 12),
          const SkeletonBox(width: 240, height: 30, radius: 10),
          const SizedBox(height: 20),
          EduCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Column(
              children: [
                for (var i = 0; i < rows; i++)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(
                      children: [
                        const SkeletonBox(width: 42, height: 52, radius: 6),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              FractionallySizedBox(widthFactor: i.isEven ? .8 : .6, child: const SkeletonBox()),
                              const SizedBox(height: 8),
                              FractionallySizedBox(widthFactor: i.isEven ? .5 : .4, child: const SkeletonBox(height: 12)),
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
    );
  }
}

class SkeletonBox extends StatelessWidget {
  const SkeletonBox({this.width, this.height = 14, this.radius = 12, super.key});

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) => Container(
    width: width,
    height: height,
    decoration: BoxDecoration(color: context.app.paper2, borderRadius: BorderRadius.circular(radius)),
  );
}

/// One specular sweep shared by every skeleton under it.
class Sweep extends StatefulWidget {
  const Sweep({required this.child, super.key});

  final Widget child;

  @override
  State<Sweep> createState() => _SweepState();
}

class _SweepState extends State<Sweep> with SingleTickerProviderStateMixin {
  // Created in initState so dispose never looks up ancestors on a dead element
  // (a late field first touched in dispose used to throw when Reduce motion skipped build).
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: AppMotion.loop);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (context.reduceMotion) {
      _c.stop();
    } else if (!_c.isAnimating) {
      unawaited(_c.repeat());
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (context.reduceMotion) return widget.child;
    final glint = context.app.dark ? AppColors.white.withValues(alpha: 0.13) : AppColors.white.withValues(alpha: 0.85);
    return AnimatedBuilder(
      animation: _c,
      child: widget.child,
      builder: (context, child) {
        final t = kEase.transform(_c.value);
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (rect) => LinearGradient(
            begin: Alignment(-1.6 + 3.2 * t, -.3),
            end: Alignment(-.6 + 3.2 * t, .3),
            colors: [Colors.transparent, glint, Colors.transparent],
            stops: const [.3, .5, .7],
          ).createShader(rect),
          child: child,
        );
      },
    );
  }
}

/// Glass capsule shown under the top controls while offline.
class OfflineCapsule extends StatelessWidget {
  const OfflineCapsule({super.key});

  @override
  Widget build(BuildContext context) {
    if (!Get.isRegistered<ConnectivityService>()) return const SizedBox.shrink();
    return Obx(() {
      final net = Get.find<ConnectivityService>();
      if (net.isOnline.value) return const SizedBox.shrink();
      final since = net.lastSynced.value;
      return Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Center(
          child: Glass(
            height: 44,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(PhosphorIconsRegular.wifiSlash, size: 16, color: context.app.ink),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    since == null ? 'common.offline'.tr : 'common.offline_since'.trp({'time': TimeOfDay.fromDateTime(since).format(context)}),
                    style: AppText.capB(color: context.app.ink, height: 1),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    });
  }
}

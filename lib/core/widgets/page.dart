import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// Space a tab page leaves for the floating dock.
const kDockClearance = 112.0;

/// Phone page: content scrolls beneath floating glass controls at the top and
/// an optional glass bar at the bottom.
class PageFrame extends StatelessWidget {
  const PageFrame({
    required this.children,
    this.leading,
    this.actions = const [],
    this.bottomBar,
    this.bottomBarHeight = 64,
    this.background,
    this.onRefresh,
    this.dockPage = false,
    this.underlay,
    this.topPadding,
    this.padContent = true,
    this.topFade = true,
    this.controller,
    super.key,
  });

  final List<Widget> children;
  final Widget? leading;
  final List<Widget> actions;
  final Widget? bottomBar;
  final double bottomBarHeight;
  final Color? background;
  final Future<void> Function()? onRefresh;

  /// Leaves room for the shell's dock instead of a bottom bar.
  final bool dockPage;

  /// Full-bleed art behind the top controls (pigment hero, ribbon, map).
  final Widget? underlay;

  /// Overrides where content starts (default: below the top controls).
  final double? topPadding;
  final bool padContent;

  /// Thin status-bar scrim; off where art already fills the top edge.
  final bool topFade;
  final ScrollController? controller;

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.paddingOf(context);
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    final top = inset.top + 8;
    // On a tab page a bottom bar floats above the dock.
    final barLift = dockPage ? 76.0 : 0.0;
    final bottomSpace = bottomBar != null
        ? bottomBarHeight + 48 + barLift + inset.bottom
        : dockPage
        ? kDockClearance + inset.bottom
        : 32 + inset.bottom;
    final hasTopRow = leading != null || actions.isNotEmpty;
    // On tablets the reading column stays phone-like and centred.
    final side = padContent ? math.max<double>(20, (MediaQuery.sizeOf(context).width - 720) / 2) : 0.0;
    final list = ListView(
      controller: controller,
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      padding: EdgeInsets.fromLTRB(side, topPadding ?? (hasTopRow ? top + 58 : top + 8), side, bottomSpace),
      children: [
        if (underlay == null) const OfflineCapsule(),
        ...children,
      ],
    );
    return Scaffold(
      backgroundColor: background ?? context.app.chalk,
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          if (onRefresh == null)
            Positioned.fill(child: list)
          else
            Positioned.fill(
              child: _PullToRefresh(onRefresh: onRefresh!, top: top + 10, child: list),
            ),
          // A thin scrim keeps the clock readable over text. Nothing else covers content: glass has to
          // show what scrolls beneath it, and page-coloured bands read as dark shadows in dark themes.
          if (underlay == null && topFade)
            Positioned(
              left: 0,
              right: 0,
              top: 0,
              height: inset.top + 10,
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        (background ?? context.app.chalk).withValues(alpha: .96),
                        (background ?? context.app.chalk).withValues(alpha: 0),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          if (hasTopRow)
            Positioned(
              left: 16,
              right: 16,
              top: top,
              child: Row(
                children: [
                  ?leading,
                  const Spacer(),
                  for (var i = 0; i < actions.length; i++) ...[
                    if (i > 0) const SizedBox(width: 10),
                    actions[i],
                  ],
                ],
              ),
            ),
          if (bottomBar != null)
            Positioned(
              left: 16,
              right: 16,
              // Rides above the keyboard when the bar holds a text field.
              bottom: keyboard > 0 ? keyboard + 12 : 28 + barLift + inset.bottom,
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 520),
                  child: bottomBar,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Glass back button; pops the current route.
class BackGlass extends StatelessWidget {
  const BackGlass({this.close = false, this.onTap, this.color, super.key});

  final bool close;
  final VoidCallback? onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) => GlassIconButton(
    icon: close ? PhosphorIconsRegular.x : PhosphorIconsRegular.caretLeft,
    label: close ? 'common.close'.tr : 'common.back'.tr,
    color: color,
    onTap: onTap ?? () => Get.back<void>(),
  );
}

/// Large page title with an optional line beneath.
class PageTitle extends StatelessWidget {
  const PageTitle(this.title, {this.subtitle, this.small = false, super.key});

  final String title;
  final String? subtitle;
  final bool small;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(title.tr, style: small ? context.type.h2 : context.type.h1),
      if (subtitle != null)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(subtitle!.tr, style: context.type.cap),
        ),
    ],
  );
}

/// Section header: overline on the left, optional link on the right.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {this.action, this.onAction, this.top = 22, super.key});

  final String text;
  final String? action;
  final VoidCallback? onAction;
  final double top;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(top: top, bottom: 10),
    child: Row(
      children: [
        Expanded(
          child: Text(
            text.tr.toUpperCase(),
            style: context.type.o,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (action != null)
          GestureDetector(
            onTap: onAction,
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text(
                action!.tr,
                style: context.type.capB.copyWith(color: context.app.ink2),
              ),
            ),
          ),
      ],
    ),
  );
}

/// Flutter's pull-to-refresh logic with our own indicator: a whole circle parked in the empty middle of
/// the top control row, so it never lands on lectures or cards and is never clipped mid-pull.
class _PullToRefresh extends StatefulWidget {
  const _PullToRefresh({required this.onRefresh, required this.top, required this.child});

  final Future<void> Function() onRefresh;
  final double top;
  final Widget child;

  @override
  State<_PullToRefresh> createState() => _PullToRefreshState();
}

class _PullToRefreshState extends State<_PullToRefresh> {
  RefreshIndicatorStatus? _status;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final busy = _status == RefreshIndicatorStatus.refresh || _status == RefreshIndicatorStatus.snap;
    // Only when releasing will refresh. Flutter reports `drag` for any scroll that starts at the top edge
    // (dragging up on a short page, a touch that wobbles), so showing the circle then made it flicker up
    // at random.
    final visible = busy || _status == RefreshIndicatorStatus.armed;
    return Stack(
      children: [
        RefreshIndicator.noSpinner(
          onRefresh: widget.onRefresh,
          onStatusChange: (s) => setState(() => _status = s),
          child: widget.child,
        ),
        Positioned(
          top: widget.top,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: Center(
              child: AnimatedScale(
                scale: visible ? 1 : .7,
                duration: AppMotion.t2,
                curve: kEase,
                child: AnimatedOpacity(
                  opacity: visible ? 1 : 0,
                  duration: AppMotion.t2,
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: c.paper,
                      shape: BoxShape.circle,
                      border: Border.all(color: c.line2),
                      boxShadow: [BoxShadow(color: c.shadow, blurRadius: 12, offset: const Offset(0, 4))],
                    ),
                    child: busy
                        ? Padding(
                            padding: const EdgeInsets.all(10),
                            child: CircularProgressIndicator(strokeWidth: 2.4, color: c.ink),
                          )
                        : Icon(PhosphorIconsBold.arrowClockwise, size: 18, color: c.ink),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

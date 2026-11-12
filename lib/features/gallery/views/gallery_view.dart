import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/view_state.dart';
import 'package:gradeon/core/widgets/empty_art.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/sheets.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/features/gallery/controllers/gallery_controller.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// Placeholder pigments while a photo loads or when it cannot.
List<Color> get _wash => [
  for (final id in const ['computer', 'science', 'maths', 'pe']) Color.lerp(AppColors.subject(id).fill, AppColors.blackboard.chalk, .55)!,
];

class _Photo extends StatelessWidget {
  const _Photo({required this.url, required this.wash});

  final String url;
  final Color wash;

  @override
  Widget build(BuildContext context) => CachedNetworkImage(
    imageUrl: url,
    fit: BoxFit.cover,
    fadeInDuration: AppMotion.t3,
    placeholder: (_, _) => ColoredBox(color: wash),
    errorWidget: (_, _, _) => ColoredBox(
      color: wash,
      child: Center(child: Icon(PhosphorIconsRegular.imageBroken, color: AppColors.white.withValues(alpha: .5))),
    ),
  );
}

class GalleryView extends GetView<GalleryController> {
  const GalleryView({super.key});

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.paddingOf(context);
    return Obx(() {
      controller.onlyChild.value;
      final albums = controller.visible;
      final ready = controller.state.value == ViewState.success && albums.isNotEmpty;
      final hero = ready ? albums.first : null;
      final rest = ready ? albums.skip(1).toList() : <GalleryAlbum>[];
      return PageFrame(
        padContent: false,
        topPadding: ready ? 0 : null,
        leading: BackGlass(color: ready ? AppColors.white : null),
        actions: [
          if (controller.childName != null && controller.albums.isNotEmpty)
            GlassPress(
              onTap: () => controller.onlyChild.toggle(),
              child: Semantics(
                button: true,
                toggled: controller.onlyChild.value,
                child: Glass(
                  height: 44,
                  width: 150,
                  onPigment: ready,
                  tint: controller.onlyChild.value ? context.app.brand.withValues(alpha: 0.35) : null,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(PhosphorIconsRegular.user, size: 15, color: ready ? AppColors.white : context.app.ink),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          'gallery.only'.trp({'name': controller.childName!}),
                          style: AppText.chip(color: ready ? AppColors.white : context.app.ink, height: 1),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
        onRefresh: controller.load,
        children: [
          if (!ready)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const PageTitle('gallery.title'),
                  const SizedBox(height: 16),
                  ViewStateView(
                    state: controller.state.value == ViewState.success ? ViewState.empty : controller.state.value,
                    onRetry: controller.load,
                    errorKey: controller.errorMessage.value,
                    emptyTitle: controller.onlyChild.value ? 'gallery.none_with' : 'gallery.empty',
                    emptyBody: 'gallery.empty_body',
                    emptyArt: EmptyArt.photos,
                    emptyHint: controller.onlyChild.value ? null : 'gallery.empty_hint',
                    child: const SizedBox.shrink(),
                  ),
                ],
              ),
            )
          else ...[
            _Hero(album: hero!, controller: controller, height: 316 + inset.top),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (rest.isNotEmpty) ...[
                    Rise(child: Overline('gallery.albums'.trp({'year': _year(hero.date)}))),
                    const SizedBox(height: 12),
                    Rise(index: 1, child: _AlbumGrid(albums: rest)),
                  ],
                ],
              ),
            ),
          ],
        ],
      );
    });
  }

  /// Academic year runs June to May.
  static String _year(DateTime d) {
    final start = d.month >= 6 ? d.year : d.year - 1;
    return '$start–${(start + 1) % 100}';
  }
}

void _open(GalleryAlbum album, [int index = 0]) => unawaited(
  Get.to<void>(
    () => GalleryViewer(album: album, initial: index),
    transition: Transition.fadeIn,
  ),
);

class _Hero extends StatelessWidget {
  const _Hero({required this.album, required this.controller, required this.height});

  final GalleryAlbum album;
  final GalleryController controller;
  final double height;

  @override
  Widget build(BuildContext context) {
    final count = controller.withChild(album);
    return Semantics(
      button: true,
      label: '${album.title}, ${'gallery.photos'.trn(album.photos.length)}',
      excludeSemantics: true,
      child: Pressable(
        onTap: () => _open(album),
        child: ClipRRect(
          borderRadius: const BorderRadius.vertical(bottom: Radius.circular(28)),
          child: SizedBox(
            height: height,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (album.photos.isNotEmpty)
                  _Photo(url: album.photos.first.url, wash: _wash[0])
                else
                  ColoredBox(color: _wash[0]),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [AppColors.amoled.chalk.withValues(alpha: 0.35), Colors.transparent, Colors.transparent, AppColors.blackboard.chalk.withValues(alpha: 0.7)],
                      stops: const [0, .3, .5, 1],
                    ),
                  ),
                ),
                Positioned(
                  left: 20,
                  right: 20,
                  bottom: 20,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Overline(
                        'gallery.latest'.trp({'date': DateFormat('d MMM').format(album.date)}),
                        color: AppColors.white.withValues(alpha: .8),
                      ),
                      const SizedBox(height: 6),
                      Text(album.title, style: context.type.h1.copyWith(color: AppColors.white)),
                      Text(
                        [
                          'gallery.photos'.trn(album.photos.length),
                          if (count > 0 && controller.childName != null)
                            'gallery.with'.trp({'n': '$count', 'name': controller.childName!}),
                        ].join(' · '),
                        style: context.type.s.copyWith(color: AppColors.white.withValues(alpha: .85)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),),
    );
  }
}

class _AlbumGrid extends StatelessWidget {
  const _AlbumGrid({required this.albums});

  final List<GalleryAlbum> albums;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      // Pairs at 210 tall; an odd album out takes the full width at 150.
      final half = (box.maxWidth - 12) / 2;
      return Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          for (var i = 0; i < albums.length; i++)
            SizedBox(
              width: i == albums.length - 1 && albums.length.isOdd ? box.maxWidth : half,
              height: i == albums.length - 1 && albums.length.isOdd ? 150 : 210,
              child: _AlbumTile(album: albums[i], wash: _wash[(i + 1) % _wash.length]),
            ),
        ],
      );
    },
  );
}

class _AlbumTile extends StatelessWidget {
  const _AlbumTile({required this.album, required this.wash});

  final GalleryAlbum album;
  final Color wash;

  @override
  Widget build(BuildContext context) {
    final shadow = [Shadow(color: AppColors.amoled.chalk.withValues(alpha: 0.4), blurRadius: 8, offset: const Offset(0, 1))];
    return Semantics(
      button: true,
      label:
          '${album.title}, ${DateFormat('d MMMM').format(album.date)}, ${'gallery.photos'.trn(album.photos.length)}',
      excludeSemantics: true,
      child: Pressable(
        onTap: () => _open(album),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (album.photos.isNotEmpty) _Photo(url: album.photos.first.url, wash: wash) else ColoredBox(color: wash),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, AppColors.amoled.chalk.withValues(alpha: 0.55)],
                    stops: const [.5, 1],
                  ),
                ),
              ),
              Positioned(
                left: 12,
                right: 12,
                bottom: 10,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      album.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: context.type.t.copyWith(color: AppColors.white, shadows: shadow),
                    ),
                    Text(
                      '${DateFormat('d MMM').format(album.date)} · ${'gallery.photos'.trn(album.photos.length)}',
                      style: context.type.cap.copyWith(color: AppColors.white.withValues(alpha: .85), shadows: shadow),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Full-screen photo viewer: swipe between photos, thumbnails and a glass action bar.
class GalleryViewer extends StatefulWidget {
  const GalleryViewer({required this.album, required this.initial, super.key});

  final GalleryAlbum album;
  final int initial;

  @override
  State<GalleryViewer> createState() => _GalleryViewerState();
}

class _GalleryViewerState extends State<GalleryViewer> with SingleTickerProviderStateMixin {
  late final _pages = PageController(initialPage: widget.initial);
  late final _thumbs = ScrollController();
  late final _kenBurns = AnimationController(vsync: this, duration: const Duration(seconds: 12));
  late int _index = widget.initial;

  GalleryController get _gallery => Get.find<GalleryController>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (context.reduceMotion) {
      _kenBurns.value = 0;
    } else if (!_kenBurns.isAnimating) {
      _kenBurns.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _pages.dispose();
    _thumbs.dispose();
    _kenBurns.dispose();
    super.dispose();
  }

  void _go(int i) {
    if (context.reduceMotion) {
      _pages.jumpToPage(i);
    } else {
      _pages.animateToPage(i, duration: AppMotion.t4, curve: const Cubic(.2, .8, .2, 1));
    }
  }

  void _syncThumbs(int i) {
    if (!_thumbs.hasClients) return;
    final target = (i * 52.0 - (_thumbs.position.viewportDimension - 44) / 2).clamp(
      0.0,
      _thumbs.position.maxScrollExtent,
    );
    _thumbs.animateTo(target, duration: AppMotion.t3, curve: kEase);
  }

  Future<void> _details(GalleryPhoto photo) => showSheet<void>(
    SheetBody(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 16),
          Text(photo.caption, style: context.type.h2),
          const SizedBox(height: 6),
          Text(
            '${widget.album.title} · ${DateFormat('EEE d MMMM y').format(widget.album.date)}',
            style: context.type.cap,
          ),
          const SizedBox(height: 12),
          Text(widget.album.blurb, style: context.type.b),
          const SizedBox(height: 24),
        ],
      ),
    ),
  );

  Future<void> _report(GalleryPhoto photo) async {
    final ok = await confirmSheet(
      title: 'gallery.report_title',
      body: 'gallery.report_body',
      confirm: 'gallery.report',
      icon: PhosphorIconsRegular.flag,
    );
    if (ok) ToastHelper.show('gallery.reported', kind: ToastKind.success);
  }

  @override
  Widget build(BuildContext context) {
    final photos = widget.album.photos;
    final inset = MediaQuery.paddingOf(context);
    final photo = photos[_index];
    final childId = _gallery.childId;
    final withChild = childId != null && photo.tagged.contains(childId);
    const white = AppColors.white;
    return Theme(
      data: Theme.of(context).copyWith(extensions: [AppColors.blackboard]),
      child: Scaffold(
        backgroundColor: AppColors.amoled.chalk,
        body: Stack(
          children: [
            Positioned.fill(
              child: PageView.builder(
                controller: _pages,
                itemCount: photos.length,
                onPageChanged: (i) {
                  setState(() => _index = i);
                  _syncThumbs(i);
                },
                itemBuilder: (context, i) => AnimatedBuilder(
                  animation: _kenBurns,
                  builder: (context, child) => Transform.scale(
                    scale: 1 + .06 * kEase.transform(_kenBurns.value),
                    child: child,
                  ),
                  child: Semantics(
                    image: true,
                    label: photos[i].caption,
                    child: _Photo(url: photos[i].url, wash: _wash[0]),
                  ),
                ),
              ),
            ),
            // Keeps the caption and controls legible over bright photos.
            Positioned.fill(
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [AppColors.amoled.chalk.withValues(alpha: 0.4), Colors.transparent, Colors.transparent, AppColors.amoled.chalk.withValues(alpha: 0.7)],
                      stops: const [0, .18, .55, 1],
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              left: 16,
              right: 16,
              top: inset.top + 8,
              child: Row(
                children: [
                  const BackGlass(close: true, color: white),
                  const Spacer(),
                  Glass(
                    height: 44,
                    width: 120,
                    onPigment: true,
                    child: Center(
                      child: Text(
                        'gallery.n_of'.trp({'i': '${_index + 1}', 'n': '${photos.length}'}),
                        style: AppText.chip(color: white, height: 1, tabular: true),
                      ),
                    ),
                  ),
                  const Spacer(),
                  GlassIconButton(
                    icon: PhosphorIconsRegular.info,
                    label: 'gallery.details'.tr,
                    color: white,
                    onTap: () => unawaited(_details(photo)),
                  ),
                ],
              ),
            ),
            Positioned(
              left: 20,
              right: 20,
              bottom: 168 + inset.bottom,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(photo.caption, style: context.type.h3.copyWith(color: white)),
                  const SizedBox(height: 4),
                  Text(
                    [
                      widget.album.title,
                      DateFormat('d MMM').format(widget.album.date),
                      if (withChild) 'gallery.is_in'.trp({'name': _gallery.childName ?? ''}),
                    ].join(' · '),
                    style: context.type.s.copyWith(color: AppColors.white.withValues(alpha: .8)),
                  ),
                ],
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 104 + inset.bottom,
              height: 56,
              child: ListView.separated(
                controller: _thumbs,
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                itemCount: photos.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, i) => Semantics(
                  button: true,
                  selected: i == _index,
                  label: photos[i].caption,
                  child: Pressable(
                    onTap: () => _go(i),
                    child: AnimatedOpacity(
                      duration: AppMotion.t2,
                      opacity: i == _index ? 1 : .6,
                      child: Container(
                        width: 44,
                        height: 56,
                        foregroundDecoration: i == _index
                            ? BoxDecoration(
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: white, width: 2),
                              )
                            : null,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: _Photo(url: photos[i].url, wash: _wash[0]),
                        ),
                      ),
                    ),),
                ),
              ),
            ),
            Positioned(
              left: 16,
              right: 16,
              bottom: 30 + inset.bottom,
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Glass(
                    height: 60,
                    radius: 999,
                    onPigment: true,
                    child: Obx(() {
                      final fav = _gallery.favourites.contains(photo.id);
                      return Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _BarButton(
                            icon: PhosphorIconsRegular.export,
                            label: 'gallery.share',
                            onTap: () => ToastHelper.show('gallery.shared', kind: ToastKind.success),
                          ),
                          _BarButton(
                            icon: PhosphorIconsRegular.downloadSimple,
                            label: 'gallery.save',
                            onTap: () => ToastHelper.show('gallery.saved', kind: ToastKind.success),
                          ),
                          _BarButton(
                            icon: fav ? PhosphorIconsFill.heart : PhosphorIconsRegular.heart,
                            label: fav ? 'gallery.unfavourite' : 'gallery.favourite',
                            color: fav ? AppColors.blackboard.badText : null,
                            onTap: () => fav ? _gallery.favourites.remove(photo.id) : _gallery.favourites.add(photo.id),
                          ),
                          _BarButton(
                            icon: PhosphorIconsRegular.flag,
                            label: 'gallery.report_label',
                            onTap: () => unawaited(_report(photo)),
                          ),
                        ],
                      );
                    }),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BarButton extends StatelessWidget {
  const _BarButton({required this.icon, required this.label, required this.onTap, this.color});

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: label.tr,
    excludeSemantics: true,
    child: GlassPress(
      onTap: onTap,
      child: SizedBox(width: 44, height: 44, child: Icon(icon, color: color ?? AppColors.white, size: 24)),
    ),
  );
}

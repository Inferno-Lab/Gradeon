import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/formatters.dart';
import 'package:gradeon/core/widgets/empty_art.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/sheets.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/features/library/controllers/library_controller.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class LibraryView extends GetView<LibraryController> {
  const LibraryView({super.key});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      controller.query.value;
      final fair = controller.fair;
      final mine = controller.mine;
      final shelf = controller.shelf;
      return PageFrame(
        leading: const BackGlass(),
        actions: [
          if (fair != null)
            Chip2(
              'library.fair'.trp({
                'title': fair.title.replaceFirst(RegExp('^library ', caseSensitive: false), '').capitalizeFirst!,
                'date': DateFormat('EEE d MMM').format(fair.date),
              }),
              background: context.app.mariSoft,
              foreground: context.app.mariText,
              onTap: () => Get.toNamed<void>('/events/${fair.id}'),
            ),
        ],
        onRefresh: controller.load,
        bottomBarHeight: 56,
        bottomBar: controller.books.isEmpty ? null : _SearchBar(controller: controller, count: controller.books.length),
        children: [
          const Rise(child: PageTitle('library.title')),
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyTitle: 'library.empty',
            emptyBody: 'library.empty_body',
            emptyArt: EmptyArt.books,
            emptyHint: 'library.empty_hint',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (mine.isNotEmpty) ...[
                  Rise(
                    index: 1,
                    child: SectionLabel(
                      'library.on_shelf'.trp({'n': '${mine.length}', 'max': '${LibraryController.limit}'}),
                      top: 18,
                    ),
                  ),
                  Rise(
                    index: 1,
                    child: EduCard(
                      child: Column(
                        children: [
                          for (var i = 0; i < mine.length; i++) ...[
                            if (i > 0) const Hr(indent: 64),
                            _MineRow(book: mine[i], controller: controller),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
                Rise(
                  index: 2,
                  child: SectionLabel('library.available_now', top: mine.isEmpty ? 18 : 22),
                ),
                if (shelf.isEmpty)
                  const EmptyState(art: EmptyArt.search, title: 'library.no_match', body: 'library.no_match_body')
                else
                  Rise(
                    index: 3,
                    child: LayoutBuilder(
                      builder: (context, box) {
                        final columns = box.maxWidth >= 600 ? 5 : 3;
                        final w = (box.maxWidth - 12 * (columns - 1)) / columns;
                        return Wrap(
                          spacing: 12,
                          runSpacing: 12,
                          children: [
                            for (var i = 0; i < shelf.length; i++)
                              SizedBox(
                                width: w,
                                child: _Book(book: shelf[i], style: i % _styles.length, controller: controller),
                              ),
                          ],
                        );
                      },
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

class _MineRow extends StatelessWidget {
  const _MineRow({required this.book, required this.controller});

  final LibraryBook book;
  final LibraryController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final due = book.dueDate;
    final days = due == null ? null : Formatters.daysUntil(due);
    final Widget trailing;
    if (days != null && days < 0) {
      trailing = Stamp('library.overdue'.tr, color: c.badText);
    } else if (days != null && days <= 5) {
      trailing = Stamp(
        days == 0 ? 'library.today'.tr : 'library.days'.trp({'n': '$days'}),
        color: c.dark ? const Color(0xFFF6BA45) : AppColors.late,
      );
    } else {
      trailing = Btn(
        'library.renew',
        kind: BtnKind.quiet,
        small: true,
        height: 34,
        onPressed: () => unawaited(controller.renew(book)),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Cover(subject: book.category.toLowerCase(), label: '', width: 38, height: 50),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(book.title, style: context.type.t, maxLines: 1, overflow: TextOverflow.ellipsis),
                Text(
                  due == null
                      ? book.author
                      : 'library.return_by'.trp({
                          'author': book.author,
                          'date': DateFormat('EEE d MMM').format(due),
                        }),
                  style: context.type.cap,
                  maxLines: 2,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          trailing,
        ],
      ),
    );
  }
}

/// Cover styles in shelf order, each with its own printed shape.
const _styles = ['computer', 'art', 'night', 'english', 'pe', 'hindi'];

class _Book extends StatelessWidget {
  const _Book({required this.book, required this.style, required this.controller});

  final LibraryBook book;
  final int style;
  final LibraryController controller;

  @override
  Widget build(BuildContext context) {
    final id = _styles[style];
    final night = id == 'night';
    final pigment = night ? const SubjectColor(Color(0xFF10201B), Color(0xFFE8EFEA)) : AppColors.subject(id);
    final away = !book.available;
    final shapes = switch (id) {
      'computer' => [_shape(right: -24, top: 40, w: 80, h: 80, color: const Color(0x24FFFFFF))],
      'art' => [_shape(left: -10, top: 70, w: 120, h: 40, color: const Color(0x66FFFFFF), radius: 40)],
      'night' => [
        _shape(left: 30, top: 76, w: 6, h: 6, color: AppColors.mari),
        _shape(left: 70, top: 96, w: 4, h: 4, color: AppColors.white),
        _shape(left: 52, top: 58, w: 5, h: 5, color: AppColors.white),
      ],
      'english' => [_shape(left: -30, bottom: -30, w: 90, h: 90, color: const Color(0x1FFFFFFF))],
      'pe' => [
        Positioned(
          right: 10,
          top: 62,
          child: Container(
            width: 50,
            height: 20,
            decoration: const BoxDecoration(
              color: Color(0x4010201B),
              borderRadius: BorderRadius.only(
                topLeft: Radius.elliptical(25, 10),
                topRight: Radius.elliptical(25, 10),
                bottomRight: Radius.elliptical(5, 2),
                bottomLeft: Radius.elliptical(25, 10),
              ),
            ),
          ),
        ),
      ],
      _ => const <Widget>[],
    };
    const radius = BorderRadius.only(
      topLeft: Radius.circular(5),
      bottomLeft: Radius.circular(5),
      topRight: Radius.circular(12),
      bottomRight: Radius.circular(12),
    );
    final cover = Container(
      height: 150,
      decoration: BoxDecoration(
        color: pigment.fill,
        borderRadius: radius,
        boxShadow: const [
          BoxShadow(color: Color(0x8010201B), blurRadius: 18, spreadRadius: -12, offset: Offset(0, 10)),
        ],
      ),
      foregroundDecoration: spineDecoration,
      child: ClipRRect(
        borderRadius: radius,
        child: Stack(
          children: [
            ...shapes,
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 10, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    book.title,
                    maxLines: 5,
                    overflow: TextOverflow.ellipsis,
                    style: anek(14, 740, width: 108, height: 1.05, color: pigment.on),
                  ),
                  SizedBox(
                    width: double.infinity,
                    child: Text(
                      away && book.dueDate != null
                          ? 'library.back_on'.trp({'date': DateFormat('d MMM').format(book.dueDate!)})
                          : book.author,
                      maxLines: 2,
                      style: anek(10.5, 600, height: 1.2, color: pigment.on.withValues(alpha: .85)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
    return Semantics(
      button: !away,
      label: away
          ? '${book.title}, ${book.author}, ${'library.borrowed_by_someone'.tr}'
          : '${book.title}, ${book.author}, ${'library.tap_reserve'.tr}',
      excludeSemantics: true,
      child: Pressable(
        onTap: away ? null : () => unawaited(_confirm(context)),
        child: Opacity(opacity: away ? .45 : 1, child: cover),
      ),
    );
  }

  Future<void> _confirm(BuildContext context) async {
    final ok = await confirmSheet(
      title: 'library.reserve_title'.trp({'title': book.title}),
      body: 'library.reserve_body'.trp({'author': book.author}),
      confirm: 'library.reserve',
      danger: false,
      icon: PhosphorIconsRegular.bookmarkSimple,
    );
    if (ok) await controller.reserve(book);
  }

  static Widget _shape({
    required double w,
    required double h,
    required Color color,
    double? left,
    double? right,
    double? top,
    double? bottom,
    double? radius,
  }) => Positioned(
    left: left,
    right: right,
    top: top,
    bottom: bottom,
    child: Container(
      width: w,
      height: h,
      decoration: BoxDecoration(
        color: color,
        borderRadius: radius == null ? null : BorderRadius.circular(radius),
        shape: radius == null ? BoxShape.circle : BoxShape.rectangle,
      ),
    ),
  );
}

class _SearchBar extends StatefulWidget {
  const _SearchBar({required this.controller, required this.count});

  final LibraryController controller;
  final int count;

  @override
  State<_SearchBar> createState() => _SearchBarState();
}

class _SearchBarState extends State<_SearchBar> {
  late final _text = TextEditingController(text: widget.controller.query.value);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Glass(
      height: 56,
      radius: 28,
      tint: c.dark ? null : const Color(0x4DFBFCF9),
      padding: const EdgeInsets.only(left: 18, right: 6),
      child: Row(
        children: [
          Icon(PhosphorIconsRegular.magnifyingGlass, color: c.ink, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: _text,
              onChanged: (v) => setState(() => widget.controller.query.value = v),
              textInputAction: TextInputAction.search,
              style: anek(15.5, 520, color: c.ink),
              cursorColor: c.ink,
              decoration: InputDecoration(
                isCollapsed: true,
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                hintText: 'library.search'.trp({'n': NumberFormat.decimalPattern('en_IN').format(widget.count)}),
                hintStyle: anek(15.5, 520, color: c.ink3),
              ),
            ),
          ),
          if (_text.text.isNotEmpty)
            IconButton(
              tooltip: 'common.clear'.tr,
              onPressed: () {
                _text.clear();
                widget.controller.query.value = '';
                setState(() {});
              },
              icon: Icon(PhosphorIconsRegular.x, color: c.ink, size: 20),
            )
          else
            IconButton(
              tooltip: 'library.scan_isbn'.tr,
              onPressed: () => ToastHelper.show('library.scan_hint'),
              icon: Icon(PhosphorIconsRegular.barcode, color: c.ink, size: 22),
            ),
        ],
      ),
    );
  }
}

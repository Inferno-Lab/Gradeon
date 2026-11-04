import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
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
import 'package:gradeon/data/models/student.dart';
import 'package:gradeon/features/chat/controllers/chat_controller.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// Avatar pigment for a thread: the teacher's subject, ink for the office.
({Color fill, Color on}) _threadColor(BuildContext context, ChatThread t) {
  final sub = t.subtitle.toLowerCase();
  for (final id in AppColors.subjects.keys) {
    if (sub.contains(id) || sub.contains(subjectName(id).toLowerCase())) {
      final p = AppColors.subject(id);
      return (fill: p.fill, on: p.on);
    }
  }
  return (fill: context.app.ink, on: context.app.chalk);
}

String _stamp(DateTime t) {
  final today = DateUtils.dateOnly(DateTime.now());
  final day = DateUtils.dateOnly(t);
  final ago = today.difference(day).inDays;
  if (ago == 0) return DateFormat('H:mm').format(t);
  if (ago == 1) return 'common.yesterday'.tr;
  if (ago < 7) return DateFormat('EEE').format(t);
  return DateFormat('d MMM').format(t);
}

class ChatListView extends GetView<ChatListController> {
  const ChatListView({super.key});

  @override
  Widget build(BuildContext context) {
    final tab = ModalRoute.of(context)?.settings.name != '/chat';
    return Obx(() {
      controller.query.value;
      controller.state.value;
      final threads = controller.visible;
      final suggested = controller.suggested;
      final ready = controller.state.value == ViewState.success || controller.state.value == ViewState.empty;
      return PageFrame(
        dockPage: tab,
        leading: tab ? null : const BackGlass(),
        topPadding: tab ? MediaQuery.paddingOf(context).top + 14 : null,
        onRefresh: controller.load,
        children: [
          Row(
            children: [
              Expanded(child: Text('chat.title'.tr, style: context.type.h1)),
              if (suggested.isNotEmpty || controller.threads.isNotEmpty)
                GlassIconButton(
                  icon: PhosphorIconsRegular.pencilSimple,
                  label: 'chat.new'.tr,
                  onTap: () => unawaited(showSheet<void>(_NewChatSheet(controller: controller))),
                ),
            ],
          ),
          const SizedBox(height: 18),
          if (ready && controller.threads.isNotEmpty) Rise(child: _Search(controller: controller)),
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyTitle: 'chat.empty',
            emptyBody: 'chat.empty_body',
            emptyArt: EmptyArt.chat,
            emptyHint: 'chat.empty_hint',
            emptyActions: [EmptyAction('common.ask_office', icon: PhosphorIconsRegular.lifebuoy, onTap: () => Get.toNamed<void>(AppRoutes.help))],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (threads.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Rise(
                    index: 1,
                    child: EduCard(
                      child: Column(
                        children: [
                          for (var i = 0; i < threads.length; i++) ...[
                            if (i > 0) const Hr(indent: 66),
                            _ThreadRow(thread: threads[i], controller: controller),
                          ],
                        ],
                      ),
                    ),
                  ),
                ] else if (controller.query.value.isNotEmpty)
                  EmptyState(
                    title: 'chat.no_match',
                    body: 'chat.no_match_body'.trp({'q': controller.query.value}),
                  ),
                if (threads.isEmpty && controller.query.value.isEmpty && suggested.isNotEmpty)
                  const EmptyState(art: EmptyArt.chat, title: 'chat.no_chats', body: 'chat.no_chats_body'),
                if (suggested.isNotEmpty && controller.query.value.isEmpty) ...[
                  Rise(index: 2, child: SectionLabel('chat.start_with'.tr)),
                  Rise(
                    index: 3,
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      clipBehavior: Clip.none,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          for (var i = 0; i < suggested.length; i++) ...[
                            if (i > 0) const SizedBox(width: 14),
                            _Suggested(teacher: suggested[i], controller: controller),
                          ],
                        ],
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
}

class _Search extends StatefulWidget {
  const _Search({required this.controller});

  final ChatListController controller;

  @override
  State<_Search> createState() => _SearchState();
}

class _SearchState extends State<_Search> {
  late final _text = TextEditingController(text: widget.controller.query.value);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Field(
    controller: _text,
    hint: 'chat.search',
    icon: PhosphorIconsRegular.magnifyingGlass,
    minHeight: 48,
    fill: context.app.paper2,
    borderless: true,
    textInputAction: TextInputAction.search,
    onChanged: (v) => setState(() => widget.controller.query.value = v),
    trailing: _text.text.isEmpty
        ? null
        : IconButton(
            tooltip: 'common.clear'.tr,
            onPressed: () {
              _text.clear();
              setState(() => widget.controller.query.value = '');
            },
            icon: Icon(PhosphorIconsRegular.x, size: 18, color: context.app.ink3),
          ),
  );
}

class _ThreadRow extends StatelessWidget {
  const _ThreadRow({required this.thread, required this.controller});

  final ChatThread thread;
  final ChatListController controller;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final last = controller.previews[thread.id];
    final unread = controller.unreadBy[thread.id] ?? 0;
    final color = _threadColor(context, thread);
    final mine = last != null && last.senderId == controller.me;
    final preview = last == null
        ? 'chat.no_messages'.tr
        : (mine ? 'chat.you'.trp({'text': last.text}) : last.text);
    return Semantics(
      button: true,
      label: [
        thread.title,
        if (unread > 0) 'chat.n_unread'.trp({'n': '$unread'}),
        preview,
      ].join(', '),
      excludeSemantics: true,
      child: Pressable(
        onTap: () => Get.toNamed<void>('/chat/${thread.id}'),
        scale: .985,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          child: Row(
            children: [
              Avatar(
                thread.title,
                background: color.fill,
                foreground: color.on,
                ring: thread.online ? color.fill : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            thread.title,
                            style: context.type.t,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (last != null) Text(_stamp(last.sentAt), style: context.type.cap),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            preview,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: context.type.s.copyWith(
                              color: unread > 0 ? c.ink : null,
                              fontVariations: unread > 0 ? const [FontVariation('wght', 560)] : null,
                            ),
                          ),
                        ),
                        if (unread > 0) ...[
                          const SizedBox(width: 8),
                          Container(
                            constraints: const BoxConstraints(minWidth: 22),
                            height: 22,
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(color: AppColors.mari, borderRadius: BorderRadius.circular(11)),
                            child: Text('$unread', style: anek(12, 760, height: 1, color: AppColors.mariInk)),
                          ),
                        ],
                      ],
                    ),
                    Text(thread.subtitle, style: context.type.cap.copyWith(fontSize: 11.5)),
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

class _Suggested extends StatelessWidget {
  const _Suggested({required this.teacher, required this.controller});

  final Teacher teacher;
  final ChatListController controller;

  @override
  Widget build(BuildContext context) {
    final p = AppColors.subject(teacher.subject);
    return Semantics(
      button: true,
      label: 'chat.start_named'.trp({'name': teacher.name}),
      excludeSemantics: true,
      child: Pressable(
        onTap: () => unawaited(controller.startWith(teacher)),
        child: SizedBox(
          width: 64,
          child: Column(
            children: [
              Avatar(teacher.name, size: 56, background: p.fill, foreground: p.on),
              const SizedBox(height: 6),
              Text(
                '${teacher.name.split(' ').first} · ${subjectName(teacher.subject)}',
                textAlign: TextAlign.center,
                maxLines: 2,
                style: context.type.cap.copyWith(fontSize: 11.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NewChatSheet extends StatelessWidget {
  const _NewChatSheet({required this.controller});

  final ChatListController controller;

  @override
  Widget build(BuildContext context) {
    final threads = controller.threads;
    return SheetBody(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 18),
          Text('chat.new'.tr, style: context.type.h2),
          const SizedBox(height: 8),
          for (final t in threads)
            _SheetRow(
              title: t.title,
              sub: t.subtitle,
              color: _threadColor(context, t),
              onTap: () {
                Get.back<void>();
                unawaited(Get.toNamed<void>('/chat/${t.id}'));
              },
            ),
          for (final t in controller.suggested)
            _SheetRow(
              title: t.name,
              sub: subjectName(t.subject),
              color: (fill: AppColors.subject(t.subject).fill, on: AppColors.subject(t.subject).on),
              onTap: () {
                Get.back<void>();
                unawaited(controller.startWith(t));
              },
            ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _SheetRow extends StatelessWidget {
  const _SheetRow({required this.title, required this.sub, required this.color, required this.onTap});

  final String title;
  final String sub;
  final ({Color fill, Color on}) color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Avatar(title, background: color.fill, foreground: color.on),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: context.type.t),
                Text(sub, style: context.type.cap),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

/// One conversation: glass header, bubbles, quick replies and a glass composer.
class ChatThreadView extends GetView<ChatThreadController> {
  const ChatThreadView({super.key});

  static const _quick = ['chat.q_thanks', 'chat.q_late', 'chat.q_absent', 'chat.q_will_do'];

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final inset = MediaQuery.paddingOf(context);
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    final bottom = keyboard > 0 ? keyboard + 12 : 28 + inset.bottom;
    final side = (MediaQuery.sizeOf(context).width - 720) / 2;
    final gutter = side > 16 ? side : 16.0;
    return Obx(() {
      controller.state.value;
      final thread = controller.thread;
      final messages = controller.messages;
      final color = thread == null ? (fill: c.ink, on: c.chalk) : _threadColor(context, thread);
      final empty = controller.draft.value.trim().isEmpty;
      final myName = Get.find<AuthService>().user.value?.name.split(' ').first ?? '';
      return Scaffold(
        backgroundColor: c.chalk,
        resizeToAvoidBottomInset: false,
        body: Stack(
          children: [
            Positioned.fill(
              child: thread == null || messages.isEmpty
                  ? Padding(
                      padding: EdgeInsets.fromLTRB(20, inset.top + 90, 20, 0),
                      child: ViewStateView(
                        state: controller.state.value,
                        onRetry: controller.load,
                        errorKey: controller.errorMessage.value,
                        emptyArt: EmptyArt.search,
            emptyTitle: 'chat.gone',
                        emptyBody: 'chat.gone_body',
                        child: EmptyState(
                          title: 'chat.say_hello',
                          body: 'chat.say_hello_body'.trp({'name': thread?.title ?? ''}),
                        ),
                      ),
                    )
                  : ListView.builder(
                      reverse: true,
                      physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
                      padding: EdgeInsets.fromLTRB(gutter, inset.top + 120, gutter, bottom + 56 + 60),
                      itemCount: messages.length + (controller.typing.value ? 1 : 0),
                      itemBuilder: (context, row) {
                        final typing = controller.typing.value;
                        if (typing && row == 0) {
                          return const Align(alignment: Alignment.centerLeft, child: _Typing());
                        }
                        final index = messages.length - 1 - (typing ? row - 1 : row);
                        final m = messages[index];
                        final mine = m.senderId == controller.me;
                        final next = index + 1 < messages.length ? messages[index + 1] : null;
                        // A time line closes each run of messages from one side.
                        final endsRun =
                            next == null ||
                            next.senderId != m.senderId ||
                            next.sentAt.difference(m.sentAt).inMinutes > 10;
                        final firstRunOfSender = !messages.take(index).any((x) => x.senderId == m.senderId);
                        final who = mine ? myName : thread.title;
                        return Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Column(
                            crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                            children: [
                              _Bubble(text: m.text, mine: mine),
                              if (endsRun)
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(6, 4, 6, 0),
                                  child: Text(
                                    firstRunOfSender
                                        ? '$who · ${DateFormat('H:mm').format(m.sentAt)}'
                                        : _stamp(m.sentAt),
                                    style: anek(11, 520, height: 1.2, color: c.ink3),
                                  ),
                                ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
            // Glass header: messages scroll beneath it.
            Positioned(
              left: gutter,
              right: gutter,
              top: inset.top + 8,
              child: Glass(
                height: 56,
                radius: 28,
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Row(
                  children: [
                    Semantics(
                      button: true,
                      label: 'common.back'.tr,
                      child: GestureDetector(
                        onTap: () => Get.back<void>(),
                        behavior: HitTestBehavior.opaque,
                        child: SizedBox(
                          width: 44,
                          height: 44,
                          child: Icon(PhosphorIconsRegular.caretLeft, color: c.ink),
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    if (thread != null) Avatar(thread.title, size: 32, background: color.fill, foreground: color.on),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            thread?.title ?? '',
                            style: context.type.t.copyWith(fontSize: 15.5),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (thread != null)
                            Text(
                              thread.online ? 'chat.online'.trp({'sub': thread.subtitle}) : thread.subtitle,
                              style: context.type.cap.copyWith(fontSize: 12),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                        ],
                      ),
                    ),
                    Semantics(
                      button: true,
                      label: 'chat.call_office'.tr,
                      child: GestureDetector(
                        onTap: () => unawaited(controller.callOffice()),
                        behavior: HitTestBehavior.opaque,
                        child: SizedBox(
                          width: 44,
                          height: 44,
                          child: Icon(PhosphorIconsRegular.phone, size: 20, color: c.ink),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (thread != null) ...[
              Positioned(
                left: 0,
                right: 0,
                bottom: bottom + 56 + 12,
                height: 36,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: EdgeInsets.symmetric(horizontal: gutter),
                  itemCount: _quick.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (context, i) => Pressable(
                    onTap: () {
                      controller.text
                        ..text = _quick[i].tr
                        ..selection = TextSelection.collapsed(offset: _quick[i].tr.length);
                    },
                    child: Container(
                      height: 36,
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: c.paper,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: c.line2),
                      ),
                      child: Text(_quick[i].tr, style: anek(14, 600, height: 1, color: c.ink)),
                    ),
                  ),
                ),
              ),
              Positioned(
                left: gutter,
                right: gutter,
                bottom: bottom,
                child: Glass(
                  height: 56,
                  radius: 28,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: Row(
                    children: [
                      Semantics(
                        button: true,
                        label: 'chat.attach'.tr,
                        child: GestureDetector(
                          onTap: () => ToastHelper.show('chat.attach_soon'),
                          child: Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(color: c.ink.withValues(alpha: .06), shape: BoxShape.circle),
                            child: Icon(PhosphorIconsRegular.plus, color: c.ink),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: TextField(
                          controller: controller.text,
                          minLines: 1,
                          maxLines: 3,
                          textCapitalization: TextCapitalization.sentences,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => unawaited(controller.send()),
                          style: anek(16, 450, height: 1.3, color: c.ink),
                          cursorColor: c.ink,
                          decoration: InputDecoration(
                            isCollapsed: true,
                            filled: false,
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                            hintText: 'chat.message_to'.trp({'name': thread.title}),
                            hintStyle: anek(16, 450, height: 1.3, color: c.ink3),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Semantics(
                        button: true,
                        enabled: !empty,
                        label: 'chat.send'.tr,
                        child: GlassPress(
                          onTap: empty ? null : () => unawaited(controller.send()),
                          child: AnimatedOpacity(
                            duration: const Duration(milliseconds: 200),
                            opacity: empty ? .45 : 1,
                            child: Container(
                              width: 46,
                              height: 46,
                              decoration: BoxDecoration(
                                color: const Color(0xD9F2A007),
                                shape: BoxShape.circle,
                                border: Border.all(color: AppColors.white, width: .6),
                                boxShadow: const [
                                  BoxShadow(
                                    color: Color(0x99B06F00),
                                    blurRadius: 10,
                                    spreadRadius: -2,
                                    offset: Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: const Icon(PhosphorIconsBold.arrowUp, color: AppColors.mariInk, size: 22),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      );
    });
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.text, required this.mine});

  final String text;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.sizeOf(context).width * .72 > 270 ? 270 : MediaQuery.sizeOf(context).width * .72,
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: mine ? c.ink : c.paper,
          border: mine ? null : Border.all(color: c.line),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(20),
            topRight: const Radius.circular(20),
            bottomLeft: Radius.circular(mine ? 20 : 6),
            bottomRight: Radius.circular(mine ? 6 : 20),
          ),
        ),
        child: Text(text, style: anek(15, 450, height: 1.4, color: mine ? c.chalk : c.ink)),
      ),
    );
  }
}

class _Typing extends StatefulWidget {
  const _Typing();

  @override
  State<_Typing> createState() => _TypingState();
}

class _TypingState extends State<_Typing> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(seconds: 1))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Semantics(
      label: 'chat.typing'.tr,
      child: Container(
        width: 70,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: c.paper,
          border: Border.all(color: c.line),
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(20),
            topRight: Radius.circular(20),
            bottomRight: Radius.circular(20),
            bottomLeft: Radius.circular(6),
          ),
        ),
        child: AnimatedBuilder(
          animation: _c,
          builder: (context, _) => Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              for (var i = 0; i < 3; i++)
                Builder(
                  builder: (context) {
                    final t = ((_c.value - i * .15) % 1 + 1) % 1;
                    final bob = Curves.easeInOut.transform(t < .5 ? t * 2 : (1 - t) * 2);
                    return Transform.translate(
                      offset: Offset(0, -4 * bob),
                      child: Opacity(opacity: .5 + .5 * bob, child: Dot(c.ink3, size: 7)),
                    );
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }
}

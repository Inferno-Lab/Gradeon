import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/utils/app_exception.dart';
import 'package:gradeon/core/utils/loadable.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/models/student.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/data/repositories/campus_repository.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';
import 'package:url_launcher/url_launcher.dart';

/// Threads are stored from the family's side ("Kavita Iyer, class teacher").
/// For the person that title names, show the other side instead.
Future<ChatThread> threadForMe(ChatThread t, AppUser me) async {
  if (t.title != me.name) return t;
  final other = t.participantIds.where((id) => id != me.id).firstOrNull;
  final name = other == null ? null : await Get.find<DirectoryRepository>().userName(other);
  if (name == null) return t;
  return ChatThread(
    id: t.id,
    title: name,
    subtitle: 'chat.family'.tr,
    participantIds: t.participantIds,
    avatarUrl: t.avatarUrl,
    online: t.online,
  );
}

class ChatListController extends GetxController with Loadable {
  List<ChatThread> threads = [];
  final previews = <String, ChatMessage>{};
  final unreadBy = <String, int>{};
  final unread = 0.obs;
  final query = ''.obs;

  /// Teachers of the child's class with no conversation yet.
  List<Teacher> suggested = [];

  String? get me => Get.find<AuthService>().user.value?.id;

  List<ChatThread> get visible {
    final needle = query.value.trim().toLowerCase();
    final list = [...threads]
      ..sort((a, b) {
        final at = previews[a.id]?.sentAt;
        final bt = previews[b.id]?.sentAt;
        if (at == null || bt == null) return at == null ? 1 : -1;
        return bt.compareTo(at);
      });
    if (needle.isEmpty) return list;
    return list
        .where(
          (t) =>
              t.title.toLowerCase().contains(needle) ||
              t.subtitle.toLowerCase().contains(needle) ||
              (previews[t.id]?.text.toLowerCase().contains(needle) ?? false),
        )
        .toList();
  }

  @override
  Future<void> load() => run(() async {
    final user = Get.find<AuthService>().user.value;
    if (user == null) return;
    final bundle = await Get.find<ChatRepository>().inbox(user.id);
    threads = [for (final t in bundle.threads) await threadForMe(t, user)];
    previews.clear();
    unreadBy.clear();
    for (final message in bundle.messages) {
      if (!message.read && message.senderId != user.id) {
        unreadBy[message.threadId] = (unreadBy[message.threadId] ?? 0) + 1;
      }
      final current = previews[message.threadId];
      if (current == null || message.sentAt.isAfter(current.sentAt)) {
        previews[message.threadId] = message;
      }
    }
    unread.value = unreadBy.values.fold(0, (a, b) => a + b);
    suggested = [];
    final studentId = Get.find<AuthService>().activeStudentId.value;
    if (user.role != UserRole.teacher && studentId != null) {
      final directory = Get.find<DirectoryRepository>();
      final student = await directory.student(studentId);
      final titles = threads.map((t) => t.title).toSet();
      suggested = (await directory.teachers())
          .where((t) => t.classIds.contains(student.classId) && !titles.contains(t.name))
          .toList();
    }
  }, isEmpty: () => threads.isEmpty && suggested.isEmpty);

  Future<void> startWith(Teacher teacher) async {
    final userId = me;
    if (userId == null) return;
    try {
      final id = await Get.find<ChatRepository>().start(userId: userId, teacher: teacher);
      unawaited(Get.toNamed<void>('/chat/$id'));
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
    }
  }
}

class ChatThreadController extends GetxController with Loadable {
  final text = TextEditingController();
  final draft = ''.obs;

  /// The other side is typing. shortcut: always false with mock data; wire to presence events with the backend.
  final typing = false.obs;
  List<ChatMessage> messages = [];
  ChatThread? thread;
  String? officePhone;

  String? get me => Get.find<AuthService>().user.value?.id;

  @override
  void onInit() {
    text.addListener(() => draft.value = text.text);
    super.onInit();
  }

  @override
  Future<void> load() => run(() async {
    final id = Get.parameters['id'];
    final userId = me;
    if (id == null || userId == null) return;
    final repo = Get.find<ChatRepository>();
    final account = Get.find<AuthService>().user.value!;
    final found = (await repo.threadsFor(userId)).where((t) => t.id == id).firstOrNull;
    thread = found == null ? null : await threadForMe(found, account);
    messages = await repo.messages(id);
    officePhone ??= (await Get.find<DirectoryRepository>().school()).phone;
    if (messages.any((m) => !m.read && m.senderId != userId)) {
      await repo.markRead(threadId: id, userId: userId);
    }
  }, isEmpty: () => thread == null);

  Future<void> send() async {
    final value = text.text.trim();
    final id = thread?.id;
    final userId = me;
    if (value.isEmpty || id == null || userId == null) return;
    text.clear();
    try {
      await Get.find<ChatRepository>().send(threadId: id, senderId: userId, text: value);
    } on AppException catch (error) {
      text.text = value;
      ToastHelper.show(error.message, kind: ToastKind.error);
    }
  }

  Future<void> callOffice() async {
    final phone = officePhone;
    if (phone == null) return;
    try {
      await launchUrl(Uri(scheme: 'tel', path: phone));
    } on Exception {
      ToastHelper.show('errors.cant_open', kind: ToastKind.error);
    }
  }

  @override
  void onClose() {
    text.dispose();
    super.onClose();
  }
}

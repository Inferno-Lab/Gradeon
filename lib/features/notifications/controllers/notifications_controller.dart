import 'dart:async';

import 'package:get/get.dart';
import 'package:gradeon/core/services/live_stream.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/utils/app_exception.dart';
import 'package:gradeon/core/utils/loadable.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/data/repositories/campus_repository.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';

/// Notification types that come from the school rather than a person.
const schoolNoticeTypes = {'general', 'event', 'notice'};

class NotificationsController extends GetxController with Loadable, LiveListen {
  @override
  void onInit() {
    super.onInit();
    // A new notification shows at once.
    listenLive('notification', (_) => unawaited(load()));
  }

  List<AppNotification> items = [];

  /// First names of a parent's children, for the per-child filter.
  List<String> children = [];

  /// 'all', 'school' or a child's first name.
  final filter = 'all'.obs;

  /// Rows swiped away, hidden at once while the dismissal saves.
  final gone = <String>{}.obs;

  List<AppNotification> get visible {
    final f = filter.value;
    final list = items.where((n) => !gone.contains(n.id)).toList()..sort((a, b) => b.date.compareTo(a.date));
    if (f == 'all') return list;
    if (f == 'school') return list.where((n) => schoolNoticeTypes.contains(n.type)).toList();
    return list.where((n) => '${n.title} ${n.body}'.contains(f)).toList();
  }

  int get unread => items.where((n) => !n.read && !gone.contains(n.id)).length;

  @override
  Future<void> load() async {
    final user = Get.find<AuthService>().user.value;
    if (user == null) {
      await run(() async {}, isEmpty: () => true);
      return;
    }
    await run(() async {
      items = await Get.find<NotificationRepository>().forUser(user.id);
      gone.clear();
      children = [];
      if (user.role == UserRole.parent) {
        final directory = Get.find<DirectoryRepository>();
        for (final id in user.childIds) {
          children.add((await directory.student(id)).name.split(' ').first);
        }
      }
    }, isEmpty: () => items.isEmpty);
  }

  /// The one just dismissed, offered back for a few seconds.
  final undoable = Rxn<AppNotification>();
  Timer? _undoOff;

  Future<void> undo() async {
    final n = undoable.value;
    if (n == null) return;
    undoable.value = null;
    try {
      await Get.find<NotificationRepository>().restore(n.id);
      gone.remove(n.id);
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
    }
  }

  Future<void> dismiss(AppNotification n) async {
    gone.add(n.id);
    undoable.value = n;
    _undoOff?.cancel();
    _undoOff = Timer(const Duration(seconds: 6), () => undoable.value = null);
    try {
      await Get.find<NotificationRepository>().dismiss(n.id);
    } on AppException catch (error) {
      gone.remove(n.id);
      ToastHelper.show(error.message, kind: ToastKind.error);
    }
  }

  Future<void> readAll() async {
    final id = Get.find<AuthService>().user.value?.id;
    if (id == null) return;
    try {
      await Get.find<NotificationRepository>().markAllRead(id);
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
    }
  }
}

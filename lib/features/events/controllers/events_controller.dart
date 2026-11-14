import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/school_config.dart';
import 'package:gradeon/core/utils/app_exception.dart';
import 'package:gradeon/core/utils/loadable.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/repositories/campus_repository.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';
import 'package:gradeon/core/utils/clock.dart';

class EventsController extends GetxController with Loadable {
  List<SchoolEvent> items = [];
  String? childName;

  /// Answers given on this device before the server confirms them.
  final pending = <String, RsvpStatus>{}.obs;

  String? get _me => Get.find<AuthService>().user.value?.id;

  List<SchoolEvent> get upcoming {
    final today = DateUtils.dateOnly(Clock.now());
    return items.where((e) => !e.date.isBefore(today)).toList()..sort((a, b) => a.date.compareTo(b.date));
  }

  String? _featuredId;

  /// The next event that asks families to come and has no answer yet; else the next one.
  /// Picked on first load and then held, so answering shows the choice on the same card
  /// instead of swapping to the next event.
  SchoolEvent? get featured => byId(_featuredId) ?? _pick();

  SchoolEvent? _pick() {
    final list = upcoming;
    return list.where((e) => e.category != 'general' && mine(e) == null).firstOrNull ?? list.firstOrNull;
  }

  RsvpStatus? mine(SchoolEvent e) =>
      pending[e.id] ?? e.rsvps.where((r) => r.userId == _me).map((r) => r.status).firstOrNull;

  int going(SchoolEvent e) {
    final others = e.rsvps.where((r) => r.userId != _me && r.status == RsvpStatus.going).length;
    return others + (mine(e) == RsvpStatus.going ? 1 : 0);
  }

  @override
  Future<void> load() => run(() async {
    items = await Get.find<EventRepository>().all();
    // A reload after an answer must not move the card: pick again only if the held event is gone.
    if (byId(_featuredId) == null) _featuredId = _pick()?.id;
    final id = Get.find<AuthService>().activeStudentId.value;
    childName = id == null ? null : (await Get.find<DirectoryRepository>().student(id)).name.split(' ').first;
  }, isEmpty: () => items.isEmpty);

  SchoolEvent? byId(String? id) => items.where((e) => e.id == id).firstOrNull;

  Future<void> rsvp(String eventId, RsvpStatus status) async {
    if (!SchoolConfig.allows('events.rsvp')) return;
    final userId = _me;
    if (userId == null) return;
    pending[eventId] = status;
    try {
      await Get.find<EventRepository>().rsvp(eventId: eventId, userId: userId, status: status);
      ToastHelper.show('events.saved', kind: ToastKind.success);
    } on AppException catch (error) {
      pending.remove(eventId);
      ToastHelper.show(error.message, kind: ToastKind.error);
    }
  }
}

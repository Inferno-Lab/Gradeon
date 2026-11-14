import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/school_config.dart';
import 'package:gradeon/core/utils/app_exception.dart';
import 'package:gradeon/core/utils/loadable.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/repositories/campus_repository.dart';
import 'package:gradeon/core/utils/clock.dart';

class LibraryController extends GetxController with Loadable {
  /// Books a student may hold at once.
  static const limit = 3;

  final query = ''.obs;
  List<LibraryBook> books = [];
  SchoolEvent? fair;

  String? get _me => Get.find<AuthService>().activeStudentId.value;

  List<LibraryBook> get mine =>
      books.where((b) => b.borrowedBy != null && b.borrowedBy == _me).toList()
        ..sort((a, b) => (a.dueDate ?? DateTime(9999)).compareTo(b.dueDate ?? DateTime(9999)));

  /// The shelf: books on it first, then ones others have borrowed, filtered by the search.
  List<LibraryBook> get shelf {
    final needle = query.value.trim().toLowerCase();
    return books
        .where((b) => b.borrowedBy == null || b.borrowedBy != _me)
        .where(
          (b) =>
              needle.isEmpty ||
              b.title.toLowerCase().contains(needle) ||
              b.author.toLowerCase().contains(needle) ||
              b.category.toLowerCase().contains(needle) ||
              b.isbn.contains(needle),
        )
        .toList()
      ..sort((a, b) => (a.available ? 0 : 1).compareTo(b.available ? 0 : 1));
  }

  @override
  Future<void> load() => run(() async {
    books = await Get.find<LibraryRepository>().all();
    final today = DateUtils.dateOnly(Clock.now());
    final events = await Get.find<EventRepository>().all();
    // A library event coming up gets a chip in the header.
    fair =
        (events.where((e) => e.venue.toLowerCase().contains('library') && !e.date.isBefore(today)).toList()
              ..sort((a, b) => a.date.compareTo(b.date)))
            .firstOrNull;
  }, isEmpty: () => books.isEmpty);

  Future<void> reserve(LibraryBook book) async {
    if (!SchoolConfig.allows('library.reservations')) return;
    final id = _me;
    if (id == null) return;
    if (mine.length >= limit) {
      ToastHelper.show('library.limit', kind: ToastKind.error);
      return;
    }
    try {
      await Get.find<LibraryRepository>().reserve(bookId: book.id, studentId: id);
      ToastHelper.show('library.reserved', kind: ToastKind.success);
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
    }
  }

  Future<void> renew(LibraryBook book) async {
    if (!SchoolConfig.allows('library.reservations')) return;
    try {
      await Get.find<LibraryRepository>().renew(book.id);
      ToastHelper.show('library.renewed', kind: ToastKind.success);
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
    }
  }
}

import 'dart:async';

import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/utils/loadable.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/repositories/campus_repository.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';

class GalleryController extends GetxController with Loadable {
  final onlyChild = false.obs;
  final favourites = <String>{}.obs;
  List<GalleryAlbum> albums = [];
  String? childId;
  String? childName;

  /// Albums newest first; with "Only (child)" on, just the photos they are in.
  List<GalleryAlbum> get visible {
    final sorted = [...albums]..sort((a, b) => b.date.compareTo(a.date));
    if (!onlyChild.value || childId == null) return sorted;
    return [
      for (final a in sorted)
        if (a.photos.any((p) => p.tagged.contains(childId)))
          GalleryAlbum(
            id: a.id,
            title: a.title,
            date: a.date,
            blurb: a.blurb,
            photos: a.photos.where((p) => p.tagged.contains(childId)).toList(),
          ),
    ];
  }

  int withChild(GalleryAlbum album) =>
      childId == null ? 0 : album.photos.where((p) => p.tagged.contains(childId)).length;

  @override
  Future<void> load() => run(() async {
    albums = await Get.find<GalleryRepository>().all();
    childId = Get.find<AuthService>().activeStudentId.value;
    childName = childId == null
        ? null
        : (await Get.find<DirectoryRepository>().student(childId!)).name.split(' ').first;
  }, isEmpty: () => albums.isEmpty);
}

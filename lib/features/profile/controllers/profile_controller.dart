import 'dart:async';

import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/utils/loadable.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/data/models/student.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';
import 'package:image_picker/image_picker.dart';

class ProfileController extends GetxController with Loadable {
  Student? student;
  SchoolClass? schoolClass;
  Teacher? teacher;
  List<SchoolClass> teaching = [];

  @override
  Future<void> load() async {
    final auth = Get.find<AuthService>();
    final id = auth.activeStudentId.value;
    final teacherId = auth.user.value?.teacherId;
    await run(() async {
      final directory = Get.find<DirectoryRepository>();
      student = null;
      teacher = null;
      if (id != null) {
        student = await directory.student(id);
        schoolClass = await directory.schoolClass(student!.classId);
      } else if (teacherId != null) {
        teacher = await directory.teacher(teacherId);
        teaching = await directory.classesForTeacher(teacherId);
      }
    }, isEmpty: () => false);
  }

  Future<void> editPhoto() async {
    try {
      final file = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
      if (file == null) return;
      await Get.find<AuthService>().updateAvatar(file.path);
      ToastHelper.show('profile.photo', kind: ToastKind.success);
    } on Exception {
      ToastHelper.show('profile.photo_failed', kind: ToastKind.error);
    }
  }
}

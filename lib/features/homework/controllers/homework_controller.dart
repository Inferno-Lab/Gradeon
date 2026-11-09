import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/school_config.dart';
import 'package:gradeon/core/utils/app_exception.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/loadable.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/models/student.dart';
import 'package:gradeon/data/repositories/academic_repository.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';
import 'package:image_picker/image_picker.dart';

class HomeworkController extends GetxController with Loadable {
  final tab = 0.obs;
  final selectedId = RxnString();
  List<Homework> items = [];
  String? studentId;
  Student? student;
  Map<String, String> teachers = {};

  int count(HomeworkStatus status) => items.where((item) {
    final mine = studentId == null ? null : item.forStudent(studentId!);
    return (mine?.status ?? HomeworkStatus.pending) == status;
  }).length;

  List<Homework> get visible {
    final status = switch (tab.value) {
      1 => HomeworkStatus.submitted,
      2 => HomeworkStatus.graded,
      _ => HomeworkStatus.pending,
    };
    return items.where((item) {
      final mine = studentId == null ? null : item.forStudent(studentId!);
      final current = mine?.status ?? HomeworkStatus.pending;
      return current == status;
    }).toList();
  }

  String? get pick => selectedId.value;

  set pick(String? id) => selectedId.value = id;

  Homework? get selected {
    final id = selectedId.value;
    if (id != null) {
      for (final item in items) {
        if (item.id == id) return item;
      }
    }
    return visible.firstOrNull;
  }

  @override
  Future<void> load() async {
    studentId = Get.find<AuthService>().activeStudentId.value;
    if (studentId == null) {
      await run(() async {}, isEmpty: () => true);
      return;
    }
    await run(() async {
      student = await Get.find<DirectoryRepository>().student(studentId!);
      items = await Get.find<HomeworkRepository>().forClass(student!.classId);
      teachers = {for (final t in await Get.find<DirectoryRepository>().teachers()) t.id: t.name};
    }, isEmpty: () => false);
  }

  /// Upload a file from the gallery.
  Future<void> upload(Homework homework) async {
    try {
      final file = await ImagePicker().pickImage(source: ImageSource.gallery);
      if (file == null) return;
      await send(homework, file.name);
    } on Exception {
      ToastHelper.show('errors.generic', kind: ToastKind.error);
    }
  }

  // shortcut: scanned pages are counted, not merged into a PDF; add PDF export when the API stores files.
  Future<void> sendScan(Homework homework, int pages) =>
      send(homework, 'homework.scan_file'.trn(pages));

  Future<void> send(Homework homework, String fileName) async {
    if (!SchoolConfig.allows('homework.onlineSubmission')) return;
    final id = studentId ?? Get.find<AuthService>().activeStudentId.value;
    if (id == null) return;
    try {
      await Get.find<HomeworkRepository>().submit(
        homeworkId: homework.id,
        studentId: id,
        fileName: fileName,
      );
      ToastHelper.show('homework.sent', kind: ToastKind.success);
    } on AppException catch (error) {
      ToastHelper.show(error.message, kind: ToastKind.error);
    }
  }
}

class HomeworkDetailController extends GetxController with Loadable {
  Homework? item;
  String? teacher;
  String? studentId;

  HomeworkSubmission? get mine => studentId == null ? null : item?.forStudent(studentId!);

  @override
  Future<void> load() async {
    final id = Get.parameters['id'];
    if (id == null) {
      await run(() async {}, isEmpty: () => true);
      return;
    }
    await run(() async {
      studentId = Get.find<AuthService>().activeStudentId.value;
      item = await Get.find<HomeworkRepository>().byId(id);
      if (item != null) teacher = (await Get.find<DirectoryRepository>().teacherOrNull(item!.teacherId))?.name;
    }, isEmpty: () => item == null);
  }
}

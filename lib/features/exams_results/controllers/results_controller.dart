import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/utils/loadable.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/repositories/academic_repository.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';

class ResultsController extends GetxController with Loadable {
  final examIndex = 0.obs;

  /// Exams that have a result for this student, newest first.
  List<Exam> exams = [];
  List<ExamResult> results = [];

  Exam? get exam => exams.isEmpty ? null : exams[examIndex.value.clamp(0, exams.length - 1)];

  ExamResult? resultFor(Exam? e) => e == null ? null : results.where((r) => r.examId == e.id).firstOrNull;

  ExamResult? get result => resultFor(exam);

  Exam? get previousExam {
    final i = examIndex.value + 1;
    return i < exams.length ? exams[i] : null;
  }

  ExamResult? get previous => resultFor(previousExam);

  /// Marks change per subject since the previous exam, biggest moves first.
  List<(SubjectMark, int)> get changes {
    final now = result;
    final before = previous;
    if (now == null || before == null) return const [];
    final out = <(SubjectMark, int)>[];
    for (final mark in now.subjects) {
      final old = before.subjects.where((m) => m.subject == mark.subject).firstOrNull;
      if (old == null) continue;
      // Compare as marks out of the current exam's maximum.
      final delta = (mark.marks - old.marks * mark.maxMarks / old.maxMarks).round();
      out.add((mark, delta));
    }
    out.sort((a, b) => b.$2.abs().compareTo(a.$2.abs()));
    return out;
  }

  @override
  Future<void> load() async {
    final id = Get.find<AuthService>().activeStudentId.value;
    if (id == null) {
      await run(() async {}, isEmpty: () => true);
      return;
    }
    await run(() async {
      final student = await Get.find<DirectoryRepository>().student(id);
      final all = await Get.find<ExamRepository>().forClass(student.classId);
      results = await Get.find<ExamRepository>().resultsFor(id);
      exams = all.where((e) => results.any((r) => r.examId == e.id)).toList()
        ..sort((a, b) => b.endDate.compareTo(a.endDate));
      if (examIndex.value >= exams.length) examIndex.value = 0;
    }, isEmpty: () => exams.isEmpty);
  }
}

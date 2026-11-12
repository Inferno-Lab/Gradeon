import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/status.dart';
import 'package:gradeon/data/datasources/mock_json_datasource.dart';
import 'package:gradeon/data/datasources/mock_writes.dart';
import 'package:gradeon/data/datasources/remote_datasource.dart';
import 'package:gradeon/data/models/academics.dart';

abstract class AttendanceRepository {
  Future<List<AttendanceDay>> forStudent(String studentId);

  Future<AttendanceSummary> summary(String studentId, {DateTime? month});

  Future<Map<String, AttendanceStatus>> todayForClass(List<String> studentIds);

  Future<void> markToday(Map<String, AttendanceStatus> byStudent);
}

class MockAttendanceRepository implements AttendanceRepository {
  MockAttendanceRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<List<AttendanceDay>> forStudent(String studentId) => _ds.guard(
    () => _ds.attendance.where((day) => day.studentId == studentId).toList(),
  );

  @override
  Future<AttendanceSummary> summary(String studentId, {DateTime? month}) {
    return _ds.guard(() {
      final days = _ds.attendance.where((day) {
        if (day.studentId != studentId) return false;
        if (month == null) return true;
        return day.date.year == month.year && day.date.month == month.month;
      });
      return AttendanceSummary.from(days.toList());
    });
  }

  @override
  Future<Map<String, AttendanceStatus>> todayForClass(List<String> studentIds) {
    return _ds.guard(() {
      final today = DateTime.now().dateOnly;
      final map = <String, AttendanceStatus>{};
      for (final day in _ds.attendance) {
        if (!studentIds.contains(day.studentId)) continue;
        if (day.date.dateOnly != today) continue;
        map[day.studentId] = day.status;
      }
      return map;
    });
  }

  @override
  Future<void> markToday(Map<String, AttendanceStatus> byStudent) =>
      _ds.guard(() => _ds.markAttendance(byStudent));
}

class RemoteAttendanceRepository implements AttendanceRepository {
  RemoteAttendanceRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<List<AttendanceDay>> forStudent(String studentId) async {
    final json = await _remote.get('/students/$studentId/attendance');
    return [
      for (final item in json as List)
        AttendanceDay.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }

  @override
  Future<AttendanceSummary> summary(String studentId, {DateTime? month}) async {
    final days = await forStudent(studentId);
    return AttendanceSummary.from(days);
  }

  @override
  Future<Map<String, AttendanceStatus>> todayForClass(
    List<String> studentIds,
  ) async {
    final json = await _remote.get('/attendance/today', query: {'students': studentIds.join(',')});
    return {
      for (final e in (json as Map).entries)
        e.key as String: switch (e.value) {
          'absent' => AttendanceStatus.absent,
          'late' => AttendanceStatus.lateArrival,
          'holiday' => AttendanceStatus.holiday,
          _ => AttendanceStatus.present,
        },
    };
  }

  @override
  Future<void> markToday(Map<String, AttendanceStatus> byStudent) async {
    await _remote.post('/attendance', {
      for (final entry in byStudent.entries) entry.key: entry.value == AttendanceStatus.lateArrival ? 'late' : entry.value.name,
    });
  }
}

abstract class TimetableRepository {
  Future<List<TimetableDay>> forClass(String classId);
}

class MockTimetableRepository implements TimetableRepository {
  MockTimetableRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<List<TimetableDay>> forClass(String classId) => _ds.guard(
    () => _ds.timetable.where((day) => day.classId == classId).toList(),
  );
}

class RemoteTimetableRepository implements TimetableRepository {
  RemoteTimetableRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<List<TimetableDay>> forClass(String classId) async {
    final json = await _remote.get('/classes/$classId/timetable');
    return [
      for (final item in json as List)
        TimetableDay.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }
}

abstract class HomeworkRepository {
  Future<List<Homework>> forClass(String classId);

  Future<Homework?> byId(String id);

  Future<void> submit({
    required String homeworkId,
    required String studentId,
    required String fileName,
    String? filePath,
  });

  Future<void> grade({
    required String homeworkId,
    required String studentId,
    required int marks,
    required String grade,
    required String feedback,
  });

  Future<void> assign(Homework homework);
}

class MockHomeworkRepository implements HomeworkRepository {
  MockHomeworkRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<List<Homework>> forClass(String classId) => _ds.guard(
    () => _ds.homework.where((item) => item.classId == classId).toList(),
  );

  @override
  Future<Homework?> byId(String id) => _ds.guard(() {
    for (final item in _ds.homework) {
      if (item.id == id) return item;
    }
    return null;
  });

  @override
  Future<void> submit({
    required String homeworkId,
    required String studentId,
    required String fileName,
    String? filePath,
  }) => _ds.guard(
    () => _ds.submitHomework(
      homeworkId: homeworkId,
      studentId: studentId,
      fileName: fileName,
    ),
  );

  @override
  Future<void> grade({
    required String homeworkId,
    required String studentId,
    required int marks,
    required String grade,
    required String feedback,
  }) => _ds.guard(
    () => _ds.gradeHomework(
      homeworkId: homeworkId,
      studentId: studentId,
      marks: marks,
      grade: grade,
      feedback: feedback,
    ),
  );

  @override
  Future<void> assign(Homework homework) =>
      _ds.guard(() => _ds.addHomework(homework));
}

class RemoteHomeworkRepository implements HomeworkRepository {
  RemoteHomeworkRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<List<Homework>> forClass(String classId) async {
    final json = await _remote.get('/classes/$classId/homework');
    return [
      for (final item in json as List)
        Homework.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }

  @override
  Future<Homework?> byId(String id) async {
    final json = await _remote.get('/homework/$id');
    return Homework.fromJson(Map<String, dynamic>.from(json as Map));
  }

  @override
  Future<void> submit({
    required String homeworkId,
    required String studentId,
    required String fileName,
    String? filePath,
  }) async {
    // The work itself goes to the school's storage first; the hand-in then names it.
    final fileId = filePath == null ? null : await _remote.client.upload(kind: 'homework_submission', ownerId: '$homeworkId:$studentId', path: filePath);
    await _remote.post('/homework/$homeworkId/submissions', {
      'studentId': studentId,
      'fileName': fileName,
      'fileIds': [?fileId],
    });
  }

  @override
  Future<void> grade({
    required String homeworkId,
    required String studentId,
    required int marks,
    required String grade,
    required String feedback,
  }) => _remote.post('/homework/$homeworkId/grades', {
    'studentId': studentId,
    'marks': marks,
    'grade': grade,
    'feedback': feedback,
  });

  @override
  Future<void> assign(Homework homework) =>
      _remote.post('/homework', homework.toJson());
}

abstract class ExamRepository {
  Future<List<Exam>> forClass(String classId);

  Future<ExamResult?> result({required String examId, required String studentId});

  Future<List<ExamResult>> resultsFor(String studentId);

  Future<Map<String, int>> marksDraft(String classId, String subject);

  Future<void> saveMarks({
    required String classId,
    required String subject,
    required Map<String, int> values,
  });
}

class MockExamRepository implements ExamRepository {
  MockExamRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<List<Exam>> forClass(String classId) => _ds.guard(
    () => _ds.exams.where((exam) => exam.classId == classId).toList(),
  );

  @override
  Future<ExamResult?> result({
    required String examId,
    required String studentId,
  }) => _ds.guard(() {
    for (final item in _ds.results) {
      if (item.examId == examId && item.studentId == studentId) return item;
    }
    return null;
  });

  @override
  Future<List<ExamResult>> resultsFor(String studentId) => _ds.guard(
    () => _ds.results.where((item) => item.studentId == studentId).toList(),
  );

  @override
  Future<Map<String, int>> marksDraft(String classId, String subject) =>
      _ds.guard(() => {...?_ds.marks['$classId|$subject']});

  @override
  Future<void> saveMarks({
    required String classId,
    required String subject,
    required Map<String, int> values,
  }) => _ds.guard(
    () => _ds.saveMarks(classId: classId, subject: subject, values: values),
  );
}

class RemoteExamRepository implements ExamRepository {
  RemoteExamRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<List<Exam>> forClass(String classId) async {
    final json = await _remote.get('/classes/$classId/exams');
    return [
      for (final item in json as List)
        Exam.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }

  @override
  Future<ExamResult?> result({
    required String examId,
    required String studentId,
  }) async {
    final json = await _remote.get('/results/$examId/$studentId');
    return ExamResult.fromJson(Map<String, dynamic>.from(json as Map));
  }

  @override
  Future<List<ExamResult>> resultsFor(String studentId) async {
    final json = await _remote.get('/students/$studentId/results');
    return [
      for (final item in json as List)
        ExamResult.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }

  @override
  Future<Map<String, int>> marksDraft(String classId, String subject) async {
    final json = await _remote.get('/classes/$classId/marks', query: {'subject': subject});
    return {for (final e in (json as Map).entries) e.key as String: (e.value as num).toInt()};
  }

  @override
  Future<void> saveMarks({
    required String classId,
    required String subject,
    required Map<String, int> values,
  }) => _remote.post('/classes/$classId/marks', {
    'subject': subject,
    'values': values,
  });
}

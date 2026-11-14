// Reads every screen's data from a running school API and checks that the app's models accept it.
// Needs the demo school running (`bash tools/dev-reset.sh`). Usage (the app must be built for that school):
//   flutter test test/tool/live_probe_test.dart --dart-define=LIVE_API=http://localhost:4000 --dart-define=SCHOOL=greenfield --dart-define=API_BASE_URL=http://localhost:4000
import 'package:flutter_test/flutter_test.dart';
import 'package:tangent/core/network/api_client.dart';
import 'package:tangent/core/services/storage_service.dart';
import 'package:tangent/data/datasources/remote_datasource.dart';
import 'package:tangent/data/models/academics.dart';
import 'package:tangent/data/models/user.dart';
import 'package:tangent/data/repositories/academic_repository.dart';
import 'package:tangent/data/repositories/auth_repository.dart';
import 'package:tangent/data/repositories/campus_repository.dart';
import 'package:tangent/data/repositories/directory_repository.dart';

const _api = String.fromEnvironment('LIVE_API');

Future<(RemoteDataSource, AppUser)> _signIn(UserRole role) async {
  final client = ApiClient(storage: StorageService(memory: <String, dynamic>{}), base: _api, school: 'greenfield');
  final remote = RemoteDataSource(client);
  final user = await RemoteAuthRepository(remote).loginAs(role);
  return (remote, user);
}

void main() {
  const skip = _api == '' ? 'needs LIVE_API' : null;
  group('a parent reads the school', skip: skip, () {
    test('every family screen parses', () async {
      final (remote, user) = await _signIn(UserRole.parent);
      expect(user.role, UserRole.parent);
      expect(user.childIds.length, 2);
      final directory = RemoteDirectoryRepository(remote);
      final aarav = await directory.student('stu_aarav');
      expect(aarav.name, 'Aarav Sharma');
      final cls = await directory.schoolClass(aarav.classId);
      expect(cls.studentIds, isNotEmpty);
      expect((await directory.teachers()).any((t) => t.name == 'Kavita Iyer'), isTrue);
      expect(await directory.userName(user.id), 'Priya Sharma');
      expect((await directory.school()).name, isNotEmpty);

      final attendance = await RemoteAttendanceRepository(remote).forStudent('stu_aarav');
      expect(attendance, isNotEmpty);
      final tt = await RemoteTimetableRepository(remote).forClass(aarav.classId);
      expect(tt, isNotEmpty);
      expect(tt.first.periods.any((p) => p.kind == PeriodKind.breakTime), isTrue);
      final homework = await RemoteHomeworkRepository(remote).forClass(aarav.classId);
      expect(homework, isNotEmpty);
      expect((await RemoteHomeworkRepository(remote).byId(homework.first.id))!.title, homework.first.title);
      final exams = RemoteExamRepository(remote);
      final done = (await exams.forClass(aarav.classId)).firstWhere((e) => e.status == ExamStatus.completed);
      final result = await exams.result(examId: done.id, studentId: 'stu_aarav');
      expect(result!.overallPercent, 91);
      expect((await exams.resultsFor('stu_aarav')), isNotEmpty);

      final fee = await RemoteFeeRepository(remote).forStudent('stu_aarav');
      expect(fee!.installments, isNotEmpty);
      expect((await RemoteNoticeRepository(remote).all()), isNotEmpty);
      final events = await RemoteEventRepository(remote).all();
      expect(events.first.time, matches(RegExp(r'^\d{2}:\d{2}$')));

      final chat = RemoteChatRepository(remote);
      final inbox = await chat.inbox(user.id);
      expect(inbox.threads, isNotEmpty);
      expect(inbox.messages, isNotEmpty);
      expect((await chat.messages(inbox.threads.first.id)), isNotEmpty);

      expect((await RemoteLibraryRepository(remote).all()), isA<List<dynamic>>());
      expect((await RemoteTransportRepository(remote).forStudent('stu_aarav'))!.routeName, 'Route 4');
      expect((await RemoteLeaveRepository(remote).forStudent('stu_aarav')), isA<List<dynamic>>());
      expect((await RemoteGalleryRepository(remote).all()), isEmpty);
      expect((await RemoteNotificationRepository(remote).forUser(user.id)), isA<List<dynamic>>());
    });
  });

  group('a teacher reads and writes', skip: skip, () {
    test('the teacher screens parse and the marks draft is a map', () async {
      final (remote, user) = await _signIn(UserRole.teacher);
      expect(user.teacherId, isNotNull);
      final classes = await RemoteDirectoryRepository(remote).classesForTeacher(user.teacherId!);
      expect(classes.map((c) => c.id), contains('cls_8a'));
      final today = await RemoteAttendanceRepository(remote).todayForClass(['stu_aarav']);
      expect(today, isA<Map<String, AttendanceStatus>>());
      expect(await RemoteExamRepository(remote).marksDraft('cls_8a', 'maths'), isA<Map<String, int>>());
    });
  });
}

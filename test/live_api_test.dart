// Reads every app endpoint from a running school API through the app's own repositories, as a parent and as a teacher, so a
// change in what the server sends shows up as a failure here instead of on a phone. Skipped unless LIVE_API is set:
//   flutter test test/live_api_test.dart --dart-define=LIVE_API=http://localhost:4000 --dart-define=LIVE_SCHOOL=greenfield
import 'package:flutter_test/flutter_test.dart';
import 'package:tangent/core/network/api_client.dart';
import 'package:tangent/core/services/storage_service.dart';
import 'package:tangent/data/datasources/remote_datasource.dart';
import 'package:tangent/data/models/user.dart';
import 'package:tangent/data/repositories/academic_repository.dart';
import 'package:tangent/data/repositories/auth_repository.dart';
import 'package:tangent/data/repositories/campus_repository.dart';
import 'package:tangent/data/repositories/directory_repository.dart';

const _base = String.fromEnvironment('LIVE_API');
const _school = String.fromEnvironment('LIVE_SCHOOL', defaultValue: 'greenfield');

Future<(RemoteDataSource, AppUser)> _signIn(String email) async {
  final remote = RemoteDataSource(ApiClient(storage: StorageService(memory: <String, dynamic>{}), base: _base, school: _school));
  final auth = RemoteAuthRepository(remote);
  try {
    return (remote, await auth.login(email: email, password: 'nest2026'));
  } on OtpRequired catch (otp) {
    return (remote, await auth.loginWithOtp(email: email, otp: otp.demoCode ?? '424242'));
  }
}

void main() {
  final skip = _base.isEmpty ? 'set LIVE_API to a running school API' : null;

  test('a parent reads everything the app shows', () async {
    final (remote, me) = await _signIn('priya.sharma@example.com');
    expect(me.role, UserRole.parent);
    final dir = RemoteDirectoryRepository(remote);
    await dir.school();
    await dir.teachers();
    for (final id in me.childIds) {
      final child = await dir.student(id);
      await dir.schoolClass(child.classId);
      await RemoteAttendanceRepository(remote).forStudent(id);
      await RemoteAttendanceRepository(remote).summary(id);
      await RemoteTimetableRepository(remote).forClass(child.classId);
      await RemoteHomeworkRepository(remote).forClass(child.classId);
      await RemoteExamRepository(remote).forClass(child.classId);
      await RemoteExamRepository(remote).resultsFor(id);
      await RemoteFeeRepository(remote).forStudent(id);
      await RemoteTransportRepository(remote).forStudent(id);
      await RemoteLeaveRepository(remote).forStudent(id);
    }
    await RemoteNoticeRepository(remote).all();
    await RemoteEventRepository(remote).all();
    await RemoteChatRepository(remote).threadsFor(me.id);
    await RemoteChatRepository(remote).inbox(me.id);
    await RemoteLibraryRepository(remote).all();
    await RemoteGalleryRepository(remote).all();
    await RemoteNotificationRepository(remote).forUser(me.id);
  }, skip: skip, timeout: const Timeout(Duration(minutes: 2)));

  test('a teacher reads everything the app shows', () async {
    final (remote, me) = await _signIn('kavita.iyer@greenfield.edu.in');
    expect(me.role, UserRole.teacher);
    final dir = RemoteDirectoryRepository(remote);
    final classes = await dir.classesForTeacher(me.id);
    expect(classes, isNotEmpty);
    for (final c in classes) {
      final students = await dir.studentsIn(c.id);
      await RemoteAttendanceRepository(remote).todayForClass([for (final s in students) s.id]);
      await RemoteHomeworkRepository(remote).forClass(c.id);
      await RemoteExamRepository(remote).forClass(c.id);
      await RemoteTimetableRepository(remote).forClass(c.id);
    }
    await RemoteNoticeRepository(remote).all();
    await RemoteChatRepository(remote).inbox(me.id);
    await RemoteLibraryRepository(remote).all();
    await RemoteNotificationRepository(remote).forUser(me.id);
  }, skip: skip, timeout: const Timeout(Duration(minutes: 2)));
}

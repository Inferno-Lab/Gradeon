import 'package:gradeon/core/utils/app_exception.dart';
import 'package:gradeon/data/datasources/mock_json_datasource.dart';
import 'package:gradeon/data/datasources/remote_datasource.dart';
import 'package:gradeon/data/models/student.dart';

abstract class DirectoryRepository {
  Future<Student> student(String id);

  Future<List<Student>> studentsIn(String classId);

  Future<SchoolClass> schoolClass(String id);

  Future<List<SchoolClass>> classesForTeacher(String teacherId);

  Future<Teacher> teacher(String id);

  Future<Teacher?> teacherOrNull(String id);

  /// Display name for any account (parent, student or teacher), or null.
  Future<String?> userName(String userId);

  Future<List<Teacher>> teachers();

  Future<SchoolInfo> school();
}

class MockDirectoryRepository implements DirectoryRepository {
  MockDirectoryRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<Student> student(String id) => _ds.guard(() {
    for (final item in _ds.students) {
      if (item.id == id) return item;
    }
    throw const AppException('errors.not_found');
  });

  @override
  Future<List<Student>> studentsIn(String classId) => _ds.guard(
    () => _ds.students.where((item) => item.classId == classId).toList(),
  );

  @override
  Future<SchoolClass> schoolClass(String id) => _ds.guard(() {
    for (final item in _ds.classes) {
      if (item.id == id) return item;
    }
    throw const AppException('errors.not_found');
  });

  @override
  Future<List<SchoolClass>> classesForTeacher(String teacherId) => _ds.guard(() {
    // A teacher's classes: the ones they teach, plus any they are class teacher of.
    final teaches = _findTeacher(teacherId)?.classIds ?? const <String>[];
    return _ds.classes.where((item) => item.classTeacherId == teacherId || teaches.contains(item.id)).toList();
  });

  @override
  Future<Teacher> teacher(String id) => _ds.guard(() {
    final found = _findTeacher(id);
    if (found == null) throw const AppException('errors.not_found');
    return found;
  });

  @override
  Future<Teacher?> teacherOrNull(String id) => _ds.guard(() => _findTeacher(id));

  @override
  Future<String?> userName(String userId) =>
      _ds.guard(() => _ds.users.where((u) => u.id == userId).firstOrNull?.name);

  @override
  Future<List<Teacher>> teachers() => _ds.guard(() => [..._ds.teachers]);

  @override
  Future<SchoolInfo> school() => _ds.guard(() => _ds.school!);

  Teacher? _findTeacher(String id) {
    for (final item in _ds.teachers) {
      if (item.id == id) return item;
    }
    return null;
  }
}

class RemoteDirectoryRepository implements DirectoryRepository {
  RemoteDirectoryRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<Student> student(String id) async =>
      Student.fromJson(Map<String, dynamic>.from(await _remote.get('/students/$id') as Map));

  @override
  Future<List<Student>> studentsIn(String classId) async => _students(
    await _remote.get('/classes/$classId/students'),
  );

  @override
  Future<SchoolClass> schoolClass(String id) async => SchoolClass.fromJson(
    Map<String, dynamic>.from(await _remote.get('/classes/$id') as Map),
  );

  @override
  Future<List<SchoolClass>> classesForTeacher(String teacherId) async {
    final json = await _remote.get('/teachers/$teacherId/classes');
    return [
      for (final item in json as List)
        SchoolClass.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }

  @override
  Future<Teacher> teacher(String id) async =>
      Teacher.fromJson(Map<String, dynamic>.from(await _remote.get('/teachers/$id') as Map));

  @override
  Future<Teacher?> teacherOrNull(String id) async => teacher(id);

  @override
  Future<String?> userName(String userId) async {
    final json = await _remote.get('/users/$userId');
    return (json as Map)['name'] as String?;
  }

  @override
  Future<List<Teacher>> teachers() async {
    final json = await _remote.get('/teachers');
    return [
      for (final item in json as List)
        Teacher.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }

  @override
  Future<SchoolInfo> school() async => SchoolInfo.fromJson(
    Map<String, dynamic>.from(await _remote.get('/school') as Map),
  );

  Future<List<Student>> _students(dynamic json) async => [
    for (final item in json as List)
      Student.fromJson(Map<String, dynamic>.from(item as Map)),
  ];
}

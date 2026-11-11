// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'academics.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AttendanceDay _$AttendanceDayFromJson(Map<String, dynamic> json) =>
    AttendanceDay(
      studentId: json['studentId'] as String,
      date: DateTime.parse(json['date'] as String),
      status: $enumDecode(_$AttendanceStatusEnumMap, json['status']),
    );

Map<String, dynamic> _$AttendanceDayToJson(AttendanceDay instance) =>
    <String, dynamic>{
      'studentId': instance.studentId,
      'date': instance.date.toIso8601String(),
      'status': _$AttendanceStatusEnumMap[instance.status]!,
    };

const _$AttendanceStatusEnumMap = {
  AttendanceStatus.present: 'present',
  AttendanceStatus.absent: 'absent',
  AttendanceStatus.lateArrival: 'late',
  AttendanceStatus.holiday: 'holiday',
};

PeriodSlot _$PeriodSlotFromJson(Map<String, dynamic> json) => PeriodSlot(
  id: json['id'] as String,
  subject: json['subject'] as String,
  start: json['start'] as String,
  end: json['end'] as String,
  room: json['room'] as String,
  kind: $enumDecode(_$PeriodKindEnumMap, json['kind']),
  teacherId: json['teacherId'] as String?,
);

Map<String, dynamic> _$PeriodSlotToJson(PeriodSlot instance) =>
    <String, dynamic>{
      'id': instance.id,
      'subject': instance.subject,
      'teacherId': ?instance.teacherId,
      'start': instance.start,
      'end': instance.end,
      'room': instance.room,
      'kind': _$PeriodKindEnumMap[instance.kind]!,
    };

const _$PeriodKindEnumMap = {
  PeriodKind.klass: 'class',
  PeriodKind.breakTime: 'break',
  PeriodKind.recess: 'recess',
};

TimetableDay _$TimetableDayFromJson(Map<String, dynamic> json) => TimetableDay(
  classId: json['classId'] as String,
  day: json['day'] as String,
  periods: (json['periods'] as List<dynamic>)
      .map((e) => PeriodSlot.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$TimetableDayToJson(TimetableDay instance) =>
    <String, dynamic>{
      'classId': instance.classId,
      'day': instance.day,
      'periods': instance.periods.map((e) => e.toJson()).toList(),
    };

HomeworkSubmission _$HomeworkSubmissionFromJson(Map<String, dynamic> json) =>
    HomeworkSubmission(
      studentId: json['studentId'] as String,
      status: $enumDecode(_$HomeworkStatusEnumMap, json['status']),
      submittedAt: json['submittedAt'] == null
          ? null
          : DateTime.parse(json['submittedAt'] as String),
      fileName: json['fileName'] as String?,
      marks: (json['marks'] as num?)?.toInt(),
      grade: json['grade'] as String?,
      feedback: json['feedback'] as String?,
      returnNote: json['returnNote'] as String?,
    );

Map<String, dynamic> _$HomeworkSubmissionToJson(HomeworkSubmission instance) =>
    <String, dynamic>{
      'studentId': instance.studentId,
      'status': _$HomeworkStatusEnumMap[instance.status]!,
      'submittedAt': ?instance.submittedAt?.toIso8601String(),
      'fileName': ?instance.fileName,
      'marks': ?instance.marks,
      'grade': ?instance.grade,
      'feedback': ?instance.feedback,
      'returnNote': ?instance.returnNote,
    };

const _$HomeworkStatusEnumMap = {
  HomeworkStatus.pending: 'pending',
  HomeworkStatus.submitted: 'submitted',
  HomeworkStatus.graded: 'graded',
  HomeworkStatus.returned: 'returned',
};

Homework _$HomeworkFromJson(Map<String, dynamic> json) => Homework(
  id: json['id'] as String,
  classId: json['classId'] as String,
  subject: json['subject'] as String,
  title: json['title'] as String,
  description: json['description'] as String,
  assignedOn: DateTime.parse(json['assignedOn'] as String),
  dueOn: DateTime.parse(json['dueOn'] as String),
  teacherId: json['teacherId'] as String,
  maxMarks: (json['maxMarks'] as num).toInt(),
  attachments: (json['attachments'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  submissions: (json['submissions'] as List<dynamic>)
      .map((e) => HomeworkSubmission.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$HomeworkToJson(Homework instance) => <String, dynamic>{
  'id': instance.id,
  'classId': instance.classId,
  'subject': instance.subject,
  'title': instance.title,
  'description': instance.description,
  'assignedOn': instance.assignedOn.toIso8601String(),
  'dueOn': instance.dueOn.toIso8601String(),
  'teacherId': instance.teacherId,
  'maxMarks': instance.maxMarks,
  'attachments': instance.attachments,
  'submissions': instance.submissions.map((e) => e.toJson()).toList(),
};

Exam _$ExamFromJson(Map<String, dynamic> json) => Exam(
  id: json['id'] as String,
  name: json['name'] as String,
  classId: json['classId'] as String,
  startDate: DateTime.parse(json['startDate'] as String),
  endDate: DateTime.parse(json['endDate'] as String),
  status: $enumDecode(_$ExamStatusEnumMap, json['status']),
  subjects: (json['subjects'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  papers:
      (json['papers'] as List<dynamic>?)
          ?.map((e) => ExamPaper.fromJson(e as Map<String, dynamic>))
          .toList() ??
      [],
);

Map<String, dynamic> _$ExamToJson(Exam instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'classId': instance.classId,
  'startDate': instance.startDate.toIso8601String(),
  'endDate': instance.endDate.toIso8601String(),
  'status': _$ExamStatusEnumMap[instance.status]!,
  'subjects': instance.subjects,
  'papers': instance.papers.map((e) => e.toJson()).toList(),
};

const _$ExamStatusEnumMap = {
  ExamStatus.upcoming: 'upcoming',
  ExamStatus.completed: 'completed',
};

ExamPaper _$ExamPaperFromJson(Map<String, dynamic> json) => ExamPaper(
  subject: json['subject'] as String,
  date: DateTime.parse(json['date'] as String),
  subjectName: json['subjectName'] as String? ?? '',
  startsAt: json['startsAt'] as String? ?? '',
  endsAt: json['endsAt'] as String? ?? '',
  room: json['room'] as String? ?? '',
  maxMarks: (json['maxMarks'] as num?)?.toInt() ?? 0,
);

Map<String, dynamic> _$ExamPaperToJson(ExamPaper instance) => <String, dynamic>{
  'subject': instance.subject,
  'subjectName': instance.subjectName,
  'date': instance.date.toIso8601String(),
  'startsAt': instance.startsAt,
  'endsAt': instance.endsAt,
  'room': instance.room,
  'maxMarks': instance.maxMarks,
};

SubjectMark _$SubjectMarkFromJson(Map<String, dynamic> json) => SubjectMark(
  subject: json['subject'] as String,
  marks: (json['marks'] as num).toInt(),
  maxMarks: (json['maxMarks'] as num).toInt(),
  grade: json['grade'] as String,
);

Map<String, dynamic> _$SubjectMarkToJson(SubjectMark instance) =>
    <String, dynamic>{
      'subject': instance.subject,
      'marks': instance.marks,
      'maxMarks': instance.maxMarks,
      'grade': instance.grade,
    };

TrendPoint _$TrendPointFromJson(Map<String, dynamic> json) => TrendPoint(
  label: json['label'] as String,
  percent: (json['percent'] as num).toDouble(),
);

Map<String, dynamic> _$TrendPointToJson(TrendPoint instance) =>
    <String, dynamic>{'label': instance.label, 'percent': instance.percent};

ExamResult _$ExamResultFromJson(Map<String, dynamic> json) => ExamResult(
  id: json['id'] as String,
  examId: json['examId'] as String,
  studentId: json['studentId'] as String,
  overallPercent: (json['overallPercent'] as num).toDouble(),
  grade: json['grade'] as String,
  rank: (json['rank'] as num).toInt(),
  totalStudents: (json['totalStudents'] as num).toInt(),
  subjects: (json['subjects'] as List<dynamic>)
      .map((e) => SubjectMark.fromJson(e as Map<String, dynamic>))
      .toList(),
  trend: (json['trend'] as List<dynamic>)
      .map((e) => TrendPoint.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ExamResultToJson(ExamResult instance) =>
    <String, dynamic>{
      'id': instance.id,
      'examId': instance.examId,
      'studentId': instance.studentId,
      'overallPercent': instance.overallPercent,
      'grade': instance.grade,
      'rank': instance.rank,
      'totalStudents': instance.totalStudents,
      'subjects': instance.subjects.map((e) => e.toJson()).toList(),
      'trend': instance.trend.map((e) => e.toJson()).toList(),
    };

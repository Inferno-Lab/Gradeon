import 'package:get/get.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/data/datasources/mock_json_datasource.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/models/student.dart';

extension MockWrites on MockJsonDataSource {
  void submitHomework({
    required String homeworkId,
    required String studentId,
    required String fileName,
  }) {
    final index = homework.indexWhere((item) => item.id == homeworkId);
    if (index < 0) return;
    final item = homework[index];
    final next = [
      for (final submission in item.submissions)
        if (submission.studentId == studentId)
          submission.copyWith(
            status: HomeworkStatus.submitted,
            submittedAt: DateTime.now(),
            fileName: fileName,
          )
        else
          submission,
    ];
    homework[index] = item.copyWith(submissions: next);
    bump();
  }

  void gradeHomework({
    required String homeworkId,
    required String studentId,
    required int marks,
    required String grade,
    required String feedback,
  }) {
    final index = homework.indexWhere((item) => item.id == homeworkId);
    if (index < 0) return;
    final item = homework[index];
    final next = [
      for (final submission in item.submissions)
        if (submission.studentId == studentId)
          submission.copyWith(
            status: HomeworkStatus.graded,
            marks: marks,
            grade: grade,
            feedback: feedback,
            submittedAt: submission.submittedAt ?? DateTime.now(),
          )
        else
          submission,
    ];
    homework[index] = item.copyWith(submissions: next);
    bump();
  }

  void addHomework(Homework item) {
    homework.insert(0, item);
    bump();
  }

  /// Marks the installment paid and returns the receipt that was stored.
  Receipt? payInstallment({
    required String studentId,
    required String installmentId,
    required String method,
  }) {
    final index = fees.indexWhere((account) => account.studentId == studentId);
    if (index < 0) return null;
    final account = fees[index];
    Installment? paid;
    final next = [
      for (final installment in account.installments)
        if (installment.id == installmentId && !installment.paid)
          paid = installment.copyWith(
            paid: true,
            paidOn: DateTime.now(),
            method: method,
            reference: 'DEMO${DateTime.now().millisecondsSinceEpoch % 1000000}',
          )
        else
          installment,
    ];
    final receiptSource = paid;
    final receipts = [...account.receipts];
    Receipt? created;
    if (receiptSource != null) {
      receipts.insert(
        0,
        created = Receipt(
          id: nextId('rcpt'),
          installmentId: receiptSource.id,
          title: receiptSource.title,
          amount: receiptSource.amount,
          paidOn: receiptSource.paidOn!,
          method: receiptSource.method!,
          reference: receiptSource.reference!,
        ),
      );
    }
    fees[index] = account.copyWith(installments: next, receipts: receipts);
    bump();
    return created;
  }

  void sendMessage({
    required String threadId,
    required String senderId,
    required String text,
  }) {
    messages.add(
      ChatMessage(
        id: nextId('msg'),
        threadId: threadId,
        senderId: senderId,
        text: text,
        sentAt: DateTime.now(),
        read: true,
      ),
    );
    bump();
    Future<void>.delayed(const Duration(milliseconds: 1200), () {
      messages.add(
        ChatMessage(
          id: nextId('msg'),
          threadId: threadId,
          senderId: 'usr_office',
          text: 'Thanks, noted. I will follow up after the next period.',
          sentAt: DateTime.now(),
          read: false,
        ),
      );
      bump();
    });
  }

  void markAttendance(Map<String, AttendanceStatus> byStudent) {
    final today = DateTime.now().dateOnly;
    attendance.removeWhere(
      (day) =>
          byStudent.containsKey(day.studentId) && day.date.dateOnly == today,
    );
    for (final entry in byStudent.entries) {
      attendance.add(
        AttendanceDay(
          studentId: entry.key,
          date: today,
          status: entry.value,
        ),
      );
    }
    bump();
  }

  void applyLeave(LeaveRequest request) {
    leaves.insert(0, request);
    bump();
  }

  void reviewLeave({
    required String id,
    required LeaveStatus status,
    required String reviewer,
    String? note,
  }) {
    final i = leaves.indexWhere((l) => l.id == id);
    if (i < 0) return;
    final l = leaves[i];
    leaves[i] = LeaveRequest(
      id: l.id,
      studentId: l.studentId,
      from: l.from,
      to: l.to,
      reason: l.reason,
      status: status,
      appliedOn: l.appliedOn,
      reviewedBy: reviewer,
      reviewNote: note,
      note: l.note,
    );
    bump();
  }

  void rsvp({
    required String eventId,
    required String userId,
    required RsvpStatus status,
  }) {
    final index = events.indexWhere((event) => event.id == eventId);
    if (index < 0) return;
    final event = events[index];
    final next = [
      for (final item in event.rsvps)
        if (item.userId != userId) item,
      Rsvp(userId: userId, status: status),
    ];
    events[index] = event.copyWith(rsvps: next);
    bump();
  }

  void addNotice(Notice notice) {
    notices.insert(0, notice);
    bump();
  }

  void reserveBook({required String bookId, required String studentId}) {
    final index = books.indexWhere((book) => book.id == bookId);
    if (index < 0) return;
    books[index] = books[index].copyWith(
      available: false,
      borrowedBy: studentId,
      dueDate: DateTime.now().add(const Duration(days: 14)),
    );
    bump();
  }

  /// Extends a borrowed book by two weeks from its current due date.
  void renewBook(String bookId) {
    final index = books.indexWhere((book) => book.id == bookId);
    final due = index < 0 ? null : books[index].dueDate;
    if (due == null) return;
    books[index] = books[index].copyWith(
      dueDate: due.add(const Duration(days: 14)),
    );
    bump();
  }

  void markThreadRead({required String threadId, required String userId}) {
    var changed = false;
    for (var i = 0; i < messages.length; i++) {
      final m = messages[i];
      if (m.threadId != threadId || m.senderId == userId || m.read) continue;
      messages[i] = ChatMessage(
        id: m.id,
        threadId: m.threadId,
        senderId: m.senderId,
        text: m.text,
        sentAt: m.sentAt,
        read: true,
      );
      changed = true;
    }
    if (changed) bump();
  }

  String startThread({required String userId, required Teacher teacher}) {
    final other = teacher.userId ?? 'usr_${teacher.id}';
    final existing = threads
        .where(
          (t) =>
              t.participantIds.contains(userId) &&
              t.participantIds.contains(other),
        )
        .firstOrNull;
    if (existing != null) return existing.id;
    final thread = ChatThread(
      id: nextId('th'),
      title: teacher.name,
      subtitle: 'subject.${teacher.subject}'.tr,
      participantIds: [userId, other],
      avatarUrl: teacher.avatarUrl,
      online: false,
    );
    threads.add(thread);
    bump();
    return thread.id;
  }

  void dismissNotification(String id) {
    notifications.removeWhere((item) => item.id == id);
    bump();
  }

  void markNotificationsRead(String userId) {
    notifications = [
      for (final item in notifications)
        if (item.userId == userId) item.copyWith(read: true) else item,
    ];
    bump();
  }

  void saveMarks({
    required String classId,
    required String subject,
    required Map<String, int> values,
  }) {
    marks['$classId|$subject'] = {...values};
    bump();
  }
}

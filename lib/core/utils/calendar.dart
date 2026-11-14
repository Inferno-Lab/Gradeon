import 'package:tangent/core/widgets/toast.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

/// Opens a pre-filled calendar event. All-day events end the day after [last].
///
/// shortcut: uses the Google Calendar web template (no device calendar plugin); switch to a native
/// calendar intent if families ask for it.
Future<void> addToCalendar({
  required String title,
  required DateTime first,
  DateTime? last,
  String details = '',
}) async {
  final fmt = DateFormat('yyyyMMdd');
  final end = (last ?? first).add(const Duration(days: 1));
  final uri = Uri.https('calendar.google.com', '/calendar/render', {
    'action': 'TEMPLATE',
    'text': title,
    'dates': '${fmt.format(first)}/${fmt.format(end)}',
    'details': details,
  });
  var ok = false;
  try {
    ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } on Exception {
    ok = false;
  }
  if (!ok) ToastHelper.show('errors.cant_open', kind: ToastKind.error);
}

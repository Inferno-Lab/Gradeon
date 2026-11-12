#!/usr/bin/env bash
# FIRST IMPORT ONLY. The generated views are edited by hand afterwards (dashboard, login and others already are): do not run this over them.
# Re-runs the canvas converter for every board. Only for the first import: after that the generated files are edited by hand.
set -e
cd "$(dirname "$0")/.."
for spec in \
  "Main dashboard apps/admin/src/pages/dashboard" "AdminStudents students apps/admin/src/pages/students" "AdminTimetable timetable apps/admin/src/pages/timetable" \
  "AdminPhone phone apps/admin/src/pages/phone" \
  "ConsoleFleet fleet apps/console/src/pages/fleet" "ConsoleSchool school apps/console/src/pages/school" "Components components apps/admin/src/design/components" \
  ; do
  set -- $spec
  node tools/dc-to-tsx.mjs "$1" "$2" "$3"
done

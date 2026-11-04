#!/usr/bin/env python3
"""Generate Gradeon mock JSON. Dates are relative to today (today-N / today+N)."""

from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "assets" / "mock"
ROOT.mkdir(parents=True, exist_ok=True)
rng = random.Random(42)


def dump(name: str, data: object) -> None:
    (ROOT / name).write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def avatar(img: int) -> str:
    return f"https://i.pravatar.cc/300?img={img}"


def photo(seed: str, w: int = 900, h: int = 1200) -> str:
    return f"https://picsum.photos/seed/{seed}/{w}/{h}"


students = [
    ("stu_aarav", "usr_aarav", "Aarav Sharma", "cls_8a", "08", "2012-04-18", "B+", "Emerald", 12, "14, Ivory Towers, Baner, Pune"),
    ("stu_diya", None, "Diya Mehta", "cls_8a", "14", "2012-08-02", "O+", "Ruby", 5, "9, Palms, Aundh, Pune"),
    ("stu_kabir", None, "Kabir Singh", "cls_8a", "21", "2012-01-29", "A+", "Sapphire", 15, "22, Lake Homes, Baner, Pune"),
    ("stu_myra", None, "Myra Kapoor", "cls_8a", "11", "2012-11-09", "AB+", "Amber", 9, "3, Oakwood, Balewadi, Pune"),
    ("stu_vivaan", None, "Vivaan Joshi", "cls_8a", "27", "2012-06-14", "B+", "Emerald", 33, "18, River Park, Baner, Pune"),
    ("stu_anika", None, "Anika Rao", "cls_8a", "04", "2012-03-22", "O-", "Ruby", 20, "7, Green Court, Pashan, Pune"),
    ("stu_ishaan", None, "Ishaan Gupta", "cls_8a", "19", "2012-09-30", "A+", "Sapphire", 52, "11, Horizon, Baner, Pune"),
    ("stu_sara", None, "Sara Khan", "cls_8a", "16", "2012-12-05", "B-", "Amber", 45, "2, Crescent, Aundh, Pune"),
    ("stu_arjun_s", None, "Arnav Nair", "cls_8a", "23", "2012-02-17", "O+", "Emerald", 60, "16, Maple, Baner, Pune"),
    ("stu_kiara", None, "Kiara Patel", "cls_8a", "09", "2012-07-28", "A+", "Ruby", 25, "5, Silk Route, Balewadi, Pune"),
    ("stu_ananya", "usr_ananya", "Ananya Sharma", "cls_5b", "06", "2015-09-12", "B+", "Sapphire", 32, "14, Ivory Towers, Baner, Pune"),
    ("stu_reyansh", None, "Reyansh Kulkarni", "cls_5b", "12", "2015-01-08", "O+", "Amber", 68, "21, Windmere, Aundh, Pune"),
    ("stu_aisha", None, "Aisha Shaikh", "cls_5b", "03", "2015-05-19", "A+", "Emerald", 47, "8, Pearl Residency, Pashan, Pune"),
    ("stu_advait", None, "Advait Desai", "cls_5b", "18", "2015-10-27", "B+", "Ruby", 11, "13, Saffron, Baner, Pune"),
    ("stu_mishka", None, "Mishka Bansal", "cls_5b", "15", "2015-04-03", "AB+", "Sapphire", 24, "6, Clover, Balewadi, Pune"),
]

teachers = [
    ("tch_kavita", "usr_kavita", "Kavita Iyer", "maths", "kavita.iyer@greenfield.edu.in", "+91 98220 44110", 49, ["cls_8a"]),
    ("tch_meera", None, "Meera Nair", "english", "meera.nair@greenfield.edu.in", "+91 98220 44111", 44, ["cls_5b"]),
    ("tch_rahul", None, "Rahul Deshmukh", "science", "rahul.deshmukh@greenfield.edu.in", "+91 98220 44112", 14, ["cls_8a"]),
    ("tch_arjun", None, "Arjun Patil", "social", "arjun.patil@greenfield.edu.in", "+91 98220 44113", 13, ["cls_8a"]),
    ("tch_sneha", None, "Sneha Kulkarni", "hindi", "sneha.kulkarni@greenfield.edu.in", "+91 98220 44114", 36, ["cls_8a", "cls_5b"]),
    ("tch_dev", None, "Dev Patel", "computer", "dev.patel@greenfield.edu.in", "+91 98220 44115", 59, ["cls_8a"]),
    ("tch_pooja", None, "Pooja Joshi", "art", "pooja.joshi@greenfield.edu.in", "+91 98220 44116", 41, ["cls_8a", "cls_5b"]),
    ("tch_amit", None, "Amit Rao", "pe", "amit.rao@greenfield.edu.in", "+91 98220 44117", 18, ["cls_8a", "cls_5b"]),
    ("tch_leela", None, "Leela Krishnan", "music", "leela.krishnan@greenfield.edu.in", "+91 98220 44118", 26, ["cls_5b"]),
]

class_8 = [s[0] for s in students if s[3] == "cls_8a"]
class_5 = [s[0] for s in students if s[3] == "cls_5b"]

users = [
    {
        "id": "usr_aarav",
        "role": "student",
        "name": "Aarav Sharma",
        "email": "aarav.sharma@gradeon.app",
        "phone": "+91 98220 11001",
        "avatarUrl": avatar(12),
        "password": "demo123",
        "studentId": "stu_aarav",
        "childIds": [],
    },
    {
        "id": "usr_ananya",
        "role": "student",
        "name": "Ananya Sharma",
        "email": "ananya.sharma@gradeon.app",
        "phone": "+91 98220 11003",
        "avatarUrl": avatar(32),
        "password": "demo123",
        "studentId": "stu_ananya",
        "childIds": [],
    },
    {
        "id": "usr_priya",
        "role": "parent",
        "name": "Priya Sharma",
        "email": "priya.sharma@gradeon.app",
        "phone": "+91 98220 11002",
        "avatarUrl": avatar(48),
        "password": "demo123",
        "childIds": ["stu_aarav", "stu_ananya"],
    },
    {
        "id": "usr_kavita",
        "role": "teacher",
        "name": "Kavita Iyer",
        "email": "kavita.iyer@gradeon.app",
        "phone": "+91 98220 44110",
        "avatarUrl": avatar(49),
        "password": "demo123",
        "teacherId": "tch_kavita",
        "childIds": [],
    },
]

dump("users.json", users)

dump(
    "students.json",
    [
        {
            "id": sid,
            "userId": uid,
            "name": name,
            "classId": cid,
            "rollNo": roll,
            "dob": dob,
            "bloodGroup": blood,
            "house": house,
            "avatarUrl": avatar(img),
            "guardianName": "Priya Sharma" if sid in ("stu_aarav", "stu_ananya") else "Parent or guardian",
            "guardianPhone": "+91 98220 11002" if sid in ("stu_aarav", "stu_ananya") else "+91 98000 00000",
            "address": address,
        }
        for sid, uid, name, cid, roll, dob, blood, house, img, address in students
    ],
)

dump(
    "classes.json",
    [
        {
            "id": "cls_8a",
            "name": "Class 8",
            "section": "A",
            "classTeacherId": "tch_kavita",
            "room": "B-204",
            "studentIds": class_8,
        },
        {
            "id": "cls_5b",
            "name": "Class 5",
            "section": "B",
            "classTeacherId": "tch_meera",
            "room": "A-102",
            "studentIds": class_5,
        },
    ],
)

dump(
    "teachers.json",
    [
        {
            "id": tid,
            "userId": uid,
            "name": name,
            "subject": subject,
            "email": email,
            "phone": phone,
            "avatarUrl": avatar(img),
            "classIds": cids,
        }
        for tid, uid, name, subject, email, phone, img, cids in teachers
    ],
)

attendance = []
for sid, *_rest in students:
    local = random.Random(sum(ord(char) for char in sid))
    for offset in range(1, 91):
        if offset % 7 == 0:
            status = "holiday"
        elif local.random() < 0.05:
            status = "absent"
        elif local.random() < 0.04:
            status = "late"
        else:
            status = "present"
        attendance.append(
            {"studentId": sid, "date": f"today-{offset}", "status": status}
        )
    attendance.append(
        {"studentId": sid, "date": "today-16", "status": "holiday"}
    )

dump("attendance.json", attendance)

slots = [
    ("08:00", "08:40", "class"),
    ("08:45", "09:25", "class"),
    ("09:25", "09:40", "break"),
    ("09:40", "10:20", "class"),
    ("10:25", "11:05", "class"),
    ("11:05", "11:25", "recess"),
    ("11:25", "12:05", "class"),
    ("12:10", "12:50", "class"),
]
days = ["mon", "tue", "wed", "thu", "fri", "sat"]
plan_8 = [
    ("maths", "tch_kavita"),
    ("science", "tch_rahul"),
    ("english", "tch_meera"),
    ("hindi", "tch_sneha"),
    ("social", "tch_arjun"),
    ("computer", "tch_dev"),
    ("art", "tch_pooja"),
    ("pe", "tch_amit"),
]
plan_5 = [
    ("english", "tch_meera"),
    ("maths", "tch_kavita"),
    ("hindi", "tch_sneha"),
    ("science", "tch_rahul"),
    ("art", "tch_pooja"),
    ("pe", "tch_amit"),
    ("music", "tch_leela"),
    ("english", "tch_meera"),
]


def timetable_for(class_id: str, plan: list[tuple[str, str]], room: str) -> list[dict]:
    rows = []
    class_slots = [s for s in slots if s[2] == "class"]
    for day_index, day in enumerate(days):
        periods = []
        class_i = 0
        for start, end, kind in slots:
            if kind == "class":
                subject, teacher = plan[(class_i + day_index) % len(plan)]
                periods.append(
                    {
                        "id": f"{class_id}-{day}-{class_i}",
                        "subject": subject,
                        "teacherId": teacher,
                        "start": start,
                        "end": end,
                        "room": room,
                        "kind": "class",
                    }
                )
                class_i += 1
            else:
                periods.append(
                    {
                        "id": f"{class_id}-{day}-{kind}",
                        "subject": kind,
                        "start": start,
                        "end": end,
                        "room": "",
                        "kind": kind,
                    }
                )
        rows.append({"classId": class_id, "day": day, "periods": periods})
    return rows


dump(
    "timetable.json",
    timetable_for("cls_8a", plan_8, "B-204") + timetable_for("cls_5b", plan_5, "A-102"),
)


def submissions(class_ids: list[str], status: str, marks: int | None = None, grade: str | None = None) -> list[dict]:
    rows = []
    for sid in class_ids:
        if status == "mixed":
            pick = "submitted" if sid.endswith(("aarav", "diya", "kabir", "anika")) else "pending"
        else:
            pick = status
        row: dict = {"studentId": sid, "status": pick}
        if pick == "submitted":
            row["submittedAt"] = "today-1T18:40"
            row["fileName"] = "submission.pdf"
        if pick == "graded":
            row["submittedAt"] = "today-5T19:10"
            row["fileName"] = "submission.pdf"
            earned = marks if sid in ("stu_aarav", "stu_ananya") else max(10, (marks or 16) - (len(sid) % 4))
            row["marks"] = earned
            row["grade"] = grade or "A"
            row["feedback"] = "Clear working and neat presentation. Keep it up."
        rows.append(row)
    return rows


homework = [
    {
        "id": "hw_linear",
        "classId": "cls_8a",
        "subject": "maths",
        "title": "Linear equations worksheet",
        "description": "Solve questions 1 to 12 from the shared worksheet. Show each step, and check your answer by substitution.",
        "assignedOn": "today-2",
        "dueOn": "today+1",
        "teacherId": "tch_kavita",
        "maxMarks": 20,
        "attachments": ["Linear_equations_worksheet.pdf"],
        "submissions": submissions(class_8, "pending"),
    },
    {
        "id": "hw_photo",
        "classId": "cls_8a",
        "subject": "science",
        "title": "Photosynthesis lab note",
        "description": "Write the aim, a labelled diagram of a leaf cross-section, and three observations from Friday's experiment.",
        "assignedOn": "today-1",
        "dueOn": "today+3",
        "teacherId": "tch_rahul",
        "maxMarks": 20,
        "attachments": ["Lab_note_template.pdf"],
        "submissions": submissions(class_8, "pending"),
    },
    {
        "id": "hw_letter",
        "classId": "cls_8a",
        "subject": "english",
        "title": "Letter to the editor",
        "description": "Write a formal letter about safer crossings outside the school gate. 150 to 180 words.",
        "assignedOn": "today-6",
        "dueOn": "today-1",
        "teacherId": "tch_meera",
        "maxMarks": 20,
        "attachments": ["Formal_letter_format.pdf"],
        "submissions": submissions(class_8, "mixed"),
    },
    {
        "id": "hw_monsoon",
        "classId": "cls_8a",
        "subject": "hindi",
        "title": "Essay: first rain in Pune",
        "description": "Write 120 words on the first monsoon evening in your neighbourhood. Use at least five describing words.",
        "assignedOn": "today-10",
        "dueOn": "today-4",
        "teacherId": "tch_sneha",
        "maxMarks": 20,
        "attachments": [],
        "submissions": submissions(class_8, "graded", 18, "A"),
    },
    {
        "id": "hw_rivers",
        "classId": "cls_8a",
        "subject": "social",
        "title": "Rivers of India map work",
        "description": "Mark the Ganga, Yamuna, Godavari, Krishna and Kaveri on the outline map. Add the direction of flow.",
        "assignedOn": "today-1",
        "dueOn": "today+6",
        "teacherId": "tch_arjun",
        "maxMarks": 15,
        "attachments": ["India_outline_map.pdf"],
        "submissions": submissions(class_8, "pending"),
    },
    {
        "id": "hw_scratch",
        "classId": "cls_8a",
        "subject": "computer",
        "title": "Scratch greeting card",
        "description": "Build a one-scene greeting card with a sprite, a backdrop and one sound. Export the project file.",
        "assignedOn": "today-14",
        "dueOn": "today-8",
        "teacherId": "tch_dev",
        "maxMarks": 20,
        "attachments": ["Scratch_checklist.pdf"],
        "submissions": submissions(class_8, "graded", 19, "A+"),
    },
    {
        "id": "hw_fractions",
        "classId": "cls_5b",
        "subject": "maths",
        "title": "Fractions practice",
        "description": "Complete the shaded-figure questions and the four word problems on sharing a dosa and a ribbon.",
        "assignedOn": "today-1",
        "dueOn": "today+2",
        "teacherId": "tch_kavita",
        "maxMarks": 20,
        "attachments": ["Fractions_class5.pdf"],
        "submissions": submissions(class_5, "pending"),
    },
    {
        "id": "hw_festival",
        "classId": "cls_5b",
        "subject": "english",
        "title": "My favourite festival",
        "description": "Write eight sentences about how your family celebrates one festival. Draw a small picture if you like.",
        "assignedOn": "today-7",
        "dueOn": "today-2",
        "teacherId": "tch_meera",
        "maxMarks": 10,
        "attachments": [],
        "submissions": submissions(class_5, "mixed"),
    },
]
dump("homework.json", homework)

exams = [
    {
        "id": "ex_8_term",
        "name": "Term 1",
        "classId": "cls_8a",
        "startDate": "today-18",
        "endDate": "today-12",
        "status": "completed",
        "subjects": ["maths", "science", "english", "hindi", "social", "computer"],
    },
    {
        "id": "ex_8_ut",
        "name": "Unit Test 2",
        "classId": "cls_8a",
        "startDate": "today-40",
        "endDate": "today-36",
        "status": "completed",
        "subjects": ["maths", "science", "english", "hindi", "social", "computer"],
    },
    {
        "id": "ex_8_mid",
        "name": "Mid Term",
        "classId": "cls_8a",
        "startDate": "today+14",
        "endDate": "today+18",
        "status": "upcoming",
        "subjects": ["maths", "science", "english", "hindi", "social", "computer"],
    },
    {
        "id": "ex_5_term",
        "name": "Term 1",
        "classId": "cls_5b",
        "startDate": "today-18",
        "endDate": "today-13",
        "status": "completed",
        "subjects": ["maths", "english", "hindi", "science", "art"],
    },
    {
        "id": "ex_5_mid",
        "name": "Mid Term",
        "classId": "cls_5b",
        "startDate": "today+15",
        "endDate": "today+18",
        "status": "upcoming",
        "subjects": ["maths", "english", "hindi", "science"],
    },
]
dump("exams.json", exams)


def result(exam_id: str, student_id: str, rows: list[tuple[str, int, int]], rank: int, total: int, trend: list[tuple[str, float]]) -> dict:
    earned = sum(m for _, m, _ in rows)
    maximum = sum(m for _, _, m in rows)
    percent = round(earned / maximum * 100, 1)
    grade = "A+" if percent >= 90 else "A" if percent >= 80 else "B+" if percent >= 70 else "B"
    return {
        "id": f"res_{student_id}_{exam_id}",
        "examId": exam_id,
        "studentId": student_id,
        "overallPercent": percent,
        "grade": grade,
        "rank": rank,
        "totalStudents": total,
        "subjects": [
            {
                "subject": subject,
                "marks": marks,
                "maxMarks": max_marks,
                "grade": "A+" if marks / max_marks >= 0.9 else "A" if marks / max_marks >= 0.8 else "B+",
            }
            for subject, marks, max_marks in rows
        ],
        "trend": [{"label": label, "percent": pct} for label, pct in trend],
    }


dump(
    "results.json",
    [
        result(
            "ex_8_term",
            "stu_aarav",
            [("maths", 46, 50), ("science", 44, 50), ("english", 41, 50), ("hindi", 38, 50), ("social", 42, 50), ("computer", 47, 50)],
            3,
            32,
            [("UT1", 78), ("UT2", 82), ("Term 1", 86)],
        ),
        result(
            "ex_8_ut",
            "stu_aarav",
            [("maths", 36, 40), ("science", 33, 40), ("english", 31, 40), ("hindi", 30, 40), ("social", 32, 40), ("computer", 35, 40)],
            4,
            32,
            [("UT1", 78), ("UT2", 82)],
        ),
        result(
            "ex_5_term",
            "stu_ananya",
            [("maths", 44, 50), ("english", 46, 50), ("hindi", 42, 50), ("science", 40, 50), ("art", 48, 50)],
            2,
            28,
            [("UT1", 84), ("Term 1", 88)],
        ),
    ],
)


def fees(student_id: str, rows: list[dict]) -> dict:
    receipts = []
    for row in rows:
        if row["paid"]:
            receipts.append(
                {
                    "id": f"rcpt_{row['id']}",
                    "installmentId": row["id"],
                    "title": row["title"],
                    "amount": row["amount"],
                    "paidOn": row["paidOn"],
                    "method": row["method"],
                    "reference": row["reference"],
                }
            )
    return {"studentId": student_id, "academicYear": "2026-27", "installments": rows, "receipts": receipts}


dump(
    "fees.json",
    [
        fees(
            "stu_aarav",
            [
                {"id": "fee_aarav_t1", "title": "Term 1 tuition", "amount": 28500, "dueDate": "today-60", "paid": True, "paidOn": "today-58", "method": "upi", "reference": "UPI28461937"},
                {"id": "fee_aarav_bus", "title": "Transport, first term", "amount": 9000, "dueDate": "today-55", "paid": True, "paidOn": "today-54", "method": "netbanking", "reference": "NB11029384"},
                {"id": "fee_aarav_lab", "title": "Lab and activity", "amount": 4500, "dueDate": "today-3", "paid": False},
                {"id": "fee_aarav_t2", "title": "Term 2 tuition", "amount": 28500, "dueDate": "today+6", "paid": False},
            ],
        ),
        fees(
            "stu_ananya",
            [
                {"id": "fee_ananya_t1", "title": "Term 1 tuition", "amount": 24000, "dueDate": "today-60", "paid": True, "paidOn": "today-59", "method": "upi", "reference": "UPI99881220"},
                {"id": "fee_ananya_t2", "title": "Term 2 tuition", "amount": 24000, "dueDate": "today-2", "paid": True, "paidOn": "today-1", "method": "card", "reference": "CARD441298"},
                {"id": "fee_ananya_act", "title": "Annual day costume", "amount": 1800, "dueDate": "today+40", "paid": False},
            ],
        ),
    ],
)

dump(
    "notices.json",
    [
        {
            "id": "nt_ptm",
            "title": "Parent-teacher meeting this Saturday",
            "body": "Meet your child's class teacher between 9:00 am and 12:30 pm in the classroom. Please carry the Term 1 report card. Slots are first come, first served, with ten minutes per family.",
            "category": "academic",
            "audience": "all",
            "pinned": True,
            "date": "today-1",
            "author": "Principal's office",
            "attachments": ["PTM_slot_note.pdf"],
        },
        {
            "id": "nt_mid",
            "title": "Mid term timetable is out",
            "body": "The mid term begins in two weeks. The seating plan will be on the notice board outside the library on the Friday before the exams. Arrive 15 minutes early with a transparent pouch.",
            "category": "exams",
            "audience": "all",
            "pinned": True,
            "date": "today-0",
            "author": "Examination cell",
            "attachments": ["Midterm_timetable.pdf"],
        },
        {
            "id": "nt_football",
            "title": "Inter-house football trials",
            "body": "Trials for the inter-house tournament are on the main ground after school. Wear house colours and sports shoes. Water will be provided. Parents may watch from the side stands.",
            "category": "sports",
            "audience": "students",
            "pinned": False,
            "date": "today-2",
            "author": "Amit Rao, PE",
            "attachments": [],
        },
        {
            "id": "nt_diwali",
            "title": "Diwali break dates",
            "body": "The school will remain closed for Diwali from the dates on the attached note. Homework for the break is light and already on the homework tab. The campus reopens on a regular Monday timetable.",
            "category": "holiday",
            "audience": "all",
            "pinned": False,
            "date": "today-4",
            "author": "Principal's office",
            "attachments": ["Diwali_break.pdf"],
        },
        {
            "id": "nt_fee",
            "title": "Term 2 fee reminder",
            "body": "Term 2 tuition is due this month. You can pay inside the app with UPI, card or net banking. Receipts are saved under Fees. Please ignore this note if you have already paid.",
            "category": "fees",
            "audience": "parents",
            "pinned": False,
            "date": "today-3",
            "author": "Accounts office",
            "attachments": [],
        },
        {
            "id": "nt_books",
            "title": "Book fair in the library foyer",
            "body": "The Pune book fair stall is in the library foyer this week, from 9 am to 2 pm. Students may buy with a note from home, or reserve a title and collect it at the PTM.",
            "category": "general",
            "audience": "all",
            "pinned": False,
            "date": "today-5",
            "author": "Library",
            "attachments": [],
        },
    ],
)

dump(
    "events.json",
    [
        {
            "id": "ev_ptm",
            "title": "Parent-teacher meeting",
            "description": "A short conversation with the class teacher about Term 1, attendance and the term ahead. Report cards will be handed over in the classroom.",
            "date": "today+4",
            "time": "09:00",
            "venue": "Classrooms",
            "category": "academic",
            "imageUrl": photo("gradeon-ptm", 1200, 800),
            "rsvps": [{"userId": "usr_priya", "status": "going"}],
        },
        {
            "id": "ev_annual",
            "title": "Annual Day: Monsoon Orchestra",
            "description": "An evening of music, dance and a short play by Classes 5 to 10. Gates open at 4:30 pm. Each family has two seats in the auditorium.",
            "date": "today+18",
            "time": "17:00",
            "venue": "School auditorium",
            "category": "cultural",
            "imageUrl": photo("gradeon-annual", 1200, 800),
            "rsvps": [],
        },
        {
            "id": "ev_science",
            "title": "Science exhibition",
            "description": "Class 8 presents working models on water, light and the city climate. Parents are welcome during the open hour after lunch.",
            "date": "today+9",
            "time": "11:00",
            "venue": "Science block lawn",
            "category": "academic",
            "imageUrl": photo("gradeon-science", 1200, 800),
            "rsvps": [{"userId": "usr_aarav", "status": "going"}],
        },
        {
            "id": "ev_football",
            "title": "Inter-house football final",
            "description": "Emerald takes on Ruby in the final. Cheer from the east stand. The match is 30 minutes each way.",
            "date": "today+11",
            "time": "15:30",
            "venue": "Main ground",
            "category": "sports",
            "imageUrl": photo("gradeon-football", 1200, 800),
            "rsvps": [],
        },
        {
            "id": "ev_books",
            "title": "Library book fair",
            "description": "Pick a holiday read. Teachers will be around to help younger students choose.",
            "date": "today+2",
            "time": "09:30",
            "venue": "Library foyer",
            "category": "general",
            "imageUrl": photo("gradeon-books", 1200, 800),
            "rsvps": [],
        },
    ],
)

dump(
    "chat_threads.json",
    [
        {
            "id": "th_kavita_aarav",
            "title": "Kavita Iyer",
            "subtitle": "Class teacher · Maths",
            "participantIds": ["usr_aarav", "usr_kavita"],
            "avatarUrl": avatar(49),
            "online": True,
        },
        {
            "id": "th_office_aarav",
            "title": "School office",
            "subtitle": "Front desk",
            "participantIds": ["usr_aarav", "usr_office"],
            "avatarUrl": avatar(28),
            "online": True,
        },
        {
            "id": "th_rahul_aarav",
            "title": "Rahul Deshmukh",
            "subtitle": "Science",
            "participantIds": ["usr_aarav", "usr_rahul"],
            "avatarUrl": avatar(14),
            "online": False,
        },
        {
            "id": "th_kavita_priya",
            "title": "Kavita Iyer",
            "subtitle": "Aarav's class teacher",
            "participantIds": ["usr_priya", "usr_kavita"],
            "avatarUrl": avatar(49),
            "online": True,
        },
        {
            "id": "th_meera_priya",
            "title": "Meera Nair",
            "subtitle": "Ananya's class teacher",
            "participantIds": ["usr_priya", "usr_meera"],
            "avatarUrl": avatar(44),
            "online": False,
        },
        {
            "id": "th_staff",
            "title": "Staff room",
            "subtitle": "Class 8 teachers",
            "participantIds": ["usr_kavita", "usr_rahul"],
            "avatarUrl": avatar(14),
            "online": True,
        },
    ],
)

dump(
    "messages.json",
    [
        {"id": "m1", "threadId": "th_kavita_aarav", "senderId": "usr_kavita", "text": "Aarav, bring the geometry box tomorrow. We start constructions in period 1.", "sentAt": "today-1T16:10", "read": True},
        {"id": "m2", "threadId": "th_kavita_aarav", "senderId": "usr_aarav", "text": "Yes ma'am, I have it. Should I also bring the graph book?", "sentAt": "today-1T16:22", "read": True},
        {"id": "m3", "threadId": "th_kavita_aarav", "senderId": "usr_kavita", "text": "Graph book on Thursday is enough. The worksheet is due tomorrow evening.", "sentAt": "today-0T08:05", "read": True},
        {"id": "m4", "threadId": "th_office_aarav", "senderId": "usr_office", "text": "Your ID card reprint is ready at the front desk. Collect it during the long break.", "sentAt": "today-0T09:40", "read": False},
        {"id": "m5", "threadId": "th_rahul_aarav", "senderId": "usr_rahul", "text": "Nice questions in the lab today. Add the diagram before you submit the note.", "sentAt": "today-2T14:15", "read": True},
        {"id": "m6", "threadId": "th_kavita_priya", "senderId": "usr_kavita", "text": "Priya, Aarav is steady in class. We can talk through the mid term plan at the PTM on Saturday.", "sentAt": "today-1T18:02", "read": True},
        {"id": "m7", "threadId": "th_kavita_priya", "senderId": "usr_priya", "text": "Thank you, Kavita. We will be there by 10.", "sentAt": "today-1T18:20", "read": True},
        {"id": "m8", "threadId": "th_meera_priya", "senderId": "usr_meera", "text": "Ananya read her festival piece aloud today. It was lovely. The written copy is in.", "sentAt": "today-2T15:45", "read": True},
        {"id": "m9", "threadId": "th_staff", "senderId": "usr_rahul", "text": "Science exhibition boards can go up on Thursday after lunch. I will keep the lawn clear.", "sentAt": "today-0T11:12", "read": False},
    ],
)

dump(
    "library_books.json",
    [
        {"id": "bk_science", "title": "The Story of Science", "author": "Joy Bhattacharya", "category": "Science", "isbn": "9788172348801", "available": False, "coverUrl": photo("book-science", 600, 800), "borrowedBy": "stu_aarav", "dueDate": "today+4"},
        {"id": "bk_rivers", "title": "Rivers of the Deccan", "author": "Leela Patkar", "category": "Social", "isbn": "9788172348802", "available": False, "coverUrl": photo("book-rivers", 600, 800), "borrowedBy": "stu_aarav", "dueDate": "today-1"},
        {"id": "bk_math", "title": "Puzzles for a Rainy Day", "author": "Amit Narang", "category": "Maths", "isbn": "9788172348803", "available": True, "coverUrl": photo("book-math", 600, 800)},
        {"id": "bk_poem", "title": "Monsoon Poems for Children", "author": "Sneha Kulkarni", "category": "English", "isbn": "9788172348804", "available": True, "coverUrl": photo("book-poems", 600, 800)},
        {"id": "bk_space", "title": "A Pocket Guide to the Night Sky", "author": "Dev Krishnan", "category": "Science", "isbn": "9788172348805", "available": True, "coverUrl": photo("book-sky", 600, 800)},
        {"id": "bk_pune", "title": "Walks in Old Pune", "author": "Arjun Patil", "category": "Social", "isbn": "9788172348806", "available": True, "coverUrl": photo("book-pune", 600, 800)},
        {"id": "bk_fest", "title": "Festival Kitchen", "author": "Meera Nair", "category": "General", "isbn": "9788172348807", "available": False, "coverUrl": photo("book-fest", 600, 800), "borrowedBy": "stu_ananya", "dueDate": "today+8"},
        {"id": "bk_draw", "title": "Draw Birds of the Sahyadris", "author": "Pooja Joshi", "category": "Art", "isbn": "9788172348808", "available": True, "coverUrl": photo("book-birds", 600, 800)},
    ],
)


def route(student_id: str, name: str, bus: str, eta: int, progress: float, driver: str, phone: str, img: int, stops: list[tuple[str, str, bool]]) -> dict:
    return {
        "studentId": student_id,
        "routeName": name,
        "busNumber": bus,
        "etaMinutes": eta,
        "progress": progress,
        "driver": {"name": driver, "phone": phone, "avatarUrl": avatar(img)},
        "stops": [
            {"name": stop, "time": time, "reached": reached}
            for stop, time, reached in stops
        ],
    }


dump(
    "transport.json",
    [
        route(
            "stu_aarav",
            "Route 4 · Baner",
            "MH12 AB 4418",
            12,
            0.62,
            "Ramesh Pawar",
            "+919823011223",
            51,
            [
                ("School gate", "07:10", True),
                ("Balewadi phata", "07:22", True),
                ("Baner road signal", "07:31", False),
                ("Ivory Towers", "07:38", False),
            ],
        ),
        route(
            "stu_ananya",
            "Route 2 · Aundh",
            "MH12 CD 2291",
            8,
            0.74,
            "Suresh Jadhav",
            "+919823011440",
            53,
            [
                ("School gate", "07:15", True),
                ("University circle", "07:24", True),
                ("Aundh gaon", "07:33", False),
                ("Ivory Towers", "07:41", False),
            ],
        ),
    ],
)

dump(
    "leave_requests.json",
    [
        {
            "id": "lv_aarav_past",
            "studentId": "stu_aarav",
            "from": "today-20",
            "to": "today-19",
            "reason": "Family function in Nashik",
            "status": "approved",
            "appliedOn": "today-24",
            "reviewedBy": "Kavita Iyer",
            "reviewNote": "Approved. Please collect the class notes from Diya.",
        },
        {
            "id": "lv_aarav_open",
            "studentId": "stu_aarav",
            "from": "today+7",
            "to": "today+8",
            "reason": "Dental appointment and a day of rest after",
            "status": "pending",
            "appliedOn": "today-1",
        },
        {
            "id": "lv_ananya_no",
            "studentId": "stu_ananya",
            "from": "today-8",
            "to": "today-8",
            "reason": "Out of town",
            "status": "rejected",
            "appliedOn": "today-9",
            "reviewedBy": "Meera Nair",
            "reviewNote": "Please add a note from home with the city you are travelling to, then apply again.",
        },
    ],
)

albums = [
    ("alb_annual", "Annual Day", "today-40", "The evening the auditorium turned into a monsoon stage.", ["Opening dance", "Choir", "Class 8 play", "Finale"]),
    ("alb_sports", "Sports Day", "today-70", "House flags, sack races and a very close relay.", ["March past", "Relay baton", "Long jump", "House cup"]),
    ("alb_science", "Science fair", "today-25", "Models, questions and a lot of curious parents.", ["Water filter", "Volcano", "Star projector", "Judges"]),
    ("alb_indep", "Independence Day", "today-55", "Flag hoisting on a bright August morning.", ["Flag", "Speech", "Song", "Sweet distribution"]),
]
dump(
    "gallery.json",
    [
        {
            "id": aid,
            "title": title,
            "date": date,
            "blurb": blurb,
            "photos": [
                {
                    "id": f"{aid}_{index}",
                    "url": photo(f"{aid}-{index}"),
                    "caption": caption,
                }
                for index, caption in enumerate(captions, start=1)
            ],
        }
        for aid, title, date, blurb, captions in albums
    ],
)

dump(
    "notifications.json",
    [
        {"id": "nf1", "userId": "usr_aarav", "title": "Worksheet due tomorrow", "body": "Linear equations worksheet is due tomorrow evening.", "type": "homework", "date": "today-0T07:30", "read": False, "route": "/homework"},
        {"id": "nf2", "userId": "usr_aarav", "title": "ID card is ready", "body": "Collect the reprinted ID card from the front desk at long break.", "type": "general", "date": "today-0T09:41", "read": False, "route": "/chat/th_office_aarav"},
        {"id": "nf3", "userId": "usr_aarav", "title": "Lab fee is overdue", "body": "Lab and activity fee of ₹4,500 was due 3 days ago.", "type": "fees", "date": "today-1T08:00", "read": True, "route": "/fees"},
        {"id": "nf4", "userId": "usr_aarav", "title": "You are 3rd in Term 1", "body": "Term 1 results are published. Overall 86 percent.", "type": "results", "date": "today-6T17:00", "read": True, "route": "/results"},
        {"id": "nf5", "userId": "usr_priya", "title": "PTM on Saturday", "body": "Kavita Iyer can meet you from 9 am. You marked Going.", "type": "event", "date": "today-0T08:10", "read": False, "route": "/events"},
        {"id": "nf6", "userId": "usr_priya", "title": "Aarav was on time today", "body": "Attendance for today has not been submitted yet. Yesterday was present.", "type": "attendance", "date": "today-1T15:30", "read": True, "route": "/attendance"},
        {"id": "nf7", "userId": "usr_priya", "title": "Ananya's essay is in", "body": "Meera Nair confirmed the festival writing was submitted.", "type": "homework", "date": "today-2T16:00", "read": True, "route": "/homework"},
        {"id": "nf8", "userId": "usr_kavita", "title": "4 letters still pending", "body": "English letter submissions are in from 4 of 10 students.", "type": "homework", "date": "today-0T10:00", "read": False, "route": "/teacher/grading"},
        {"id": "nf9", "userId": "usr_kavita", "title": "Attendance not submitted", "body": "Class 8 A attendance for today is still open.", "type": "attendance", "date": "today-0T08:20", "read": False, "route": "/teacher/attendance/cls_8a"},
        {"id": "nf10", "userId": "usr_kavita", "title": "Exhibition boards Thursday", "body": "Rahul will clear the science lawn after lunch on Thursday.", "type": "general", "date": "today-0T11:13", "read": False, "route": "/chat/th_staff"},
    ],
)

dump(
    "school_info.json",
    {
        "name": "Greenfield International School",
        "tagline": "Curiosity first. Kindness always.",
        "address": "42, Baner Road, Baner, Pune 411045",
        "phone": "+912045678900",
        "email": "hello@greenfield.edu.in",
        "website": "https://greenfield.edu.in",
        "principal": "Dr. Anil Kulkarni",
        "founded": 2004,
        "officeHours": "Monday to Friday, 8:00 am to 3:30 pm",
        "about": "Greenfield is a co-ed day school in Baner for Classes 1 to 10. Classes stay small, houses run the sports calendar, and every child is known by name in the staff room. The campus has a science lawn, a library that lends freely, and a bus network across west Pune.",
    },
)

lottie_dir = ROOT.parent / "lottie"
lottie_dir.mkdir(parents=True, exist_ok=True)


def lottie(name: str, color: list[float], shape: str) -> None:
    shapes: list[dict]
    if shape == "check":
        shapes = [
            {"ty": "el", "p": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [180, 180]}},
            {"ty": "st", "c": {"a": 0, "k": color}, "o": {"a": 0, "k": 100}, "w": {"a": 0, "k": 14}, "lc": 2, "lj": 2},
            {"ty": "tr", "p": {"a": 0, "k": [0, 0]}, "a": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [100, 100]}, "r": {"a": 0, "k": 0}, "o": {"a": 0, "k": 100}},
        ]
    else:
        shapes = [
            {"ty": "rc", "p": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [120, 90]}, "r": {"a": 0, "k": 16}},
            {"ty": "fl" if shape == "empty" else "st", "c": {"a": 0, "k": color}, "o": {"a": 0, "k": 100}, "w": {"a": 0, "k": 10}},
            {"ty": "tr", "p": {"a": 0, "k": [0, 0]}, "a": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [100, 100]}, "r": {"a": 0, "k": 0}, "o": {"a": 0, "k": 100}},
        ]
    data = {
        "v": "5.7.4",
        "fr": 30,
        "ip": 0,
        "op": 60,
        "w": 240,
        "h": 240,
        "nm": name,
        "ddd": 0,
        "assets": [],
        "layers": [
            {
                "ddd": 0,
                "ind": 1,
                "ty": 4,
                "nm": name,
                "sr": 1,
                "ks": {
                    "o": {"a": 0, "k": 100},
                    "r": {"a": 0, "k": 0},
                    "p": {"a": 0, "k": [120, 120, 0]},
                    "a": {"a": 0, "k": [0, 0, 0]},
                    "s": {
                        "a": 1,
                        "k": [
                            {"t": 0, "s": [70, 70, 100], "i": {"x": [0.4], "y": [1]}, "o": {"x": [0.2], "y": [0]}},
                            {"t": 24, "s": [100, 100, 100]},
                        ],
                    },
                },
                "ao": 0,
                "shapes": shapes,
                "ip": 0,
                "op": 60,
                "st": 0,
                "bm": 0,
            }
        ],
    }
    (lottie_dir / f"{name}.json").write_text(json.dumps(data), encoding="utf-8")


lottie("success", [0.12, 0.62, 0.42, 1], "check")
lottie("empty", [0.18, 0.43, 0.93, 1], "empty")
lottie("error", [0.86, 0.32, 0.36, 1], "empty")
lottie("loading", [0.18, 0.43, 0.93, 1], "check")
print(f"Wrote mock JSON to {ROOT}")

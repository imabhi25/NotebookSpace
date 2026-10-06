#!/usr/bin/env python3
"""
Generate synthetic sample course documents for the public demo.
Creates 3 PDFs in docs/sample_docs/:
- syllabus.pdf (4 pages)
- assignment_1.pdf (3 pages)
- announcement_update.pdf (3 pages)

Every page includes the required visible header:
"SYNTHETIC SAMPLE DOCUMENT - not a real course"

Includes 3 deliberate conflicts between syllabus.pdf and announcement_update.pdf:
1. Assignment 1 due date (October 14 vs October 21)
2. Late submission penalty (10% per day up to 3 days vs 5% per day up to 2 days)
3. Midterm examination date (November 5 vs November 12)
"""

from pathlib import Path
import sys
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

project_root = Path(__file__).resolve().parent.parent
OUTPUT_DIR = project_root / "docs" / "sample_docs"

HEADER_TEXT = "SYNTHETIC SAMPLE DOCUMENT - not a real course"


def _draw_header(c: canvas.Canvas):
    c.setFont("Helvetica-Bold", 10)
    c.setFillColorRGB(0.65, 0.1, 0.1)
    c.drawString(54, 755, HEADER_TEXT)
    c.setStrokeColorRGB(0.75, 0.75, 0.75)
    c.setLineWidth(0.5)
    c.line(54, 747, 558, 747)
    c.setFillColorRGB(0, 0, 0)


def _draw_page_content(c: canvas.Canvas, title: str, paragraphs: list[str]):
    _draw_header(c)
    y = 720
    if title:
        c.setFont("Helvetica-Bold", 14)
        c.drawString(54, y, title)
        y -= 25

    c.setFont("Helvetica", 10)
    for p in paragraphs:
        # Wrap words manually into lines fitting ~500pt width
        words = p.split()
        line = []
        for w in words:
            line.append(w)
            if len(" ".join(line)) > 75:
                c.drawString(54, y, " ".join(line))
                y -= 14
                line = []
        if line:
            c.drawString(54, y, " ".join(line))
            y -= 14
        y -= 10
    c.showPage()


def build_syllabus(out_path: Path):
    c = canvas.Canvas(str(out_path), pagesize=letter)

    # Page 1: Course Overview & Information
    _draw_page_content(
        c,
        "CS 401: Advanced Systems Programming - Course Syllabus",
        [
            "Term: Fall 2026 | Credits: 4.0 | Location: Turing Hall Room 101.",
            "Instructor: Dr. Alex Mercer (email: amercer@example.edu).",
            "Office Hours: Tuesdays and Thursdays from 2:00 PM to 4:00 PM in Science Center Room 405.",
            "Course Description: This course covers advanced concepts in computer systems, operating systems, and systems programming. Topics include low-level thread synchronization, non-blocking data structures, memory management, and asynchronous I/O architectures.",
            "Prerequisites: Students must have completed CS 201 (Data Structures) and CS 202 (Computer Systems Fundamentals) with a grade of C or better.",
            "Course Goals: By the end of this course, students will be proficient in writing multi-threaded systems in modern C++, profiling latency-critical services, and diagnosing race conditions.",
        ],
    )

    # Page 2: Grading Policy & Policies
    _draw_page_content(
        c,
        "Grading Breakdown and Course Policies",
        [
            "Grading Breakdown:",
            "- Programming Assignments (4 projects): 40 percent of total grade (10 percent each).",
            "- Midterm Examination: 25 percent of total grade. The Midterm Exam will take place on November 5, 2026 in Hall B.",
            "- Final Term Project: 25 percent of total grade.",
            "- Class Participation and Quizzes: 10 percent of total grade.",
            "Late Submission Policy:",
            "Late submissions lose 10 percent per day up to a maximum of 3 days. Submissions after 3 days receive a score of zero. No extensions are granted without prior dean approval.",
            "Grading Scale: A (93-100), A- (90-92), B+ (87-89), B (83-86), B- (80-82), C (70-79), F (below 70).",
        ],
    )

    # Page 3: Project Schedule & Due Dates
    _draw_page_content(
        c,
        "Assignment Schedule and Key Deadlines",
        [
            "The course includes four hands-on programming assignments designed to build practical systems engineering skills.",
            "Assignment 1: High-Performance Concurrent Key-Value Store.",
            "Assignment 1 is due on October 14, 2026 at 11:59 PM.",
            "Assignment 2: Distributed Consensus with Raft.",
            "Assignment 2 is due on November 18, 2026 at 11:59 PM.",
            "Assignment 3: Write-Ahead Logging and Crash Recovery Engine.",
            "Assignment 3 is due on December 2, 2026 at 11:59 PM.",
            "Assignment 4: Asynchronous Network RPC Framework.",
            "Assignment 4 is due on December 16, 2026 at 11:59 PM.",
            "All assignment deliverables must be submitted via the course portal before the stated deadline timestamp.",
        ],
    )

    # Page 4: Academic Integrity & Student Resources
    _draw_page_content(
        c,
        "Academic Integrity and Student Support",
        [
            "Academic Integrity: All code submitted for assignments must be your original work. Discussion of high-level algorithmic ideas is encouraged, but sharing code, copying solutions from previous semesters, or utilizing unauthorized generative tooling constitutes an academic integrity violation.",
            "Violations will be reported directly to the Academic Conduct Board and will result in an automatic grade of F for the course.",
            "Accommodations and Student Accessibility: Students with documented accessibility needs should contact the Student Support Office to coordinate approved accommodations.",
            "Mental Health & Wellness: University counseling services are available free of charge to all enrolled students.",
        ],
    )

    c.save()


def build_assignment_1(out_path: Path):
    c = canvas.Canvas(str(out_path), pagesize=letter)

    # Page 1: Assignment Overview
    _draw_page_content(
        c,
        "Assignment 1: Concurrent Key-Value Store",
        [
            "Course: CS 401 Advanced Systems Programming.",
            "Due Date: October 14, 2026 at 11:59 PM via the course submission portal.",
            "Objective: Design and implement an in-memory concurrent hash map supporting high-concurrency read and write operations.",
            "The data store must provide thread-safe implementations of Put(key, value), Get(key), and Delete(key).",
            "You are required to use fine-grained bucket striping or read-write lock partitioning to achieve scalable multicore throughput.",
            "Coarse-grained global locks are explicitly prohibited and will receive a failing score on performance evaluations.",
        ],
    )

    # Page 2: Implementation & Testing
    _draw_page_content(
        c,
        "Implementation Guidelines and Testing Harness",
        [
            "Implementation Requirements:",
            "- Implement bucket-level locking with at least 64 distinct lock shards.",
            "- Support dynamic rehashing when table load factor exceeds 0.75 without causing deadlocks.",
            "- Zero memory leaks or undefined behavior detected by AddressSanitizer and ThreadSanitizer.",
            "Benchmark Requirements: Your implementation will be evaluated against a benchmark harness using 4, 8, and 16 worker threads executing 80 percent reads and 20 percent writes.",
            "Submission Structure: Submit a single tar.gz archive containing your Makefile, source code in src/, and a 2-page design document in doc/design.pdf.",
        ],
    )

    # Page 3: Grading Rubric
    _draw_page_content(
        c,
        "Assignment 1 Grading Rubric",
        [
            "Evaluation Criteria:",
            "- Correctness and Thread Safety (60 points): Passes all concurrency stress tests without deadlocks, race conditions, or dropped updates.",
            "- Performance Scaling (25 points): Demonstrates near-linear throughput scaling up to 16 threads under concurrent read-heavy workload.",
            "- Design Document and Code Style (15 points): Clear architecture explanations, clean code formatting, and comprehensive comments.",
            "Late Policy Reminder: Submissions follow the standard course submission policy stated in the syllabus unless an official course extension is posted.",
        ],
    )

    c.save()


def build_announcement(out_path: Path):
    c = canvas.Canvas(str(out_path), pagesize=letter)

    # Page 1: Due Date Extension Announcement
    _draw_page_content(
        c,
        "Important Course Announcement: Schedule Updates & Policy Revisions",
        [
            "Date: October 8, 2026 | From: Dr. Alex Mercer | Subject: Assignment 1 Extension and Revised Policies.",
            "Dear CS 401 Students,",
            "Due to scheduled electrical maintenance and network downtime in the Science Center computer laboratories during the upcoming weekend, we are updating several important course deadlines and policies.",
            "Assignment 1 Due Date Extension:",
            "The deadline for Assignment 1 (Concurrent Key-Value Store) has been extended by one full week.",
            "Assignment 1 is now due on October 21, 2026 at 11:59 PM.",
            "Please make sure your repository is updated with the latest grading harness before your submission.",
        ],
    )

    # Page 2: Late Penalty Policy Update & Midterm Rescheduling
    _draw_page_content(
        c,
        "Revised Late Policy and Midterm Exam Date",
        [
            "Update on Late Submission Penalties:",
            "In response to student feedback regarding heavy project workloads across the department, the late penalty policy has been revised for all remaining assignments.",
            "Late submissions lose 5 percent per day up to a maximum of 2 days. Submissions beyond 2 days late will not be accepted.",
            "This policy replaces the prior late policy effective immediately.",
            "Midterm Examination Rescheduling:",
            "To accommodate the shifted schedule, the Midterm Exam originally scheduled for early November has been rescheduled.",
            "The Midterm Exam will take place on November 12, 2026 in Hall B.",
            "The midterm will cover concurrency, synchronization primitives, and memory models.",
        ],
    )

    # Page 3: Additional Office Hours and Resources
    _draw_page_content(
        c,
        "Additional Office Hours and Midterm Review Sessions",
        [
            "Additional Office Hours:",
            "Teaching Assistants will host extra walk-in tutoring sessions on Wednesday afternoons from 3:00 PM to 5:00 PM in Turing Hall Room 204.",
            "Midterm Review Session: A practice review session will be conducted on November 9, 2026 during the regularly scheduled lecture period.",
            "Sample exam problems covering reader-writer locks and lock-free stacks have been uploaded to the course resource drive.",
            "Good luck with Assignment 1 and your midterm preparations!",
        ],
    )

    c.save()


def make_sample_docs():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    syllabus_path = OUTPUT_DIR / "syllabus.pdf"
    assignment_path = OUTPUT_DIR / "assignment_1.pdf"
    announcement_path = OUTPUT_DIR / "announcement_update.pdf"

    print(f"Generating synthetic sample documents in {OUTPUT_DIR}...")
    build_syllabus(syllabus_path)
    print(f"Generated {syllabus_path.name}")

    build_assignment_1(assignment_path)
    print(f"Generated {assignment_path.name}")

    build_announcement(announcement_path)
    print(f"Generated {announcement_path.name}")

    print("All sample documents successfully generated.")


if __name__ == "__main__":
    make_sample_docs()

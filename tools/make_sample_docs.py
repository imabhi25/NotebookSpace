#!/usr/bin/env python3
"""
Generate synthetic sample course documents for the public demo and evaluation.
Creates 6 PDFs in docs/sample_docs/ (22 pages total):
- syllabus.pdf (4 pages)
- assignment_1.pdf (3 pages)
- announcement_update.pdf (3 pages)
- assignment_2.pdf (4 pages)
- exam_guide.pdf (4 pages)
- lecture_schedule.pdf (4 pages)

Every page includes the required visible header:
"SYNTHETIC SAMPLE DOCUMENT - not a real course"

Intentional conflicts ground truth (10 total):
1. Assignment 1 due date: syllabus.pdf (p. 3: October 14, 2026) vs announcement_update.pdf (p. 1: October 21, 2026)
2. Late submission penalty: syllabus.pdf (p. 2: 10 percent per day up to 3 days) vs announcement_update.pdf (p. 2: 5 percent per day up to 2 days)
3. Midterm examination date: syllabus.pdf (p. 2: November 5, 2026 in Hall B) vs announcement_update.pdf (p. 2: November 12, 2026 in Hall B)
4. Assignment 2 due date: syllabus.pdf (p. 3: November 18, 2026) vs assignment_2.pdf (p. 1: November 25, 2026)
5. Instructor office hours location: syllabus.pdf (p. 1: Science Center Room 405) vs lecture_schedule.pdf (p. 1: Turing Hall Room 310)
6. Final Term Project grade weight: syllabus.pdf (p. 2: 25 percent) vs lecture_schedule.pdf (p. 4: 30 percent)
7. Assignment 1 minimum lock shard count: assignment_1.pdf (p. 2: at least 64 distinct lock shards) vs lecture_schedule.pdf (p. 2: at least 32 distinct lock shards)
8. Teaching Assistant walk-in tutoring location: announcement_update.pdf (p. 3: Turing Hall Room 204) vs exam_guide.pdf (p. 4: Science Center Room 215)
9. Assignment 2 benchmark cluster nodes: assignment_2.pdf (p. 2: 2, 4, and 8 cluster node instances) vs lecture_schedule.pdf (p. 3: 3, 5, and 7 cluster node instances)
10. Official course C++ standard: exam_guide.pdf (p. 2: modern C++20 standard) vs lecture_schedule.pdf (p. 1: standardized on C++17)
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


def build_assignment_2(out_path: Path):
    c = canvas.Canvas(str(out_path), pagesize=letter)

    # Page 1: Overview and Objectives
    _draw_page_content(
        c,
        "Assignment 2: Distributed Consensus with Raft",
        [
            "Course: CS 401 Advanced Systems Programming.",
            "Due Date: November 25, 2026 at 11:59 PM via the course submission portal.",
            "Objective: Implement a fault-tolerant distributed consensus service based on the Raft protocol specification.",
            "The consensus service must manage replicated state machine logs and elect a new leader when network partitions or node crashes occur.",
            "Key RPCs: Implement RequestVote and AppendEntries RPC interfaces with strict message ordering.",
        ],
    )

    # Page 2: Timing and Benchmark Requirements
    _draw_page_content(
        c,
        "Raft Timing Requirements and Benchmark Harness",
        [
            "Heartbeat and Election Timers: Heartbeat intervals must be set to 50 milliseconds. Election timeouts must be randomized between 150 milliseconds and 300 milliseconds.",
            "Benchmark Harness: The automated test suite evaluates performance on 2, 4, and 8 cluster node instances under simulated packet loss.",
            "Linearizability Guarantee: All client read and write operations must satisfy strict linearizability across leader transitions.",
            "Concurrency Controls: Use mutexes and condition variables to guard internal state machine transitions without deadlocks.",
        ],
    )

    # Page 3: State Machine Persistence and Log Compaction
    _draw_page_content(
        c,
        "State Machine Persistence and Log Compaction",
        [
            "Log Compaction: Implement Snapshot RPC to discard committed log entries and bound disk usage.",
            "Persistent Storage Interface: Persist currentTerm, votedFor, and log entries to the mock disk interface before responding to RPCs.",
            "Crash Recovery: Nodes must successfully reconstruct in-memory state machines upon simulated reboot from persistent storage.",
            "Network Partitions: Sub-clusters with fewer than a majority of nodes must reject client write operations.",
        ],
    )

    # Page 4: Grading Rubric and Submission Format
    _draw_page_content(
        c,
        "Assignment 2 Grading Rubric and Submission Format",
        [
            "Evaluation Breakdown: Leader Election (30 points), Log Replication (40 points), Partition Recovery and Persistence (30 points).",
            "Submission Packaging: Submit a single compressed archive named assignment2.tar.gz containing your src/ directory and tests/ suite.",
            "Collaboration Rule: All implementation code must be written individually. Group submissions are not accepted.",
            "Late Penalty: Submissions follow the revised course late submission policy stated in the latest course announcements.",
        ],
    )

    c.save()


def build_exam_guide(out_path: Path):
    c = canvas.Canvas(str(out_path), pagesize=letter)

    # Page 1: Exam Structure and Permitted Items
    _draw_page_content(
        c,
        "CS 401 Midterm Examination Study and Logistics Guide",
        [
            "Examination Overview: The CS 401 Midterm Examination evaluates core concepts in multi-threaded programming and distributed consensus.",
            "Duration and Format: The exam duration is 120 minutes. It includes 20 multiple-choice questions and 3 handwritten systems coding problems.",
            "Allowed Reference Materials: Students may bring one double-sided 8.5x11 inch handwritten notes sheet and a basic non-programmable calculator.",
            "Prohibited Devices: Cellular phones, smartwatches, laptops, and connected devices are strictly forbidden during the exam.",
        ],
    )

    # Page 2: Technical Scope and Required Standard
    _draw_page_content(
        c,
        "Technical Scope and Required Programming Standard",
        [
            "Programming Language Standard: All midterm and exam code syntax must use modern C++20 standard conventions including std::jthread and concepts.",
            "Topic 1: Concurrency Primitives: Mutexes, shared_mutex, condition variables, atomic variables, and sequentially consistent memory ordering.",
            "Topic 2: Lock-Free Programming: Compare-and-swap loops, ABA problem mitigation, and memory reclamation strategies.",
            "Topic 3: Distributed Consensus: Raft leader election invariants, term management, and safety properties.",
        ],
    )

    # Page 3: Problem Strategies and Common Pitfalls
    _draw_page_content(
        c,
        "Exam Problem Strategies and Common Pitfalls",
        [
            "Reader-Writer Lock Invariants: Ensure write acquisition requests give priority over newly arriving read requests to prevent writer starvation.",
            "Deadlock Avoidance: Enforce strict global lock acquisition ordering across all nested synchronization regions.",
            "Spurious Wakeups: Condition variable wait operations must always be enclosed within a while predicate loop.",
            "Memory Fences: Do not assume relaxed atomic operations establish synchronization barriers without explicit fences.",
        ],
    )

    # Page 4: Review Sessions, Tutoring, and Regrade Policies
    _draw_page_content(
        c,
        "Review Sessions, Tutoring, and Regrade Policies",
        [
            "Tutoring and Review Support: Teaching Assistant walk-in tutoring is conducted in Science Center Room 215 on Thursday mornings from 10:00 AM to 12:00 PM.",
            "Official Exam Review: Solutions and rubric guidelines will be discussed in lecture following the return of graded exams.",
            "Regrade Requests: Regrade petitions must be submitted through the course portal within 5 business days of exam distribution.",
            "Accommodated Testing: Students with approved testing accommodations must schedule room reservations with the Accessibility Center 7 days in advance.",
        ],
    )

    c.save()


def build_lecture_schedule(out_path: Path):
    c = canvas.Canvas(str(out_path), pagesize=letter)

    # Page 1: Course Info and Technology Standards
    _draw_page_content(
        c,
        "CS 401 Weekly Lecture Schedule and Technology Standards",
        [
            "Course Overview: Advanced Systems Programming meets Monday and Wednesday from 10:00 AM to 11:30 AM in Turing Hall Room 101.",
            "Official Technology Standards: All code examples, assignments, and exam reference syntax are standardized on C++17.",
            "Staff and Office Hours: Dr. Alex Mercer holds office hours in Turing Hall Room 310 on Mondays from 1:00 PM to 3:00 PM.",
            "Course Repository: Weekly lecture slides and coding examples are published to the department course git server each Friday.",
        ],
    )

    # Page 2: Weeks 1-5 Lecture Topics
    _draw_page_content(
        c,
        "Weeks 1 through 5: Concurrency and Thread Safety",
        [
            "Week 1: Multi-core hardware architectures, memory hierarchies, cache coherence, and false sharing.",
            "Week 2: POSIX threads, C++ thread lifecycles, race conditions, and AddressSanitizer/ThreadSanitizer diagnostics.",
            "Week 3: Synchronization primitives, reader-writer locks, and semaphore implementations.",
            "Week 4: Assignment 1 Architecture: Concurrent hash tables, bucket striping, and lock sharding requirements. Note: Assignment 1 requires bucket-level locking with at least 32 distinct lock shards.",
            "Week 5: Lock-free data structures, atomic memory models, and non-blocking queue design.",
        ],
    )

    # Page 3: Weeks 6-10 Lecture Topics
    _draw_page_content(
        c,
        "Weeks 6 through 10: Distributed Systems and Consensus",
        [
            "Week 6: RPC communication patterns, failure detection, and network timeouts.",
            "Week 7: Fault-tolerant state machine replication and quorum systems.",
            "Week 8: The Raft consensus algorithm: Leader election and heartbeat protocols.",
            "Week 9: Assignment 2 Architecture: Raft log replication and cluster testing harness. Note: Assignment 2 automated evaluation is conducted on 3, 5, and 7 cluster node instances.",
            "Week 10: Distributed log compaction and snapshotting mechanisms.",
        ],
    )

    # Page 4: Weeks 11-15 Lecture Topics and Final Deliverables
    _draw_page_content(
        c,
        "Weeks 11 through 15: Storage Systems and Final Projects",
        [
            "Week 11: Write-ahead logging, crash recovery, and ARIES database algorithms.",
            "Week 12: Distributed key-value systems and consistency trade-offs.",
            "Week 13: Final term project design presentations and architecture reviews.",
            "Course Deliverables Overview: Final Term Project accounts for 30 percent of the total course grade, evaluated on performance benchmarks.",
            "Final Demo Schedule: Final project live demonstrations will take place December 18 through December 20, 2026.",
        ],
    )

    c.save()


def build_tutorial_02(out_path: Path):
    c = canvas.Canvas(str(out_path), pagesize=letter)
    _draw_page_content(
        c,
        "Tutorial 02: Array Algorithms and Pseudocode Conventions",
        [
            "Course: EECS 3101 / CS 401 Introduction to Algorithms.",
            "Array Indexing Convention:",
            "In all tutorial pseudocode, exercises, and algorithm walkthroughs, arrays are 1-indexed (indices range from 1 to n).",
            "For example, for an array A with n elements:",
            "The first element is located at A[1] and the final element is located at A[n].",
            "Example Linear Search Routine:",
            "    function linear_search(A, n, target):",
            "        for i = 1 to n do:",
            "            if A[i] == target then return i",
            "        return -1",
            "Subarray Partitioning Convention:",
            "The left subarray is denoted A[1 .. mid] and the right subarray is denoted A[mid + 1 .. right].",
            "All loop invariants must be formulated assuming index 1 as the first element.",
        ],
    )
    c.save()


def make_sample_docs():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    syllabus_path = OUTPUT_DIR / "syllabus.pdf"
    assignment1_path = OUTPUT_DIR / "assignment_1.pdf"
    announcement_path = OUTPUT_DIR / "announcement_update.pdf"
    assignment2_path = OUTPUT_DIR / "assignment_2.pdf"
    exam_guide_path = OUTPUT_DIR / "exam_guide.pdf"
    lecture_schedule_path = OUTPUT_DIR / "lecture_schedule.pdf"
    tutorial2_path = OUTPUT_DIR / "tutorial_02_arrays.pdf"

    print(f"Generating synthetic sample documents in {OUTPUT_DIR}...")
    build_syllabus(syllabus_path)
    print(f"Generated {syllabus_path.name}")

    build_assignment_1(assignment1_path)
    print(f"Generated {assignment1_path.name}")

    build_announcement(announcement_path)
    print(f"Generated {announcement_path.name}")

    build_assignment_2(assignment2_path)
    print(f"Generated {assignment2_path.name}")

    build_exam_guide(exam_guide_path)
    print(f"Generated {exam_guide_path.name}")

    build_lecture_schedule(lecture_schedule_path)
    print(f"Generated {lecture_schedule_path.name}")

    build_tutorial_02(tutorial2_path)
    print(f"Generated {tutorial2_path.name}")

    print("All sample documents successfully generated.")


if __name__ == "__main__":
    make_sample_docs()


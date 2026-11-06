#!/usr/bin/env python3
"""
Generate a dedicated synthetic course overview PDF for the one-click sample notebook.
Saved to docs/sample_notebook/cs401_course_overview.pdf (4 pages).
"""

from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

project_root = Path(__file__).resolve().parent.parent
OUTPUT_DIR = project_root / "docs" / "sample_notebook"
OUTPUT_FILE = OUTPUT_DIR / "cs401_course_overview.pdf"

HEADER_TEXT = "SYNTHETIC SAMPLE NOTEBOOK DOCUMENT - not a real course"


def _draw_header(c: canvas.Canvas):
    c.setFont("Helvetica-Bold", 10)
    c.setFillColorRGB(0.2, 0.3, 0.6)
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


def build_sample_notebook_doc(out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(out_path), pagesize=letter)

    # Page 1: Course Overview, Prerequisites & Office Hours
    _draw_page_content(
        c,
        "CS 401: Systems Programming - Course Overview",
        [
            "Term: Fall 2026 | Credits: 4.0 | Location: Engineering Building Room 101.",
            "Instructor: Course Staff (contact via course portal). Office Hours: Mondays and Wednesdays from 2:00 PM to 4:00 PM in Computer Science Building Room 204. Teaching Assistant Office Hours: Fridays from 10:00 AM to 12:00 PM online via course discussion forum.",
            "Prerequisites: Students must have completed CS 201 (Data Structures and Algorithms) and CS 202 (Computer Architecture and Systems) with a grade of C or better. Proficiency in C/C++ programming and Unix command-line utilities is required.",
            "Course Description: This course covers fundamental and advanced principles of systems programming, concurrency, memory management, and distributed systems. Students develop multi-threaded network services and high-performance storage components.",
        ],
    )

    # Page 2: Grading Breakdown & Course Policies
    _draw_page_content(
        c,
        "Grading Breakdown and Assessment Policies",
        [
            "Grading Breakdown: Course grades are computed from the following components (totaling exactly 100 percent):",
            "- Programming Projects (4 assignments): 40 percent of total grade (10 percent each).",
            "- Midterm Examination: 25 percent of total grade.",
            "- Final Term Examination: 25 percent of total grade.",
            "- Homework Problem Sets and Quizzes: 10 percent of total grade.",
            "Grading Scale: A: 90-100 percent, B: 80-89 percent, C: 70-79 percent, D: 60-69 percent, F: below 60 percent.",
            "Late Policy: Assignments submitted after the scheduled deadline will incur a penalty of 10 percent per day for up to 3 days late. Submissions more than 3 days late will receive zero credit. Medical and emergency accommodations require prior approval from the academic dean.",
        ],
    )

    # Page 3: Examination Details and Midterm Information
    _draw_page_content(
        c,
        "Examination Schedule and Midterm Details",
        [
            "Midterm Examination Date and Weight: The Midterm Examination is scheduled for Thursday, November 5, 2026, from 7:00 PM to 9:00 PM in Lecture Hall C. The midterm accounts for 25 percent of the overall course grade.",
            "Midterm Scope and Allowed Materials: The examination covers all material from Weeks 1 through 7, including memory hierarchies, thread synchronization, and asynchronous I/O. The exam is closed-book; students may bring one double-sided letter-sized (8.5x11 inch) handwritten formula sheet.",
            "Final Examination: The Final Examination will be held during university exam week on December 18, 2026, contributing 25 percent of the course grade. It is comprehensive with an emphasis on Weeks 8 through 14.",
        ],
    )

    # Page 4: Weekly Course Schedule and Topics
    _draw_page_content(
        c,
        "Weekly Course Schedule and Topics",
        [
            "Course Topics by Week:",
            "- Week 1: Unix Environment, Tooling, Compilers, and Build Systems.",
            "- Week 2: Memory Layout, Pointers, Stack and Heap Dynamic Allocation.",
            "- Week 3: POSIX File I/O, File Descriptors, and System Calls.",
            "- Week 4: Processes, Signals, IPC, and Process Management.",
            "- Week 5: Threads, Pthreads Library, and Shared Memory.",
            "- Week 6: Concurrency, Mutexes, Semaphores, and Race Condition Prevention.",
            "- Week 7: Deadlocks, Condition Variables, and Thread Synchronization.",
            "- Week 8: Midterm Examination Review and Midterm Exam.",
            "- Week 9: Network Sockets, TCP/IP Communication, and Client-Server Protocols.",
            "- Week 10: Asynchronous and Event-Driven I/O Architectures (epoll/kqueue).",
            "- Week 11: Distributed Consensus, RPC Systems, and Fault Tolerance.",
            "- Week 12: File System Design, Disk Layouts, and Crash Recovery.",
            "- Week 13: Memory-Mapped Files, Caching Strategies, and Performance Profiling.",
            "- Week 14: Final Review, Case Studies in Modern Operating Systems, and Project Presentations.",
        ],
    )

    c.save()


if __name__ == "__main__":
    print(f"Generating sample notebook document at {OUTPUT_FILE}...")
    build_sample_notebook_doc(OUTPUT_FILE)
    print("Done!")

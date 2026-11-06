#!/usr/bin/env python3
"""
Standalone memory & latency benchmark for NotebookSpace embedding models.

Runs ONE FRESH subprocess per configuration (MiniLM, BGE, MiniLM+reranker,
BGE+reranker). Each subprocess:
  1. Loads model(s) → reports peak RSS after load.
  2. Embeds 30 real eval questions → reports median/p95 embed time per query.
  3. Reranks top-15 realistic-length passages per query (if reranker enabled)
     → reports median/p95 rerank time per query.
  4. Reports peak RSS after workload.

No PDF parsing, no database, no LLM calls in the measured process.

Usage:
    .venv/bin/python evals/benchmark_memory.py
    .venv/bin/python evals/benchmark_memory.py --docker   # build & run in Docker with 512m limit
"""

import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
EVALS_DIR = PROJECT_ROOT / "evals"
SCRATCH_DIR = EVALS_DIR / ".bench_scratch"


def _collect_queries() -> list[str]:
    """Collect 30 real evaluation query strings (15 from Set A, 15 from Set B)."""
    qs_a = json.loads((EVALS_DIR / "questions_real.json").read_text())
    qs_b = json.loads((EVALS_DIR / "questions_real_b.json").read_text())
    ans_a = [q for q in qs_a if not q.get("is_absent") and q.get("category") != "absent_fact"]
    ans_b = [q for q in qs_b if not q.get("is_absent") and q.get("category") != "absent_fact"]
    return [q["question"] for q in ans_a[:15]] + [q["question"] for q in ans_b[:15]]


def _generate_dummy_passages(n: int = 15, seed: int = 42) -> list[str]:
    """Generate n realistic-length dummy passages (~200-400 words each).

    We use fixed text snippets representative of textbook prose rather than
    random strings, so cross-encoder scoring is exercised realistically.
    """
    import random
    rng = random.Random(seed)

    base_texts = [
        "Python is a high-level, general-purpose programming language. Its design philosophy "
        "emphasizes code readability with the use of significant indentation. Python is "
        "dynamically typed and garbage-collected. It supports multiple programming paradigms, "
        "including structured, object-oriented, and functional programming. Python was "
        "conceived in the late 1980s by Guido van Rossum at Centrum Wiskunde & Informatica "
        "as a successor to the ABC programming language. Its implementation began in December "
        "1989. Python consistently ranks as one of the most popular programming languages.",

        "A variable is a named storage location in computer memory that holds a value. In "
        "Python, variables are created when you first assign a value to them. Unlike many "
        "other programming languages, Python does not require you to declare a variable's "
        "type before using it. The type of a variable is determined automatically based on "
        "the value assigned to it. This is called dynamic typing. Variable names must start "
        "with a letter or underscore, followed by letters, digits, or underscores.",

        "An expression is a combination of values, variables, operators, and function calls "
        "that the interpreter evaluates to produce a result. For example, 2 + 3 is an "
        "arithmetic expression that evaluates to 5. Expressions can include comparison "
        "operators like ==, !=, <, >, <=, and >= which evaluate to Boolean values True or "
        "False. The order of operations follows standard mathematical precedence: "
        "parentheses, exponentiation, multiplication/division, addition/subtraction.",

        "Conditional statements allow a program to execute different blocks of code based on "
        "whether a condition is true or false. The if statement is the simplest form. An "
        "if-else statement provides an alternative block when the condition is false. The "
        "elif clause (short for else if) allows checking multiple conditions in sequence. "
        "Python uses indentation to define the body of each branch, unlike languages that "
        "use curly braces. Nested conditionals can be used for more complex logic.",

        "A string in Python is a sequence of characters enclosed in single quotes, double "
        "quotes, or triple quotes. Strings are immutable, meaning once created they cannot "
        "be changed. Common string operations include concatenation (+), repetition (*), "
        "slicing, and various methods like upper(), lower(), strip(), split(), and join(). "
        "F-strings (formatted string literals) provide a concise way to embed expressions "
        "inside string literals using curly braces. They were introduced in Python 3.6.",
    ]

    passages = []
    for i in range(n):
        base = base_texts[i % len(base_texts)]
        # Repeat and shuffle sentences to get realistic ~250-word passages
        sentences = base.split(". ")
        rng.shuffle(sentences)
        text = ". ".join(sentences)
        # Pad to at least 200 words
        while len(text.split()) < 200:
            text += " " + base
        passages.append(text[:1500])  # Cap at ~1500 chars like real chunks
    return passages


def _write_benchmark_data():
    """Write queries and passages to a scratch directory for subprocess use."""
    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
    queries = _collect_queries()
    passages = _generate_dummy_passages()
    (SCRATCH_DIR / "queries.json").write_text(json.dumps(queries))
    (SCRATCH_DIR / "passages.json").write_text(json.dumps(passages))
    return len(queries), len(passages)


# ---------------------------------------------------------------
# Subprocess worker script (executed as a standalone process)
# ---------------------------------------------------------------

WORKER_SCRIPT = textwrap.dedent(r'''
import json
import os
import resource
import sys
import time

def get_peak_rss_mb():
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform == "darwin":
        return rss / (1024 * 1024)
    return rss / 1024

def main():
    config = json.loads(sys.argv[1])
    scratch_dir = config["scratch_dir"]
    emb_model = config["embedding_model"]
    use_reranker = config["use_reranker"]

    queries = json.loads(open(os.path.join(scratch_dir, "queries.json")).read())
    passages = json.loads(open(os.path.join(scratch_dir, "passages.json")).read())

    # ----- Phase 1: Load models -----
    from fastembed import TextEmbedding
    emb = TextEmbedding(model_name=emb_model)
    # Warm up
    list(emb.embed(["warmup"]))

    reranker = None
    if use_reranker:
        from fastembed.rerank.cross_encoder import TextCrossEncoder
        reranker = TextCrossEncoder(model_name="Xenova/ms-marco-MiniLM-L-6-v2")
        list(reranker.rerank("warmup", ["warmup doc"]))

    rss_after_load = get_peak_rss_mb()

    # ----- Phase 2: Embed all queries -----
    embed_times = []
    for q in queries:
        t0 = time.perf_counter()
        list(emb.embed([q]))
        embed_times.append((time.perf_counter() - t0) * 1000.0)

    # ----- Phase 3: Rerank (if enabled) -----
    rerank_times = []
    if reranker:
        for q in queries:
            t0 = time.perf_counter()
            list(reranker.rerank(q, passages[:15]))
            rerank_times.append((time.perf_counter() - t0) * 1000.0)

    rss_after_work = get_peak_rss_mb()

    # ----- Phase 4: Compute stats -----
    import statistics
    def pct(lst, p):
        s = sorted(lst)
        k = int(len(s) * p / 100)
        return s[min(k, len(s) - 1)]

    result = {
        "embedding_model": emb_model,
        "use_reranker": use_reranker,
        "rss_after_load_mb": round(rss_after_load, 1),
        "rss_after_work_mb": round(rss_after_work, 1),
        "embed_median_ms": round(statistics.median(embed_times), 1),
        "embed_p95_ms": round(pct(embed_times, 95), 1),
        "num_queries": len(queries),
        "num_passages": len(passages),
    }
    if rerank_times:
        result["rerank_median_ms"] = round(statistics.median(rerank_times), 1)
        result["rerank_p95_ms"] = round(pct(rerank_times, 95), 1)

    print("BENCHMARK_RESULT:" + json.dumps(result))

if __name__ == "__main__":
    main()
''')


CONFIGS = [
    {
        "name": "MiniLM",
        "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
        "use_reranker": False,
    },
    {
        "name": "BGE",
        "embedding_model": "BAAI/bge-small-en-v1.5",
        "use_reranker": False,
    },
    {
        "name": "MiniLM + Reranker",
        "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
        "use_reranker": True,
    },
    {
        "name": "BGE + Reranker",
        "embedding_model": "BAAI/bge-small-en-v1.5",
        "use_reranker": True,
    },
]


def run_benchmark(docker: bool = False):
    """Run all 4 configurations and print results."""
    n_queries, n_passages = _write_benchmark_data()
    print(f"Prepared {n_queries} queries and {n_passages} dummy passages")

    # Write worker script to scratch dir
    worker_path = SCRATCH_DIR / "worker.py"
    worker_path.write_text(WORKER_SCRIPT)

    results = []
    for cfg in CONFIGS:
        print(f"\n{'='*60}")
        print(f"Running: {cfg['name']}")
        print(f"{'='*60}")

        config_json = json.dumps({
            "scratch_dir": str(SCRATCH_DIR),
            "embedding_model": cfg["embedding_model"],
            "use_reranker": cfg["use_reranker"],
        })

        if docker:
            cmd = [
                "docker", "run", "--rm",
                "--memory=512m",
                "--memory-swap=512m",
                "-v", f"{PROJECT_ROOT}:/app",
                "-w", "/app",
                "python:3.12-slim",
                "bash", "-c",
                f"pip install -q fastembed && python {worker_path.relative_to(PROJECT_ROOT)} '{config_json}'"
            ]
        else:
            cmd = [
                str(PROJECT_ROOT / ".venv" / "bin" / "python"),
                str(worker_path),
                config_json,
            ]

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,  # 5 minute timeout per config
                cwd=str(PROJECT_ROOT),
            )

            # Parse result from stdout
            result_line = None
            for line in proc.stdout.split("\n"):
                if line.startswith("BENCHMARK_RESULT:"):
                    result_line = line[len("BENCHMARK_RESULT:"):]
                    break

            if proc.returncode != 0:
                print(f"  FAILED (exit code {proc.returncode})")
                if proc.stderr:
                    # Check for OOM
                    stderr_lower = proc.stderr.lower()
                    if "killed" in stderr_lower or "oom" in stderr_lower or "memory" in stderr_lower:
                        print(f"  *** OOM-KILLED ***")
                        results.append({"name": cfg["name"], "status": "OOM-KILLED"})
                    else:
                        print(f"  stderr: {proc.stderr[-500:]}")
                        results.append({"name": cfg["name"], "status": f"FAILED (exit {proc.returncode})"})
                continue

            if result_line:
                data = json.loads(result_line)
                data["name"] = cfg["name"]
                data["status"] = "OK"
                results.append(data)
                print(f"  RSS after load: {data['rss_after_load_mb']} MB")
                print(f"  RSS after work: {data['rss_after_work_mb']} MB")
                print(f"  Embed: median {data['embed_median_ms']} ms, p95 {data['embed_p95_ms']} ms")
                if data.get("rerank_median_ms"):
                    print(f"  Rerank: median {data['rerank_median_ms']} ms, p95 {data['rerank_p95_ms']} ms")
            else:
                print(f"  No result found in output")
                print(f"  stdout: {proc.stdout[-500:]}")
                results.append({"name": cfg["name"], "status": "NO_RESULT"})

        except subprocess.TimeoutExpired:
            print(f"  TIMEOUT after 300s")
            results.append({"name": cfg["name"], "status": "TIMEOUT"})

    # Print summary table
    print(f"\n\n{'='*90}")
    print(" MEMORY & LATENCY BENCHMARK RESULTS")
    print(f"{'='*90}")
    print(f"{'Configuration':<22} | {'RSS Load':>10} | {'RSS Work':>10} | {'Embed Med':>10} | {'Embed P95':>10} | {'Rerank Med':>10} | {'Rerank P95':>10}")
    print("-" * 90)
    for r in results:
        if r.get("status") != "OK":
            print(f"{r['name']:<22} | {r['status']}")
            continue
        rerank_med = f"{r.get('rerank_median_ms', '-')}" if r.get('rerank_median_ms') else "—"
        rerank_p95 = f"{r.get('rerank_p95_ms', '-')}" if r.get('rerank_p95_ms') else "—"
        print(
            f"{r['name']:<22} | "
            f"{r['rss_after_load_mb']:>8.1f}MB | "
            f"{r['rss_after_work_mb']:>8.1f}MB | "
            f"{r['embed_median_ms']:>8.1f}ms | "
            f"{r['embed_p95_ms']:>8.1f}ms | "
            f"{rerank_med:>10} | "
            f"{rerank_p95:>10}"
        )
    print(f"{'='*90}")
    print(f"Queries: {n_queries} real eval questions | Rerank passages: {n_passages} × ~250 words each")
    mode = "Docker (--memory=512m --memory-swap=512m)" if docker else f"Native ({sys.platform})"
    print(f"Mode: {mode}")
    print("NOTE: CPU is NOT Render's free-tier CPU. Latencies are indicative, not deployment-representative.")

    # Save results JSON
    output_path = SCRATCH_DIR / "benchmark_results.json"
    output_path.write_text(json.dumps(results, indent=2))
    print(f"\nResults saved to {output_path}")

    return results


def run_docker_benchmark():
    """Run the benchmark inside Docker with --memory=512m."""
    print("\n" + "=" * 60)
    print(" DOCKER MEMORY LIMIT TEST (512 MB)")
    print("=" * 60)

    n_queries, n_passages = _write_benchmark_data()
    worker_path = SCRATCH_DIR / "worker.py"
    worker_path.write_text(WORKER_SCRIPT)

    results = []
    for cfg in CONFIGS:
        print(f"\n--- {cfg['name']} ---")

        config_json = json.dumps({
            "scratch_dir": "/app/evals/.bench_scratch",
            "embedding_model": cfg["embedding_model"],
            "use_reranker": cfg["use_reranker"],
        })

        # Use the repo's requirements to install fastembed
        cmd = [
            "docker", "run", "--rm",
            "--memory=512m",
            "--memory-swap=512m",
            "-v", f"{PROJECT_ROOT}:/app:ro",
            "-v", f"{SCRATCH_DIR}:/app/evals/.bench_scratch",
            "-w", "/app",
            "python:3.12-slim",
            "bash", "-c",
            (
                "pip install -q fastembed numpy 2>/dev/null && "
                f"python /app/evals/.bench_scratch/worker.py '{config_json}'"
            ),
        ]

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,
            )

            if proc.returncode == 137:  # SIGKILL = OOM
                print(f"  *** OOM-KILLED (exit 137) ***")
                results.append({"name": cfg["name"], "status": "OOM-KILLED"})
                continue

            result_line = None
            for line in proc.stdout.split("\n"):
                if line.startswith("BENCHMARK_RESULT:"):
                    result_line = line[len("BENCHMARK_RESULT:"):]
                    break

            if proc.returncode != 0:
                stderr = proc.stderr[-300:] if proc.stderr else ""
                if "killed" in stderr.lower() or "oom" in stderr.lower():
                    print(f"  *** OOM-KILLED ***")
                    results.append({"name": cfg["name"], "status": "OOM-KILLED"})
                else:
                    print(f"  FAILED (exit {proc.returncode}): {stderr}")
                    results.append({"name": cfg["name"], "status": f"FAILED"})
                continue

            if result_line:
                data = json.loads(result_line)
                data["name"] = cfg["name"]
                data["status"] = "OK"
                results.append(data)
                print(f"  Completed. Peak RSS: {data['rss_after_work_mb']} MB")
            else:
                print(f"  No result parsed. stdout tail: {proc.stdout[-200:]}")
                results.append({"name": cfg["name"], "status": "NO_RESULT"})

        except subprocess.TimeoutExpired:
            print(f"  TIMEOUT")
            results.append({"name": cfg["name"], "status": "TIMEOUT"})

    print(f"\n{'='*60}")
    print(" DOCKER 512 MB SUMMARY")
    print(f"{'='*60}")
    for r in results:
        status = r["status"]
        rss = f" (peak {r.get('rss_after_work_mb', '?')} MB)" if status == "OK" else ""
        print(f"  {r['name']:<22}: {status}{rss}")
    print("NOTE: CPU is NOT Render's free-tier CPU.")
    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Standalone memory & latency benchmark")
    parser.add_argument("--docker", action="store_true", help="Run in Docker with --memory=512m")
    args = parser.parse_args()

    if args.docker:
        run_docker_benchmark()
    else:
        run_benchmark()

import os
import sys
from pathlib import Path

# Add project root to sys.path if not present
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

import psycopg
from dotenv import load_dotenv

load_dotenv()


def get_migrations_dir() -> Path:
    return Path(__file__).resolve().parent / "migrations"


def run_migrations(db_url: str | None = None) -> list[str]:
    """Apply all pending SQL migrations in numerical order."""
    from db.connection import get_database_url

    url = db_url or get_database_url()
    migrations_dir = get_migrations_dir()

    if not migrations_dir.exists():
        raise FileNotFoundError(f"Migrations directory not found: {migrations_dir}")

    migration_files = sorted(migrations_dir.glob("*.sql"))
    if not migration_files:
        print("No migration files found.")
        return []

    applied: list[str] = []

    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            # Ensure migration tracking table exists
            cur.execute("""
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version VARCHAR(255) PRIMARY KEY,
                    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            """)
            conn.commit()

            # Query already applied migrations
            cur.execute("SELECT version FROM schema_migrations;")
            already_applied = {row[0] for row in cur.fetchall()}

            for migration_path in migration_files:
                version = migration_path.name
                if version in already_applied:
                    continue

                print(f"Applying migration: {version}...")
                with open(migration_path, "r", encoding="utf-8") as f:
                    sql_content = f.read()

                try:
                    cur.execute(sql_content)
                    cur.execute(
                        "INSERT INTO schema_migrations (version) VALUES (%s);",
                        (version,),
                    )
                    conn.commit()
                    applied.append(version)
                    print(f"Successfully applied: {version}")
                except Exception as e:
                    conn.rollback()
                    print(f"Error applying migration {version}: {e}", file=sys.stderr)
                    raise

    if not applied:
        print("Database schema is up to date. No pending migrations.")
    else:
        print(f"Applied {len(applied)} migration(s).")

    return applied


if __name__ == "__main__":
    db_target = sys.argv[1] if len(sys.argv) > 1 else None
    run_migrations(db_target)

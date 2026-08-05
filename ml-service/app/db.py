from contextlib import contextmanager

import psycopg2
import psycopg2.extras

from app.config import settings


@contextmanager
def get_connection():
    conn = psycopg2.connect(settings.database_url)
    try:
        yield conn
    finally:
        conn.close()


def query(sql: str, params: tuple = ()) -> list[dict]:
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(row) for row in cur.fetchall()]

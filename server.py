#!/usr/bin/env python3
"""GreyNoise secure backend proxy — serves the dashboard and proxies Community API lookups."""

from __future__ import annotations

import atexit
import datetime
import logging
import os
import re
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Generator

import psycopg2
import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from psycopg2 import pool
from psycopg2.extras import Json

ROOT = Path(__file__).resolve().parent
GREYNOISE_UPSTREAM = "https://api.greynoise.io/v3/community"
DEFAULT_ALLOWED_ORIGINS = [
    "https://sycure.ai",
    "https://sycureai-71c13dfc.onrender.com",
    "http://localhost:5000",
]
IPV4_PATTERN = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")
CACHE_EXPIRATION_HOURS = 24

load_dotenv(ROOT / ".env")

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("greynoise_proxy")

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip() or None
DB_POOL_MIN = int(os.environ.get("DB_POOL_MIN", "1"))
DB_POOL_MAX = int(os.environ.get("DB_POOL_MAX", "10"))
DB_SSLMODE = os.environ.get("DB_SSLMODE", "require")

_allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "").strip()
ALLOWED_ORIGINS = (
    [origin.strip() for origin in _allowed_origins_env.split(",") if origin.strip()]
    if _allowed_origins_env
    else DEFAULT_ALLOWED_ORIGINS
)

_connection_pool: pool.ThreadedConnectionPool | None = None

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")
CORS(app, origins=ALLOWED_ORIGINS, methods=["GET"], allow_headers=["Accept"])

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[],
    storage_uri=os.environ.get("RATELIMIT_STORAGE_URI", "memory://"),
)


def get_api_key() -> str:
    return os.environ.get("GREYNOISE_API_KEY", "").strip()


def _utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _as_utc(value: datetime.datetime) -> datetime.datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(datetime.timezone.utc)


def init_connection_pool() -> bool:
    """Create a per-worker threaded pool. Safe to call repeatedly."""
    global _connection_pool

    if not DATABASE_URL:
        logger.info("DATABASE_URL not configured; cache disabled.")
        return False

    if _connection_pool is not None:
        return True

    try:
        _connection_pool = pool.ThreadedConnectionPool(
            minconn=DB_POOL_MIN,
            maxconn=DB_POOL_MAX,
            dsn=DATABASE_URL,
            sslmode=DB_SSLMODE,
        )
        logger.info(
            "Database connection pool ready (min=%s, max=%s).",
            DB_POOL_MIN,
            DB_POOL_MAX,
        )
        return True
    except Exception as exc:
        _connection_pool = None
        logger.warning("Database pool initialization failed: %s", exc)
        return False


def close_connection_pool() -> None:
    """Release all pooled connections when the worker process exits."""
    global _connection_pool

    if _connection_pool is None:
        return

    try:
        _connection_pool.closeall()
        logger.info("Database connection pool closed.")
    except Exception as exc:
        logger.warning("Error while closing database pool: %s", exc)
    finally:
        _connection_pool = None


@contextmanager
def borrow_db_connection() -> Generator[psycopg2.extensions.connection | None, None, None]:
    """
    Acquire a pooled connection for the current thread.

    Returns None when the database is unavailable so callers can fall back to
    live upstream queries without failing the HTTP request.
    """
    conn: psycopg2.extensions.connection | None = None
    discard = False

    if not init_connection_pool() or _connection_pool is None:
        yield None
        return

    try:
        conn = _connection_pool.getconn()
    except pool.PoolError as exc:
        logger.warning("Could not acquire pooled database connection: %s", exc)
        yield None
        return

    try:
        yield conn
    except psycopg2.Error as exc:
        discard = True
        if conn is not None and not conn.closed:
            conn.rollback()
        logger.warning("Database operation failed; discarding connection: %s", exc)
        raise
    finally:
        if conn is not None and _connection_pool is not None:
            _connection_pool.putconn(conn, close=discard)


def get_cached_telemetry(ip: str) -> dict[str, Any] | None:
    """Retrieve fresh cached telemetry, or None on miss / database failure."""
    try:
        with borrow_db_connection() as conn:
            if conn is None:
                return None

            with conn.cursor() as cur:
                cur.execute(
                    "SELECT telemetry, fetched_at FROM greynoise_cache WHERE ip = %s;",
                    (ip,),
                )
                result = cur.fetchone()

            if not result:
                return None

            telemetry, fetched_at = result
            age = _utc_now() - _as_utc(fetched_at)
            if age < datetime.timedelta(hours=CACHE_EXPIRATION_HOURS):
                return telemetry

    except psycopg2.Error as exc:
        logger.warning("Cache read failed for %s: %s", ip, exc)
    except Exception as exc:
        logger.warning("Unexpected cache read error for %s: %s", ip, exc)

    return None


def set_cached_telemetry(ip: str, telemetry_data: dict[str, Any]) -> None:
    """Upsert telemetry into cache. Failures are logged and ignored."""
    try:
        with borrow_db_connection() as conn:
            if conn is None:
                return

            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO greynoise_cache (ip, telemetry, fetched_at)
                    VALUES (%s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (ip)
                    DO UPDATE SET
                        telemetry = EXCLUDED.telemetry,
                        fetched_at = CURRENT_TIMESTAMP;
                    """,
                    (ip, Json(telemetry_data)),
                )
            conn.commit()

    except psycopg2.Error as exc:
        logger.warning("Cache write failed for %s: %s", ip, exc)
    except Exception as exc:
        logger.warning("Unexpected cache write error for %s: %s", ip, exc)


def init_db() -> None:
    """Create the cache table on worker startup when the database is reachable."""
    try:
        with borrow_db_connection() as conn:
            if conn is None:
                logger.warning(
                    "Skipping DB initialization: database unavailable at startup."
                )
                return

            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS greynoise_cache (
                        ip TEXT PRIMARY KEY,
                        telemetry JSONB NOT NULL,
                        fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_greynoise_cache_ip
                        ON greynoise_cache(ip);
                    """
                )
            conn.commit()
            logger.info("Database cache table verified/created.")
    except psycopg2.Error as exc:
        logger.warning("Database initialization failed: %s", exc)
    except Exception as exc:
        logger.warning("Unexpected database initialization error: %s", exc)


def bootstrap() -> None:
    """Run once per Gunicorn worker process (also used by Flask dev server)."""
    init_connection_pool()
    init_db()


@app.route("/")
def dashboard() -> Response:
    return send_from_directory(ROOT, "greynoise_dashboard.html")


@app.route("/api/greynoise/<ip>")
@limiter.limit("30 per minute")
def greynoise_proxy(ip: str) -> Response | tuple[Response, int]:
    sanitized_ip = ip.strip()
    if not IPV4_PATTERN.match(sanitized_ip):
        return jsonify({"message": "Invalid IPv4 address format."}), 400

    cached_data = get_cached_telemetry(sanitized_ip)
    if cached_data is not None:
        logger.info("Cache HIT for IP: %s", sanitized_ip)
        return jsonify(cached_data)

    logger.info("Cache MISS for IP: %s. Querying GreyNoise upstream.", sanitized_ip)

    api_key = get_api_key()
    if not api_key:
        return jsonify({"message": "GreyNoise API key is not configured on the server."}), 500

    upstream_url = f"{GREYNOISE_UPSTREAM}/{sanitized_ip}"
    try:
        upstream = requests.get(
            upstream_url,
            headers={"Accept": "application/json", "key": api_key},
            timeout=20,
        )
    except requests.RequestException as exc:
        logger.error("GreyNoise upstream request failed for %s: %s", sanitized_ip, exc)
        return jsonify({"message": f"GreyNoise upstream error: {exc}"}), 502

    if upstream.status_code == 200:
        try:
            telemetry_data = upstream.json()
            set_cached_telemetry(sanitized_ip, telemetry_data)
            return jsonify(telemetry_data)
        except ValueError as exc:
            logger.error("Invalid JSON from GreyNoise for %s: %s", sanitized_ip, exc)
            return jsonify({"message": "GreyNoise returned invalid JSON."}), 502

    return Response(
        upstream.content,
        status=upstream.status_code,
        content_type=upstream.headers.get("Content-Type", "application/json"),
    )


@app.route("/<path:filename>")
def static_assets(filename: str) -> Response:
    return send_from_directory(ROOT, filename)


def main() -> None:
    bootstrap()

    port = int(os.environ.get("PORT", 10000))
    key_status = "configured" if get_api_key() else "MISSING"

    logger.info("GreyNoise dashboard: http://127.0.0.1:%s/", port)
    logger.info("API proxy:           http://127.0.0.1:%s/api/greynoise/{ip}", port)
    logger.info("API key:             %s", key_status)

    app.run(host="0.0.0.0", port=port, debug=False)


atexit.register(close_connection_pool)
bootstrap()

if __name__ == "__main__":
    main()
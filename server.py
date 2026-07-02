#!/usr/bin/env python3
"""GreyNoise secure backend proxy — serves the dashboard and proxies Community API lookups."""

from __future__ import annotations

import os
import re
import datetime
from pathlib import Path

import requests
import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

ROOT = Path(__file__).resolve().parent
GREYNOISE_UPSTREAM = "https://api.greynoise.io/v3/community"
ALLOWED_ORIGINS = ["https://sycure.ai", "http://localhost:5000"]
IPV4_PATTERN = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")
CACHE_EXPIRATION_HOURS = 24

load_dotenv(ROOT / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL")

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")
CORS(app, origins=ALLOWED_ORIGINS, methods=["GET"], allow_headers=["Accept"])

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[],
    storage_uri="memory://",
)


def get_api_key() -> str:
    return os.environ.get("GREYNOISE_API_KEY", "").strip()


def get_db_connection():
    """Establishes a connection to the PostgreSQL database."""
    if not DATABASE_URL:
        return None
    try:
        return psycopg2.connect(DATABASE_URL, sslmode='require')
    except Exception as e:
        print(f"Database connection failed: {e}")
        return None


def get_cached_telemetry(ip: str):
    """Retrieves cached telemetry if it exists and is fresh."""
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT telemetry, fetched_at FROM greynoise_cache WHERE ip = %s;", (ip,))
            result = cur.fetchone()
            if result:
                telemetry, fetched_at = result
                age = datetime.datetime.now(datetime.timezone.utc) - fetched_at
                if age < datetime.timedelta(hours=CACHE_EXPIRATION_HOURS):
                    return telemetry
    except Exception as e:
        print(f"Cache read error: {e}")
    finally:
        conn.close()
    return None


def set_cached_telemetry(ip: str, telemetry_data: dict):
    """Upserts fresh telemetry data into the database cache."""
    conn = get_db_connection()
    if not conn:
        return
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO greynoise_cache (ip, telemetry, fetched_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (ip) 
                DO UPDATE SET telemetry = EXCLUDED.telemetry, fetched_at = CURRENT_TIMESTAMP;
            """, (ip, Json(telemetry_data)))
            conn.commit()
    except Exception as e:
        print(f"Cache write error: {e}")
    finally:
        conn.close()


@app.route("/")
def dashboard() -> Response:
    return send_from_directory(ROOT, "greynoise_dashboard.html")


@app.route("/api/greynoise/<ip>")
@limiter.limit("30 per minute")
def greynoise_proxy(ip: str):
    sanitized_ip = ip.strip()
    if not IPV4_PATTERN.match(sanitized_ip):
        return jsonify({"message": "Invalid IPv4 address format."}), 400

    # 1. Intercept request and query the database cache first
    cached_data = get_cached_telemetry(sanitized_ip)
    if cached_data:
        print(f"Cache HIT for IP: {sanitized_ip}")
        return jsonify(cached_data)

    print(f"Cache MISS for IP: {sanitized_ip}. Routing live request to GreyNoise...")

    # 2. Cache Miss: Request live data from upstream network API
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
        return jsonify({"message": f"GreyNoise upstream error: {exc}"}), 502

    # 3. If upstream query is valid (200 OK), commit payload to cache
    if upstream.status_code == 200:
        try:
            telemetry_data = upstream.json()
            set_cached_telemetry(sanitized_ip, telemetry_data)
            return jsonify(telemetry_data)
        except Exception as e:
            print(f"Failed to parse or commit response data to cache: {e}")

    return Response(
        upstream.content,
        status=upstream.status_code,
        content_type=upstream.headers.get("Content-Type", "application/json"),
    )


@app.route("/<path:filename>")
def static_assets(filename: str) -> Response:
    return send_from_directory(ROOT, filename)


def init_db():
    """Creates the cache table automatically on startup if it doesn't exist."""
    conn = get_db_connection()
    if not conn:
        print("Skipping DB initialization: No DATABASE_URL configured or connection failed.")
        return
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS greynoise_cache (
                    ip TEXT PRIMARY KEY,
                    telemetry JSONB NOT NULL,
                    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_greynoise_cache_ip ON greynoise_cache(ip);
            """)
            conn.commit()
            print("Database initialized successfully (cache table verified/created).")
    except Exception as e:
        print(f"Failed to initialize database table: {e}")
    finally:
        conn.close()


def main() -> None:
    # 1. Spin up the database table checks first
    init_db()
    
    # 2. Configure the production network environment
    port = int(os.environ.get("PORT", 10000))
    key_status = "configured" if get_api_key() else "MISSING"
    
    print(f"GreyNoise dashboard: http://127.0.0.1:{port}/")
    print(f"API proxy:           http://127.0.0.1:{port}/api/greynoise/{{ip}}")
    print(f"API key:             {key_status}")
    
    app.run(host="0.0.0.0", port=port, debug=False)


if __name__ == "__main__":
    main()
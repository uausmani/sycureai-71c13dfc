#!/usr/bin/env python3
"""GreyNoise secure backend proxy — serves the dashboard and proxies Community API lookups."""

from __future__ import annotations

import os
import re
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

ROOT = Path(__file__).resolve().parent
GREYNOISE_UPSTREAM = "https://api.greynoise.io/v3/community"
ALLOWED_ORIGINS = ["https://sycure.ai", "http://localhost:5000"]
IPV4_PATTERN = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")

load_dotenv(ROOT / ".env")

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


@app.route("/")
def dashboard() -> Response:
    return send_from_directory(ROOT, "greynoise_dashboard.html")


@app.route("/api/greynoise/<ip>")
@limiter.limit("30 per minute")
def greynoise_proxy(ip: str):
    sanitized_ip = ip.strip()
    if not IPV4_PATTERN.match(sanitized_ip):
        return jsonify({"message": "Invalid IPv4 address format."}), 400

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

    return Response(
        upstream.content,
        status=upstream.status_code,
        content_type=upstream.headers.get("Content-Type", "application/json"),
    )


@app.route("/<path:filename>")
def static_assets(filename: str) -> Response:
    return send_from_directory(ROOT, filename)


def main() -> None:
    port = int(os.environ.get("PORT", "5000"))
    key_status = "configured" if get_api_key() else "MISSING"
    print(f"GreyNoise dashboard: http://127.0.0.1:{port}/")
    print(f"API proxy:            http://127.0.0.1:{port}/api/greynoise/{{ip}}")
    print(f"API key:              {key_status}")
    app.run(host="0.0.0.0", port=port, debug=False)


if __name__ == "__main__":
    main()
"""Repeatable microbenchmarks. Uses disposable DBs, never real lead data."""

import asyncio
import json
import os
import sqlite3
import statistics
import tempfile
import time
from contextlib import closing

import main
from security import LIMITS, RateLimiter, SecurityGuard

ESTIMATE = {"building": "complex", "city": "tehran", "units": 24,
            "gas": 6000000, "electricity": 4000000}
LEAD = {"name": "Audit", "phone": "+98 912-345 6789", "city": "tehran",
        "building": "complex", "units": 24}


def measure(fn, count):
    samples = []
    for _ in range(count):
        start = time.perf_counter_ns()
        fn()
        samples.append((time.perf_counter_ns() - start) / 1000)
    ordered = sorted(samples)
    return {"iterations": count, "median_us": round(statistics.median(samples), 2),
            "p95_us": round(ordered[int(len(ordered) * .95)], 2)}


async def middleware_measurements(count=500):
    """Measure middleware alone, with a synthetic downstream ASGI app."""
    async def downstream(scope, receive, send):
        await receive()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})

    body = json.dumps(ESTIMATE).encode()
    scope = {"type": "http", "method": "POST", "path": "/api/estimate",
             "client": ("benchmark", 1), "headers": [(b"content-type", b"application/json")]}

    async def sample(app):
        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}
        async def send(message):
            if message["type"] == "http.response.start":
                assert message["status"] == 200
        await app(scope, receive, send)

    result = {}
    for label, app in (("synthetic_asgi_without_guard", downstream),
                       ("synthetic_asgi_with_guard", SecurityGuard(downstream))):
        samples = []
        for _ in range(count):
            start = time.perf_counter_ns()
            await sample(app)
            samples.append((time.perf_counter_ns() - start) / 1000)
        ordered = sorted(samples)
        result[label] = {"iterations": count, "median_us": round(statistics.median(samples), 2),
                         "p95_us": round(ordered[int(count * .95)], 2)}
    return result


def run():
    result = {}
    allowed = RateLimiter(lambda: 0)
    exhausted = RateLimiter(lambda: 0)
    for _ in range(LIMITS["/api/estimate"]):
        assert exhausted.allow("test", "/api/estimate")[0]
    def allowed_check():
        assert allowed.allow("test", "/api/estimate")[0]
    def rejected_check():
        assert not exhausted.allow("test", "/api/estimate")[0]
    result["rate_limit_allowed"] = measure(allowed_check, 1000)
    result["rate_limit_rejected"] = measure(rejected_check, 1000)
    result["estimate_validation"] = measure(lambda: main.EstimateIn.model_validate(ESTIMATE), 1000)
    result["lead_validation_and_phone_normalization"] = measure(lambda: main.LeadIn.model_validate(LEAD), 1000)
    result.update(asyncio.run(middleware_measurements()))
    with tempfile.TemporaryDirectory() as directory:
        original = main.DB
        main.DB = os.path.join(directory, "hardened.db")
        try:
            main.init_db()
            legacy_path = os.path.join(directory, "legacy.db")
            def legacy_write():
                # Faithful old per-request setup/transaction; explicitly close
                # for fair timing instead of depending on garbage collection.
                with closing(sqlite3.connect(legacy_path)) as con, con:
                    con.execute("CREATE TABLE IF NOT EXISTS leads(id INTEGER PRIMARY KEY,name TEXT,phone TEXT,city TEXT,building TEXT,units INTEGER,created TEXT)")
                    con.execute("INSERT INTO leads(name,phone,city,building,units,created) VALUES(?,?,?,?,?,?)",
                                ("Audit", "09123456789", "tehran", "complex", 24, "2026-10-11"))
            def hardened_write():
                with closing(sqlite3.connect(main.DB, timeout=2)) as con, con:
                    main.limit_storage(con)
                    con.execute("INSERT INTO leads(name,phone,city,building,units,created) VALUES(?,?,?,?,?,?)",
                                ("Audit", "09123456789", "tehran", "complex", 24, "2026-10-11"))
            legacy_write()
            hardened_write()
            result["legacy_sqlite_write"] = measure(legacy_write, 100)
            result["bounded_sqlite_write"] = measure(hardened_write, 100)
        finally:
            main.DB = original
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    run()

"""Local adversarial ASGI tests; never contact a deployed host or real database."""

import asyncio
import json
import os
import sqlite3
import tempfile
import unittest
from contextlib import closing
from unittest.mock import patch

import main
import security

ESTIMATE = {"building": "complex", "city": "tehran", "units": 10, "gas": 6000000, "electricity": 4000000}
LEAD = {"name": "Audit Test", "phone": "09123456789", "city": "tehran", "building": "complex", "units": 24}


async def request(app, path, payload=None, *, method="POST", headers=None, chunks=None, peer="127.0.0.1", receive=None):
    body = json.dumps(payload).encode() if payload is not None else b""
    events = [{"type": "http.request", "body": chunk, "more_body": i < len(chunks) - 1}
              for i, chunk in enumerate(chunks)] if chunks is not None else [{"type": "http.request", "body": body}]
    async def default_receive():
        return events.pop(0) if events else {"type": "http.disconnect"}
    messages = []
    async def send(message):
        messages.append(message)
    header_values = {"content-type": "application/json", **(headers or {})}
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
             "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"", "root_path": "",
             "server": ("test", 80), "client": (peer, 12345),
             "headers": [(k.lower().encode(), v.encode()) for k, v in header_values.items()]}
    # The restricted execution sandbox suppresses cross-thread socket wakeups.
    # A timer keeps the real ASGI/threadpool path progressing without mocking it.
    operation = asyncio.create_task(app(scope, receive or default_receive, send))
    deadline = asyncio.get_running_loop().time() + 10
    while not operation.done() and asyncio.get_running_loop().time() < deadline:
        await asyncio.sleep(0.001)
    if not operation.done():
        operation.cancel()
        await asyncio.gather(operation, return_exceptions=True)
        raise TimeoutError("Local ASGI operation exceeded test deadline")
    await operation
    if not messages:
        return None, {}, b""
    start = next(m for m in messages if m["type"] == "http.response.start")
    output = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return start["status"], dict(start["headers"]), output


class ApiSecurityTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_patch = patch.object(main, "DB", os.path.join(self.temp.name, "leads.db"))
        self.db_patch.start()
        main.init_db()
        main.app.middleware_stack = None

    def tearDown(self):
        self.db_patch.stop()
        self.temp.cleanup()

    def rows(self):
        with closing(sqlite3.connect(main.DB)) as con:
            return con.execute("SELECT name, phone, units FROM leads").fetchall()

    async def test_valid_estimate_and_no_store(self):
        status, headers, body = await request(main.app, "/api/estimate", ESTIMATE)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["net"], 1560000)
        self.assertEqual(headers[b"cache-control"], b"no-store")
        self.assertEqual(headers[b"x-content-type-options"], b"nosniff")

    async def test_strict_integer_bounds_and_unknown_fields(self):
        for extra in [{"units": True}, {"units": 1.1}, {"units": "1"}, {"units": 0}, {"units": 1001},
                      {"gas": -1}, {"electricity": 10000000001}, {"city": "unknown"}, {"admin": True}]:
            with self.subTest(extra=extra):
                self.assertEqual((await request(main.app, "/api/estimate", {**ESTIMATE, **extra}))[0], 422)

    async def test_zero_and_maximum_bills_are_finite(self):
        for amount in (0, 10000000000):
            status, _, body = await request(main.app, "/api/estimate", {**ESTIMATE, "gas": amount, "electricity": amount})
            self.assertEqual(status, 200)
            result = json.loads(body)
            self.assertEqual(result["baseline"], amount * 2)
            self.assertGreaterEqual(result["new_bill"], 0)

    async def test_declared_oversize_body(self):
        self.assertEqual((await request(main.app, "/api/leads", LEAD, headers={"content-length": "8193"}))[0], 413)
        self.assertFalse(self.rows())

    async def test_chunked_and_lying_length_body_bounds(self):
        for headers in ({}, {"content-length": "1"}):
            self.assertEqual((await request(main.app, "/api/leads", headers=headers, chunks=[b"x" * 4096, b"x" * 4097]))[0], 413)

    async def test_invalid_content_length(self):
        for length in ("-1", "bogus"):
            self.assertEqual((await request(main.app, "/api/leads", LEAD, headers={"content-length": length}))[0], 400)

    async def test_form_and_cross_site_posts_refused(self):
        for content_type in ("text/plain", "application/x-www-form-urlencoded", "multipart/form-data"):
            self.assertEqual((await request(main.app, "/api/leads", LEAD, headers={"content-type": content_type}))[0], 415)
        self.assertEqual((await request(main.app, "/api/leads", LEAD, headers={"sec-fetch-site": "cross-site"}))[0], 403)
        self.assertFalse(self.rows())

    async def test_malformed_and_deep_json(self):
        for body in (b"{", b"[" * 2000 + b"]" * 2000):
            status = (await request(main.app, "/api/leads", chunks=[body]))[0]
            self.assertIn(status, (400, 422))

    async def test_slow_body_total_deadline(self):
        async def never_ready():
            await asyncio.Event().wait()
        with patch.object(security, "BODY_TIMEOUT_SECONDS", 0.01):
            self.assertEqual((await request(main.app, "/api/leads", receive=never_ready))[0], 408)

    async def test_client_disconnect_does_not_write(self):
        async def disconnected():
            return {"type": "http.disconnect"}
        self.assertEqual((await request(main.app, "/api/leads", receive=disconnected))[0], None)
        self.assertFalse(self.rows())

    async def test_validation_errors_do_not_reflect_phone(self):
        secret = "private-contact-value"
        status, _, body = await request(main.app, "/api/leads", {**LEAD, "phone": secret})
        self.assertEqual(status, 422)
        self.assertNotIn(secret.encode(), body)
        self.assertNotIn(b'"input"', body)

    async def test_long_phone_and_invalid_names(self):
        for extra in ({"phone": "0" * 65}, {"name": "  "}, {"name": "a" * 61}, {"name": "A\nB"}, {"units": 1.5}):
            self.assertEqual((await request(main.app, "/api/leads", {**LEAD, **extra}))[0], 422)
        self.assertFalse(self.rows())

    async def test_localized_phone_normalization(self):
        for phone in ("۰۹۱۲۳۴۵۶۷۸۹", "٠٩١٢٣٤٥٦٧٨٩", "+98 912-345 6789"):
            self.assertEqual((await request(main.app, "/api/leads", {**LEAD, "phone": phone}))[0], 201)
        self.assertEqual([r[1] for r in self.rows()], ["09123456789"] * 3)

    async def test_sql_injection_is_literal_data(self):
        name = "Robert'); DROP TABLE leads;--"
        self.assertEqual((await request(main.app, "/api/leads", {**LEAD, "name": name}))[0], 201)
        self.assertEqual(self.rows()[0][0], name)
        self.assertEqual((await request(main.app, "/api/leads", LEAD))[0], 201)
        self.assertEqual(len(self.rows()), 2)

    async def test_script_payload_is_json_data_only(self):
        status, headers, body = await request(main.app, "/api/leads", {**LEAD, "name": "<script>alert(1)</script>"})
        self.assertEqual(status, 201)
        self.assertTrue(headers[b"content-type"].startswith(b"application/json"))
        self.assertNotIn(b"<script>", body)

    async def test_peer_limit_cannot_be_bypassed_by_forwarded_header(self):
        with patch.dict(security.LIMITS, {"/api/leads": 2}):
            for forwarded in ("1.1.1.1", "2.2.2.2"):
                self.assertEqual((await request(main.app, "/api/leads", LEAD, headers={"x-forwarded-for": forwarded}))[0], 201)
            status, headers, _ = await request(main.app, "/api/leads", LEAD, headers={"x-forwarded-for": "3.3.3.3"})
            self.assertEqual(status, 429)
            self.assertGreater(int(headers[b"retry-after"]), 0)
        self.assertEqual(len(self.rows()), 2)

    async def test_idempotent_retries_and_conflicting_payload(self):
        headers = {"idempotency-key": "audit-request-key-123456"}
        first = await request(main.app, "/api/leads", LEAD, headers=headers)
        second = await request(main.app, "/api/leads", LEAD, headers=headers)
        self.assertEqual(first[0], 201)
        self.assertEqual(second[0], 201)
        self.assertEqual(first[2], second[2])
        self.assertEqual(len(self.rows()), 1)
        self.assertEqual((await request(main.app, "/api/leads", {**LEAD, "units": 3}, headers=headers))[0], 409)
        self.assertEqual(len(self.rows()), 1)

    async def test_bad_idempotency_key(self):
        self.assertEqual((await request(main.app, "/api/leads", LEAD, headers={"idempotency-key": "bad"}))[0], 400)
        self.assertFalse(self.rows())

    async def test_storage_failure_is_generic_and_retryable(self):
        with patch.object(main, "DB", os.path.join(self.temp.name, "missing", "private.db")):
            status, headers, body = await request(main.app, "/api/leads", LEAD)
        self.assertEqual(status, 503)
        self.assertEqual(headers[b"retry-after"], b"5")
        self.assertNotIn(self.temp.name.encode(), body)

    async def test_private_db_permissions_and_connection_cleanup(self):
        self.assertEqual(os.stat(main.DB).st_mode & 0o777, 0o600)
        # Closed connections leave no lead DB descriptors, including WAL sidecars.
        for _ in range(10):
            self.assertEqual((await request(main.app, "/api/leads", LEAD))[0], 201)
        if os.path.isdir("/proc/self/fd"):
            for fd in os.listdir("/proc/self/fd"):
                try:
                    self.assertNotIn(main.DB, os.readlink("/proc/self/fd/" + fd))
                except FileNotFoundError:
                    pass

    async def test_database_size_cap(self):
        with patch.object(main, "MAX_DB_BYTES", 16 * 1024):
            with closing(sqlite3.connect(main.DB)) as con:
                main.limit_storage(con)
                with self.assertRaises(sqlite3.DatabaseError):
                    con.execute("INSERT INTO leads(name) VALUES (?)", ("x" * 20000,))

    async def test_dashboard_contains_demo_only_and_no_lead_reader(self):
        self.assertEqual((await request(main.app, "/api/dashboard", method="GET"))[0], 200)
        self.assertEqual((await request(main.app, "/api/leads", method="GET"))[0], 405)
        self.assertEqual((await request(main.app, "/api/leads/1", method="GET"))[0], 404)


class RateLimiterTests(unittest.TestCase):
    def test_window_reset_and_global_cap(self):
        now = [0.0]
        limiter = security.RateLimiter(lambda: now[0])
        with patch.dict(security.LIMITS, {"/api/leads": 2}):
            self.assertTrue(limiter.allow("one", "/api/leads")[0])
            self.assertTrue(limiter.allow("one", "/api/leads")[0])
            self.assertFalse(limiter.allow("one", "/api/leads")[0])
            for peer in ("two", "three", "four"):
                self.assertTrue(limiter.allow(peer, "/api/leads")[0])
                self.assertTrue(limiter.allow(peer, "/api/leads")[0])
            self.assertFalse(limiter.allow("rotated", "/api/leads")[0])
            now[0] = 600
            self.assertTrue(limiter.allow("one", "/api/leads")[0])

    def test_client_map_is_bounded(self):
        limiter = security.RateLimiter(lambda: 0)
        with patch.object(security, "MAX_CLIENTS", 3):
            for i in range(10):
                limiter.allow(str(i), "/api/estimate")
        self.assertEqual(len(limiter.clients), 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)

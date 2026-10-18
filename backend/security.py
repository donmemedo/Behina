"""Bounded, dependency-free guards applied before FastAPI parses request bodies."""

import asyncio
import json
import math
import time
from collections import OrderedDict

MAX_BODY_BYTES = 8192
BODY_TIMEOUT_SECONDS = 5
MAX_CLIENTS = 2048
WINDOW_SECONDS = 600
# The backend normally sees the Next proxy as its peer. These are intentionally
# service limits; deploy a per-client limiter at the trusted public ingress too.
LIMITS = {"/api/leads": 30, "/api/estimate": 1200}


class RateLimiter:
    """Fixed windows with bounded memory and a global cap against IP rotation."""

    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.clients = OrderedDict()
        self.global_counts = {}

    def allow(self, peer, path):
        now = self.clock()
        window = int(now // WINDOW_SECONDS)
        key = (peer, path)
        old_window, count = self.clients.get(key, (window, 0))
        count = count if old_window == window else 0
        global_window, total = self.global_counts.get(path, (window, 0))
        total = total if global_window == window else 0
        allowed = count < LIMITS[path] and total < LIMITS[path] * 4
        if allowed:
            self.clients[key] = (window, count + 1)
            self.clients.move_to_end(key)
            if len(self.clients) > MAX_CLIENTS:
                self.clients.popitem(last=False)
            self.global_counts[path] = (window, total + 1)
        return allowed, max(1, math.ceil((window + 1) * WINDOW_SECONDS - now))


class SecurityGuard:
    def __init__(self, app):
        self.app = app
        self.limiter = RateLimiter()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def guarded_send(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend([
                    (b"x-content-type-options", b"nosniff"),
                    (b"cache-control", b"no-store"),
                    (b"referrer-policy", b"strict-origin-when-cross-origin"),
                ])
                message = {**message, "headers": headers}
            await send(message)

        async def reject(status, detail, extra=()):
            body = json.dumps({"detail": detail}).encode()
            await guarded_send({"type": "http.response.start", "status": status,
                                "headers": [(b"content-type", b"application/json"),
                                            (b"content-length", str(len(body)).encode()), *extra]})
            await send({"type": "http.response.body", "body": body})

        path = scope["path"]
        if scope["method"] == "POST" and path in LIMITS:
            headers = {k.lower(): v for k, v in scope.get("headers", [])}
            if headers.get(b"sec-fetch-site") == b"cross-site":
                return await reject(403, "cross_site_request")
            content_type = headers.get(b"content-type", b"").split(b";", 1)[0].strip().lower()
            if content_type != b"application/json":
                return await reject(415, "json_required")
            # Forwarded headers are untrusted; the actual connection peer is used.
            peer = (scope.get("client") or ("unknown", 0))[0]
            allowed, retry = self.limiter.allow(peer, path)
            if not allowed:
                return await reject(429, "rate_limited", [(b"retry-after", str(retry).encode())])
            declared = headers.get(b"content-length")
            if declared is not None:
                try:
                    if int(declared) < 0:
                        raise ValueError
                    if int(declared) > MAX_BODY_BYTES:
                        return await reject(413, "body_too_large")
                except ValueError:
                    return await reject(400, "invalid_content_length")

            async def read_body():
                chunks, size = [], 0
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return None
                    chunk = message.get("body", b"")
                    size += len(chunk)
                    if size > MAX_BODY_BYTES:
                        return False
                    chunks.append(chunk)
                    if not message.get("more_body", False):
                        return b"".join(chunks)

            try:
                body = await asyncio.wait_for(read_body(), BODY_TIMEOUT_SECONDS)
            except TimeoutError:
                return await reject(408, "body_timeout")
            if body is None:
                return
            if body is False:
                return await reject(413, "body_too_large")

            async def replay():
                nonlocal body
                if body is not None:
                    message = {"type": "http.request", "body": body, "more_body": False}
                    body = None
                    return message
                return await receive()

            return await self.app(scope, replay, guarded_send)
        await self.app(scope, receive, guarded_send)

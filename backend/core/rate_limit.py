from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from backend.core.config import ENABLE_RATE_LIMIT


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def enforce(self, scope: str, key: str, *, limit: int, window_seconds: int) -> None:
        if not ENABLE_RATE_LIMIT or limit <= 0 or window_seconds <= 0:
            return

        now = time.time()
        bucket_key = (scope, key)
        with self._lock:
            bucket = self._hits[bucket_key]
            cutoff = now - window_seconds
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= limit:
                retry_after = max(1, int(bucket[0] + window_seconds - now))
                raise HTTPException(
                    status_code=429,
                    detail=f"请求过于频繁，请在 {retry_after} 秒后重试。",
                    headers={"Retry-After": str(retry_after)},
                )

            bucket.append(now)


rate_limiter = InMemoryRateLimiter()


def get_request_identity(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").strip()
    if forwarded:
        first_hop = forwarded.split(",")[0].strip()
        if first_hop:
            return first_hop

    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip

    if request.client and request.client.host:
        return request.client.host

    return "unknown"


def rate_limit(scope: str, *, limit: int, window_seconds: int):
    async def dependency(request: Request) -> None:
        rate_limiter.enforce(
            scope,
            get_request_identity(request),
            limit=limit,
            window_seconds=window_seconds,
        )

    return dependency

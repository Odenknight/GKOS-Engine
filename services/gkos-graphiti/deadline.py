"""Reject late success while retaining awaits until physical cleanup settles."""
import asyncio
from time import monotonic


async def await_before_deadline(operation, seconds):
    deadline = monotonic() + seconds
    result = await asyncio.wait_for(operation, seconds)
    # Providers may block the loop or suppress cancellation. This rejects late
    # success, but does not promise a hard process-termination deadline.
    if monotonic() >= deadline:
        raise TimeoutError("operation-deadline-exceeded")
    return result

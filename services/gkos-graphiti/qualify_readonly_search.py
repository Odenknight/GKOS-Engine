"""Opt-in real semantic query, synthetic ledger mapping, revocation and cleanup."""
import asyncio
from qualify_live import main

if __name__ == "__main__":
    asyncio.run(main(probe_readonly_search=True))

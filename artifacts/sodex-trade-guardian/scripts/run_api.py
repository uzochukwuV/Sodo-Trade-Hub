"""Run the standalone Guardian HTTP API.

    uvicorn sodex_guardian.api:app --host 0.0.0.0 --port 9100

or:

    python scripts/run_api.py
"""
from __future__ import annotations

import uvicorn


if __name__ == "__main__":
    uvicorn.run("sodex_guardian.api:app", host="0.0.0.0", port=9100, reload=False)

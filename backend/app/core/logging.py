"""One log format for the whole API (Render shows stdout in its log view)."""

import logging

FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def configure(level: str = "INFO") -> None:
    logging.basicConfig(level=level.upper(), format=FORMAT, force=True)
    # Request lines come from uvicorn's access log; keep library chatter down.
    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

"""The HTTP client every integration uses by default."""

import httpx

# Retries only failed connections (DNS, refused, connect timeout): the request
# never reached the server, so retrying is safe even for POSTs.
CONNECT_RETRIES = 2


def make_client(*, timeout: float, base_url: str = "") -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=base_url,
        timeout=timeout,
        transport=httpx.AsyncHTTPTransport(retries=CONNECT_RETRIES),
    )

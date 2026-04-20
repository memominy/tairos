from httpx import AsyncClient


async def test_health_returns_ok(client: AsyncClient) -> None:
    res = await client.get("/v1/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


async def test_ready_returns_ready(client: AsyncClient) -> None:
    res = await client.get("/v1/ready")
    assert res.status_code == 200
    assert res.json() == {"status": "ready"}

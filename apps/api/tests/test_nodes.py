from httpx import AsyncClient


async def test_create_and_list_nodes(client: AsyncClient) -> None:
    payload = {
        "operator": "TR",
        "name":     "Istanbul-1",
        "lat":      41.015,
        "lng":      28.979,
        "extra":    {"note": "seed"},
    }
    created = await client.post("/v1/nodes", json=payload)
    assert created.status_code == 201
    body = created.json()
    assert body["id"]
    assert body["operator"] == "TR"
    assert body["name"] == "Istanbul-1"
    assert body["extra"] == {"note": "seed"}

    listed = await client.get("/v1/nodes", params={"operator": "TR"})
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) == 1
    assert items[0]["id"] == body["id"]


async def test_list_requires_operator(client: AsyncClient) -> None:
    res = await client.get("/v1/nodes")
    # FastAPI converts a missing required query param into a 422.
    assert res.status_code == 422


async def test_patch_and_delete(client: AsyncClient) -> None:
    created = await client.post("/v1/nodes", json={
        "operator": "US",
        "name":     "Test-1",
        "lat":      0.0,
        "lng":      0.0,
    })
    assert created.status_code == 201
    node_id = created.json()["id"]

    patched = await client.patch(f"/v1/nodes/{node_id}", json={"name": "Test-1-renamed"})
    assert patched.status_code == 200
    assert patched.json()["name"] == "Test-1-renamed"
    # lat/lng untouched:
    assert patched.json()["lat"] == 0.0

    deleted = await client.delete(f"/v1/nodes/{node_id}")
    assert deleted.status_code == 204

    gone = await client.get(f"/v1/nodes/{node_id}")
    assert gone.status_code == 404


async def test_operator_scope_isolation(client: AsyncClient) -> None:
    # Two operators each get one node; listing by operator must return
    # only that operator's node.
    await client.post("/v1/nodes", json={"operator": "TR", "name": "TR-1", "lat": 0, "lng": 0})
    await client.post("/v1/nodes", json={"operator": "US", "name": "US-1", "lat": 0, "lng": 0})

    tr = await client.get("/v1/nodes", params={"operator": "TR"})
    us = await client.get("/v1/nodes", params={"operator": "US"})
    assert [n["name"] for n in tr.json()] == ["TR-1"]
    assert [n["name"] for n in us.json()] == ["US-1"]

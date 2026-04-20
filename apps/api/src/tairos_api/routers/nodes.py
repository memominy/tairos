"""Inventory nodes — CRUD endpoints.

Endpoints are intentionally operator-scoped: the frontend already
works in terms of "active operator = TR|US|..." and the backend
should refuse to return cross-operator nodes in a single payload
without an explicit query. That protects against a forgotten filter
on the client leaking RU inventory into a TR operator's view.

``GET  /v1/nodes?operator=TR``         → list (required filter)
``POST /v1/nodes``                     → create (body carries operator)
``GET  /v1/nodes/{id}``                → fetch one
``PATCH /v1/nodes/{id}``               → partial update
``DELETE /v1/nodes/{id}``              → hard delete (soft delete later)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from ..db import get_session
from ..models import Node, NodeCreate, NodeRead, NodeUpdate

router = APIRouter(prefix="/v1/nodes", tags=["nodes"])


def _generate_id() -> str:
    """Match the frontend's UUID format so IDs round-trip cleanly."""
    return str(uuid.uuid4())


@router.get("", response_model=list[NodeRead])
def list_nodes(
    operator: str = Query(..., min_length=2, max_length=4, description="Operator code (TR, US, ...)"),
    session: Session = Depends(get_session),
) -> list[Node]:
    stmt = select(Node).where(Node.operator == operator).order_by(Node.created_at.desc())
    return session.exec(stmt).all()


@router.post("", response_model=NodeRead, status_code=status.HTTP_201_CREATED)
def create_node(payload: NodeCreate, session: Session = Depends(get_session)) -> Node:
    node = Node(
        id=payload.id or _generate_id(),
        operator=payload.operator,
        name=payload.name,
        lat=payload.lat,
        lng=payload.lng,
        extra=payload.extra or {},
    )
    session.add(node)
    session.commit()
    session.refresh(node)
    return node


@router.get("/{node_id}", response_model=NodeRead)
def get_node(node_id: str, session: Session = Depends(get_session)) -> Node:
    node = session.get(Node, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.patch("/{node_id}", response_model=NodeRead)
def update_node(
    node_id: str,
    patch: NodeUpdate,
    session: Session = Depends(get_session),
) -> Node:
    node = session.get(Node, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    # Apply only the fields the caller actually sent. Pydantic v2's
    # ``model_dump(exclude_unset=True)`` respects the difference between
    # "field omitted" and "field=null" — critical for PATCH semantics.
    data = patch.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(node, key, value)

    session.add(node)
    session.commit()
    session.refresh(node)
    return node


@router.delete("/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_node(node_id: str, session: Session = Depends(get_session)) -> None:
    node = session.get(Node, node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    session.delete(node)
    session.commit()

"""Strict boundary validation for the versioned GKOS intelligence protocol."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from . import CONTRACT_VERSION

TASKS = {
    "diagnostic_explanation",
    "metadata_repair",
    "relationship",
    "classification_raise",
    "claim_extraction",
    "contradiction",
    "documentation_improvement",
}


@dataclass(frozen=True)
class ContractError(ValueError):
    message: str

    def __str__(self) -> str:
        return self.message


def validate_request(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError("request must be a JSON object")
    if value.get("contractVersion") != CONTRACT_VERSION:
        raise ContractError(f"contractVersion must be {CONTRACT_VERSION}")
    for field in ("requestId", "targetId"):
        if not isinstance(value.get(field), str) or not value[field].strip():
            raise ContractError(f"{field} must be a non-empty string")
    if value.get("task") not in TASKS:
        raise ContractError("task is not in the safe proposal vocabulary")
    if "noteText" in value and not isinstance(value["noteText"], str):
        raise ContractError("noteText must be a string")
    if len(value.get("noteText", "")) > 1_000_000:
        raise ContractError("noteText exceeds the 1 MB request limit")
    return value

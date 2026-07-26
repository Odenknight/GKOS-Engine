"""DSPy programs. DSPy is loaded only when the optional service runs."""

from __future__ import annotations

import json
import os
import uuid
from typing import Any

from . import CONTRACT_VERSION, PROGRAM_VERSION


def _dspy():
    try:
        import dspy
    except ImportError as exc:
        raise RuntimeError("DSPy is not installed; the deterministic GKOS engine remains available") from exc
    return dspy


def configure_model() -> Any:
    dspy = _dspy()
    model = os.environ.get("DSPY_MODEL")
    if not model:
        raise RuntimeError("DSPY_MODEL is not configured")
    lm = dspy.LM(model)
    dspy.configure(lm=lm)
    return lm


def _signature():
    dspy = _dspy()

    class GovernedProposal(dspy.Signature):
        """Return only non-authoritative GKOS suggestions grounded in the input.

        Never claim verification, approval, authorization, or truth. Never
        lower sensitivity. proposed_patch_json must be a JSON object and may
        contain only fields appropriate to the requested task.
        """

        task: str = dspy.InputField()
        target_id: str = dspy.InputField()
        note_text: str = dspy.InputField()
        diagnostic_json: str = dspy.InputField()
        effective_sensitivity: str = dspy.InputField()
        rationale: str = dspy.OutputField()
        proposed_patch_json: str = dspy.OutputField()
        evidence_refs_json: str = dspy.OutputField()
        confidence: float = dspy.OutputField()

    return GovernedProposal


class ProposalProgram:
    def __init__(self) -> None:
        dspy = _dspy()
        self._program = dspy.ChainOfThought(_signature())

    def __call__(self, request: dict[str, Any]) -> dict[str, Any]:
        result = self._program(
            task=request["task"],
            target_id=request["targetId"],
            note_text=request.get("noteText", ""),
            diagnostic_json=json.dumps(request.get("diagnostic")),
            effective_sensitivity=request.get("effectiveSensitivity", "secret"),
        )
        patch = json.loads(result.proposed_patch_json or "{}")
        refs = json.loads(result.evidence_refs_json or "[]")
        if not isinstance(patch, dict) or not isinstance(refs, list):
            raise ValueError("model returned invalid structured fields")
        return {
            "contractVersion": CONTRACT_VERSION,
            "proposalId": f"proposal:{uuid.uuid4()}",
            "proposalType": request["task"],
            "targetId": request["targetId"],
            "proposedPatch": patch,
            "rationale": str(result.rationale),
            "confidence": max(0.0, min(1.0, float(result.confidence))),
            "evidenceRefs": [str(ref) for ref in refs],
            "generator": {
                "system": "gkos-intelligence-dspy",
                "programVersion": PROGRAM_VERSION,
                "model": os.environ.get("DSPY_MODEL", "unconfigured"),
            },
        }


def run_request(request: dict[str, Any]) -> dict[str, Any]:
    configure_model()
    proposal = ProposalProgram()(request)
    return {
        "contractVersion": CONTRACT_VERSION,
        "requestId": request["requestId"],
        "proposals": [proposal],
    }

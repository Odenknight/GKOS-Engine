from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().with_name("known-invariant-catalog-validation.json")
CATALOG = Path(__file__).resolve().with_name("KNOWN-INVARIANTS-CATALOG.md")
INDEX = Path(__file__).resolve().with_name("known-invariant-source-index.json")
INVARIANT_PATTERN = re.compile(r"\binvariants?\b", re.IGNORECASE)
CATALOG_COUNT_PATTERN = re.compile(
    r"records all\s+(\d+) matching Markdown paths,\s+(\d+) unique byte sequences"
)
EXPECTED_EXCLUSIONS = ["integration/receipts/KNOWN-INVARIANTS-CATALOG.md"]


CHECKS = [
    ("2026-08-31/sources/GKOS-RUST-UPLIFT-R4-2026-08-27.md", 450, "eight-invariant documentation intent gate"),
    ("integration/standard-r18/docs/proposals/GKOS-DOCSTD-001_Documentation_Engineering_Alignment.md", 3, "Section 4 adopted by R19"),
    ("integration/standard-r18/docs/proposals/GKOS-DOCSTD-001_Documentation_Engineering_Alignment.md", 55, "Intent review"),
    ("integration/standard-r18/docs/proposals/GKOS-DOCSTD-001_Documentation_Engineering_Alignment.md", 68, "Authority derives from receipts/grants"),
    ("integration/standard-r18/docs/proposals/GKOS-DOCSTD-001_Documentation_Engineering_Alignment.md", 69, "Contradiction and history remain visible"),
    ("integration/standard-r18/docs/proposals/GKOS-DOCSTD-001_Documentation_Engineering_Alignment.md", 70, "Mandatory controls and conformance evidence"),
    ("integration/standard-r18/docs/proposals/GKOS-DOCSTD-001_Documentation_Engineering_Alignment.md", 71, "Agent specialization grants capability"),
    ("integration/standard-r18/docs/proposals/GKOS-DOCSTD-001_Documentation_Engineering_Alignment.md", 72, "Missing/invalid sensitivity fails closed"),
    ("integration/standard-r18/docs/proposals/GKOS-DOCSTD-001_Documentation_Engineering_Alignment.md", 73, "Implementation experience proposes but does not amend"),
    ("integration/standard-r18/docs/proposals/GKOS-DOCSTD-001_Documentation_Engineering_Alignment.md", 74, "Identity is independent of path/location"),
    ("integration/standard-r18/docs/proposals/GKOS-DOCSTD-001_Documentation_Engineering_Alignment.md", 75, "Every committed governed state change is durably receipted"),
    ("integration/standard-r18/decisions/R19_Documentation_Intent_Eighth_Invariant_Development_Decision_Record.md", 26, "Every committed governed state change is durably receipted"),
    ("integration/standard-r18/decisions/R19_Documentation_Intent_Eighth_Invariant_Development_Decision_Record.md", 28, "prospective owner adoption"),
    ("integration/standard-r18/decisions/R19_Documentation_Intent_Eighth_Invariant_Development_Decision_Record.md", 30, "seven-position DOCSTD proposal"),
    ("integration/standard-r18/decisions/R19_Documentation_Intent_Eighth_Invariant_Development_Decision_Record.md", 34, "adopts the eight-position intent-review table"),
    ("integration/standard-r18/decisions/R19_Documentation_Intent_Eighth_Invariant_Development_Decision_Record.md", 35, "unpublished development procedure"),
    ("integration/standard-r18/decisions/R19_Documentation_Intent_Eighth_Invariant_Development_Decision_Record.md", 74, "R18-131"),
    ("integration/standard-r18/CHANGELOG.md", 5, "R19 prospectively supplies and adopts"),
    ("integration/receipts/Q-INTENT-R19-ADOPTION.md", 14, "04a164792c0957f5ce8acc9ba6853597ec0660dd"),
    ("integration/receipts/Q-INTENT-R19-ADOPTION.md", 23, "previously undefined eighth"),
    ("integration/receipts/Q-INTENT-R19-ADOPTION.md", 39, "seven proposed positions"),
    ("integration/receipts/Q-INTENT-R19-ADOPTION.md", 40, "remain separate"),
    ("integration/receipts/Q-INTENT-R19-ADOPTION.md", 46, "requires a complete final"),
    ("integration/receipts/Q-INTENT-EIGHTH-INVARIANT-INDEPENDENT-REVIEW.md", 9, "04a164792c0957f5ce8acc9ba6853597ec0660dd"),
    ("integration/receipts/Q-INTENT-EIGHTH-INVARIANT-INDEPENDENT-REVIEW.md", 49, "exactly eight invariant rows"),
    ("integration/receipts/Q-INTENT-EIGHTH-INVARIANT-INDEPENDENT-REVIEW.md", 50, "byte-for-byte unchanged"),
    ("integration/receipts/Q-INTENT-EIGHTH-INVARIANT-INDEPENDENT-REVIEW.md", 52, "prospective owner adoption"),
    ("integration/receipts/Q-INTENT-EIGHTH-INVARIANT-INDEPENDENT-REVIEW.md", 170, "resolves the checklist-definition question"),
    ("integration/receipts/Q-INTENT-EIGHTH-INVARIANT-INDEPENDENT-REVIEW.md", 171, "has been executed or passed"),
    ("integration/receipts/Q-INTENT-EIGHTH-INVARIANT-INDEPENDENT-REVIEW.md", 185, "seven proposed positions plus one undefined position"),
    ("integration/receipts/Q-INTENT-EIGHTH-INVARIANT-INDEPENDENT-REVIEW.md", 186, "owner-supplied, adopted, unpublished"),
    ("integration/receipts/Q-INTENT-EIGHTH-INVARIANT-INDEPENDENT-REVIEW.md", 188, "publication/conformance status: unchanged"),
    ("integration/standard-r18/docs/reviews/2026-08-04_ENGINE_GRAPH_DRIFT_ASSESSMENT.md", 81, "ratified intent invariants"),
    ("integration/standard-r18/docs/reviews/2026-08-04_ENGINE_GRAPH_DRIFT_ASSESSMENT.md", 84, "implementation-evidence-not-amendment"),
    ("integration/receipts/Q-INTENT-RESOLUTION.md", 47, "unnamed/undefined eighth item"),
    ("integration/receipts/Q-INTENT-RESOLUTION.md", 51, "cannot select an eighth invariant"),
    ("integration/standard-r18/docs/directives/GKOS-DIRECTIVE-STD-079-r4.md", 8, "Controlling invariants"),
    ("integration/standard-r18/docs/directives/GKOS-DIRECTIVE-STD-079-r4.md", 10, "Capability is not authority"),
    ("integration/standard-r18/docs/directives/GKOS-DIRECTIVE-STD-079-r4.md", 19, "Implementation behavior proposes"),
    ("integration/standard-r18/standard/annexes/Layer_Interface_Contracts.md", 7, "Blocking invariant"),
    ("integration/standard-r18/standard/annexes/Layer_Interface_Contracts.md", 9, "Received revision"),
    ("integration/standard-r18/standard/annexes/Layer_Interface_Contracts.md", 15, "Exact context"),
    ("integration/standard-r18/standard/annexes/Layer_Interface_Contracts.md", 25, "Every normative block"),
    ("integration/standard-r18/standard/annexes/Layer_Interface_Contracts.md", 29, "Upper-layer results"),
    ("integration/standard-r18/requirements/REGISTRY.md", 14, "Original requirement text"),
    ("integration/standard-r18/requirements/REGISTRY.md", 16, "GKOS-CONFORMANCE-001"),
    ("integration/standard-r18/requirements/REGISTRY.md", 71, "GKOS-EFFECT-003"),
    ("integration/standard-r18/requirements/REGISTRY.md", 77, "GKOS-AUTHUSE-007"),
    ("integration/standard-r18/requirements/REGISTRY.md", 82, "GKOS-DISCLOSURE-001"),
    ("integration/standard-r18/requirements/REGISTRY.md", 105, "Cross-cutting standing invariant"),
    ("integration/standard-r18/standard/annexes/Diagnostic_Code_Registry.md", 26, "GKOS-GATE-L1-001"),
    ("integration/standard-r18/standard/annexes/Diagnostic_Code_Registry.md", 53, "GKOS-GATE-L7-007"),
    ("integration/standard-r18/docs/proposals/SRTP_DRAFT_TRACEABILITY.md", 3, "proposal handles only"),
    ("integration/standard-r18/docs/proposals/SRTP_DRAFT_TRACEABILITY.md", 15, "raise-only sensitivity invariant"),
    ("integration/standard-r18/docs/proposals/SRTP_DRAFT_TRACEABILITY.md", 16, "purpose-bound context invariant"),
    ("2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/contracts/governance/GKOS-Hindsight-Dream-Governance-Demonstrator.md", 5, "Ratified build specification"),
    ("2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/contracts/governance/GKOS-Hindsight-Dream-Governance-Demonstrator.md", 60, "Non-negotiable invariants"),
    ("2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/contracts/governance/GKOS-Hindsight-Dream-Governance-Demonstrator.md", 62, "Hindsight relevance is not evidence strength"),
    ("2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/contracts/governance/GKOS-Hindsight-Dream-Governance-Demonstrator.md", 71, "fails closed"),
    ("2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/contracts/hindsight/v1/HINDSIGHT-OPERATION-COMPATIBILITY.md", 3, "DRAFT_UNEVALUATED"),
    ("2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/contracts/hindsight/v1/HINDSIGHT-OPERATION-COMPATIBILITY.md", 70, "Semantic invariants"),
    ("2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/contracts/hindsight/v1/HINDSIGHT-OPERATION-COMPATIBILITY.md", 72, "zero, one, or many memories"),
    ("2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/contracts/hindsight/v1/HINDSIGHT-OPERATION-COMPATIBILITY.md", 109, "receipts remain canonical"),
    ("2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/fixtures/adversarial/r2-contracts/failure-matrix-v1.json", 66, '"invariants"'),
    ("2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/fixtures/adversarial/r2-contracts/failure-matrix-v1.json", 83, "INV-FAIL-CLOSED-UNKNOWN"),
    ("2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/fixtures/database/r2-postgres/database-invariants.json", 5, '"cases"'),
    ("2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/fixtures/database/r2-postgres/database-invariants.json", 293, "]"),
    ("integration/engine/test/service-reference-freshness.test.mjs", 78, "refuse stale"),
    ("integration/engine/test/service-reference-freshness.test.mjs", 103, "temporal continuation refuses"),
    ("integration/engine/test/service-reference-freshness.test.mjs", 149, "binds authorized"),
    ("integration/engine/test/service-reference-freshness.test.mjs", 158, "audit continuation binds"),
    ("integration/engine/test/service-reference-freshness.test.mjs", 196, "stable pages reassemble"),
    ("integration/engine/docs/CURRENT-RUNTIME-QUALIFICATION.md", 13, "npm test"),
    ("integration/engine/docs/CURRENT-RUNTIME-QUALIFICATION.md", 35, "cannot manufacture alternate-platform qualification"),
    ("integration/engine/contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/README.md", 132, "rejection ordinals"),
    ("integration/engine/contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/README.md", 140, "invariants are mandatory"),
    ("integration/engine/contracts/ingest/gkos-ingest-validation-1.0.0-draft.1/README.md", 148, "rejections by"),
    ("integration/engine/contracts/retrieval/gkos-retrieval-1.0.0-draft.2/README.md", 79, "parent is omitted"),
    ("integration/engine/contracts/retrieval/gkos-retrieval-1.0.0-draft.2/README.md", 87, "LINEAGE_VIEW_AUTHORIZED_ONLY"),
    ("integration/engine/contracts/retrieval/gkos-retrieval-1.0.0-draft.2/README.md", 95, "half-open interval"),
    ("integration/engine/evidence/2026-08-21-functional-uplift-phase-2.md", 73, "duplicate UID"),
    ("integration/engine/evidence/2026-08-21-functional-uplift-phase-2.md", 102, "canonical projection"),
    ("integration/engine/evidence/2026-08-21-functional-uplift-phase-2.md", 198, "canonical candidate ledger"),
    ("integration/engine/evidence/2026-08-21-functional-uplift-phase-2.md", 211, "evidence semantics"),
    ("integration/kosmos/kosmos-invariants.yml", 1, "Machine-readable assurance policy"),
    ("integration/kosmos/kosmos-invariants.yml", 10, "security"),
    ("integration/kosmos/kosmos-invariants.yml", 44, "mcp_latest_protocol"),
    ("integration/kosmos/kosmos-invariants.yml", 46, "build"),
    ("integration/kosmos/kosmos-invariants.yml", 51, "reproducible_executables"),
    ("integration/kosmos/kosmos-invariants.yml", 53, "release"),
    ("integration/kosmos/kosmos-invariants.yml", 67, '"*.key"'),
    ("integration/kosmos/kosmos-invariants.yml", 69, "standalone"),
    ("integration/kosmos/kosmos-invariants.yml", 73, "read_only_scanner"),
    ("integration/kosmos/kosmos-invariants.yml", 75, "renderer"),
    ("integration/kosmos/kosmos-invariants.yml", 80, "message_protocol_versioned"),
    ("integration/kosmos/kosmos-invariants.yml", 82, "gkx_migration"),
    ("integration/kosmos/kosmos-invariants.yml", 89, "network_dispatch_allowed"),
    ("integration/kosmos/kosmos-invariants.yml", 91, "gkx23_projection"),
    ("integration/kosmos/kosmos-invariants.yml", 103, "remote_schema_updates_enabled"),
    ("integration/kosmos/scripts/check-invariants.mjs", 55, "security invariants"),
    ("integration/kosmos/scripts/check-invariants.mjs", 89, "remote schema updates"),
    ("integration/kosmos/scripts/check-invariants.mjs", 91, "build invariants"),
    ("integration/kosmos/scripts/check-invariants.mjs", 96, "engines.node"),
    ("integration/kosmos/scripts/check-invariants.mjs", 98, "renderer invariants"),
    ("integration/kosmos/scripts/check-invariants.mjs", 104, "protocol must be versioned"),
    ("integration/kosmos/scripts/check-invariants.mjs", 106, "migration invariants"),
    ("integration/kosmos/scripts/check-invariants.mjs", 116, "no network dispatch"),
    ("integration/kosmos/scripts/check-invariants.mjs", 118, "standalone invariants"),
    ("integration/kosmos/scripts/check-invariants.mjs", 124, "missing"),
    ("integration/kosmos/scripts/check-invariants.mjs", 125, "}"),
    ("integration/kosmos/scripts/check-invariants.mjs", 127, "release forbidden files"),
    ("integration/kosmos/scripts/check-invariants.mjs", 135, "}"),
    ("integration/kosmos/docs/RENDERER-PROTOCOL.md", 110, "notifyAgentTraversal"),
    ("integration/kosmos/docs/RENDERER-PROTOCOL.md", 118, "shared location"),
    ("integration/kosmos/test/cosmology.test.mjs", 179, "t=0 position"),
    ("integration/kosmos/test/cosmology.test.mjs", 307, "gravScale multiplier"),
    ("integration/lite/docs/evidence/phase-1-retrieval-core.md", 102, "immutable Phase 0 fixtures"),
    ("integration/lite/docs/evidence/phase-1-retrieval-core.md", 109, "rewriting the source"),
    ("integration/lite/docs/evidence/phase-2-lineage-citations.md", 68, "Schema 3 persists"),
    ("integration/lite/docs/evidence/phase-2-lineage-citations.md", 80, "policy gates"),
    ("2026-08-31/product-audit/theMarshal-Core-Rust/specifications/MARSHAL-STATE-MACHINE-CANDIDATE.md", 3, "candidate only"),
    ("2026-08-31/product-audit/theMarshal-Core-Rust/specifications/MARSHAL-STATE-MACHINE-CANDIDATE.md", 99, "Concurrency invariants"),
    ("2026-08-31/product-audit/theMarshal-Core-Rust/specifications/MARSHAL-STATE-MACHINE-CANDIDATE.md", 105, "global mutex"),
    ("2026-08-31/product-audit/theMarshal-Core-Rust/specifications/EVD-002-LOGICAL-RECORD-CANDIDATE.md", 117, "PostgreSQL serialization and invariants"),
    ("2026-08-31/product-audit/theMarshal-Core-Rust/specifications/EVD-002-LOGICAL-RECORD-CANDIDATE.md", 123, "Normative fixtures"),
    ("2026-08-31/reports/RUST-MIGRATION-PARITY-MATRIX.md", 115, "Marshal exclusion and ownership invariants"),
    ("2026-08-31/reports/RUST-MIGRATION-PARITY-MATRIX.md", 119, "Full owns all target semantic crates"),
]


errors: list[str] = []
validated: list[dict[str, object]] = []
for relative, line_number, expected in CHECKS:
    path = ROOT / relative
    if not path.is_file():
        errors.append(f"missing file: {relative}")
        continue
    lines = path.read_text(encoding="utf-8").splitlines()
    if not 1 <= line_number <= len(lines):
        errors.append(f"line out of range: {relative}:{line_number}/{len(lines)}")
        continue
    actual = lines[line_number - 1]
    if expected not in actual:
        errors.append(f"text mismatch: {relative}:{line_number}: expected {expected!r}; actual {actual!r}")
        continue
    validated.append({"path": relative, "line": line_number, "expected": expected})

failure_matrix_path = ROOT / "2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/fixtures/adversarial/r2-contracts/failure-matrix-v1.json"
database_path = ROOT / "2026-08-31/standard-audit/gkos-hindsight-governance-snapshot/fixtures/database/r2-postgres/database-invariants.json"
failure_matrix = json.loads(failure_matrix_path.read_text(encoding="utf-8"))
database = json.loads(database_path.read_text(encoding="utf-8"))
catalog_text = CATALOG.read_text(encoding="utf-8")
index = json.loads(INDEX.read_text(encoding="utf-8"))


def normalized_path(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


derived_records: list[dict[str, object]] = []
derived_by_hash: dict[str, list[str]] = defaultdict(list)
for path in sorted(
    ROOT.rglob("*.md"),
    key=lambda item: (normalized_path(item).lower(), normalized_path(item)),
):
    relative = normalized_path(path)
    if relative in EXPECTED_EXCLUSIONS:
        continue
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        errors.append(f"non-UTF-8 Markdown source: {relative}: {exc}")
        continue
    matches = [
        {"line": number, "text": line}
        for number, line in enumerate(text.splitlines(), start=1)
        if INVARIANT_PATTERN.search(line)
    ]
    if not matches:
        continue
    digest = hashlib.sha256(raw).hexdigest()
    derived_by_hash[digest].append(relative)
    derived_records.append(
        {
            "path": relative,
            "sha256": digest,
            "byte_count": len(raw),
            "match_count": len(matches),
            "matches": matches,
        }
    )

derived_duplicate_groups = [
    {"sha256": digest, "paths": paths}
    for digest, paths in sorted(derived_by_hash.items())
    if len(paths) > 1
]
derived_path_count = len(derived_records)
derived_unique_count = len(derived_by_hash)

if len(failure_matrix["invariants"]) != 17:
    errors.append("failure matrix no longer contains exactly 17 invariants")
for invariant in failure_matrix["invariants"]:
    if invariant["id"] not in catalog_text or invariant["statement"] not in catalog_text:
        errors.append(f"catalog missing failure-matrix invariant: {invariant['id']}")

if len(database["cases"]) != 41:
    errors.append("database invariant fixture no longer contains exactly 41 cases")
for case in database["cases"]:
    if f"`{case['id']}`" not in catalog_text:
        errors.append(f"catalog missing database invariant case: {case['id']}")

if index.get("schema") != "gkos-known-invariant-source-index/1":
    errors.append(f"unexpected source-index schema: {index.get('schema')!r}")
if index.get("scope_root") != ".":
    errors.append(f"unexpected source-index scope root: {index.get('scope_root')!r}")
if index.get("excluded_derived_markdown") != EXPECTED_EXCLUSIONS:
    errors.append("source-index exclusion is missing or changed")
if index.get("markdown_path_count") != derived_path_count:
    errors.append(
        "source-index Markdown path count does not match the current source tree: "
        f"{index.get('markdown_path_count')}/{derived_path_count}"
    )
if index.get("unique_content_count") != derived_unique_count:
    errors.append(
        "source-index unique-content count does not match the current source tree: "
        f"{index.get('unique_content_count')}/{derived_unique_count}"
    )
if index.get("records") != derived_records:
    errors.append("source-index records do not exactly match the current source tree")
if index.get("duplicate_content_groups") != derived_duplicate_groups:
    errors.append("source-index duplicate-content groups do not match the current source tree")

catalog_count_match = CATALOG_COUNT_PATTERN.search(catalog_text)
catalog_declared_path_count: int | None = None
catalog_declared_unique_count: int | None = None
if catalog_count_match is None:
    errors.append("catalog does not declare source-index path and unique-content counts")
else:
    catalog_declared_path_count = int(catalog_count_match.group(1))
    catalog_declared_unique_count = int(catalog_count_match.group(2))
    if catalog_declared_path_count != derived_path_count:
        errors.append(
            "catalog-declared Markdown path count does not match the current source tree: "
            f"{catalog_declared_path_count}/{derived_path_count}"
        )
    if catalog_declared_unique_count != derived_unique_count:
        errors.append(
            "catalog-declared unique-content count does not match the current source tree: "
            f"{catalog_declared_unique_count}/{derived_unique_count}"
        )

payload = {
    "schema": "gkos-known-invariant-catalog-validation/1",
    "status": "PASS" if not errors else "FAIL",
    "catalog_sha256": hashlib.sha256(CATALOG.read_bytes()).hexdigest(),
    "source_index_sha256": hashlib.sha256(INDEX.read_bytes()).hexdigest(),
    "validated_citation_points": len(validated),
    "failure_matrix_invariant_count": len(failure_matrix["invariants"]),
    "database_invariant_case_count": len(database["cases"]),
    "source_index_markdown_path_count": index.get("markdown_path_count"),
    "source_index_unique_content_count": index.get("unique_content_count"),
    "source_derived_markdown_path_count": derived_path_count,
    "source_derived_unique_content_count": derived_unique_count,
    "catalog_declared_markdown_path_count": catalog_declared_path_count,
    "catalog_declared_unique_content_count": catalog_declared_unique_count,
    "errors": errors,
}
OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps(payload))
raise SystemExit(0 if not errors else 1)

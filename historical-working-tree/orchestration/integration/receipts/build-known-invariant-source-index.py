from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().with_name("known-invariant-source-index.json")
PATTERN = re.compile(r"\binvariants?\b", re.IGNORECASE)
EXCLUDED_DERIVED_MARKDOWN = {
    Path("integration/receipts/KNOWN-INVARIANTS-CATALOG.md"),
}


def normalized_path(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


records: list[dict[str, object]] = []
by_hash: dict[str, list[str]] = defaultdict(list)

for path in sorted(
    ROOT.rglob("*.md"),
    key=lambda item: (normalized_path(item).lower(), normalized_path(item)),
):
    relative_path = path.relative_to(ROOT)
    if relative_path in EXCLUDED_DERIVED_MARKDOWN:
        continue
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    matches = [
        {"line": number, "text": line}
        for number, line in enumerate(text.splitlines(), start=1)
        if PATTERN.search(line)
    ]
    if not matches:
        continue
    digest = hashlib.sha256(raw).hexdigest()
    relative = normalized_path(path)
    by_hash[digest].append(relative)
    records.append(
        {
            "path": relative,
            "sha256": digest,
            "byte_count": len(raw),
            "match_count": len(matches),
            "matches": matches,
        }
    )

payload = {
    "schema": "gkos-known-invariant-source-index/1",
    "scope_root": normalized_path(ROOT),
    "selection": "Every UTF-8 Markdown file under orchestration containing the whole word invariant or invariants, case-insensitive, excluding the generated integration/receipts/KNOWN-INVARIANTS-CATALOG.md to avoid circular self-indexing.",
    "excluded_derived_markdown": [path.as_posix() for path in sorted(EXCLUDED_DERIVED_MARKDOWN)],
    "markdown_path_count": len(records),
    "unique_content_count": len(by_hash),
    "records": records,
    "duplicate_content_groups": [
        {"sha256": digest, "paths": paths}
        for digest, paths in sorted(by_hash.items())
        if len(paths) > 1
    ],
}

OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
print(json.dumps({"output": str(OUT), "markdown_path_count": len(records), "unique_content_count": len(by_hash)}))

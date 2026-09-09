"""Verify that every Markdown file captured at intake still has its original bytes."""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "upgrades" / "reports"
inventory = json.loads((REPORTS / "markdown-intake.json").read_text(encoding="utf-8"))
changed = []

for record in inventory["files"]:
    path = ROOT / record["path"]
    digest = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
    if digest != record["sha256"]:
        changed.append({"path": record["path"], "expected": record["sha256"], "actual": digest})

result = {"checked": len(inventory["files"]), "changed": changed}
(REPORTS / "original-markdown-preservation.json").write_text(
    json.dumps(result, indent=2) + "\n", encoding="utf-8"
)
print(json.dumps({"result": "PASS" if not changed else "FAIL", **result}))
sys.exit(1 if changed else 0)

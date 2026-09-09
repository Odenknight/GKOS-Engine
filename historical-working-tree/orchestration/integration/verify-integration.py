"""Verify local integration branches against the sealed deliverable manifest."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
UPGRADES = ROOT.parent / "upgrades"
RECEIPTS = ROOT / "receipts"
manifest = json.loads((UPGRADES / "deliverables" / "MANIFEST.json").read_text(encoding="utf-8"))

specs = {
    "engine": ("codex/integrate-engine-stability-20260831", "8207958047b3361ae21ac07c5a2abbd26a42a684"),
    "standard-r18": ("codex/integrate-standard-r18-20260831", "aa9a05315a9a767bd672aa2bb5179c963d9d66ca"),
    "kosmos": ("codex/integrate-kosmos-identity-20260831", "6486035dfc2e42173b1158b8007c9bab35aa7dc9"),
    "lite": ("codex/integrate-lite-quick-connect-20260831", "4027bfc4499ad0a2f3e753401f1320468e283823"),
    "observatory": ("codex/integrate-observatory-identity-20260831", "2a7b66fc6a33076fdcf29574cf2e31082c1b6e2a"),
}
observatory_reconstruction = {
    "deploy/live/build-engine.sh": "04246380190aa5defea7aa5988db8bd7f46833af",
    "deploy/live/patches/SHA256SUMS": "ca383bdb5417ffc7177fe498a2083feef5384ef2",
    "deploy/live/patches/engine-content.patch": "9d4a394264d15ca219b4a8a2a59381d1fb3073b8",
    "deploy/live/patches/engine-param-errors-pr37.patch": "8e858fd943e7f570871efd5f3c7732e6a562aff4",
    "docs/INVALID-PARAMS-BUILD.md": "3889e0b350e8e390b0cd70d7b513889567c21511",
}

def run(repo, *args, check=True):
    return subprocess.run(["git", "-C", str(repo), *args], check=check, capture_output=True)

def text(repo, *args):
    return run(repo, *args).stdout.decode().strip()

errors = []
records = {}
for name, (branch, base) in specs.items():
    repo = ROOT / name
    entry = manifest["repositories"][name]
    head = text(repo, "rev-parse", "HEAD")
    tree = text(repo, "rev-parse", "HEAD^{tree}")
    actual_branch = text(repo, "branch", "--show-current")
    status = text(repo, "status", "--porcelain=v1", "--untracked-files=all")
    parent = text(repo, "rev-parse", "HEAD^")
    patch_base = parent if name == "observatory" else base
    patch = run(repo, "-c", "core.autocrlf=true", "diff", "--binary", f"{patch_base}..{head}", "--").stdout
    patch_sha = hashlib.sha256(patch).hexdigest()
    remote = run(repo, "ls-remote", "--heads", "origin", branch).stdout.decode().strip()
    diffcheck = run(repo, "-c", "core.autocrlf=true", "diff", "--check", f"{patch_base}..{head}", check=False)

    if actual_branch != branch: errors.append(f"{name}: branch mismatch")
    if status: errors.append(f"{name}: dirty status")
    if patch_sha != entry["patch_sha256"]: errors.append(f"{name}: patch/commit mismatch")
    if remote: errors.append(f"{name}: branch exists at origin")
    if diffcheck.returncode: errors.append(f"{name}: diff check failed")
    if name != "observatory" and parent != base: errors.append(f"{name}: commit is not directly above base")

    blob_errors = []
    for item in entry["paths"]:
        blob = run(repo, "show", f"{head}:{item['path']}", check=False)
        if blob.returncode or hashlib.sha256(blob.stdout).hexdigest() != item["git_blob_sha256"] or len(blob.stdout) != item["git_blob_bytes"]:
            blob_errors.append(item["path"])
    if blob_errors: errors.append(f"{name}: staged blob mismatch: {', '.join(blob_errors)}")

    record = {
        "branch": branch,
        "base": base,
        "head": head,
        "tree": tree,
        "parent": parent,
        "patch_sha256": patch_sha,
        "status_clean": not status,
        "remote_branch_present": bool(remote),
        "diff_check": "PASS" if not diffcheck.returncode else "FAIL",
        "manifested_blobs": "PASS" if not blob_errors else "FAIL",
    }
    if name == "observatory":
        reconstruction = parent
        reconstruction_parent = text(repo, "rev-parse", f"{reconstruction}^")
        reconstructed = {path: text(repo, "rev-parse", f"{reconstruction}:{path}") for path in observatory_reconstruction}
        source_object = run(repo, "cat-file", "-e", "8da1d2239a9ce0af5570fe1bfa264934d8aabbe4^{commit}", check=False)
        if reconstruction_parent != base: errors.append("observatory: reconstruction is not directly above local Git base")
        if reconstructed != observatory_reconstruction: errors.append("observatory: reconstruction blob mismatch")
        record.update({
            "source_coordinate": "8da1d2239a9ce0af5570fe1bfa264934d8aabbe4",
            "source_object_available_locally": source_object.returncode == 0,
            "reconstruction_commit": reconstruction,
            "reconstruction_parent": reconstruction_parent,
            "reconstruction_blobs": reconstructed,
        })
    records[name] = record

result = {"version": "gkos-local-integration-verification/1", "result": "PASS" if not errors else "FAIL", "repositories": records, "errors": errors}
RECEIPTS.mkdir(exist_ok=True)
(RECEIPTS / "integration-branch-verification.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"result": result["result"], "repositories": len(records), "errors": errors}))
sys.exit(1 if errors else 0)

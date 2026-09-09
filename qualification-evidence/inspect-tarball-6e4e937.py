import base64, hashlib, json, pathlib, re, tarfile

root = pathlib.Path(__file__).parent / 'artifact-6e4e937'
archive = root / 'gkos-engine-2.2.0.tgz'
report = json.loads((root / 'pack.json').read_text(encoding='utf-8-sig'))['gkos-engine']
expected = {r['path']: r for r in report['files']}
findings, inventory = [], []
patterns = {
    'PRIVATE_KEY_HEADER': rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
    'NPM_TOKEN_SHAPE': rb'\bnpm_[A-Za-z0-9]{36,}\b',
    'GITHUB_TOKEN_SHAPE': rb'\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b',
    'AWS_ACCESS_KEY_SHAPE': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'LOCAL_USER_PATH': rb'(?:C:[/\\]+Users[/\\]+FAC|[HOST_PATH]',
}
with tarfile.open(archive, 'r:gz') as tf:
    for member in tf:
        name = member.name.removeprefix('package/')
        if not member.isfile() or not member.name.startswith('package/') or name not in expected or '..' in pathlib.PurePosixPath(name).parts:
            findings.append({'path': name, 'code': 'UNEXPECTED_ARCHIVE_ENTRY'})
            continue
        data = tf.extractfile(member).read()
        assert len(data) == expected[name]['size'] == member.size
        assert member.mode == expected[name]['mode']
        inventory.append({'path': name, 'size': len(data), 'mode': member.mode, 'sha256': hashlib.sha256(data).hexdigest()})
        for code, expression in patterns.items():
            if re.search(expression, data):
                findings.append({'path': name, 'code': code})
        if re.search(r'(^|/)(\.git|\.gkx|\.env(\..*)?|\.npmrc|node_modules|__pycache__|\.cache|private)(/|$)|\.(pem|key|sqlite3?|db|log|pyc)$', name, re.I):
            findings.append({'path': name, 'code': 'UNEXPECTED_PRIVATE_OR_TRANSIENT_PATH'})
assert len(inventory) == len(expected) == len({r['path'] for r in inventory})
data = archive.read_bytes()
receipt = {'schema': 'gkos-package-inspection/1', 'sourceCommit': '6e4e937f5bf6b3b49809072e49beafee71c3fcd8', 'status': 'REVIEW_REQUIRED' if findings else 'PASS', 'fileCount': len(inventory), 'unpackedBytes': sum(r['size'] for r in inventory), 'sha256': hashlib.sha256(data).hexdigest(), 'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode(), 'findings': findings, 'limitations': ['Pattern scanning is not proof that arbitrary secrets are absent; package inventory and intended public fixture review remain required.']}
(root / 'content-inventory.json').write_text(json.dumps(sorted(inventory, key=lambda r:r['path']), indent=2)+'\n')
(root / 'inspection.json').write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps(receipt))

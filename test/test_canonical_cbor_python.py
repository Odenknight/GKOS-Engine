"""Separate Python CBOR checks; no Engine/JS codec or evaluator imports."""
import hashlib
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'verify-canonical-cbor.py'
SCRATCH = pathlib.Path(tempfile.gettempdir())
VECTORS = json.loads((ROOT / 'test' / 'canonical-cbor-vectors.json').read_text(encoding='utf-8'))


def verifier_module():
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location('independent_cbor_verifier', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class VerifierTests(unittest.TestCase):
    def fixture(self, node, raw='f6'):
        return {'rendering_format': 'gkos.cbor.typed-json.v1', 'algorithm': 'sha-256',
                'canonical_profile': 'GKX-CBOR-1', 'digest': hashlib.sha256(bytes.fromhex(raw)).hexdigest(),
                'node': node}

    def render_refusal(self, content, gate):
        status, result = self.rendering(content if type(content) is str or type(content) is bytes else json.dumps(content))
        self.assertEqual(status, 1, result)
        self.assertIs(result['verified'], False)
        self.assertEqual(result['code'], f'GKOS-GATE-L6-{gate:03d}')
        self.assertEqual(result['requirement_id'], f'GKOS-CANON-{gate:03d}')

    def rendering(self, content):
        with tempfile.TemporaryDirectory(dir=SCRATCH, prefix='python-cbor-test-') as directory:
            path = pathlib.Path(directory) / 'render.json'
            path.write_bytes(content.encode('utf-8') if type(content) is str else content)
            return self.cli('--render', str(path))

    def cli(self, *args):
        proc = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(proc.stderr, '', proc.stderr)
        try:
            result = json.loads(proc.stdout)
        except ValueError:
            self.fail('CLI did not emit JSON: ' + proc.stdout)
        return proc.returncode, result

    def accept(self, hex_value, node=None):
        status, result = self.cli('--hex', hex_value)
        self.assertEqual(status, 0, result)
        self.assertEqual(result['rendering_format'], 'gkos.cbor.typed-json.v1')
        self.assertEqual(result['algorithm'], 'sha-256')
        self.assertEqual(result['canonical_profile'], 'GKX-CBOR-1')
        self.assertEqual(result['digest'], hashlib.sha256(bytes.fromhex(hex_value)).hexdigest())
        if node is not None:
            self.assertEqual(result['node'], node)
        return result

    def refuse(self, hex_value, gate=1):
        status, result = self.cli('--hex', hex_value)
        self.assertEqual(status, 1, result)
        self.assertEqual(set(result), {'verified', 'code', 'requirement_id', 'reason'})
        self.assertIs(result['verified'], False)
        self.assertEqual(result['code'], f'GKOS-GATE-L6-{gate:03d}')
        self.assertEqual(result['requirement_id'], f'GKOS-CANON-{gate:03d}')
        self.assertTrue(result['reason'])

    def test_null_cli_and_sha256(self):
        self.accept('f6', {'kind': 'null'})

    def test_scalar_render_roundtrip(self):
        for vector in VECTORS['positive']:
            if vector['node']['kind'] not in ('array', 'map'):
                with self.subTest(label=vector['label']):
                    rendering = self.accept(vector['hex'], vector['node'])
                    status, result = self.rendering(json.dumps(rendering))
                    self.assertEqual(status, 0, result)
                    self.assertEqual(result['canonical_hex'], vector['hex'])
                    self.assertEqual(result['node'], vector['node'])
                    self.assertEqual(result['digest'], rendering['digest'])
                    again_status, again = self.rendering(json.dumps(result))
                    self.assertEqual(again_status, 0, again)
                    self.assertEqual(again, result)

    def test_scalar_render_requires_exact_fields_types_and_hash(self):
        valid = self.fixture({'kind': 'null'})
        for field, replacement in [('rendering_format', 'bogus'), ('algorithm', 'SHA-256'),
                                   ('canonical_profile', 'wrong'), ('digest', True),
                                   ('digest', 'F' * 64), ('digest', '0' * 63), ('node', None)]:
            self.render_refusal({**valid, field: replacement}, 8)
        for field in valid:
            changed = dict(valid)
            del changed[field]
            self.render_refusal(changed, 8)
        self.render_refusal({**valid, 'extra': False}, 8)
        self.render_refusal({**valid, 'digest': '0' * 64}, 7)
        self.render_refusal({**valid, 'canonical_hex': '00'}, 8)
        self.render_refusal({**valid, 'canonical_hex': 'F6'}, 8)
        malformed_nodes = [({'kind': 'null', 'value': None}, 8),
                           ({'kind': 'boolean', 'value': 1}, 8),
                           ({'kind': 'integer', 'value': 1}, 3),
                           ({'kind': 'integer', 'value': True}, 3),
                           ({'kind': 'float', 'value': True}, 3),
                           ({'kind': 'float', 'value': '1.0'}, 3),
                           ({'kind': 'float', 'value': 9007199254740993}, 3),
                           ({'kind': 'float', 'value': -0.0}, 3),
                           ({'kind': 'text', 'value': 1}, 5),
                           ({'kind': 'text', 'value': '\ud800'}, 5),
                           ({'kind': 'text', 'value': 'e\u0301'}, 5),
                           ({'kind': 'bytes', 'value': 'AA'}, 8),
                           ({'kind': 'bytes', 'value': 'a'}, 8),
                           ({'kind': 'bytes', 'value': '00 00'}, 8),
                           ({'kind': 'bytes', 'value': []}, 8),
                           ({'kind': 'tag', 'value': 0}, 8),
                           ({'kind': 'null', 'kind2': 'null'}, 8), ({}, 8)]
        for text in ('-0', '+1', '01', ' 1', '1 ', '1.0', '1e0', '١',
                     '18446744073709551616', '-18446744073709551617'):
            malformed_nodes.append(({'kind': 'integer', 'value': text}, 3))
        for node, gate in malformed_nodes:
            with self.subTest(node=node):
                self.render_refusal({**valid, 'node': node}, gate)
        for raw in ('{}', '[]', 'null', '{', '\ufeff{}', '{}{}'):
            self.render_refusal(raw, 1 if raw in ('{', '\ufeff{}', '{}{}') else 8)
        raw = json.dumps(valid)
        self.render_refusal(raw.replace('"algorithm":', '"algorithm":"sha-256","algorithm":'), 8)
        self.render_refusal(raw.replace('"kind": "null"', '"kind":"null","kind":"null"'), 8)
        for numeric in ('NaN', 'Infinity', '-Infinity', '1e999', '1e-999'):
            content = json.dumps({**valid, 'node': {'kind': 'float', 'value': 'PLACEHOLDER'}})
            self.render_refusal(content.replace('"PLACEHOLDER"', numeric), 3)
        status, result = self.cli('--render', str(SCRATCH / 'nonexistent-cbor-render-file.json'))
        self.assertEqual(status, 1)
        self.assertEqual(result['code'], 'GKOS-GATE-L6-001')

    def test_scalar_heads_and_malformed_input(self):
        for v in VECTORS['positive']:
            if v['node']['kind'] in ('integer', 'boolean', 'bytes'):
                with self.subTest(v=v['label']):
                    self.accept(v['hex'], v['node'])
        for raw in ('', 'zz', '0', 'f600', '1800', '190018', '1a00000018',
                    '1b0000000000000018', '1c', '1d', '1e', '1f', '40ff',
                    '5f', '43aa', 'f7', 'f8ff', 'ff', 'c000'):
            with self.subTest(raw=raw):
                self.refuse(raw)
        status, result = self.cli()
        self.assertEqual(status, 1)
        self.assertIs(result['verified'], False)

    def test_float_width_type_and_prohibited_values(self):
        for v in VECTORS['positive']:
            if v['node']['kind'] == 'float':
                self.accept(v['hex'], v['node'])
        for raw, value in [('f90000', 0.0), ('f90001', 2 ** -24),
                           ('f903ff', 1023 * 2 ** -24), ('f90400', 2 ** -14),
                           ('f97bff', 65504.0), ('fa00000001', 2 ** -149),
                           ('fa00800000', 2 ** -126),
                           ('fb0000000000000001', 5e-324),
                           ('fb7fefffffffffffff', sys.float_info.max)]:
            with self.subTest(raw=raw):
                result = self.accept(raw, {'kind': 'float', 'value': value})
                self.assertIs(type(result['node']['value']), float)
        for raw in ('f98000', 'fa80000000', 'fb8000000000000000',
                    'f97e00', 'f97c00', 'f9fc00', 'fa7fc00000',
                    'fb7ff8000000000000', 'fa3f800000', 'fb3ff0000000000000',
                    'fb40f86a0000000000', 'fa33800000'):
            with self.subTest(raw=raw):
                self.refuse(raw, 3)
        for raw in ('f9', 'f900', 'fa0000', 'fb000000'):
            self.refuse(raw)

    def test_unicode17_text_and_missing_provider(self):
        for v in VECTORS['positive']:
            if v['node']['kind'] == 'text':
                self.accept(v['hex'], v['node'])
        self.accept('64f09f9880', {'kind': 'text', 'value': '\U0001f600'})
        for raw in ('61ff', '62c080', '63eda080', '64f4908080', '61c2',
                    '6365cc81', '66e18480e185a1'):
            self.refuse(raw, 5)
        proc = subprocess.run([sys.executable, '-S', str(SCRIPT), '--hex', '60'],
                              capture_output=True, text=True)
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(proc.stderr, '')
        result = json.loads(proc.stdout)
        self.assertEqual(result['code'], 'GKOS-GATE-L6-005')
        self.assertEqual(result['reason'], 'unicode_profile_unavailable')

    def test_decode_resource_boundaries(self):
        module = verifier_module()
        self.assertEqual(module.decode_canonical(b'\x81' * 64 + b'\xf6')['kind'], 'array')
        for raw in (b'\x81' * 65 + b'\xf6', b'\x81' * 2000 + b'\xf6',
                    b'\x99\x27\x10' + b'\xf6' * 10000,
                    b'\x9b' + b'\xff' * 8, b'\x5b' + b'\xff' * 8,
                    b'\xbb' + b'\xff' * 8, b'\xf6' * 1048577):
            with self.subTest(size=len(raw)):
                with self.assertRaises(module.Refusal) as context:
                    module.decode_canonical(raw)
                self.assertEqual(context.exception.gate, 1)
        array = module.decode_canonical(b'\x99\x27\x0f' + b'\xf6' * 9999)
        self.assertEqual(len(array['items']), 9999)
        largest = b'\x5a' + (1048571).to_bytes(4, 'big') + b'\0' * 1048571
        self.assertEqual(len(module.decode_canonical(largest)['value']), 2097142)
        for raw in (b'\x00', bytearray(b'\xf6'), None, 'f6', [246]):
            if raw == b'\x00' and type(raw) is bytes:
                continue
            with self.assertRaises(module.Refusal):
                module.decode_canonical(raw)
        self.refuse(' 00')

    def test_containers_preserve_order_and_refuse_duplicate_keys(self):
        for v in VECTORS['positive']:
            if v['node']['kind'] in ('array', 'map'):
                self.accept(v['hex'], v['node'])
        self.accept('a2617a0062616101', {'kind': 'map', 'entries': [
            ['z', {'kind': 'integer', 'value': '0'}],
            ['aa', {'kind': 'integer', 'value': '1'}]]})
        for raw in ('a2616101616102', 'a2616201616102', 'a3616100616200616100',
                    'a262616100617a01'):
            self.refuse(raw, 2)
        for raw in ('a10000', '9fff', 'bf', 'a16161', '82f6', 'a1810000'):
            self.refuse(raw)

    def test_container_render_roundtrip_and_exact_entry_order(self):
        for vector in VECTORS['positive']:
            if vector['node']['kind'] in ('array', 'map'):
                with self.subTest(label=vector['label']):
                    rendering = self.fixture(vector['node'], vector['hex'])
                    status, result = self.rendering(json.dumps(rendering))
                    self.assertEqual(status, 0, result)
                    self.assertEqual(result['canonical_hex'], vector['hex'])
                    self.assertEqual(result['node'], vector['node'])
        valid = self.fixture({'kind': 'null'})
        for node in ({'kind': 'array'}, {'kind': 'array', 'items': None},
                     {'kind': 'array', 'items': [None]},
                     {'kind': 'array', 'items': [], 'value': None},
                     {'kind': 'map', 'entries': {}},
                     {'kind': 'map', 'entries': [['a']]},
                     {'kind': 'map', 'entries': [['a', {'kind': 'null'}, 0]]},
                     {'kind': 'map', 'entries': [[1, {'kind': 'null'}]]},
                     {'kind': 'map', 'entries': [['a', None]]}):
            self.render_refusal({**valid, 'node': node}, 8)
        for keys in (['a', 'a'], ['b', 'a'], ['aa', 'z']):
            node = {'kind': 'map', 'entries': [[k, {'kind': 'null'}] for k in keys]}
            self.render_refusal({**valid, 'node': node}, 2)
        node = {'kind': 'map', 'entries': [['e\u0301', {'kind': 'null'}]]}
        self.render_refusal({**valid, 'node': node}, 5)
        rendered = self.fixture({'kind': 'array', 'items': [{'kind': 'null'}]}, '81f6')
        self.render_refusal(json.dumps(rendered).replace('"kind": "null"', '"kind":"null","kind":"null"'), 8)

    def test_encode_and_render_resource_boundaries(self):
        module = verifier_module()
        node = {'kind': 'null'}
        for _ in range(64):
            node = {'kind': 'array', 'items': [node]}
        self.assertEqual(module.encode_node(node), b'\x81' * 64 + b'\xf6')
        too_deep = {'kind': 'array', 'items': [node]}
        with self.assertRaises(module.Refusal) as context:
            module.encode_node(too_deep)
        self.assertEqual(context.exception.reason, 'nesting_depth_limit')
        cyclic = {'kind': 'array', 'items': []}
        cyclic['items'].append(cyclic)
        with self.assertRaises(module.Refusal) as context:
            module.encode_node(cyclic)
        self.assertEqual(context.exception.reason, 'cyclic_typed_input')
        for bad in ({'kind': 'array', 'items': [{'kind': 'null'}] * 10000},
                    {'kind': 'bytes', 'value': '00' * 1048572},
                    {'kind': 'text', 'value': 'a' * 1048572}):
            with self.assertRaises(module.Refusal) as context:
                module.encode_node(bad)
            self.assertEqual(context.exception.gate, 1)
        self.assertEqual(len(module.encode_node({'kind': 'bytes', 'value': '00' * 1048571})), 1048576)
        self.assertEqual(len(module.encode_node({'kind': 'array', 'items': [{'kind': 'null'}] * 9999})), 10002)
        entries = [[str(i).zfill(4), {'kind': 'null'}] for i in range(4999)]
        map_node = {'kind': 'map', 'entries': entries}
        accepted = {'kind': 'array', 'items': [map_node]}
        module.decode_canonical(module.encode_node(accepted))
        too_many = {'kind': 'array', 'items': [map_node, {'kind': 'null'}]}
        with self.assertRaises(module.Refusal) as context:
            module.encode_node(too_many)
        self.assertEqual(context.exception.reason, 'node_count_limit')
        self.render_refusal(self.fixture(too_deep), 1)
        self.render_refusal(self.fixture({'kind': 'array', 'items': [{'kind': 'null'}] * 10000}), 1)
        self.render_refusal(b'\xff', 1)
        self.render_refusal('[' * 2000 + ']' * 2000, 1)
        with tempfile.TemporaryDirectory(dir=SCRATCH, prefix='python-cbor-test-') as directory:
            path = pathlib.Path(directory) / 'huge.json'
            with path.open('wb') as stream:
                stream.write(b' ' * (10 * 1048576))
                stream.write(json.dumps(self.fixture({'kind': 'null'})).encode())
            status, result = self.cli('--render', str(path))
            self.assertEqual(status, 1)
            self.assertEqual(result['reason'], 'rendering_byte_limit')

    def test_explicit_timestamp_validation_not_arbitrary_text(self):
        module = verifier_module()
        self.assertTrue(hasattr(module, 'validate_canonical_timestamp'), 'explicit timestamp validator is missing')
        for value in ('2024-02-29T23:59:59.000000Z', '2000-02-29T00:00:00.123456Z',
                      '0001-01-01T00:00:00.000000Z', '9999-12-31T23:59:59.999999Z'):
            module.validate_canonical_timestamp(value)
        for value in ('1900-02-29T00:00:00.000000Z', '2023-02-29T00:00:00.000000Z',
                      '0000-01-01T00:00:00.000000Z', '2024-04-31T00:00:00.000000Z',
                      '2024-01-00T00:00:00.000000Z', '2024-13-01T00:00:00.000000Z',
                      '2024-01-01T24:00:00.000000Z', '2024-01-01T23:60:00.000000Z',
                      '2024-01-01T00:00:60.000000Z', '2024-01-01T00:00:00.12345Z',
                      '2024-01-01T00:00:00.1234567Z', '2024-01-01T00:00:00.000000z',
                      '2024-01-01t00:00:00.000000Z', '2024-01-01T00:00:00.000000+00:00',
                      '２０２４-01-01T00:00:00.000000Z', '2024-01-01T00:00:00.000000Z\n',
                      None, True, 0):
            with self.subTest(value=value):
                with self.assertRaises(module.Refusal) as context:
                    module.validate_canonical_timestamp(value)
                self.assertEqual(context.exception.gate, 4)
        node = {'kind': 'text', 'value': 'not-a-date'}
        self.assertEqual(module.decode_canonical(module.encode_node(node)), node)

    def test_official_unicode17_normalization_vectors(self):
        configured_path = os.environ.get('GKOS_NORMALIZATION_TEST_PATH')
        if not configured_path:
            self.skipTest('GKOS_NORMALIZATION_TEST_PATH absent: official Unicode17 vectors unavailable')
        # Explicit configuration must work: a missing or wrong file is a failure,
        # not an alternate scratch-path lookup or a successful validation skip.
        path = pathlib.Path(configured_path)
        content = path.read_bytes()
        self.assertEqual(hashlib.sha256(content).hexdigest(),
                         '5019ffd530751a741900c849c0e010332f142a3612234639bd200b82138a87db',
                         'Official Unicode17 normalization bytes do not match the pinned SHA256')
        self.assertTrue(content.startswith(b'# NormalizationTest-17.0.0.txt'))
        module = verifier_module()
        provider = module.unicode_data
        self.assertIsNotNone(provider)
        self.assertEqual(provider.unidata_version, '17.0.0')
        counts = {'rows': 0, 'normalization_invariants': 0, 'cbor_text_decisions': 0,
                  'accepted_nfc': 0, 'refused_non_nfc': 0, 'part2_codepoints': 0,
                  'part2_invariants': 0}
        part = None
        part1 = set()
        for line_number, line in enumerate(content.decode('utf-8').splitlines(), 1):
            body = line.split('#', 1)[0].strip()
            if not body:
                continue
            if body.startswith('@'):
                part = body
                continue
            cells = body.split(';')[:5]
            self.assertEqual(len(cells), 5)
            columns = [''.join(chr(int(cp, 16)) for cp in cell.split()) for cell in cells]
            if part == '@Part1':
                part1.update(ord(cp) for cp in columns[0])
            targets = {'NFC': [columns[1]] * 3 + [columns[3]] * 2,
                       'NFD': [columns[2]] * 3 + [columns[4]] * 2,
                       'NFKC': [columns[3]] * 5, 'NFKD': [columns[4]] * 5}
            for form, expected in targets.items():
                for text, target in zip(columns, expected):
                    self.assertEqual(provider.normalize(form, text), target, (line_number, form))
                    counts['normalization_invariants'] += 1
            for index, text in enumerate(columns):
                nfc = columns[1] if index < 3 else columns[3]
                raw = text.encode('utf-8')
                size = len(raw)
                prefix = bytes([0x60 + size]) if size < 24 else b'\x78' + bytes([size])
                data = prefix + raw
                if text == nfc:
                    node = {'kind': 'text', 'value': text}
                    self.assertEqual(module.encode_node(node), data)
                    self.assertEqual(module.decode_canonical(data), node)
                    counts['accepted_nfc'] += 1
                else:
                    for operation in (lambda: module.encode_node({'kind': 'text', 'value': text}),
                                      lambda: module.decode_canonical(data)):
                        with self.assertRaises(module.Refusal) as context:
                            operation()
                        self.assertEqual(context.exception.gate, 5)
                    counts['refused_non_nfc'] += 1
                counts['cbor_text_decisions'] += 2
            counts['rows'] += 1
        self.assertGreater(counts['rows'], 19000)
        # Official conformance clause 2: assigned scalars absent from Part1.
        for cp in range(0x110000):
            if cp in part1 or 0xD800 <= cp <= 0xDFFF:
                continue
            text = chr(cp)
            if provider.category(text) == 'Cn':
                continue
            for form in ('NFC', 'NFD', 'NFKC', 'NFKD'):
                self.assertEqual(provider.normalize(form, text), text, (cp, form))
                counts['part2_invariants'] += 1
            counts['part2_codepoints'] += 1
        counts['source_sha256'] = hashlib.sha256(content).hexdigest()
        print('UNICODE17_COUNTS ' + json.dumps(counts, sort_keys=True), flush=True)

    def test_all_binary16_patterns_and_shared_negative_vectors(self):
        import math
        import struct
        module = verifier_module()
        counts = {'patterns': 0, 'accepted': 0, 'refused': 0}
        for bits in range(65536):
            payload = bits.to_bytes(2, 'big')
            data = b'\xf9' + payload
            number = struct.unpack('>e', payload)[0]
            if not math.isfinite(number) or bits == 0x8000:
                with self.assertRaises(module.Refusal) as context:
                    module.decode_canonical(data)
                self.assertEqual(context.exception.gate, 3)
                counts['refused'] += 1
            else:
                node = module.decode_canonical(data)
                self.assertEqual(node['kind'], 'float')
                self.assertEqual(node['value'], number)
                self.assertEqual(module.encode_node(node), data)
                counts['accepted'] += 1
            counts['patterns'] += 1
        for vector in VECTORS['negative']:
            with self.subTest(label=vector['label']):
                self.refuse(vector['hex'], int(vector['code'][-3:]))
        print('BINARY16_COUNTS ' + json.dumps(counts, sort_keys=True), flush=True)

    def test_deterministic_binary32_binary64_and_malformed_corpus(self):
        import math
        import random
        import struct
        module = verifier_module()
        rng = random.Random(20261002)
        counts = {'binary32': 0, 'binary64': 0, 'malformed_inputs': 0}
        for width, fmt, prefix in [(32, '>f', b'\xfa'), (64, '>d', b'\xfb')]:
            for _ in range(4096):
                payload = rng.getrandbits(width).to_bytes(width // 8, 'big')
                number = struct.unpack(fmt, payload)[0]
                data = prefix + payload
                expected = None
                if math.isfinite(number) and not (number == 0 and math.copysign(1, number) < 0):
                    # Test oracle independently tries every narrower exact representation.
                    for test_fmt, marker in [('>e', b'\xf9'), ('>f', b'\xfa'), ('>d', b'\xfb')]:
                        try:
                            candidate = struct.pack(test_fmt, number)
                        except OverflowError:
                            continue
                        if struct.unpack(test_fmt, candidate)[0] == number:
                            expected = marker + candidate
                            break
                if expected == data:
                    node = module.decode_canonical(data)
                    self.assertEqual(module.encode_node(node), expected)
                else:
                    with self.assertRaises(module.Refusal) as context:
                        module.decode_canonical(data)
                    self.assertEqual(context.exception.gate, 3)
                if expected is not None:
                    self.assertEqual(module.encode_node({'kind': 'float', 'value': number}), expected)
                counts[f'binary{width}'] += 1
        for _ in range(4096):
            data = rng.randbytes(rng.randrange(0, 40))
            try:
                node = module.decode_canonical(data)
            except module.Refusal:
                pass
            else:
                self.assertEqual(module.encode_node(node), data)
            counts['malformed_inputs'] += 1
        for value in (23, 24, 255, 256, 65535, 65536, 4294967295, 4294967296,
                      18446744073709551615):
            for integer in (value, -1 - value):
                node = {'kind': 'integer', 'value': str(integer)}
                data = module.encode_node(node)
                self.assertEqual(module.decode_canonical(data), node)
                for length in range(len(data)):
                    with self.assertRaises(module.Refusal):
                        module.decode_canonical(data[:length])
        # Empty values never acquire defaults or lose their declared kind.
        for raw, node in [('60', {'kind': 'text', 'value': ''}),
                          ('40', {'kind': 'bytes', 'value': ''}),
                          ('80', {'kind': 'array', 'items': []}),
                          ('a0', {'kind': 'map', 'entries': []}),
                          ('f6', {'kind': 'null'})]:
            self.assertEqual(module.decode_canonical(bytes.fromhex(raw)), node)
            self.assertEqual(module.encode_node(node).hex(), raw)
        nested = {'kind': 'null'}
        for _ in range(64):
            nested = {'kind': 'map', 'entries': [['a', nested]]}
        data = module.encode_node(nested)
        status, result = self.rendering(json.dumps(self.fixture(nested, data.hex())))
        self.assertEqual(status, 0, result)
        braces = {'kind': 'text', 'value': '\\\"' + '{[' * 256}
        data = module.encode_node(braces)
        status, result = self.rendering(json.dumps(self.fixture(braces, data.hex())))
        self.assertEqual(status, 0, result)
        print('CORPUS_COUNTS ' + json.dumps(counts, sort_keys=True), flush=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)

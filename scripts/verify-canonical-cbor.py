#!/usr/bin/env python
"""Independent development-only GKX-CBOR-1 typed rendering verifier."""
import hashlib
import datetime
import json
import math
import pathlib
import re
import struct
import sys

try:
    import unicodedata2 as unicode_data
except ImportError:
    unicode_data = None

MAX_BYTES = 1048576
MAX_DEPTH = 64
MAX_NODES = 10000
# A JSON view may expand control text 6x and include payload hex 2x.
# This transport-only ceiling is separate from the 1 MiB canonical limit.
MAX_RENDER_BYTES = 10 * MAX_BYTES


def wrapper(data, node):
    return {'rendering_format': 'gkos.cbor.typed-json.v1', 'algorithm': 'sha-256',
            'canonical_profile': 'GKX-CBOR-1', 'digest': hashlib.sha256(data).hexdigest(),
            'node': node}


class Refusal(ValueError):
    def __init__(self, gate, reason):
        self.gate = gate
        self.reason = reason
        super().__init__(reason)

    def result(self):
        return {'verified': False, 'code': f'GKOS-GATE-L6-{self.gate:03d}',
                'requirement_id': f'GKOS-CANON-{self.gate:03d}', 'reason': self.reason}


def validate_canonical_timestamp(value):
    """Explicit schema helper; arbitrary CBOR text is not a timestamp."""
    if type(value) is not str or re.fullmatch(
            r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z', value) is None:
        raise Refusal(4, 'invalid_timestamp_format')
    try:
        datetime.datetime(int(value[0:4]), int(value[5:7]), int(value[8:10]),
                          int(value[11:13]), int(value[14:16]), int(value[17:19]),
                          int(value[20:26]))
    except ValueError:
        raise Refusal(4, 'invalid_gregorian_timestamp') from None


def validate_text(value):
    if type(value) is not str:
        raise Refusal(5, 'text_string_required')
    if unicode_data is None or unicode_data.unidata_version != '17.0.0':
        raise Refusal(5, 'unicode_profile_unavailable')
    try:
        encoded = value.encode('utf-8', 'strict')
    except UnicodeEncodeError:
        raise Refusal(5, 'invalid_unicode_scalar') from None
    if unicode_data.normalize('NFC', value) != value:
        raise Refusal(5, 'non_nfc_text')
    return encoded


def float_bytes(value):
    if not math.isfinite(value) or (value == 0 and math.copysign(1, value) < 0):
        raise Refusal(3, 'prohibited_float')
    for fmt, prefix in [('>e', b'\xf9'), ('>f', b'\xfa'), ('>d', b'\xfb')]:
        try:
            packed = struct.pack(fmt, value)
        except OverflowError:
            continue
        if struct.unpack(fmt, packed)[0] == value:
            return prefix + packed
    raise Refusal(3, 'unrepresentable_float')


class Decoder:
    def __init__(self, data):
        if type(data) is not bytes:
            raise Refusal(1, 'binary_input_required')
        if len(data) > MAX_BYTES:
            raise Refusal(1, 'encoded_byte_limit')
        self.data = data
        self.pos = 0
        self.nodes = 0

    def take(self, size):
        if size > len(self.data) - self.pos:
            raise Refusal(1, 'truncated_value')
        result = self.data[self.pos:self.pos + size]
        self.pos += size
        return result

    def argument(self, additional):
        if additional < 24:
            return additional
        widths = {24: 1, 25: 2, 26: 4, 27: 8}
        if additional not in widths:
            raise Refusal(1, 'indefinite_or_reserved_head')
        width = widths[additional]
        value = int.from_bytes(self.take(width), 'big')
        if value < {1: 24, 2: 256, 4: 65536, 8: 4294967296}[width]:
            raise Refusal(1, 'nonshortest_head')
        return value

    def node(self, depth=0):
        if depth > MAX_DEPTH:
            raise Refusal(1, 'nesting_depth_limit')
        self.nodes += 1
        if self.nodes > MAX_NODES:
            raise Refusal(1, 'node_count_limit')
        initial = self.take(1)[0]
        major, additional = initial >> 5, initial & 31
        if major == 7:
            if additional == 22:
                return {'kind': 'null'}
            if additional in (20, 21):
                return {'kind': 'boolean', 'value': additional == 21}
            if additional in (25, 26, 27):
                fmt, size = {25: ('>e', 2), 26: ('>f', 4), 27: ('>d', 8)}[additional]
                raw = self.take(size)
                value = struct.unpack(fmt, raw)[0]
                if float_bytes(value) != bytes([initial]) + raw:
                    raise Refusal(3, 'nonshortest_float')
                return {'kind': 'float', 'value': value}
            raise Refusal(1, 'unsupported_simple_value')
        value = self.argument(additional)
        if major in (0, 1):
            return {'kind': 'integer', 'value': str(value if major == 0 else -1 - value)}
        if major == 2:
            return {'kind': 'bytes', 'value': self.take(value).hex()}
        if major == 3:
            try:
                text = self.take(value).decode('utf-8', 'strict')
            except UnicodeDecodeError:
                raise Refusal(5, 'invalid_utf8') from None
            validate_text(text)
            return {'kind': 'text', 'value': text}
        if major == 4:
            if value > MAX_NODES - self.nodes or value > len(self.data) - self.pos:
                raise Refusal(1, 'excessive_declared_array_length')
            return {'kind': 'array', 'items': [self.node(depth + 1) for _ in range(value)]}
        if major == 5:
            if value > (MAX_NODES - self.nodes) // 2 or value > (len(self.data) - self.pos) // 2:
                raise Refusal(1, 'excessive_declared_map_length')
            entries = []
            previous = None
            for _ in range(value):
                start = self.pos
                # Match the typed decoder: the map-key grammar is checked before
                # interpreting a forbidden key's floating/nested payload.
                if self.pos >= len(self.data) or self.data[self.pos] >> 5 != 3:
                    raise Refusal(1, 'nontext_map_key')
                key = self.node(depth + 1)
                if key['kind'] != 'text':
                    raise Refusal(1, 'nontext_map_key')
                encoded_key = self.data[start:self.pos]
                if previous is not None and encoded_key <= previous:
                    raise Refusal(2, 'duplicate_or_unsorted_map_key')
                previous = encoded_key
                entries.append([key['value'], self.node(depth + 1)])
            return {'kind': 'map', 'entries': entries}
        raise Refusal(1, 'unsupported_type')


def decode_canonical(data):
    decoder = Decoder(data)
    node = decoder.node()
    if decoder.pos != len(data):
        raise Refusal(1, 'trailing_bytes')
    return node


def head(major, value):
    prefix = major << 5
    if value < 24:
        return bytes([prefix | value])
    for additional, width in [(24, 1), (25, 2), (26, 4), (27, 8)]:
        if value < 1 << (width * 8):
            return bytes([prefix | additional]) + value.to_bytes(width, 'big')
    raise Refusal(3, 'integer_out_of_range')


class EncodingBudget:
    def __init__(self):
        self.nodes = 0
        self.bytes = 0
        self.active = set()

    def count(self, depth):
        if depth > MAX_DEPTH:
            raise Refusal(1, 'nesting_depth_limit')
        self.nodes += 1
        if self.nodes > MAX_NODES:
            raise Refusal(1, 'node_count_limit')

    def part(self, data):
        self.bytes += len(data)
        if self.bytes > MAX_BYTES:
            raise Refusal(1, 'encoded_byte_limit')
        return data


def encode_node(node):
    return _encode_node(node, EncodingBudget(), 0)


def _encode_node(node, budget, depth):
    budget.count(depth)
    identity = id(node)
    if identity in budget.active:
        raise Refusal(1, 'cyclic_typed_input')
    budget.active.add(identity)
    try:
        return _encode_body(node, budget, depth)
    finally:
        budget.active.remove(identity)


def _encode_body(node, budget, depth):
    if type(node) is not dict or type(node.get('kind')) is not str:
        raise Refusal(8, 'typed_node_required')
    kind = node['kind']
    if kind not in ('null', 'boolean', 'integer', 'float', 'text', 'bytes', 'array', 'map'):
        raise Refusal(8, 'unsupported_rendered_kind')
    fields = {'null': {'kind'}, 'array': {'kind', 'items'}, 'map': {'kind', 'entries'}}
    if set(node) != fields.get(kind, {'kind', 'value'}):
        raise Refusal(8, 'incorrect_node_fields')
    if kind == 'null':
        return budget.part(b'\xf6')
    if kind == 'array':
        items = node['items']
        if type(items) is not list:
            raise Refusal(8, 'array_items_required')
        prefix = budget.part(head(4, len(items)))
        return prefix + b''.join(_encode_node(item, budget, depth + 1) for item in items)
    if kind == 'map':
        entries = node['entries']
        if type(entries) is not list:
            raise Refusal(8, 'map_entry_array_required')
        parts = [budget.part(head(5, len(entries)))]
        previous = None
        for entry in entries:
            if type(entry) is not list or len(entry) != 2 or type(entry[0]) is not str:
                raise Refusal(8, 'text_key_value_pair_required')
            budget.count(depth + 1)
            if len(entry[0]) > MAX_BYTES:
                raise Refusal(1, 'encoded_byte_limit')
            raw_key = validate_text(entry[0])
            encoded_key = head(3, len(raw_key)) + raw_key
            if previous is not None and encoded_key <= previous:
                raise Refusal(2, 'duplicate_or_unsorted_map_key')
            previous = encoded_key
            parts.extend([budget.part(encoded_key), _encode_node(entry[1], budget, depth + 1)])
        return b''.join(parts)
    value = node['value']
    if kind == 'boolean':
        if type(value) is not bool:
            raise Refusal(8, 'boolean_required')
        return budget.part(b'\xf5' if value else b'\xf4')
    if kind == 'integer':
        if type(value) is not str or len(value) > 21 or re.fullmatch(r'(?:0|[1-9][0-9]*|-[1-9][0-9]*)', value) is None:
            raise Refusal(3, 'canonical_decimal_integer_required')
        number = int(value)
        if not -(1 << 64) <= number < (1 << 64):
            raise Refusal(3, 'integer_out_of_range')
        return budget.part(head(0, number) if number >= 0 else head(1, -1 - number))
    if kind == 'float':
        if type(value) not in (int, float):
            raise Refusal(3, 'float_number_required')
        try:
            numeric = float(value)
        except OverflowError:
            raise Refusal(3, 'prohibited_float') from None
        if type(value) is int and numeric != value:
            raise Refusal(3, 'inexact_float_integer_conversion')
        return budget.part(float_bytes(numeric))
    if kind == 'text':
        if type(value) is str and len(value) > MAX_BYTES:
            raise Refusal(1, 'encoded_byte_limit')
        raw = validate_text(value)
        return budget.part(head(3, len(raw)) + raw)
    if kind == 'bytes':
        if type(value) is str and len(value) > 2 * MAX_BYTES:
            raise Refusal(1, 'encoded_byte_limit')
        if type(value) is not str or len(value) % 2 or re.fullmatch('[0-9a-f]*', value) is None:
            raise Refusal(8, 'lowercase_hex_bytes_required')
        raw = bytes.fromhex(value)
        return budget.part(head(2, len(raw)) + raw)
    raise Refusal(1, 'unsupported_type')


def unique_fields(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise Refusal(8, 'duplicate_json_field')
        result[key] = value
    return result


def json_float(token):
    value = float(token)
    significant = token.lower().split('e')[0]
    if not math.isfinite(value) or (value == 0 and any(c in '123456789' for c in significant)):
        raise Refusal(3, 'unrepresentable_json_number')
    return value


def json_integer(token):
    return -0.0 if token == '-0' else int(token)


def json_constant(token):
    raise Refusal(3, 'nonfinite_json_number')


def check_json_depth(content):
    # A typed-map level occupies node object, entries array, and entry array.
    # Scan syntax without interpreting braces inside JSON string literals.
    depth = 0
    quoted = False
    escaped = False
    for character in content:
        if quoted:
            if escaped:
                escaped = False
            elif character == '\\':
                escaped = True
            elif character == '"':
                quoted = False
        elif character == '"':
            quoted = True
        elif character in '[{':
            depth += 1
            if depth > 3 * (MAX_DEPTH + 1) + 4:
                raise Refusal(1, 'json_nesting_limit')
        elif character in ']}':
            depth -= 1


def verify_render(path):
    with pathlib.Path(path).open('rb') as stream:
        content = stream.read(MAX_RENDER_BYTES + 1)
    if len(content) > MAX_RENDER_BYTES:
        raise Refusal(1, 'rendering_byte_limit')
    text = content.decode('utf-8', 'strict')
    check_json_depth(text)
    rendering = json.loads(text,
                           object_pairs_hook=unique_fields, parse_constant=json_constant,
                           parse_float=json_float, parse_int=json_integer)
    required = {'rendering_format', 'algorithm', 'canonical_profile', 'digest', 'node'}
    if type(rendering) is not dict or set(rendering) not in (required, required | {'canonical_hex'}):
        raise Refusal(8, 'incorrect_rendering_fields')
    for field, expected in [('rendering_format', 'gkos.cbor.typed-json.v1'),
                            ('algorithm', 'sha-256'), ('canonical_profile', 'GKX-CBOR-1')]:
        if type(rendering[field]) is not str or rendering[field] != expected:
            raise Refusal(8, 'incorrect_rendering_metadata')
    digest = rendering['digest']
    if type(digest) is not str or re.fullmatch('[0-9a-f]{64}', digest) is None:
        raise Refusal(8, 'lowercase_sha256_digest_required')
    data = encode_node(rendering['node'])
    result = wrapper(data, decode_canonical(data))
    if digest != result['digest']:
        raise Refusal(7, 'displayed_hash_mismatch')
    if 'canonical_hex' in rendering and rendering['canonical_hex'] != data.hex():
        raise Refusal(8, 'rendering_byte_roundtrip_mismatch')
    result['canonical_hex'] = data.hex()
    return result


def main():
    try:
        if len(sys.argv) != 3 or sys.argv[1] not in ('--hex', '--render'):
            raise Refusal(1, 'usage: --hex HEX or --render FILE')
        if sys.argv[1] == '--render':
            print(json.dumps(verify_render(sys.argv[2])))
            return 0
        raw = sys.argv[2]
        if len(raw) > MAX_BYTES * 2:
            raise Refusal(1, 'encoded_byte_limit')
        if not raw or len(raw) % 2 or any(c not in '0123456789abcdefABCDEF' for c in raw):
            raise Refusal(1, 'invalid_hex')
        data = bytes.fromhex(raw)
        print(json.dumps(wrapper(data, decode_canonical(data))))
        return 0
    except Refusal as error:
        print(json.dumps(error.result()))
        return 1
    except (OSError, UnicodeError, ValueError, TypeError, KeyError, RecursionError, OverflowError) as error:
        print(json.dumps(Refusal(1, 'malformed_or_unreadable_input').result()))
        return 1


if __name__ == '__main__':
    sys.exit(main())

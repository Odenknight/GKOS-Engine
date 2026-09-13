"""Loopback-only reader for one host-authorized published ledger generation."""
import argparse
import hmac
import importlib
import json
import os
import re
from pathlib import Path
from aiohttp import web
from deadline import await_before_deadline
from ledger import Ledger, Refused, binding
from query_http import QuerySession, create_query_app, unique_object


def file_snapshot(path, limit):
    path = Path(path)
    with path.open('rb') as stream:
        before = os.fstat(stream.fileno())
        if before.st_size > limit:
            raise Refused('host-file-too-large')
        data = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
    current = path.stat()
    def stamp(value):
        return value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns
    # Windows Python reports handle ctime as change time but path ctime as
    # creation time. Keep handle ctime in the revision; compare portable identity
    # and write metadata when verifying the pathname still names that handle.
    path_fields = 4 if os.name == 'nt' else 5
    if len(data) > limit or stamp(before) != stamp(after) or stamp(after)[:path_fields] != stamp(current)[:path_fields]:
        raise Refused('host-file-changed')
    return stamp(after), data


class PublishedServiceHost:
    def __init__(self, profile_path):
        self.path = Path(profile_path).absolute()
        self.profile_snapshot = file_snapshot(self.path, 16384)
        profile = json.loads(self.profile_snapshot[1], object_pairs_hook=unique_object)
        if type(profile) is not dict or set(profile) != {'ledger_directory', 'job', 'binding', 'token_file', 'factory_module', 'port'}:
            raise Refused('host-profile-invalid')
        binding(profile['binding'])
        if not isinstance(profile['job'], str) or not re.fullmatch(r'sha256:[0-9a-f]{64}', profile['job']) or \
                not isinstance(profile['factory_module'], str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', profile['factory_module']) or \
                type(profile['port']) is not int or not 1024 <= profile['port'] <= 65535:
            raise Refused('host-profile-invalid')
        for key in ('ledger_directory', 'token_file'):
            if not isinstance(profile[key], str) or not Path(profile[key]).is_absolute():
                raise Refused('host-path-invalid')
        self.profile = profile
        self.token_snapshot = file_snapshot(profile['token_file'], 512)
        token = self.token_snapshot[1]
        if not re.fullmatch(rb'[A-Za-z0-9._~-]{32,512}', token):
            raise Refused('host-token-invalid')
        self.token = token
        self.invalid = False
        self.configuration = None
        self.ledger = Ledger(Path(profile['ledger_directory']).resolve(strict=True))
        try:
            self.publication = self.ledger.read(profile['job'], profile['binding'])
        except BaseException:
            self.ledger.close()
            raise
        self.session = None

    def current(self):
        if self.invalid:
            raise Refused('host-authority-invalidated')
        try:
            if file_snapshot(self.path, 16384) != self.profile_snapshot or \
                    file_snapshot(self.profile['token_file'], 512) != self.token_snapshot or \
                    self.ledger.read(self.profile['job'], self.profile['binding']) != self.publication or \
                    (self.configuration is not None and self.configuration() != self.profile['binding']['configuration_digest']):
                raise Refused('host-authority-changed')
        except Exception:
            self.invalid = True
            raise Refused('host-authority-invalidated') from None
        return dict(self.profile['binding'])

    def resolve(self, token):
        if not isinstance(token, str) or not token.isascii() or not hmac.compare_digest(token.encode(), self.token):
            return None
        try:
            self.current()
            return self.session
        except Refused:
            return None

    async def application(self):
        try:
            self.current()
            factory = importlib.import_module(self.profile['factory_module'])
            self.configuration = factory.configuration_digest
            self.current()
            graphiti, driver = factory.open_readonly(self.publication['binding']['projection_id'])
            self.session = QuerySession(self.ledger, self.profile['job'], self.current, graphiti, driver)
            app = create_query_app(self.resolve)
            async def close(_app):
                self.invalid = True
                try:
                    await await_before_deadline(graphiti.close(), 10)
                finally:
                    self.ledger.close()
            app.on_cleanup.append(close)
            return app
        except BaseException:
            self.ledger.close()
            raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--profile', required=True)
    args = parser.parse_args()
    host = PublishedServiceHost(args.profile)
    web.run_app(host.application(), host='127.0.0.1', port=host.profile['port'], access_log=None, print=None)

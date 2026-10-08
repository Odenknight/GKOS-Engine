import socket
import unittest
from unittest.mock import patch
from gkos_intelligence.server import create_server, health_payload


class SettingsTests(unittest.TestCase):
    def test_loopback_families_and_bounds(self):
        # No listener or external model request: verify constructor routing deterministically.
        with patch('gkos_intelligence.server.ThreadingHTTPServer.__init__', return_value=None):
            for host in ('127.0.0.1', 'localhost', '::1'):
                server = create_server(host, 8765)
                self.assertEqual(server.address_family, socket.AF_INET6 if host == '::1' else socket.AF_INET)
        for host, port in [('0.0.0.0', 8765), ('::', 8765), ('127.0.0.1', 0), ('::1', 65536), ('localhost', True)]:
            with self.assertRaises(ValueError):
                create_server(host, port)

    def test_unconfigured_health_is_not_ready(self):
        with patch.dict('os.environ', {}, clear=True):
            result = health_payload()
            self.assertEqual(result['status'], 'needs_configuration')
            self.assertFalse(result['authoritative'])

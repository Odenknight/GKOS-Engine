import unittest
from unittest.mock import patch

from gkos_intelligence.contracts import ContractError, validate_request
from gkos_intelligence.server import health_payload


class ContractTests(unittest.TestCase):
    def test_valid_request(self):
        request = {
            "contractVersion": "gkos.intelligence.v1",
            "requestId": "request:test",
            "task": "diagnostic_explanation",
            "targetId": "note:test",
        }
        self.assertIs(validate_request(request), request)

    def test_rejects_unknown_task(self):
        with self.assertRaises(ContractError):
            validate_request({
                "contractVersion": "gkos.intelligence.v1",
                "requestId": "request:test",
                "task": "approve_everything",
                "targetId": "note:test",
            })

    def test_rejects_oversized_note(self):
        with self.assertRaises(ContractError):
            validate_request({
                "contractVersion": "gkos.intelligence.v1",
                "requestId": "request:test",
                "task": "claim_extraction",
                "targetId": "note:test",
                "noteText": "x" * 1_000_001,
            })

    def test_health_is_honest_when_model_is_not_configured(self):
        with patch.dict("os.environ", {}, clear=True):
            health = health_payload()
        self.assertEqual(health["status"], "needs_configuration")
        self.assertFalse(health["modelConfigured"])
        self.assertFalse(health["authoritative"])


if __name__ == "__main__":
    unittest.main()

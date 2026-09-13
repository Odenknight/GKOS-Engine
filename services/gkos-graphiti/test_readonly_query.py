import asyncio
import sys
import types
import unittest
from unittest.mock import patch
from ledger import Refused
from readonly_query import create_readonly_driver, search_readonly


class ReadOnlyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.group = "gkos_" + "a" * 32
        self.calls = []
        owner = self

        class BaseDriver:
            def __init__(self, *, falkor_db, database):
                self.client, self._database = falkor_db, database
                self._init_task = asyncio.create_task(self.build_indices_and_constraints())

            async def build_indices_and_constraints(self):
                raise AssertionError("Constructor attempted index mutation")

            def _get_graph(self, name):
                return self.client.select_graph(name)

            async def execute_query(self, query, **kwargs):
                raise AssertionError("Inherited query logger must not run")

            async def close(self):
                await self._init_task
                await self.client.aclose()

        class Graph:
            async def query(self, *args, **kwargs):
                raise AssertionError("Write-capable API used")

            async def ro_query(self, query, **kwargs):
                owner.calls.append((query, kwargs))
                if query.startswith("CREATE"):
                    raise RuntimeError("read-only refusal")
                return types.SimpleNamespace(header=[[1, "value"], [1, "missing"]], result_set=[[7]])

        class Client:
            def select_graph(self, group):
                owner.assertEqual(group, owner.group)
                return Graph()

            async def aclose(self):
                owner.calls.append("close")

        self.recipe = types.SimpleNamespace(limit=10, edge_config={"mode": "rrf"})
        self.modules = patch.dict(sys.modules, {
            "graphiti_core.driver.falkordb_driver": types.SimpleNamespace(FalkorDriver=BaseDriver,
                convert_datetimes_to_strings=lambda value: value, _strip_nul_bytes=lambda value: value),
            "graphiti_core.search.search_config_recipes": types.SimpleNamespace(EDGE_HYBRID_SEARCH_RRF=self.recipe),
        })
        self.modules.start()
        self.version = patch("importlib.metadata.version", return_value="0.30.2")
        self.version.start()
        self.driver = create_readonly_driver(self.group, Client())
        self.graphiti = types.SimpleNamespace(driver=self.driver, clients=types.SimpleNamespace(driver=self.driver))

    async def asyncTearDown(self):
        await self.driver.close()
        self.version.stop()
        self.modules.stop()

    async def test_constructor_readback_and_clone_never_use_write_transport(self):
        await self.driver._init_task
        self.assertEqual(self.calls, [])
        result = await self.driver.execute_query("RETURN $value", value=7)
        self.assertEqual(result, ([{"value": 7, "missing": None}], ["value", "missing"], None))
        self.assertEqual(self.calls, [("RETURN $value", {"params": {"value": 7}, "timeout": 30000})])
        self.assertIs(self.driver.clone(self.group), self.driver)
        with self.assertRaisesRegex(Refused, "projection-mismatch"):
            self.driver.clone("other")
        with self.assertRaisesRegex(Refused, "projection-mismatch"):
            self.driver.client.select_graph("other")
        with self.assertRaisesRegex(RuntimeError, "read-only refusal"):
            await self.driver.execute_query("CREATE (:Forbidden)")

    async def test_concurrent_searches_have_independent_recipes_and_exact_group(self):
        configurations = []
        ready = asyncio.Event()

        async def search(query, *, config, group_ids, driver):
            self.assertEqual(group_ids, [self.group])
            self.assertIs(driver, self.driver)
            configurations.append(config)
            if len(configurations) == 2:
                ready.set()
            await asyncio.wait_for(ready.wait(), 1)
            config.edge_config["mode"] = query
            return types.SimpleNamespace(edges=[config.limit])

        self.graphiti.search_ = search
        self.assertEqual(await asyncio.gather(search_readonly(self.graphiti, self.driver, "first", 1),
                                              search_readonly(self.graphiti, self.driver, "second", 50)), [[1], [50]])
        self.assertIsNot(configurations[0], configurations[1])
        self.assertIsNot(configurations[0].edge_config, configurations[1].edge_config)
        self.assertEqual(self.recipe.edge_config, {"mode": "rrf"})
        self.assertEqual(self.recipe.limit, 10)

    async def test_invalid_query_and_wrong_driver_fail_before_search(self):
        for query, limit in ((" ", 10), ("a\n", 10), ("\ud800", 10), ("a" * 4097, 10), ("a", True), ("a", 51)):
            with self.assertRaisesRegex(Refused, "query-invalid"):
                await search_readonly(self.graphiti, self.driver, query, limit)
        self.graphiti.clients.driver = object()
        with self.assertRaisesRegex(Refused, "readonly-driver-required"):
            await search_readonly(self.graphiti, self.driver, "valid")

    async def test_unsupported_version_refuses_before_client_use(self):
        with patch("importlib.metadata.version", return_value="0.31.0"):
            with self.assertRaisesRegex(Refused, "unsupported"):
                create_readonly_driver(self.group, object())

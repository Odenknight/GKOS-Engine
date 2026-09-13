"""Graphiti 0.30.2 public ingestion API plus explicit FalkorDB read-only readback.

Factories are configured by the trusted host using its pinned local-model
configuration. This module never chooses provider credentials or fallbacks.
"""
import asyncio
import importlib.metadata
import json
import re
from datetime import datetime
from ledger import Refused


def validate_episode(episode):
    if type(episode) is not dict or set(episode) != {"name", "episode_body", "source_description", "reference_time"}:
        raise Refused("episode-invalid")
    for name, limit in (("name", 512), ("source_description", 2048), ("episode_body", 1048576), ("reference_time", 64)):
        value = episode[name]
        if not isinstance(value, str) or not value or len(value.encode("utf-8")) > limit:
            raise Refused("episode-invalid")
    json.loads(episode["episode_body"])
    reference = datetime.fromisoformat(episode["reference_time"].replace("Z", "+00:00"))
    if reference.utcoffset() is None:
        raise Refused("episode-timezone-required")
    return reference


class GraphitiBackend:
    def __init__(self, group, graphiti_factory, readonly_client):
        if not isinstance(group, str) or not re.fullmatch(r"gkos_[0-9a-f]{32}", group):
            raise Refused("projection-invalid")
        if importlib.metadata.version("graphiti-core") != "0.30.2":
            raise Refused("graphiti-version-unsupported")
        self.group = group
        self.graphiti = graphiti_factory(group)
        self.readonly_client = readonly_client

    async def initialize(self):
        await asyncio.wait_for(self.graphiti.build_indices_and_constraints(), 60)

    async def add(self, episode):
        from graphiti_core.nodes import EpisodeType
        reference = validate_episode(episode)
        result = await asyncio.wait_for(self.graphiti.add_episode(
            name=episode["name"], episode_body=episode["episode_body"], source=EpisodeType.json,
            source_description=episode["source_description"], reference_time=reference, group_id=self.group), 120)
        uid = result.episode.uuid
        if not isinstance(uid, str) or not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", uid):
            raise Refused("projection-mapping-invalid")
        return uid

    async def matches(self, uid, episode):
        result = await asyncio.wait_for(self.readonly_client.select_graph(self.group).ro_query(
            "MATCH (e:Episodic {uuid: $uuid}) RETURN e.content = $body, e.group_id = $group LIMIT 2",
            params={"uuid": uid, "body": episode["episode_body"], "group": self.group}, timeout=30000), 30)
        return result.result_set == [[True, True]]

    async def close(self):
        try:
            await asyncio.wait_for(self.graphiti.close(), 10)
        finally:
            await asyncio.wait_for(self.readonly_client.aclose(), 10)

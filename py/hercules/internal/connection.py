"""gRPC connection (port of ``src/internal/connection.ts``).

Opens the bi-directional ``ActionTransferService.Transfer`` stream and sends the
initial ``ActionLogon`` request. Uses ``grpc.aio`` for an async streaming client.
"""
from __future__ import annotations

from typing import Optional, Tuple

import grpc

from tucana.generated.aquila import action_pb2, action_pb2_grpc
from tucana.generated.shared import module_pb2


async def create_connection(
    module: module_pb2.Module,
    auth_token: str,
    aquila_url: str,
    grpc_options: Optional[list] = None,
) -> Tuple[grpc.aio.Channel, "grpc.aio.StreamStreamCall"]:
    channel = grpc.aio.insecure_channel(aquila_url, options=grpc_options)
    stub = action_pb2_grpc.ActionTransferServiceStub(channel)

    # Bi-directional stream. Authorization is passed as call metadata.
    stream = stub.Transfer(metadata=(("authorization", auth_token),))

    await stream.write(
        action_pb2.ActionTransferRequest(
            logon=action_pb2.ActionLogon(
                module=module,
                scaling_option=action_pb2.ActionLogon.ScalingOption.SPLIT,
            )
        )
    )

    return channel, stream

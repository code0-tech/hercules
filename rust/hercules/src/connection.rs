//! Opens the bidirectional `ActionTransferService.Transfer` stream to Aquila
//! and sends the initial `ActionLogon` frame.

use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::metadata::MetadataValue;
use tonic::transport::Endpoint;
use tonic::{Request, Streaming};
use tucana::aquila::action_transfer_service_client::ActionTransferServiceClient;
use tucana::aquila::{
    ActionLogon, ActionTransferRequest, ActionTransferResponse, action_transfer_request,
};
use tucana::shared::Module;

use crate::error::{HerculesError, Result};
use crate::types::ScalingOption;

pub struct Connection {
    pub request_tx: mpsc::Sender<ActionTransferRequest>,
    pub responses: Streaming<ActionTransferResponse>,
}

/// Plain gRPC, no TLS — Aquila is expected to sit behind a trusted network
/// boundary rather than be reachable directly.
fn endpoint_uri(aquila_url: &str) -> String {
    if aquila_url.starts_with("http://") || aquila_url.starts_with("https://") {
        aquila_url.to_string()
    } else {
        format!("http://{aquila_url}")
    }
}

pub async fn connect(
    module: Module,
    scaling_option: ScalingOption,
    auth_token: &str,
    aquila_url: &str,
    request_queue_capacity: usize,
) -> Result<Connection> {
    if request_queue_capacity == 0 {
        return Err(HerculesError::InvalidQueueCapacity);
    }

    let channel = Endpoint::from_shared(endpoint_uri(aquila_url))?
        .connect()
        .await?;
    let mut client = ActionTransferServiceClient::new(channel);

    let (request_tx, request_rx) = mpsc::channel::<ActionTransferRequest>(request_queue_capacity);
    request_tx
        .send(ActionTransferRequest {
            data: Some(action_transfer_request::Data::Logon(ActionLogon {
                module: Some(module),
                scaling_option: scaling_option.into_wire() as i32,
            })),
        })
        .await
        .map_err(|_| HerculesError::StreamClosed)?;

    let mut request = Request::new(ReceiverStream::new(request_rx));
    let token: MetadataValue<_> = auth_token
        .parse()
        .map_err(|_| HerculesError::Other("auth token is not valid gRPC metadata".to_string()))?;
    request.metadata_mut().insert("authorization", token);

    let responses = client.transfer(request).await?.into_inner();

    Ok(Connection {
        request_tx,
        responses,
    })
}

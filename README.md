# hercules
The action sdk to connect with aquila

This action sdk is currently implemented in:
- [Typescript](./ts/README.md)

# GRPC Communcation Flow

## Connection Flow

```mermaid
sequenceDiagram
    participant Hercules as Hercules (Client)
    participant Aquila as Aquila (Server)
    participant Stream as Stream (gRPC)

    Hercules->>Stream: Open bi-directional stream
    Hercules->>Stream: ActionLogon request

    Hercules->>Aquila: Register datatypes
    Aquila-->>Hercules: Validation result
    
    Hercules->>Stream: ActionConfiguration Request<br>with (registered) datatypes

    Hercules->>Aquila: Register function definitions
    Aquila-->>Hercules: Validation result

    Hercules->>Aquila: Register flow types
    Aquila-->>Hercules: Validation result

    Stream-->>Hercules: Receive action configurations
```

## Function execution flow

```mermaid
sequenceDiagram
    participant Hercules as Hercules (Client)
    participant Stream as Stream (gRPC)

    Stream-->>Hercules: Receive execution request
    
    Note right of Hercules: Hercules maps the request<br>with a registed function<br> and computes the result

    Hercules->>Stream: Execution response<br>with computed result
```

## Event flow

```mermaid
sequenceDiagram
    participant Hercules as Hercules (Client)
    participant Stream as Stream (gRPC)

    Hercules->>Stream: Event dispatch request<br> with project id and payload
```

# Test Server
To use a simple test server use the following command:

```bash
./bin/test_server.rb
```
This will start a test server on `localhost:50051` that you can connect to with the action sdk.
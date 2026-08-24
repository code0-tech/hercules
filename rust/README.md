# hercules-sdk

Rust SDK for building Hercules actions that connect to Aquila. An action
registers the functions it exposes, the events it can fire, and any custom
data types it needs, then talks to Aquila over a persistent gRPC stream.

Depends on the [`tucana`](https://crates.io/crates/tucana) crate for the
underlying protobuf types.

**Not yet included:** the `definitions/` standard library (the ~150
`std::*` function/data-type declarations) and an equivalent of the `hercules
export` CLI. Both are independent of the core framework and can be added
later.

## Installation

```toml
[dependencies]
hercules-sdk = "0"
```

## Quick start

Attach `#[hercules_sdk::runtime_function]` to a struct and implement
`RuntimeFunctionHandler` — that's enough to register it, no separate call
required:

```rust
use hercules_sdk::{Arguments, FunctionContext, PlainValue, Result, RuntimeFunctionHandler, async_trait};

#[hercules_sdk::runtime_function(identifier = "add", signature = "(a: NUMBER, b: NUMBER): NUMBER")]
struct Add;

#[async_trait]
impl RuntimeFunctionHandler for Add {
    async fn run(&self, _ctx: &FunctionContext, args: &Arguments) -> Result<PlainValue> {
        let a: f64 = args.get("a")?;
        let b: f64 = args.get("b")?;
        Ok((a + b).into())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let action = hercules_sdk::Action::new("my-action", "0.1.0").aquila_url("127.0.0.1:8081");

    let action = action.connect("token", None).await?;
    std::future::pending::<()>().await; // keep dispatching execution requests
    # let _ = action;
    Ok(())
}
```

Only `identifier` and `version` are required on `Action::new` — `author`,
`icon`, `documentation`, `name`, and `configuration` are optional chained
setters.

See [`examples/simple-example-rs`](./examples/simple-example-rs) for a
runnable action exercising every registration kind: a runtime function, its
public variant, a data type, and a runtime event.

```bash
cd examples/simple-example-rs
cp .env.example .env && set -a && source .env && set +a
cargo run
```

## Public vs. runtime functions

A `RuntimeFunction` holds the actual implementation. A `Function` is an
optional, separately-identified public variant of it — same execution
behavior, its own metadata (identifier, parameter defaults, ...). Use
`#[hercules_sdk::function(base = ...)]` when you want to expose a runtime
function under different public-facing metadata without duplicating logic:

```rust
#[hercules_sdk::function(base = Add, identifier = "sum")]
#[parameter(runtime_name = "a", default_value = 0)]
struct Sum;
```

Events follow the same pattern: `#[hercules_sdk::runtime_event]` for the
internal definition, `#[hercules_sdk::event(base = ...)]` for a public,
user-facing variant.

## Data types

Data types are derived from a Rust type's `schemars::JsonSchema` impl
instead of a hand-written schema DSL — `schemars`' own validation attributes
double as the wire validation rules:

```rust
use hercules_sdk::JsonSchema;
use serde::{Deserialize, Serialize};

#[hercules_sdk::data_type(identifier = "email_address", name(en_US = "Email Address"))]
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct EmailAddress(#[schemars(regex(pattern = r"^[^@]+@[^@]+\.[^@]+$"))] pub String);
```

## Firing events

```rust
action.fire("user_created", project_id, serde_json::json!({ "userId": 42 }))?;
```

The second argument is the project ID the event belongs to; the third is
the payload matching the event's signature.

## Testing without a live Aquila

`Action::build_module()` returns the wire `Module` without connecting, so
registration logic (macro-generated metadata, `Function`/`Event` merging,
data type schema resolution) can be unit tested directly — see
[`examples/simple-example-rs/src/main.rs`](./examples/simple-example-rs/src/main.rs)'s
`tests` module for a working example.

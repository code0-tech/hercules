use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::{HerculesError, Result};

const TOKEN_LIFETIME_SECS: u64 = 300;

#[derive(Serialize)]
struct Claims {
    sub: String,
    exp: u64,
}

pub(crate) fn build_logon_token(secret: &str, identifier: &str) -> Result<String> {
    let exp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| HerculesError::Other(format!("system clock is before the epoch: {err}")))?
        .as_secs()
        + TOKEN_LIFETIME_SECS;

    let claims = Claims {
        sub: identifier.to_string(),
        exp,
    };

    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|err| HerculesError::Other(format!("failed to sign logon JWT: {err}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
    use serde::Deserialize;

    #[derive(Debug, Deserialize)]
    struct VerifyClaims {
        sub: String,
        #[allow(dead_code)]
        exp: u64,
    }

    #[test]
    fn build_logon_token_round_trips() {
        let token = build_logon_token("secret", "action-id").unwrap();
        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_required_spec_claims(&["sub", "exp"]);
        let decoding_key = DecodingKey::from_secret(b"secret");
        let data = decode::<VerifyClaims>(&token, &decoding_key, &validation).unwrap();
        assert_eq!(data.claims.sub, "action-id");
    }
}

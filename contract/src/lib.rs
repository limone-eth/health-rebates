//! Signature checks for the rebate pool, and the pool itself (see `pool`).
//!
//! NEAR AI Cloud `ecdsa` signatures are Ethereum EIP-191 signatures over the text
//! `<model>:<request_hash>:<response_hash>` (provider TEE) or
//! `<request_hash>:<response_hash>` (gateway). Each hash is a SHA-256 of the exact body bytes.

use near_sdk::env;

pub mod pool;

/// keccak256("\x19Ethereum Signed Message:\n" + len(text) + text)
pub fn eip191_hash(text: &[u8]) -> Vec<u8> {
    let mut message = format!("\x19Ethereum Signed Message:\n{}", text.len()).into_bytes();
    message.extend_from_slice(text);
    env::keccak256(&message)
}

/// Returns the Ethereum address that signed `text`. `signature` is r || s || v.
pub fn recover_signer(text: &[u8], signature: &[u8; 65]) -> Option<[u8; 20]> {
    let v = match signature[64] {
        27 | 28 => signature[64] - 27,
        0 | 1 => signature[64],
        _ => return None,
    };
    let hash: [u8; 32] = eip191_hash(text).try_into().ok()?;
    let rs: [u8; 64] = signature[..64].try_into().ok()?;
    // `true` rejects malleable (high-s) signatures.
    let public_key = env::ecrecover(&hash, &rs, v, true)?;
    let digest = env::keccak256(&public_key);
    digest[12..].try_into().ok()
}

/// Lowercase hex of the SHA-256 of `body`.
pub fn sha256_hex(body: &[u8]) -> String {
    env::sha256(body).iter().map(|b| format!("{b:02x}")).collect()
}

/// True if `signer` signed the provider TEE text for these exact bodies.
pub fn verify_provider_response(
    model: &str,
    request_hash: &str,
    response_body: &[u8],
    signature: &[u8; 65],
    signer: &[u8; 20],
) -> bool {
    let text = format!("{model}:{request_hash}:{}", sha256_hex(response_body));
    recover_signer(text.as_bytes(), signature).as_ref() == Some(signer)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use k256::ecdsa::SigningKey;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;
    use sha3::{Digest, Keccak256};

    const MODEL: &str = "test/model";
    const REQUEST_HASH: &str = "abababababababababababababababababababababababababababababababab";
    const BODY: &[u8] = br#"{"choices":[{"message":{"content":"{\"days_met\":5}"}}]}"#;

    pub(crate) fn key(seed: u8) -> SigningKey {
        SigningKey::from_slice(&[seed; 32]).unwrap()
    }

    pub(crate) fn address(key: &SigningKey) -> [u8; 20] {
        let point = key.verifying_key().to_encoded_point(false);
        Keccak256::digest(&point.as_bytes()[1..])[12..].try_into().unwrap()
    }

    /// Signs the way an Ethereum wallet does, outside the NEAR runtime.
    pub(crate) fn sign(key: &SigningKey, text: &str) -> [u8; 65] {
        let mut message = format!("\x19Ethereum Signed Message:\n{}", text.len()).into_bytes();
        message.extend_from_slice(text.as_bytes());
        let digest = Keccak256::digest(&message);
        let (signature, recovery) = key.sign_prehash_recoverable(&digest).unwrap();
        let mut out = [0u8; 65];
        out[..64].copy_from_slice(&signature.to_bytes());
        out[64] = recovery.to_byte() + 27;
        out
    }

    fn provider_text(body: &[u8]) -> String {
        format!("{MODEL}:{REQUEST_HASH}:{}", sha256_hex(body))
    }

    fn setup() {
        testing_env!(VMContextBuilder::new().build());
    }

    #[test]
    fn accepts_the_registered_signer() {
        setup();
        let signer = key(1);
        let signature = sign(&signer, &provider_text(BODY));
        let before = env::used_gas().as_gas();
        let ok = verify_provider_response(MODEL, REQUEST_HASH, BODY, &signature, &address(&signer));
        let used = env::used_gas().as_gas() - before;
        println!("signature check gas: {:.2} Tgas", used as f64 / 1e12);
        assert!(ok);
    }

    fn from_hex(text: &str) -> Vec<u8> {
        let text = text.trim_start_matches("0x");
        (0..text.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&text[i..i + 2], 16).unwrap())
            .collect()
    }

    /// A real signature from NEAR AI Cloud, saved by `spike/verify-completion.mjs`.
    /// The prompt in it is synthetic.
    #[test]
    fn accepts_a_real_near_ai_signature() {
        setup();
        let fixture: near_sdk::serde_json::Value =
            near_sdk::serde_json::from_str(include_str!("../fixtures/near-ai-response.json")).unwrap();
        let field = |name: &str| fixture[name].as_str().unwrap();
        let signature: [u8; 65] = from_hex(field("signature")).try_into().unwrap();
        let signer: [u8; 20] = from_hex(field("signing_address")).try_into().unwrap();
        let body = field("response_body").as_bytes();
        assert!(verify_provider_response(field("model"), field("request_hash"), body, &signature, &signer));

        let mut changed = body.to_vec();
        let last = changed.len() - 2;
        changed[last] ^= 1;
        assert!(!verify_provider_response(field("model"), field("request_hash"), &changed, &signature, &signer));
    }

    #[test]
    fn rejects_a_changed_response() {
        setup();
        let signer = key(1);
        let signature = sign(&signer, &provider_text(BODY));
        let changed = br#"{"choices":[{"message":{"content":"{\"days_met\":7}"}}]}"#;
        assert!(!verify_provider_response(MODEL, REQUEST_HASH, changed, &signature, &address(&signer)));
    }

    #[test]
    fn rejects_another_signer() {
        setup();
        let signature = sign(&key(2), &provider_text(BODY));
        assert!(!verify_provider_response(MODEL, REQUEST_HASH, BODY, &signature, &address(&key(1))));
    }

    /// The other valid form of a signature: (r, n - s) with the recovery bit flipped.
    /// Without the malleability check it recovers the same key, so it could replay a claim.
    #[test]
    fn rejects_a_high_s_signature() {
        const N: [u8; 32] = [
            0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe,
            0xba, 0xae, 0xdc, 0xe6, 0xaf, 0x48, 0xa0, 0x3b, 0xbf, 0xd2, 0x5e, 0x8c, 0xd0, 0x36, 0x41, 0x41,
        ];
        setup();
        let signer = key(1);
        let text = provider_text(BODY);
        let low = sign(&signer, &text);

        let mut high = low;
        let mut borrow = 0i16;
        for i in (0..32).rev() {
            let value = N[i] as i16 - low[32 + i] as i16 - borrow;
            borrow = (value < 0) as i16;
            high[32 + i] = value.rem_euclid(256) as u8;
        }
        high[64] = 27 + ((low[64] - 27) ^ 1);

        let hash: [u8; 32] = eip191_hash(text.as_bytes()).try_into().unwrap();
        let rs: [u8; 64] = high[..64].try_into().unwrap();
        let without_check = env::ecrecover(&hash, &rs, high[64] - 27, false).unwrap();
        assert_eq!(env::keccak256(&without_check)[12..], address(&signer));

        assert_eq!(recover_signer(text.as_bytes(), &low), Some(address(&signer)));
        assert_eq!(recover_signer(text.as_bytes(), &high), None);
    }

    #[test]
    fn rejects_a_bad_recovery_byte() {
        setup();
        let mut signature = sign(&key(1), &provider_text(BODY));
        signature[64] = 99;
        assert_eq!(recover_signer(provider_text(BODY).as_bytes(), &signature), None);
    }
}

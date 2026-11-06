//! The rebate pool. It takes two kinds of claim:
//! - `claim_wearable`: the wearable service applies the rule in plain code and signs
//!   (contract, member, week, request_hash, days_met, pattern_matches_owner). No model decides it.
//! - `claim_lab`: a registered NEAR AI signer signs (model, request_hash, response_hash): the TEE model read
//!   the report and gave this answer, which holds the HbA1c values. The answer does not go on-chain.
//!   The demo service applies the lab rule in plain code to that answer and signs
//!   (contract, member, year, request_hash, response_hash, test_found, rule_met). No model decides it.
//!
//! The pool pays the rebate in tUSD, a NEP-141 test token, with `ft_transfer`. A real insurer pays in USDC.
//! The insurer funds it with `ft_transfer_call`. If a payout fails, the claim goes back to Held.
//!
//! The insurer verifies the attestation off-chain, then registers the signer. A contract cannot check a TDX quote.
//! Arguments of a testnet transaction are public: the results are public, under the member's account. No report goes on-chain.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue};

use crate::recover_signer;

/// Kept in the pool for storage of new claim records.
const STORAGE_RESERVE: NearToken = NearToken::from_millinear(100);
/// NEP-145 registration for one account on the token. The token refunds what it does not use.
const TOKEN_STORAGE: NearToken = NearToken::from_micronear(1_250);
/// Minimums. The unused gas of the claim is shared among these calls too.
const GAS_STORAGE_DEPOSIT: Gas = Gas::from_tgas(5);
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(5);
const GAS_ON_PAYOUT: Gas = Gas::from_tgas(5);

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Signers,
    Claims,
}

#[derive(Clone, Copy, PartialEq, Debug)]
#[near(serializers = [borsh, json])]
pub enum Outcome {
    Paid,
    NotPaid,
    Held,
    Rejected,
}

#[derive(Clone, PartialEq, Debug)]
#[near(serializers = [borsh, json])]
pub struct ClaimRecord {
    /// Wearable claims only.
    pub days_met: Option<u8>,
    pub pattern_matches_owner: Option<bool>,
    /// Lab claims only.
    pub test_found: Option<bool>,
    pub rule_met: Option<bool>,
    /// Lab claims only: the hash of the signed answer that the member keeps.
    pub response_hash: Option<String>,
    pub outcome: Outcome,
    pub request_hash: String,
}

impl ClaimRecord {
    fn wearable(days_met: u8, pattern_matches_owner: bool, request_hash: String) -> Self {
        Self {
            days_met: Some(days_met),
            pattern_matches_owner: Some(pattern_matches_owner),
            test_found: None,
            rule_met: None,
            response_hash: None,
            outcome: Outcome::NotPaid,
            request_hash,
        }
    }
    fn lab(test_found: bool, rule_met: bool, request_hash: String, response_hash: String) -> Self {
        Self {
            days_met: None,
            pattern_matches_owner: None,
            test_found: Some(test_found),
            rule_met: Some(rule_met),
            response_hash: Some(response_hash),
            outcome: Outcome::NotPaid,
            request_hash,
        }
    }
}

#[derive(Clone, Default, PartialEq, Debug)]
#[near(serializers = [borsh, json])]
pub struct Totals {
    pub paid: u32,
    pub not_paid: u32,
    pub held: u32,
    pub rejected: u32,
}

#[derive(Clone)]
#[near(serializers = [json])]
pub struct Config {
    pub insurer: AccountId,
    pub rule: String,
    pub model: String,
    pub min_days: u8,
    pub total_days: u8,
    /// tUSD units: 6 decimals, so 10 tUSD is 10_000_000.
    pub rebate: U128,
    pub token: AccountId,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct RebatePool {
    insurer: AccountId,
    wearable_signer: [u8; 20],
    rule: String,
    model: String,
    min_days: u8,
    total_days: u8,
    rebate: u128,
    token: AccountId,
    /// tUSD that the pool holds and has not sent yet.
    balance: u128,
    signers: LookupSet<[u8; 20]>,
    claims: LookupMap<String, ClaimRecord>,
    totals: Totals,
}

/// Decodes hex of exactly N bytes, with or without "0x".
fn parse_hex<const N: usize>(text: &str) -> Option<[u8; N]> {
    let text = text.strip_prefix("0x").unwrap_or(text).as_bytes();
    if text.len() != N * 2 {
        return None;
    }
    let digit = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    let mut out = [0u8; N];
    for (i, pair) in text.chunks(2).enumerate() {
        out[i] = digit(pair[0])? << 4 | digit(pair[1])?;
    }
    Some(out)
}

fn is_sha256_hex(text: &str) -> bool {
    text.len() == 64 && text.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

fn claim_key(member: &AccountId, week: &str) -> String {
    format!("{member}:{week}")
}

/// The key of a member's lab claim. One lab claim for each year.
fn lab_period(year: u16) -> String {
    format!("lab-{year}")
}

/// The exact text that the demo service signs for a lab result that its own code decided from the model's answer.
fn lab_result_text(
    contract: &AccountId,
    member: &AccountId,
    year: u16,
    request_hash: &str,
    response_hash: &str,
    test_found: bool,
    rule_met: bool,
) -> String {
    format!("rebate-lab:{contract}:{member}:{year}:{request_hash}:{response_hash}:{test_found}:{rule_met}")
}

/// The exact text that the wearable service signs for a result that its own code decided.
/// The prefix is different, so a request signature is not also a result signature.
fn result_text(contract: &AccountId, member: &AccountId, week: &str, request_hash: &str, days_met: u8, pattern: bool) -> String {
    format!("rebate-result:{contract}:{member}:{week}:{request_hash}:{days_met}:{pattern}")
}

fn fail(message: &str) -> ! {
    env::panic_str(message)
}

#[near]
impl RebatePool {
    /// Only the pool account can call this, so nobody can set up the pool between the deploy and this call.
    #[init]
    #[private]
    pub fn new(
        insurer: AccountId,
        wearable_signer: String,
        rule: String,
        model: String,
        min_days: u8,
        total_days: u8,
        rebate: U128,
        token: AccountId,
    ) -> Self {
        require!(min_days > 0 && min_days <= total_days, "Bad rule days");
        Self {
            insurer,
            wearable_signer: parse_hex(&wearable_signer).unwrap_or_else(|| fail("Bad wearable signer")),
            rule,
            model,
            min_days,
            total_days,
            rebate: rebate.0,
            token,
            balance: 0,
            signers: LookupSet::new(StorageKey::Signers),
            claims: LookupMap::new(StorageKey::Claims),
            totals: Totals::default(),
        }
    }

    /// NEP-141 receiver: anyone can fund the pool with tUSD through `ft_transfer_call`. Other tokens go back.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let _ = msg;
        if env::predecessor_account_id() != self.token {
            return PromiseOrValue::Value(amount);
        }
        self.balance += amount.0;
        env::log_str(&format!("Pool funded: {} tUSD units by {sender_id}", amount.0));
        PromiseOrValue::Value(U128(0))
    }

    /// Anyone can add NEAR for storage and member registration on the token.
    #[payable]
    pub fn fund(&mut self) {
        require!(env::attached_deposit() > NearToken::from_yoctonear(0), "Attach a deposit");
        env::log_str(&format!("Pool funded: {} by {}", env::attached_deposit(), env::predecessor_account_id()));
    }

    /// Call this after the attestation for this signer passes off-chain.
    pub fn register_signer(&mut self, signer: String) {
        self.only_insurer();
        self.signers.insert(parse_hex(&signer).unwrap_or_else(|| fail("Bad signer")));
    }

    pub fn remove_signer(&mut self, signer: String) {
        self.only_insurer();
        self.signers.remove(&parse_hex::<20>(&signer).unwrap_or_else(|| fail("Bad signer")));
    }

    /// The caller is the member. Pays if the service's code found a recent test that meets the lab rule
    /// in the answer that a registered NEAR AI signer signed. One lab claim for each year.
    #[allow(clippy::too_many_arguments)]
    pub fn claim_lab(
        &mut self,
        year: u16,
        request_hash: String,
        response_hash: String,
        test_found: bool,
        rule_met: bool,
        ai_signature: String,
        service_signature: String,
    ) -> Outcome {
        let member = env::predecessor_account_id();
        let period = lab_period(year);
        require!(!self.claims.contains_key(&claim_key(&member, &period)), "This year's lab rebate is already claimed");
        require!(is_sha256_hex(&request_hash), "request_hash must be 64 lowercase hex characters");
        require!(is_sha256_hex(&response_hash), "response_hash must be 64 lowercase hex characters");
        require!(test_found || !rule_met, "rule_met needs test_found");

        // The text holds the published model, so a signature for another model does not recover a registered signer.
        let ai: [u8; 65] = parse_hex(&ai_signature).unwrap_or_else(|| fail("Bad NEAR AI signature"));
        let text = format!("{}:{request_hash}:{response_hash}", self.model);
        let signer = recover_signer(text.as_bytes(), &ai).unwrap_or_else(|| fail("Bad NEAR AI signature"));
        require!(self.signers.contains(&signer), "The NEAR AI signer is not registered");

        // The service built the request and applied the rule to this answer. The contract cannot read the answer.
        let service: [u8; 65] = parse_hex(&service_signature).unwrap_or_else(|| fail("Bad service signature"));
        let text = lab_result_text(&env::current_account_id(), &member, year, &request_hash, &response_hash, test_found, rule_met);
        require!(
            recover_signer(text.as_bytes(), &service) == Some(self.wearable_signer),
            "The service did not sign this lab result"
        );

        let outcome = if rule_met { Outcome::Paid } else { Outcome::NotPaid };
        self.settle(member, period, ClaimRecord::lab(test_found, rule_met, request_hash, response_hash), outcome)
    }

    /// The caller is the member. The wearable service applied the rule in plain code and signed the result.
    pub fn claim_wearable(
        &mut self,
        week: String,
        request_hash: String,
        days_met: u8,
        pattern_matches_owner: bool,
        wearable_signature: String,
    ) -> Outcome {
        let member = env::predecessor_account_id();
        require!(!self.claims.contains_key(&claim_key(&member, &week)), "This week is already claimed");
        require!(is_sha256_hex(&request_hash), "request_hash must be 64 lowercase hex characters");
        require!(days_met <= self.total_days, "days_met is too large");

        let signature: [u8; 65] = parse_hex(&wearable_signature).unwrap_or_else(|| fail("Bad wearable signature"));
        let text = result_text(&env::current_account_id(), &member, &week, &request_hash, days_met, pattern_matches_owner);
        require!(
            recover_signer(text.as_bytes(), &signature) == Some(self.wearable_signer),
            "The wearable service did not sign this result"
        );
        let outcome = if days_met < self.min_days {
            Outcome::NotPaid
        } else if !pattern_matches_owner {
            Outcome::Held
        } else {
            Outcome::Paid
        };
        self.settle(member, week, ClaimRecord::wearable(days_met, pattern_matches_owner, request_hash), outcome)
    }

    /// The insurer's decision on a held claim.
    pub fn resolve_held(&mut self, member: AccountId, week: String, approve: bool) -> Outcome {
        self.only_insurer();
        let key = claim_key(&member, &week);
        let mut record = self.claims.get(&key).cloned().unwrap_or_else(|| fail("No such claim"));
        require!(record.outcome == Outcome::Held, "This claim is not held");
        self.totals.held -= 1;
        if approve {
            self.pay(&member, &week);
            self.totals.paid += 1;
            record.outcome = Outcome::Paid;
        } else {
            self.totals.rejected += 1;
            record.outcome = Outcome::Rejected;
        }
        let outcome = record.outcome;
        self.claims.insert(key, record);
        outcome
    }

    pub fn get_claim(&self, member: AccountId, week: String) -> Option<ClaimRecord> {
        self.claims.get(&claim_key(&member, &week)).cloned()
    }

    pub fn get_totals(&self) -> Totals {
        self.totals.clone()
    }

    /// tUSD units that the pool can still pay.
    pub fn get_balance(&self) -> U128 {
        U128(self.balance)
    }

    /// Only the token's result decides this. A failed transfer puts the claim back to Held, so the insurer can pay it later.
    #[private]
    pub fn on_payout(&mut self, member: AccountId, week: String, #[callback_result] transfer: Result<(), PromiseError>) -> bool {
        if transfer.is_ok() {
            return true;
        }
        self.balance += self.rebate;
        let key = claim_key(&member, &week);
        if let Some(mut record) = self.claims.get(&key).cloned() {
            record.outcome = Outcome::Held;
            self.claims.insert(key, record);
            self.totals.paid -= 1;
            self.totals.held += 1;
        }
        env::log_str(&format!("Payout failed for {member} {week}: the claim is held"));
        false
    }

    pub fn get_config(&self) -> Config {
        Config {
            insurer: self.insurer.clone(),
            rule: self.rule.clone(),
            model: self.model.clone(),
            min_days: self.min_days,
            total_days: self.total_days,
            rebate: U128(self.rebate),
            token: self.token.clone(),
        }
    }

    pub fn is_registered_signer(&self, signer: String) -> bool {
        parse_hex::<20>(&signer).is_some_and(|signer| self.signers.contains(&signer))
    }
}

impl RebatePool {
    fn only_insurer(&self) {
        require!(env::predecessor_account_id() == self.insurer, "Only the insurer can do this");
    }

    /// Pays if the outcome is Paid, and keeps the record. Call this only after the signature checks pass.
    fn settle(&mut self, member: AccountId, period: String, mut record: ClaimRecord, outcome: Outcome) -> Outcome {
        match outcome {
            Outcome::Paid => {
                self.pay(&member, &period);
                self.totals.paid += 1;
            }
            Outcome::NotPaid => self.totals.not_paid += 1,
            Outcome::Held => self.totals.held += 1,
            Outcome::Rejected => self.totals.rejected += 1,
        }
        env::log_str(&format!("Claim {member} {period}: {outcome:?}"));
        record.outcome = outcome;
        self.claims.insert(claim_key(&member, &period), record);
        outcome
    }

    /// The claim fails before it is recorded if the pool cannot pay, so the member can try again.
    /// Registers the member with the token, then sends the rebate. `on_payout` handles a failed transfer.
    fn pay(&mut self, member: &AccountId, week: &str) {
        require!(self.balance >= self.rebate, "The pool does not have enough tUSD");
        let storage = env::storage_byte_cost().saturating_mul(env::storage_usage() as u128);
        let needed = storage.saturating_add(STORAGE_RESERVE).saturating_add(TOKEN_STORAGE);
        require!(env::account_balance() >= needed, "The pool does not have enough NEAR for storage");
        self.balance -= self.rebate;

        let register = Promise::new(self.token.clone()).function_call(
            "storage_deposit".to_string(),
            json!({ "account_id": member, "registration_only": true }).to_string().into_bytes(),
            TOKEN_STORAGE,
            GAS_STORAGE_DEPOSIT,
        );
        let transfer = Promise::new(self.token.clone()).function_call(
            "ft_transfer".to_string(),
            json!({ "receiver_id": member, "amount": U128(self.rebate), "memo": format!("Health rebate {week}") }).to_string().into_bytes(),
            NearToken::from_yoctonear(1),
            GAS_FT_TRANSFER,
        );
        let check = Promise::new(env::current_account_id()).function_call(
            "on_payout".to_string(),
            json!({ "member": member, "week": week }).to_string().into_bytes(),
            NearToken::from_yoctonear(0),
            GAS_ON_PAYOUT,
        );
        let _ = register.then(transfer).then(check);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{address, key, sign};
    use k256::ecdsa::SigningKey;
    use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
    use near_sdk::testing_env;
    use near_sdk::mock::MockAction;
    use near_sdk::serde_json::{self, Value};

    const MODEL: &str = "test/model";
    const WEEK: &str = "2026-11-02";
    const HASH: &str = "abababababababababababababababababababababababababababababababab";
    const REBATE: u128 = 10_000_000; // 10 tUSD
    const TOKEN: &str = "tusd.testnet";

    fn account(name: &str) -> AccountId {
        name.parse().unwrap()
    }
    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }
    fn wearable_key() -> SigningKey {
        key(1)
    }
    fn ai_key() -> SigningKey {
        key(2)
    }

    fn context(caller: &str, balance: NearToken) {
        testing_env!(VMContextBuilder::new()
            .current_account_id(account("pool.testnet"))
            .predecessor_account_id(account(caller))
            .account_balance(balance)
            .build());
    }

    fn pool() -> RebatePool {
        context("pool.testnet", NearToken::from_near(10));
        let mut pool = RebatePool::new(
            account("insurer.testnet"),
            hex(&address(&wearable_key())),
            "7000 steps".to_string(),
            MODEL.to_string(),
            5,
            7,
            U128(REBATE),
            account(TOKEN),
        );
        context("insurer.testnet", NearToken::from_near(10));
        pool.register_signer(hex(&address(&ai_key())));
        fund(&mut pool, 5 * REBATE);
        context("insurer.testnet", NearToken::from_near(10));
        pool
    }

    /// The token calls ft_on_transfer after the insurer's ft_transfer_call.
    fn fund(pool: &mut RebatePool, amount: u128) {
        context(TOKEN, NearToken::from_near(10));
        let _ = pool.ft_on_transfer(account("insurer.testnet"), U128(amount), String::new());
    }

    /// The number of ft_transfer calls to the token that pay `member`.
    fn payouts(member: &str) -> usize {
        get_created_receipts()
            .iter()
            .filter(|receipt| receipt.receiver_id == account(TOKEN))
            .flat_map(|receipt| receipt.actions.iter())
            .filter(|action| match action {
                MockAction::FunctionCallWeight { method_name, args, .. } => {
                    let args: Value = serde_json::from_slice(args).unwrap();
                    method_name == b"ft_transfer" && args["receiver_id"] == member && args["amount"] == REBATE.to_string()
                }
                _ => false,
            })
            .count()
    }

    const YEAR: u16 = 2026;
    const LAB: &str = "lab-2026";
    const ANSWER: &str = "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd";

    fn ai_sign(signer: &SigningKey, model: &str, response_hash: &str) -> String {
        hex(&sign(signer, &format!("{model}:{HASH}:{response_hash}")))
    }
    fn service_sign(signer: &SigningKey, member: &str, test_found: bool, rule_met: bool) -> String {
        hex(&sign(signer, &lab_result_text(&account("pool.testnet"), &account(member), YEAR, HASH, ANSWER, test_found, rule_met)))
    }

    /// A lab claim by `member`, with good signatures.
    fn claim_lab(pool: &mut RebatePool, member: &str, test_found: bool, rule_met: bool) -> Outcome {
        context(member, NearToken::from_near(10));
        pool.claim_lab(
            YEAR,
            HASH.to_string(),
            ANSWER.to_string(),
            test_found,
            rule_met,
            ai_sign(&ai_key(), MODEL, ANSWER),
            service_sign(&wearable_key(), member, test_found, rule_met),
        )
    }

    /// A lab claim by a.testnet with the given signatures, which claims a paid result.
    fn claim_lab_signed(pool: &mut RebatePool, ai_signature: String, service_signature: String) -> Outcome {
        context("a.testnet", NearToken::from_near(10));
        pool.claim_lab(YEAR, HASH.to_string(), ANSWER.to_string(), true, true, ai_signature, service_signature)
    }

    #[test]
    fn a_lab_claim_pays_a_member_who_meets_the_lab_rule() {
        let mut pool = pool();
        assert_eq!(claim_lab(&mut pool, "a.testnet", true, true), Outcome::Paid);
        assert_eq!(payouts("a.testnet"), 1);
        let record = pool.get_claim(account("a.testnet"), LAB.to_string()).unwrap();
        assert_eq!(record, ClaimRecord { outcome: Outcome::Paid, ..ClaimRecord::lab(true, true, HASH.to_string(), ANSWER.to_string()) });
        assert_eq!(pool.get_totals(), Totals { paid: 1, ..Totals::default() });
    }

    #[test]
    fn a_lab_claim_does_not_pay_a_missed_rule_or_a_missing_test() {
        let mut pool = pool();
        assert_eq!(claim_lab(&mut pool, "b.testnet", true, false), Outcome::NotPaid);
        assert_eq!(claim_lab(&mut pool, "c.testnet", false, false), Outcome::NotPaid);
        assert!(get_created_receipts().is_empty());
        assert_eq!(pool.get_totals(), Totals { not_paid: 2, ..Totals::default() });
    }

    /// A lab claim and a wearable claim have different keys, so a member can make both.
    #[test]
    fn a_lab_claim_and_a_wearable_claim_are_separate() {
        let mut pool = pool();
        assert_eq!(claim_wearable(&mut pool, "a.testnet", 6, true), Outcome::Paid);
        assert_eq!(claim_lab(&mut pool, "a.testnet", true, true), Outcome::Paid);
        assert_eq!(pool.get_claim(account("a.testnet"), WEEK.to_string()).unwrap().days_met, Some(6));
        assert_eq!(pool.get_claim(account("a.testnet"), LAB.to_string()).unwrap().rule_met, Some(true));
    }

    #[test]
    #[should_panic(expected = "already claimed")]
    fn a_lab_claim_rejects_a_second_claim_for_the_same_year() {
        let mut pool = pool();
        claim_lab(&mut pool, "a.testnet", true, true);
        claim_lab(&mut pool, "a.testnet", true, true);
    }

    #[test]
    #[should_panic(expected = "service did not sign this lab result")]
    fn a_lab_claim_rejects_a_service_signature_from_another_key() {
        let mut pool = pool();
        claim_lab_signed(&mut pool, ai_sign(&ai_key(), MODEL, ANSWER), service_sign(&key(9), "a.testnet", true, true));
    }

    /// The member cannot change a not-paid result to paid.
    #[test]
    #[should_panic(expected = "service did not sign this lab result")]
    fn a_lab_claim_rejects_a_changed_result() {
        let mut pool = pool();
        claim_lab_signed(&mut pool, ai_sign(&ai_key(), MODEL, ANSWER), service_sign(&wearable_key(), "a.testnet", true, false));
    }

    /// B cannot use the result that the service signed for A.
    #[test]
    #[should_panic(expected = "service did not sign this lab result")]
    fn a_lab_claim_rejects_a_service_signature_for_another_member() {
        let mut pool = pool();
        context("b.testnet", NearToken::from_near(10));
        pool.claim_lab(YEAR, HASH.to_string(), ANSWER.to_string(), true, true, ai_sign(&ai_key(), MODEL, ANSWER), service_sign(&wearable_key(), "a.testnet", true, true));
    }

    /// A wearable result signature is not a lab result signature.
    #[test]
    #[should_panic(expected = "service did not sign this lab result")]
    fn a_lab_claim_rejects_a_wearable_result_signature() {
        let mut pool = pool();
        claim_lab_signed(&mut pool, ai_sign(&ai_key(), MODEL, ANSWER), result_sign(&wearable_key(), "a.testnet", 6, true));
    }

    #[test]
    #[should_panic(expected = "signer is not registered")]
    fn a_lab_claim_rejects_a_near_ai_signer_that_is_not_registered() {
        let mut pool = pool();
        claim_lab_signed(&mut pool, ai_sign(&key(9), MODEL, ANSWER), service_sign(&wearable_key(), "a.testnet", true, true));
    }

    #[test]
    #[should_panic(expected = "signer is not registered")]
    fn a_lab_claim_rejects_a_signer_after_the_insurer_removes_it() {
        let mut pool = pool();
        pool.remove_signer(hex(&address(&ai_key())));
        claim_lab(&mut pool, "a.testnet", true, true);
    }

    /// A NEAR AI signature for another answer recovers another address, which is not registered.
    #[test]
    #[should_panic(expected = "signer is not registered")]
    fn a_lab_claim_rejects_a_near_ai_signature_for_another_answer() {
        let mut pool = pool();
        let other = "efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef";
        claim_lab_signed(&mut pool, ai_sign(&ai_key(), MODEL, other), service_sign(&wearable_key(), "a.testnet", true, true));
    }

    /// The signature covers another model's name, so it does not recover the registered signer.
    #[test]
    #[should_panic(expected = "signer is not registered")]
    fn a_lab_claim_rejects_a_signature_for_a_model_that_the_insurer_did_not_publish() {
        let mut pool = pool();
        claim_lab_signed(&mut pool, ai_sign(&ai_key(), "other/model", ANSWER), service_sign(&wearable_key(), "a.testnet", true, true));
    }

    #[test]
    #[should_panic(expected = "request_hash must be 64 lowercase hex")]
    fn a_lab_claim_rejects_a_request_hash_that_is_not_64_hex_characters() {
        let mut pool = pool();
        context("a.testnet", NearToken::from_near(10));
        pool.claim_lab(YEAR, "abc".to_string(), ANSWER.to_string(), true, true, ai_sign(&ai_key(), MODEL, ANSWER), service_sign(&wearable_key(), "a.testnet", true, true));
    }

    #[test]
    #[should_panic(expected = "response_hash must be 64 lowercase hex")]
    fn a_lab_claim_rejects_a_response_hash_that_is_not_64_hex_characters() {
        let mut pool = pool();
        context("a.testnet", NearToken::from_near(10));
        pool.claim_lab(YEAR, HASH.to_string(), "HbA1c 5.4%".to_string(), true, true, ai_sign(&ai_key(), MODEL, ANSWER), service_sign(&wearable_key(), "a.testnet", true, true));
    }

    #[test]
    #[should_panic(expected = "rule_met needs test_found")]
    fn a_lab_claim_rejects_a_rule_met_with_no_test() {
        let mut pool = pool();
        claim_lab(&mut pool, "a.testnet", false, true);
    }

    #[test]
    #[should_panic(expected = "enough tUSD")]
    fn fails_if_the_pool_has_too_little_tusd() {
        let mut pool = pool();
        for member in ["a1.testnet", "a2.testnet", "a3.testnet", "a4.testnet", "a5.testnet"] {
            assert_eq!(claim_wearable(&mut pool, member, 6, true), Outcome::Paid);
        }
        claim_wearable(&mut pool, "a6.testnet", 6, true);
    }

    #[test]
    fn a_claim_that_fails_to_pay_is_not_recorded() {
        let mut pool = pool();
        for member in ["a1.testnet", "a2.testnet", "a3.testnet", "a4.testnet", "a5.testnet"] {
            claim_wearable(&mut pool, member, 6, true);
        }
        let failed = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| claim_wearable(&mut pool, "a6.testnet", 6, true)));
        assert!(failed.is_err());
        assert!(pool.get_claim(account("a6.testnet"), WEEK.to_string()).is_none());
        assert_eq!(pool.get_balance().0, 0);
    }

    #[test]
    fn a_payout_registers_the_member_with_the_token_first() {
        let mut pool = pool();
        claim_wearable(&mut pool, "a.testnet", 6, true);
        let calls: Vec<String> = get_created_receipts()
            .iter()
            .flat_map(|receipt| receipt.actions.iter())
            .filter_map(|action| match action {
                MockAction::FunctionCallWeight { method_name, .. } => Some(String::from_utf8(method_name.clone()).unwrap()),
                _ => None,
            })
            .collect();
        assert_eq!(calls, ["storage_deposit", "ft_transfer", "on_payout"]);
        assert_eq!(pool.get_balance().0, 4 * REBATE);
    }

    #[test]
    fn the_pool_takes_tusd_only_from_the_token() {
        let mut pool = pool();
        context("fake-token.testnet", NearToken::from_near(10));
        let returned = pool.ft_on_transfer(account("insurer.testnet"), U128(99), String::new());
        assert!(matches!(returned, PromiseOrValue::Value(U128(99))));
        assert_eq!(pool.get_balance().0, 5 * REBATE);
    }

    #[test]
    fn a_failed_transfer_puts_the_claim_back_to_held() {
        let mut pool = pool();
        claim_wearable(&mut pool, "a.testnet", 6, true);
        context("pool.testnet", NearToken::from_near(10));
        assert!(!pool.on_payout(account("a.testnet"), WEEK.to_string(), Err(PromiseError::Failed)));
        assert_eq!(pool.get_claim(account("a.testnet"), WEEK.to_string()).unwrap().outcome, Outcome::Held);
        assert_eq!(pool.get_totals(), Totals { held: 1, ..Totals::default() });
        assert_eq!(pool.get_balance().0, 5 * REBATE);
    }

    #[test]
    fn a_good_transfer_keeps_the_claim_paid() {
        let mut pool = pool();
        claim_wearable(&mut pool, "a.testnet", 6, true);
        context("pool.testnet", NearToken::from_near(10));
        assert!(pool.on_payout(account("a.testnet"), WEEK.to_string(), Ok(())));
        assert_eq!(pool.get_totals(), Totals { paid: 1, ..Totals::default() });
    }

    #[test]
    #[should_panic(expected = "enough NEAR")]
    fn fails_if_the_pool_cannot_pay_for_storage() {
        let mut pool = pool();
        context("a.testnet", NearToken::from_millinear(50));
        pool.claim_wearable(WEEK.to_string(), HASH.to_string(), 6, true, result_sign(&wearable_key(), "a.testnet", 6, true));
    }

    #[test]
    fn the_insurer_can_approve_or_reject_a_held_claim() {
        let mut pool = pool();
        claim_wearable(&mut pool, "c.testnet", 6, false);
        claim_wearable(&mut pool, "d.testnet", 6, false);
        context("insurer.testnet", NearToken::from_near(10));
        assert_eq!(pool.resolve_held(account("c.testnet"), WEEK.to_string(), true), Outcome::Paid);
        assert_eq!(payouts("c.testnet"), 1);
        assert_eq!(pool.resolve_held(account("d.testnet"), WEEK.to_string(), false), Outcome::Rejected);
        assert_eq!(pool.get_totals(), Totals { paid: 1, rejected: 1, ..Totals::default() });
    }

    #[test]
    #[should_panic(expected = "not held")]
    fn a_paid_claim_cannot_be_paid_again() {
        let mut pool = pool();
        claim_wearable(&mut pool, "a.testnet", 6, true);
        context("insurer.testnet", NearToken::from_near(10));
        pool.resolve_held(account("a.testnet"), WEEK.to_string(), true);
    }

    #[test]
    #[should_panic(expected = "Only the insurer")]
    fn only_the_insurer_can_resolve_a_held_claim() {
        let mut pool = pool();
        claim_wearable(&mut pool, "c.testnet", 6, false);
        pool.resolve_held(account("c.testnet"), WEEK.to_string(), true);
    }

    fn result_sign(signer: &SigningKey, member: &str, days: u8, pattern: bool) -> String {
        hex(&sign(signer, &result_text(&account("pool.testnet"), &account(member), WEEK, HASH, days, pattern)))
    }

    /// A wearable claim by `member`, signed by the wearable service.
    fn claim_wearable(pool: &mut RebatePool, member: &str, days: u8, pattern: bool) -> Outcome {
        context(member, NearToken::from_near(10));
        pool.claim_wearable(WEEK.to_string(), HASH.to_string(), days, pattern, result_sign(&wearable_key(), member, days, pattern))
    }

    #[test]
    fn a_wearable_claim_pays_holds_or_refuses_from_the_signed_result() {
        let mut pool = pool();
        assert_eq!(claim_wearable(&mut pool, "a.testnet", 6, true), Outcome::Paid);
        // Each context() call clears the receipts, so check the payout before the next claim.
        assert_eq!(payouts("a.testnet"), 1);
        assert_eq!(claim_wearable(&mut pool, "b.testnet", 3, true), Outcome::NotPaid);
        assert_eq!(claim_wearable(&mut pool, "c.testnet", 6, false), Outcome::Held);
        let record = pool.get_claim(account("a.testnet"), WEEK.to_string()).unwrap();
        assert_eq!(record, ClaimRecord { outcome: Outcome::Paid, ..ClaimRecord::wearable(6, true, HASH.to_string()) });
        assert_eq!(pool.get_totals(), Totals { paid: 1, not_paid: 1, held: 1, ..Totals::default() });
        assert!(get_created_receipts().is_empty());
    }

    #[test]
    #[should_panic(expected = "wearable service did not sign this result")]
    fn a_wearable_claim_rejects_a_signature_from_another_key() {
        let mut pool = pool();
        context("a.testnet", NearToken::from_near(10));
        pool.claim_wearable(WEEK.to_string(), HASH.to_string(), 6, true, result_sign(&key(9), "a.testnet", 6, true));
    }

    /// B missed the rule, and sends a better result with the signature for the real one.
    #[test]
    #[should_panic(expected = "wearable service did not sign this result")]
    fn a_wearable_claim_rejects_a_changed_result() {
        let mut pool = pool();
        context("b.testnet", NearToken::from_near(10));
        pool.claim_wearable(WEEK.to_string(), HASH.to_string(), 6, true, result_sign(&wearable_key(), "b.testnet", 3, true));
    }

    #[test]
    #[should_panic(expected = "wearable service did not sign this result")]
    fn a_wearable_claim_rejects_a_result_signed_for_another_member() {
        let mut pool = pool();
        context("b.testnet", NearToken::from_near(10));
        pool.claim_wearable(WEEK.to_string(), HASH.to_string(), 6, true, result_sign(&wearable_key(), "a.testnet", 6, true));
    }

    /// A lab result signature is not a wearable result signature.
    #[test]
    #[should_panic(expected = "wearable service did not sign this result")]
    fn a_wearable_claim_rejects_a_lab_result_signature() {
        let mut pool = pool();
        context("a.testnet", NearToken::from_near(10));
        pool.claim_wearable(WEEK.to_string(), HASH.to_string(), 6, true, service_sign(&wearable_key(), "a.testnet", true, true));
    }

    #[test]
    #[should_panic(expected = "already claimed")]
    fn a_wearable_claim_rejects_a_replay() {
        let mut pool = pool();
        claim_wearable(&mut pool, "a.testnet", 6, true);
        claim_wearable(&mut pool, "a.testnet", 6, true);
    }

    #[test]
    #[should_panic(expected = "days_met is too large")]
    fn a_wearable_claim_rejects_days_met_above_the_week() {
        let mut pool = pool();
        claim_wearable(&mut pool, "a.testnet", 8, true);
    }

    #[test]
    #[should_panic(expected = "Only the insurer")]
    fn only_the_insurer_can_register_a_signer() {
        let mut pool = pool();
        context("a.testnet", NearToken::from_near(10));
        pool.register_signer(hex(&address(&key(9))));
    }
}

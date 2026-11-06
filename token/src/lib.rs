//! tUSD: a NEP-141 test token for the rebate demo. It has no value. A real insurer pays in USDC.
//! Six decimals, like USDC, so 1 tUSD is 1_000_000 units. The owner gets the full supply at init.

use near_contract_standards::fungible_token::metadata::{FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC};
use near_contract_standards::fungible_token::{FungibleToken, FungibleTokenCore, FungibleTokenResolver};
use near_contract_standards::storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement};
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue};

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Token,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TestUsd {
    token: FungibleToken,
}

#[near]
impl TestUsd {
    /// Only the token account can call this, so nobody can set up the token between the deploy and this call.
    #[init]
    #[private]
    pub fn new(owner: AccountId, total_supply: U128) -> Self {
        let mut token = FungibleToken::new(StorageKey::Token);
        token.internal_register_account(&owner);
        token.internal_deposit(&owner, total_supply.0);
        near_contract_standards::fungible_token::events::FtMint {
            owner_id: &owner,
            amount: total_supply,
            memo: Some("tUSD test supply"),
        }
        .emit();
        Self { token }
    }
}

#[near]
impl FungibleTokenCore for TestUsd {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for TestUsd {
    #[private]
    fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let (used, _burned) = self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for TestUsd {
    #[payable]
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        // An account with a balance cannot leave, so no tokens are burned.
        if force == Some(true) {
            env::panic_str("This test token does not burn on unregister");
        }
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for TestUsd {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "Test USD (no value)".to_string(),
            symbol: "tUSD".to_string(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 6,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn account(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    fn context(caller: &str, deposit: NearToken) {
        testing_env!(VMContextBuilder::new()
            .current_account_id(account("tusd.testnet"))
            .predecessor_account_id(account(caller))
            .attached_deposit(deposit)
            .build());
    }

    fn token() -> TestUsd {
        context("tusd.testnet", NearToken::from_yoctonear(0));
        TestUsd::new(account("insurer.testnet"), U128(1_000_000_000_000))
    }

    #[test]
    fn the_owner_holds_the_supply_and_the_metadata_says_tusd() {
        let token = token();
        assert_eq!(token.ft_balance_of(account("insurer.testnet")).0, 1_000_000_000_000);
        assert_eq!(token.ft_total_supply().0, 1_000_000_000_000);
        let metadata = token.ft_metadata();
        assert_eq!((metadata.symbol.as_str(), metadata.decimals), ("tUSD", 6));
    }

    #[test]
    fn a_registered_account_can_receive_a_transfer() {
        let mut token = token();
        context("member.testnet", NearToken::from_millinear(125));
        token.storage_deposit(None, Some(true));
        context("insurer.testnet", NearToken::from_yoctonear(1));
        token.ft_transfer(account("member.testnet"), U128(10_000_000), None);
        assert_eq!(token.ft_balance_of(account("member.testnet")).0, 10_000_000);
    }

    #[test]
    #[should_panic(expected = "is not registered")]
    fn an_account_that_is_not_registered_cannot_receive() {
        let mut token = token();
        context("insurer.testnet", NearToken::from_yoctonear(1));
        token.ft_transfer(account("member.testnet"), U128(10_000_000), None);
    }
}

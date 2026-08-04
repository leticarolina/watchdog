#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

/// Setup helper (like a deploy fixture in Foundry)
/// Also registers a mock XLM SAC (= deploying a mock ERC20 in Foundry) and
/// mints a starting balance to the owner so tests can deposit into the vault.
/// Returns a pre-allowlisted recipient so existing payment-flow tests keep working
/// unchanged now that request_payment enforces the allowlist.
fn setup() -> (Env, WatchdogContractClient<'static>, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    // Set initial timestamp
    env.ledger().with_mut(|l| l.timestamp = 1000);

    let owner = Address::generate(&env);

    // Deploy a mock XLM SAC stand-in for the real testnet native asset contract
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&owner, &1_000_000_000_i128); // 100 XLM to fund deposits

    let contract_id = env.register(WatchdogContract, ());
    let client = WatchdogContractClient::new(&env, &contract_id);

    // Initialize contract
    client.initialize(
        &owner,
        &200_000_000_i128, // 20 XLM
        &400_000_000_i128, // 40 XLM
        &token_address,
        &86400_u64, // 24h window
    );

    // Fund the vault so request_payment can actually pay out
    client.deposit(&owner, &1_000_000_000_i128); // 100 XLM

    // Allowlist a shared recipient so existing payment-flow tests keep passing
    let recipient = Address::generate(&env);
    client.set_allowlist(&owner, &recipient, &true);

    (env, client, owner, token_address, recipient)
}

/// Helper to create new agents (cleaner tests)
fn new_agent(env: &Env) -> Address {
    Address::generate(env)
}

#[test]
fn test_happy_path() {
    let (env, client, _, _, recipient) = setup();
    let agent = new_agent(&env);

    let result = client.request_payment(&agent, &recipient, &100_000_000_i128); // 10 XLM

    assert_eq!(result, true);
}

#[test]
fn test_single_payment_limit_exceeded() {
    let (env, client, _, _, recipient) = setup();
    let agent = new_agent(&env);

    let result = client.try_request_payment(&agent, &recipient, &300_000_000_i128); // 30 XLM

    assert_eq!(
        result,
        Err(Ok(WatchdogError::SinglePaymentLimitExceeded))
    );
}

#[test]
fn test_daily_budget_exceeded() {
    let (env, client, _, _, recipient) = setup();
    let agent = new_agent(&env);

    // Fill budget: 4 × 10 XLM = 40 XLM
    for _ in 0..4 {
        let ok = client.request_payment(&agent, &recipient, &100_000_000_i128);
        assert_eq!(ok, true);
    }

    // Exceed budget
    let result = client.try_request_payment(&agent, &recipient, &100_000_000_i128);

    assert_eq!(
        result,
        Err(Ok(WatchdogError::BudgetCapExceeded))
    );
}

#[test]
fn test_time_reset_24h_window() {
    let (env, client, _, _, recipient) = setup();
    let agent = new_agent(&env);

    // Spend full budget
    for _ in 0..4 {
        client.request_payment(&agent, &recipient, &100_000_000_i128);
    }

    // Move time forward 24h
    env.ledger().with_mut(|l| l.timestamp += 86400);

    // Should be allowed again
    let result = client.request_payment(&agent, &recipient, &100_000_000_i128);

    assert_eq!(result, true);
}

#[test]
fn test_owner_can_update_limits() {
    let (_env, client, owner, _, _) = setup();

    client.set_limits(
        &owner,
        &50_000_000_i128,  // 5 XLM
        &100_000_000_i128, // 10 XLM
    );

    let (max, budget) = client.get_limits();

    assert_eq!(max, 50_000_000_i128);
    assert_eq!(budget, 100_000_000_i128);
}

#[test]
fn test_non_owner_cannot_update_limits() {
    let (env, client, _, _, _) = setup();
    let attacker = new_agent(&env);

    let result = client.try_set_limits(
        &attacker,
        &1_i128,
        &1_i128,
    );

    assert_eq!(
        result,
        Err(Ok(WatchdogError::Unauthorized))
    );
}

#[test]
fn test_cannot_initialize_twice() {
    let (_env, client, owner, token_address, _) = setup();

    let result = client.try_initialize(
        &owner,
        &100_000_000_i128,
        &200_000_000_i128,
        &token_address,
        &86400_u64,
    );

    assert_eq!(
        result,
        Err(Ok(WatchdogError::AlreadyInitialized))
    );
}

#[test]
fn test_malicious_agent_drain_attempt_blocked() {
    let (env, client, _, _, recipient) = setup();
    let agent = new_agent(&env);

    // Step 1: normal behavior (small payments)
    for _ in 0..3 {
        let ok = client.request_payment(&agent, &recipient, &50_000_000_i128); // 5 XLM
        assert_eq!(ok, true);
    }
    // At this point: 15 XLM spent out of 40 XLM budget

    // Step 2: suspicious large payment (but still under single limit)
    let ok = client.request_payment(&agent, &recipient, &90_000_000_i128); // 9 XLM
    assert_eq!(ok, true);
    // Total now: 24 XLM

    // Step 3: attempt to drain remaining budget aggressively
    let result = client.try_request_payment(&agent, &recipient, &300_000_000_i128); // 30 XLM attempt

    // Should fail due to single payment limit OR budget
    assert!(
        result == Err(Ok(WatchdogError::SinglePaymentLimitExceeded))
            || result == Err(Ok(WatchdogError::BudgetCapExceeded))
    );
}

#[test]
fn test_normal_vs_malicious_agent_behavior() {
    let (env, client, _, _, recipient) = setup();

    let normal_agent = new_agent(&env);
    let malicious_agent = new_agent(&env);

    // NORMAL AGENT behaves correctly, stays within limits
    let ok1 = client.request_payment(&normal_agent, &recipient, &100_000_000_i128); // 10 XLM
    let ok2 = client.request_payment(&normal_agent, &recipient, &100_000_000_i128); // 10 XLM

    assert_eq!(ok1, true);
    assert_eq!(ok2, true);

    // MALICIOUS AGENT starts normal...
    let ok = client.request_payment(&malicious_agent, &recipient, &100_000_000_i128); // 10 XLM
    assert_eq!(ok, true);

    // ...then attempts a large spike (Rule 1 trigger)
    let spike = client.try_request_payment(&malicious_agent, &recipient, &300_000_000_i128); // 30 XLM

    assert_eq!(
        spike,
        Err(Ok(WatchdogError::SinglePaymentLimitExceeded))
    );

    // alternative malicious behavior: draining via many small txs (Rule 2)
    // fill remaining budget
    for _ in 0..3 {
        let _ = client.request_payment(&malicious_agent, &recipient, &100_000_000_i128);
    }

    // now exceeds daily cap
    let drain = client.try_request_payment(&malicious_agent, &recipient, &100_000_000_i128);

    assert_eq!(
        drain,
        Err(Ok(WatchdogError::BudgetCapExceeded))
    );
}

#[test]
fn test_get_agent_state_default_zero() {
    let (env, client, _, _, _) = setup();
    let agent = new_agent(&env);

    let state = client.get_agent_state(&agent);

    assert_eq!(
        state,
        AgentState {
            cumulative_spent: 0,
            window_start: 0,
        }
    );
}

#[test]
fn test_get_agent_state_updates_after_payment() {
    let (env, client, _, _, recipient) = setup();
    let agent = new_agent(&env);

    let ok = client.request_payment(&agent, &recipient, &100_000_000_i128); // 10 XLM
    assert_eq!(ok, true);

    let state = client.get_agent_state(&agent);

    assert_eq!(state.cumulative_spent, 100_000_000_i128);
    assert_eq!(state.window_start, 1000_u64);
}

#[test]
fn test_get_agent_state_after_24h_reset() {
    let (env, client, _, _, recipient) = setup();
    let agent = new_agent(&env);

    // Spend part of budget in first window
    let ok1 = client.request_payment(&agent, &recipient, &100_000_000_i128);
    assert_eq!(ok1, true);

    let state_before = client.get_agent_state(&agent);
    assert_eq!(state_before.cumulative_spent, 100_000_000_i128);
    assert_eq!(state_before.window_start, 1000_u64);

    // Move time forward beyond 24h
    env.ledger().with_mut(|l| l.timestamp += 86400);

    // New request should reset prior window and start fresh
    let ok2 = client.request_payment(&agent, &recipient, &100_000_000_i128);
    assert_eq!(ok2, true);

    let state_after = client.get_agent_state(&agent);
    assert_eq!(state_after.cumulative_spent, 100_000_000_i128);
    assert_eq!(state_after.window_start, 87400_u64);
}

#[test]
fn test_deposit_increases_balance() {
    let (env, client, _, token_address, _) = setup();
    // setup() already deposited into the vault; mint more and deposit again
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);
    let depositor = new_agent(&env);
    token_admin_client.mint(&depositor, &200_000_000_i128); // 20 XLM

    let balance_before = client.get_balance();
    client.deposit(&depositor, &200_000_000_i128);
    let balance_after = client.get_balance();

    assert_eq!(balance_after, balance_before + 200_000_000_i128);
}

#[test]
fn test_request_payment_transfers_funds_to_recipient() {
    let (env, client, _, token_address, recipient) = setup();
    let agent = new_agent(&env);
    let token_client = token::Client::new(&env, &token_address);

    let vault_balance_before = client.get_balance();
    let recipient_balance_before = token_client.balance(&recipient);

    let result = client.request_payment(&agent, &recipient, &100_000_000_i128); // 10 XLM

    assert_eq!(result, true);
    assert_eq!(client.get_balance(), vault_balance_before - 100_000_000_i128);
    assert_eq!(
        token_client.balance(&recipient),
        recipient_balance_before + 100_000_000_i128
    );
}

#[test]
fn test_request_payment_fails_with_insufficient_vault_balance() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 1000);

    let owner = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();

    let contract_id = env.register(WatchdogContract, ());
    let client = WatchdogContractClient::new(&env, &contract_id);

    client.initialize(
        &owner,
        &200_000_000_i128,
        &400_000_000_i128,
        &token_address,
        &86400_u64,
    );
    // No deposit made — vault is empty

    let agent = new_agent(&env);
    let recipient = new_agent(&env);
    client.set_allowlist(&owner, &recipient, &true);

    let result = client.try_request_payment(&agent, &recipient, &100_000_000_i128);

    assert_eq!(
        result,
        Err(Ok(WatchdogError::InsufficientVaultBalance))
    );
}

#[test]
fn test_set_window_changes_reset_timing() {
    let (env, client, owner, _, recipient) = setup();
    let agent = new_agent(&env);

    // Fill the daily budget under the original 24h window
    for _ in 0..4 {
        let ok = client.request_payment(&agent, &recipient, &100_000_000_i128);
        assert_eq!(ok, true);
    }

    // Shrink the window to 1h
    client.set_window(&owner, &3600_u64);

    // Move forward 2h: past the new 1h window, but nowhere near the old 24h window
    env.ledger().with_mut(|l| l.timestamp += 7200);

    // Should be allowed again because the new, shorter window has elapsed
    let result = client.request_payment(&agent, &recipient, &100_000_000_i128);
    assert_eq!(result, true);

    let state = client.get_agent_state(&agent);
    assert_eq!(state.cumulative_spent, 100_000_000_i128);
    assert_eq!(state.window_start, 1000_u64 + 7200);
}

#[test]
fn test_non_owner_cannot_set_window() {
    let (env, client, _, _, _) = setup();
    let attacker = new_agent(&env);

    let result = client.try_set_window(&attacker, &3600_u64);

    assert_eq!(
        result,
        Err(Ok(WatchdogError::Unauthorized))
    );
}

#[test]
fn test_owner_can_allowlist_recipient_and_payment_succeeds() {
    let (env, client, owner, _, _) = setup();
    let agent = new_agent(&env);
    let new_recipient = new_agent(&env);

    assert_eq!(client.is_allowed(&new_recipient), false);

    client.set_allowlist(&owner, &new_recipient, &true);
    assert_eq!(client.is_allowed(&new_recipient), true);

    let result = client.request_payment(&agent, &new_recipient, &100_000_000_i128); // 10 XLM
    assert_eq!(result, true);
}

#[test]
fn test_payment_to_non_allowlisted_recipient_fails() {
    let (env, client, _, _, _) = setup();
    let agent = new_agent(&env);
    let not_allowlisted = new_agent(&env);

    let result = client.try_request_payment(&agent, &not_allowlisted, &100_000_000_i128);

    assert_eq!(
        result,
        Err(Ok(WatchdogError::RecipientNotAllowed))
    );
}

#[test]
fn test_non_owner_cannot_set_allowlist() {
    let (env, client, _, _, recipient) = setup();
    let attacker = new_agent(&env);

    let result = client.try_set_allowlist(&attacker, &recipient, &true);

    assert_eq!(
        result,
        Err(Ok(WatchdogError::Unauthorized))
    );
}

#[test]
fn test_pause_blocks_and_unpause_allows_payment() {
    let (env, client, owner, _, recipient) = setup();
    let agent = new_agent(&env);

    client.set_paused(&owner, &true);

    let result = client.try_request_payment(&agent, &recipient, &100_000_000_i128);
    assert_eq!(result, Err(Ok(WatchdogError::ContractPaused)));

    client.set_paused(&owner, &false);

    let result = client.request_payment(&agent, &recipient, &100_000_000_i128);
    assert_eq!(result, true);
}

#[test]
fn test_non_owner_cannot_set_paused() {
    let (env, client, _, _, _) = setup();
    let attacker = new_agent(&env);

    let result = client.try_set_paused(&attacker, &true);

    assert_eq!(
        result,
        Err(Ok(WatchdogError::Unauthorized))
    );
}

#[test]
fn test_request_payment_with_non_positive_amount_fails() {
    let (env, client, _, _, recipient) = setup();
    let agent = new_agent(&env);

    let zero_result = client.try_request_payment(&agent, &recipient, &0_i128);
    assert_eq!(zero_result, Err(Ok(WatchdogError::InvalidAmount)));

    let negative_result = client.try_request_payment(&agent, &recipient, &-1_i128);
    assert_eq!(negative_result, Err(Ok(WatchdogError::InvalidAmount)));
}

#[test]
fn test_deposit_with_negative_amount_fails() {
    let (_env, client, owner, _, _) = setup();

    let result = client.try_deposit(&owner, &-1_i128);

    assert_eq!(result, Err(Ok(WatchdogError::InvalidAmount)));
}

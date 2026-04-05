#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

/// Setup helper (like a deploy fixture in Foundry)
fn setup() -> (Env, WatchdogContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(WatchdogContract, ());
    let client = WatchdogContractClient::new(&env, &contract_id);

    // Set initial timestamp
    env.ledger().with_mut(|l| l.timestamp = 1000);

    let owner = Address::generate(&env);

    // Initialize contract
    client.initialize(
        &owner,
        &200_000_000_i128, // 20 XLM
        &400_000_000_i128, // 40 XLM
    );

    (env, client, owner)
}

/// Helper to create new agents (cleaner tests)
fn new_agent(env: &Env) -> Address {
    Address::generate(env)
}

#[test]
fn test_happy_path() {
    let (env, client, _) = setup();
    let agent = new_agent(&env);

    let result = client.request_payment(&agent, &100_000_000_i128); // 10 XLM

    assert_eq!(result, true);
}

#[test]
fn test_single_payment_limit_exceeded() {
    let (env, client, _) = setup();
    let agent = new_agent(&env);

    let result = client.try_request_payment(&agent, &300_000_000_i128); // 30 XLM

    assert_eq!(
        result,
        Err(Ok(WatchdogError::SinglePaymentLimitExceeded))
    );
}

#[test]
fn test_daily_budget_exceeded() {
    let (env, client, _) = setup();
    let agent = new_agent(&env);

    // Fill budget: 4 × 10 XLM = 40 XLM
    for _ in 0..4 {
        let ok = client.request_payment(&agent, &100_000_000_i128);
        assert_eq!(ok, true);
    }

    // Exceed budget
    let result = client.try_request_payment(&agent, &100_000_000_i128);

    assert_eq!(
        result,
        Err(Ok(WatchdogError::DailyBudgetExceeded))
    );
}

#[test]
fn test_time_reset_24h_window() {
    let (env, client, _) = setup();
    let agent = new_agent(&env);

    // Spend full budget
    for _ in 0..4 {
        client.request_payment(&agent, &100_000_000_i128);
    }

    // Move time forward 24h
    env.ledger().with_mut(|l| l.timestamp += 86400);

    // Should be allowed again
    let result = client.request_payment(&agent, &100_000_000_i128);

    assert_eq!(result, true);
}

#[test]
fn test_owner_can_update_limits() {
    let (_env, client, owner) = setup();

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
    let (env, client, _) = setup();
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
    let (_env, client, owner) = setup();

    let result = client.try_initialize(
        &owner,
        &100_000_000_i128,
        &200_000_000_i128,
    );

    assert_eq!(
        result,
        Err(Ok(WatchdogError::AlreadyInitialized))
    );
}

#[test]
fn test_malicious_agent_drain_attempt_blocked() {
    let (env, client, _) = setup();
    let agent = new_agent(&env);

    // Step 1: normal behavior (small payments)
    for _ in 0..3 {
        let ok = client.request_payment(&agent, &50_000_000_i128); // 5 XLM
        assert_eq!(ok, true);
    }
    // At this point: 15 XLM spent out of 40 XLM budget

    // Step 2: suspicious large payment (but still under single limit)
    let ok = client.request_payment(&agent, &90_000_000_i128); // 9 XLM
    assert_eq!(ok, true);
    // Total now: 24 XLM

    // Step 3: attempt to drain remaining budget aggressively
    let result = client.try_request_payment(&agent, &300_000_000_i128); // 30 XLM attempt

    // Should fail due to single payment limit OR budget
    assert!(
        result == Err(Ok(WatchdogError::SinglePaymentLimitExceeded))
            || result == Err(Ok(WatchdogError::DailyBudgetExceeded))
    );
}

#[test]
fn test_normal_vs_malicious_agent_behavior() {
    let (env, client, _) = setup();

    let normal_agent = new_agent(&env);
    let malicious_agent = new_agent(&env);

    // NORMAL AGENT behaves correctly, stays within limits
    let ok1 = client.request_payment(&normal_agent, &100_000_000_i128); // 10 XLM
    let ok2 = client.request_payment(&normal_agent, &100_000_000_i128); // 10 XLM

    assert_eq!(ok1, true);
    assert_eq!(ok2, true);

    // MALICIOUS AGENT starts normal...
    let ok = client.request_payment(&malicious_agent, &100_000_000_i128); // 10 XLM
    assert_eq!(ok, true);

    // ...then attempts a large spike (Rule 1 trigger)
    let spike = client.try_request_payment(&malicious_agent, &300_000_000_i128); // 30 XLM

    assert_eq!(
        spike,
        Err(Ok(WatchdogError::SinglePaymentLimitExceeded))
    );

    // alternative malicious behavior: draining via many small txs (Rule 2)
    // fill remaining budget
    for _ in 0..3 {
        let _ = client.request_payment(&malicious_agent, &100_000_000_i128);
    }

    // now exceeds daily cap
    let drain = client.try_request_payment(&malicious_agent, &100_000_000_i128);

    assert_eq!(
        drain,
        Err(Ok(WatchdogError::DailyBudgetExceeded))
    );
}

#[test]
fn test_get_agent_state_default_zero() {
    let (env, client, _) = setup();
    let agent = new_agent(&env);

    let state = client.get_agent_state(&agent);

    assert_eq!(
        state,
        AgentState {
            cumulative_24h: 0,
            day_start: 0,
        }
    );
}

#[test]
fn test_get_agent_state_updates_after_payment() {
    let (env, client, _) = setup();
    let agent = new_agent(&env);

    let ok = client.request_payment(&agent, &100_000_000_i128); // 10 XLM
    assert_eq!(ok, true);

    let state = client.get_agent_state(&agent);

    assert_eq!(state.cumulative_24h, 100_000_000_i128);
    assert_eq!(state.day_start, 1000_u64);
}

#[test]
fn test_get_agent_state_after_24h_reset() {
    let (env, client, _) = setup();
    let agent = new_agent(&env);

    // Spend part of budget in first window
    let ok1 = client.request_payment(&agent, &100_000_000_i128);
    assert_eq!(ok1, true);

    let state_before = client.get_agent_state(&agent);
    assert_eq!(state_before.cumulative_24h, 100_000_000_i128);
    assert_eq!(state_before.day_start, 1000_u64);

    // Move time forward beyond 24h
    env.ledger().with_mut(|l| l.timestamp += 86400);

    // New request should reset prior window and start fresh
    let ok2 = client.request_payment(&agent, &100_000_000_i128);
    assert_eq!(ok2, true);

    let state_after = client.get_agent_state(&agent);
    assert_eq!(state_after.cumulative_24h, 100_000_000_i128);
    assert_eq!(state_after.day_start, 87400_u64);
}
#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

#[test]
fn test_happy_path() {
    let env = Env::default();
    let contract_id = env.register(WatchdogContract, ());
    let client = WatchdogContractClient::new(&env, &contract_id);
    env.ledger().with_mut(|l| l.timestamp = 1000);
    let agent = Address::generate(&env);
    let result = client.request_payment(&agent, &10_000_000_i128);
    assert_eq!(result, true);
}

#[test]
fn test_rule1_single_payment_limit_exceeded() {
    let env = Env::default();
    let contract_id = env.register(WatchdogContract, ());
    let client = WatchdogContractClient::new(&env, &contract_id);
    env.ledger().with_mut(|l| l.timestamp = 1000);
    let agent = Address::generate(&env);
    let result = client.try_request_payment(&agent, &30_000_000_i128);
    assert_eq!(result, Err(Ok(WatchdogError::SinglePaymentLimitExceeded)));
}

#[test]
fn test_rule2_daily_budget_exceeded() {
    let env = Env::default();
    let contract_id = env.register(WatchdogContract, ());
    let client = WatchdogContractClient::new(&env, &contract_id);
    env.ledger().with_mut(|l| l.timestamp = 1000);
    let agent = Address::generate(&env);
    for _ in 0..4 {
        assert_eq!(client.request_payment(&agent, &10_000_000_i128), true);
    }
    let result = client.try_request_payment(&agent, &10_000_000_i128);
    assert_eq!(result, Err(Ok(WatchdogError::DailyBudgetExceeded)));
}
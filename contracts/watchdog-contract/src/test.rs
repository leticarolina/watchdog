#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

// EVM equivalent: forge test --match-test test_happy_path
#[test]
fn test_happy_path() {
    let env = Env::default();
    let contract_id = env.register(WatchdogContract, ());
    let client = WatchdogContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 1000);

    let agent = Address::generate(&env);
    let amount = 10_000_000_i128; // 1 XLM — within both limits

    let result = client.request_payment(&agent, &amount);
    assert_eq!(result, true);
}

// EVM equivalent: vm.expectRevert(WatchdogError.SinglePaymentLimitExceeded.selector)
#[test]
fn test_rule1_single_payment_limit_exceeded() {
    let env = Env::default();
    let contract_id = env.register(WatchdogContract, ());
    let client = WatchdogContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 1000);

    let agent = Address::generate(&env);
    let amount = 30_000_000_i128; // 3 XLM — exceeds 2 XLM MAX_SINGLE_PAYMENT

    let result = client.try_request_payment(&agent, &amount);
    assert_eq!(result, Err(Ok(WatchdogError::SinglePaymentLimitExceeded)));
}

// EVM equivalent: vm.expectRevert(WatchdogError.DailyBudgetExceeded.selector)
#[test]
fn test_rule2_daily_budget_exceeded() {
    let env = Env::default();
    let contract_id = env.register(WatchdogContract, ());
    let client = WatchdogContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 1000);

    let agent = Address::generate(&env);
    let amount = 10_000_000_i128; // 1 XLM per request

    // 4 × 1 XLM = 4 XLM — fills the daily budget exactly (4 > 4 is false, each passes)
    for _ in 0..4 {
        assert_eq!(client.request_payment(&agent, &amount), true);
    }

    // 5th request: 4 + 1 = 5 > 4 DAILY_BUDGET — blocked
    let result = client.try_request_payment(&agent, &amount);
    assert_eq!(result, Err(Ok(WatchdogError::DailyBudgetExceeded)));
}

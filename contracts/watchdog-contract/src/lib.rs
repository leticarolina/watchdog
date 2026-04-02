//! # Watchdog
//! **Author:** Leticia Azevedo ([git](https://github.com/leticarolina))
//!
//! Watchdog is a behavioral risk layer for autonomous agent payments on Stellar.
//! Acts between an agent and the payment execution, watching for spending behavior before XLM moves on-chain.
//!
//! ## Rules
//! Every `request_payment` call is evaluated against two behavioral rules:
//! 1. **Single Payment Limit** — no single payment may exceed `MAX_SINGLE_PAYMENT` 
//! 2. **Daily Budget Cap** — cumulative spend per agent may not exceed `DAILY_BUDGET` in a 24h window
//!
//! Built for Stellar Agents Hackathon 2026

#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, contracterror, symbol_short, Address, Env};

const MAX_SINGLE_PAYMENT: i128 = 20_000_000; // 2 XLM (1 XLM = 10_000_000 stroops)
const DAILY_BUDGET: i128 = 40_000_000;        // 4 XLM

/// Errors returned by the Watchdog contract.
#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]

pub enum WatchdogError {
    SinglePaymentLimitExceeded = 1,
    DailyBudgetExceeded = 2,
}

/// Per-agent spending state stored in persistent storage.
/// Equivalent to mapping(address => AgentState) in Solidity.
#[contracttype]
pub struct AgentState {
    pub cumulative_24h: i128,
    pub day_start: u64,
}

#[contract]
pub struct WatchdogContract;

#[contractimpl]
impl WatchdogContract {
    /// Evaluates whether an agent payment is within behavioral limits.
    ///
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `agent` - Address of the agent requesting payment
    /// * `amount` - Payment amount in stroops (1 XLM = 10_000_000)
    ///
    /// # Returns
    /// * `Ok(true)` if payment is approved and state is updated
    ///
    /// # Errors
    /// * `SinglePaymentLimitExceeded` - amount > MAX_SINGLE_PAYMENT
    /// * `DailyBudgetExceeded` - cumulative_24h + amount > DAILY_BUDGET
    pub fn request_payment(env: Env, agent: Address, amount: i128) -> Result<bool, WatchdogError> {
        // Rule 1: single payment ceiling
        if amount > MAX_SINGLE_PAYMENT {
            env.events().publish(
                (symbol_short!("watchdog"), symbol_short!("blocked")),
                (agent, amount, symbol_short!("sngl_lmt")),
            );
            return Err(WatchdogError::SinglePaymentLimitExceeded);
        }

        let now: u64 = env.ledger().timestamp();

        let mut state: AgentState = env
            .storage()
            .persistent()
            .get(&agent)
            .unwrap_or(AgentState {
                cumulative_24h: 0,
                day_start: now,
            });

        // Reset 24h window if expired
        if now >= state.day_start + 86400 {
            state.cumulative_24h = 0;
            state.day_start = now;
        }

        // Rule 2: daily budget ceiling
        if state.cumulative_24h + amount > DAILY_BUDGET {
            env.events().publish(
                (symbol_short!("watchdog"), symbol_short!("blocked")),
                (agent, amount, symbol_short!("day_cap")),
            );
            return Err(WatchdogError::DailyBudgetExceeded);
        }

        state.cumulative_24h += amount;
        env.storage().persistent().set(&agent, &state);

        env.events().publish(
            (symbol_short!("watchdog"), symbol_short!("approved")),
            (agent, amount, state.cumulative_24h),
        );

        Ok(true)
    }
}

mod test;
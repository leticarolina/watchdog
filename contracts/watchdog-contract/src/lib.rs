//! # Watchdog
//! **Author:** Leticia Azevedo ([git](https://github.com/leticarolina))
//!
//! Watchdog is a behavioral risk layer for autonomous agent payments on Stellar.
//! Acts between an agent and the payment execution, watching for spending behavior before XLM moves on-chain.
//!
//! ## Rules
//! Every `request_payment` call is evaluated against two behavioral rules:
//! 1. **Single Payment Limit** — no single payment may exceed the configured limit
//! 2. **Daily Budget Cap** — cumulative spend per agent may not exceed the daily budget in a 24h window
//!
//! ## Configuration
//! Limits are set by the owner at deploy time via `initialize()` and can be updated anytime via `set_limits()`

#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env};

/// Storage keys for contract instance storage
#[contracttype]
pub enum ConfigKey {
    Owner,
    MaxSinglePayment,
    DailyBudget,
}

/// Errors returned by the Watchdog contract
#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum WatchdogError {
    SinglePaymentLimitExceeded = 1,
    DailyBudgetExceeded = 2,
    NotInitialized = 3,
    Unauthorized = 4,
    AlreadyInitialized = 5,
}

/// Per-agent spending state stored in persistent storage
/// Equivalent to mapping(address => AgentState) in Solidity
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentState {
    pub cumulative_24h: i128,
    pub day_start: u64,
}

#[contract]
pub struct WatchdogContract;

#[contractimpl]
impl WatchdogContract {
    /// Initialize the contract with owner and spending limits.
    /// Equivalent to constructor() in Solidity.
    ///
    /// # Arguments
    /// * `owner` - Address that can update limits (= msg.sender in constructor)
    /// * `max_single_payment` - Max allowed per single payment in stroops
    /// * `daily_budget` - Max cumulative spend per agent per 24h in stroops
    pub fn initialize(
        env: Env,
        owner: Address,
        max_single_payment: i128,
        daily_budget: i128,
    ) -> Result<(), WatchdogError> {
        if env.storage().instance().has(&ConfigKey::Owner) {
            return Err(WatchdogError::AlreadyInitialized);
        }

        owner.require_auth();

        env.storage().instance().set(&ConfigKey::Owner, &owner);
        env.storage().instance().set(&ConfigKey::MaxSinglePayment, &max_single_payment);
        env.storage().instance().set(&ConfigKey::DailyBudget, &daily_budget);

        Ok(())
    }

    /// Update spending limits. Only callable by owner.
    /// Equivalent to onlyOwner modifier in Solidity.
    ///
    /// # Arguments
    /// * `caller` - Must match stored owner address
    /// * `max_single_payment` - New single payment limit in stroops
    /// * `daily_budget` - New daily budget in stroops
    pub fn set_limits(
        env: Env,
        caller: Address,
        max_single_payment: i128,
        daily_budget: i128,
    ) -> Result<(), WatchdogError> {
        caller.require_auth();

        let owner: Address = env
            .storage()
            .instance()
            .get(&ConfigKey::Owner)
            .ok_or(WatchdogError::NotInitialized)?;

        if caller != owner {
            return Err(WatchdogError::Unauthorized);
        }

        env.storage().instance().set(&ConfigKey::MaxSinglePayment, &max_single_payment);
        env.storage().instance().set(&ConfigKey::DailyBudget, &daily_budget);

        Ok(())
    }

    /// Returns current spending limits.
    pub fn get_limits(env: Env) -> Result<(i128, i128), WatchdogError> {
        let max: i128 = env
            .storage()
            .instance()
            .get(&ConfigKey::MaxSinglePayment)
            .ok_or(WatchdogError::NotInitialized)?;

        let budget: i128 = env
            .storage()
            .instance()
            .get(&ConfigKey::DailyBudget)
            .ok_or(WatchdogError::NotInitialized)?;

        Ok((max, budget))
    }

    /// Returns current per-agent state.
    /// If the agent has no stored state yet, returns a zeroed state.
    pub fn get_agent_state(env: Env, agent: Address) -> AgentState {
        env.storage().persistent().get(&agent).unwrap_or(AgentState {
            cumulative_24h: 0,
            day_start: 0,
        })
    }

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
    /// * `NotInitialized` - contract not initialized yet
    /// * `SinglePaymentLimitExceeded` - amount > max_single_payment
    /// * `DailyBudgetExceeded` - cumulative_24h + amount > daily_budget
    pub fn request_payment(env: Env, agent: Address, amount: i128) -> Result<bool, WatchdogError> {
        let max_single: i128 = env
            .storage()
            .instance()
            .get(&ConfigKey::MaxSinglePayment)
            .ok_or(WatchdogError::NotInitialized)?;

        let daily_budget: i128 = env
            .storage()
            .instance()
            .get(&ConfigKey::DailyBudget)
            .ok_or(WatchdogError::NotInitialized)?;

        // Rule 1: single payment ceiling
        if amount > max_single {
            env.events().publish(
                (symbol_short!("watchdog"), symbol_short!("blocked")),
                (agent.clone(), amount, symbol_short!("sngl_lmt")),
            );
            return Err(WatchdogError::SinglePaymentLimitExceeded);
        }

        let now: u64 = env.ledger().timestamp();

        let mut state: AgentState = env.storage().persistent().get(&agent).unwrap_or(AgentState {
            cumulative_24h: 0,
            day_start: now,
        });

        // Reset 24h window if expired
        if now >= state.day_start + 86400 {
            state.cumulative_24h = 0;
            state.day_start = now;
        }

        // Rule 2: daily budget ceiling
        if state.cumulative_24h + amount > daily_budget {
            env.events().publish(
                (symbol_short!("watchdog"), symbol_short!("blocked")),
                (agent.clone(), amount, symbol_short!("day_cap"), state.day_start),
            );
            return Err(WatchdogError::DailyBudgetExceeded);
        }

        state.cumulative_24h += amount;
        env.storage().persistent().set(&agent, &state);

        env.events().publish(
            (symbol_short!("watchdog"), symbol_short!("approved")),
            (agent, amount, state.cumulative_24h, state.day_start),
        );

        Ok(true)
    }
}

mod test;
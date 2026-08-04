//! # Watchdog
//! **Author:** Leticia Azevedo ([git](https://github.com/leticarolina))
//!
//! Watchdog is a custody-based spending enforcement layer for autonomous
//! agent payments on Stellar. The contract itself holds funds and is the only party
//! that can move them out, an agent can only *propose* a payment via `request_payment`,
//! it never holds or directly transfers the funds it spends.
//!
//! ## Rules evaluated on every `request_payment` call, in order
//! 1. **Amount validity** — amount must be positive
//! 2. **Pause check** — no payments execute while the owner has paused the contract
//! 3. **Single payment ceiling** — no single payment may exceed `max_single_payment`
//! 4. **Rolling budget cap** — cumulative spend per agent may not exceed
//! within the current window.
//! 5. **Recipient allowlist** — funds may only be paid to owner-approved addresses
//! 6. **Solvency** — the contract must hold enough XLM to cover the payout
//!
//! If all checks pass, the contract transfers `amount` of XLM to `recipient` 
//!
//! ## Configuration
//! Owner, limits, token, and window are set once via `initialize()`. Limits, window,
//! allowlist entries, and pause state are all updatable afterward via their
//! respective `set_*` owner-only functions.

#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env,
};

/// Storage keys for contract instance storage
#[contracttype]
pub enum ConfigKey {
    Owner,
    MaxSinglePayment,
    BudgetCap,
    Token,
    WindowSeconds,
    Paused,
}

/// Storage key wrapper for the recipient allowlist, kept distinct from
/// AgentState (keyed directly by agent Address) in persistent storage.
/// Equivalent to mapping(address => bool) allowlist in Solidity.
#[contracttype]
pub enum AllowlistKey {
    Recipient(Address),
}

/// Errors returned by the Watchdog contract
#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum WatchdogError {
    SinglePaymentLimitExceeded = 1,
    BudgetCapExceeded = 2,
    NotInitialized = 3,
    Unauthorized = 4,
    AlreadyInitialized = 5,
    InsufficientVaultBalance = 6,
    RecipientNotAllowed = 7,
    ContractPaused = 8,
    InvalidAmount = 9,
}

/// Per-agent spending state stored in persistent storage
/// Equivalent to mapping(address => AgentState) in Solidity
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentState {
    pub cumulative_spent: i128,
    pub window_start: u64,
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
    /// * `budget_cap` - Max cumulative spend per agent within the configured window, in stroops
    /// * `token` - Address of the XLM Stellar Asset Contract (SAC) the vault holds
    /// * `window_seconds` - Length of the rolling budget window in seconds
    pub fn initialize(
        env: Env,
        owner: Address,
        max_single_payment: i128,
        budget_cap: i128,
        token: Address,
        window_seconds: u64,
    ) -> Result<(), WatchdogError> {
        if env.storage().instance().has(&ConfigKey::Owner) {
            return Err(WatchdogError::AlreadyInitialized);
        }

        owner.require_auth();

        env.storage().instance().set(&ConfigKey::Owner, &owner);
        env.storage().instance().set(&ConfigKey::MaxSinglePayment, &max_single_payment);
        env.storage().instance().set(&ConfigKey::BudgetCap, &budget_cap);
        env.storage().instance().set(&ConfigKey::Token, &token);
        env.storage().instance().set(&ConfigKey::WindowSeconds, &window_seconds);

        Ok(())
    }

    /// Update spending limits. Only callable by owner.
    /// Equivalent to onlyOwner modifier in Solidity.
    ///
    /// # Arguments
    /// * `caller` - Must match stored owner address
    /// * `max_single_payment` - New single payment limit in stroops
    /// * `budget_cap` - New budget cap in stroops
    pub fn set_limits(
        env: Env,
        caller: Address,
        max_single_payment: i128,
        budget_cap: i128,
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
        env.storage().instance().set(&ConfigKey::BudgetCap, &budget_cap);

        Ok(())
    }

    /// Update the rolling budget window length. Only callable by owner.
    /// Equivalent to onlyOwner modifier in Solidity.
    ///
    /// # Arguments
    /// * `caller` - Must match stored owner address
    /// * `window_seconds` - New window length in seconds
    pub fn set_window(env: Env, caller: Address, window_seconds: u64) -> Result<(), WatchdogError> {
        caller.require_auth();

        let owner: Address = env
            .storage()
            .instance()
            .get(&ConfigKey::Owner)
            .ok_or(WatchdogError::NotInitialized)?;

        if caller != owner {
            return Err(WatchdogError::Unauthorized);
        }

        env.storage().instance().set(&ConfigKey::WindowSeconds, &window_seconds);

        Ok(())
    }

    /// Adds or removes a recipient from the payout allowlist. Only callable by owner.
    /// Equivalent to onlyOwner modifier in Solidity.
    ///
    /// # Arguments
    /// * `caller` - Must match stored owner address
    /// * `recipient` - Address to toggle
    /// * `allowed` - Whether `recipient` may receive payments
    pub fn set_allowlist(
        env: Env,
        caller: Address,
        recipient: Address,
        allowed: bool,
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

        env.storage()
            .persistent()
            .set(&AllowlistKey::Recipient(recipient), &allowed);

        Ok(())
    }

    /// Pauses or unpauses outgoing payments. Only callable by owner.
    /// Equivalent to onlyOwner modifier in Solidity.
    ///
    /// # Arguments
    /// * `caller` - Must match stored owner address
    /// * `paused` - Whether request_payment should be frozen
    pub fn set_paused(env: Env, caller: Address, paused: bool) -> Result<(), WatchdogError> {
        caller.require_auth();

        let owner: Address = env
            .storage()
            .instance()
            .get(&ConfigKey::Owner)
            .ok_or(WatchdogError::NotInitialized)?;

        if caller != owner {
            return Err(WatchdogError::Unauthorized);
        }

        env.storage().instance().set(&ConfigKey::Paused, &paused);

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
            .get(&ConfigKey::BudgetCap)
            .ok_or(WatchdogError::NotInitialized)?;

        Ok((max, budget))
    }

    /// Returns current limits plus the rolling budget window length.
    pub fn get_config(env: Env) -> Result<(i128, i128, u64), WatchdogError> {
        let max: i128 = env
            .storage()
            .instance()
            .get(&ConfigKey::MaxSinglePayment)
            .ok_or(WatchdogError::NotInitialized)?;

        let budget: i128 = env
            .storage()
            .instance()
            .get(&ConfigKey::BudgetCap)
            .ok_or(WatchdogError::NotInitialized)?;

        let window_seconds: u64 = env
            .storage()
            .instance()
            .get(&ConfigKey::WindowSeconds)
            .ok_or(WatchdogError::NotInitialized)?;

        Ok((max, budget, window_seconds))
    }

    /// Returns whether `recipient` is allowed to receive payments.
    /// Any recipient never explicitly added returns false.
    pub fn is_allowed(env: Env, recipient: Address) -> bool {
        env.storage()
            .persistent()
            .get(&AllowlistKey::Recipient(recipient))
            .unwrap_or(false)
    }

    /// Returns whether outgoing payments are currently paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&ConfigKey::Paused).unwrap_or(false)
    }

    /// Returns current per-agent state.
    /// If the agent has no stored state yet, returns a zeroed state.
    pub fn get_agent_state(env: Env, agent: Address) -> AgentState {
        env.storage().persistent().get(&agent).unwrap_or(AgentState {
            cumulative_spent: 0,
            window_start: 0,
        })
    }

    /// Deposits XLM into the contract's own balance via the SAC transfer.
    /// Equivalent to a `deposit()` payable function pulling funds with `transferFrom` in Solidity.
    ///
    /// # Arguments
    /// * `from` - Address funding the vault (must authorize the transfer)
    /// * `amount` - Amount in stroops to deposit
    ///
    /// Deliberately not gated by is_paused(): the owner should still be able to
    /// fund/manage the vault while paused — only outgoing payments freeze.
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<(), WatchdogError> {
        if amount <= 0 {
            return Err(WatchdogError::InvalidAmount);
        }

        from.require_auth();

        let token_client = token::Client::new(&env, &Self::xlm_sac(&env));
        token_client.transfer(&from, &env.current_contract_address(), &amount);

        Ok(())
    }

    /// Returns the contract's current XLM balance held in the vault.
    pub fn get_balance(env: Env) -> i128 {
        let token_client = token::Client::new(&env, &Self::xlm_sac(&env));
        token_client.balance(&env.current_contract_address())
    }

    /// Resolves the XLM SAC token address configured at initialize().
    fn xlm_sac(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&ConfigKey::Token)
            .expect("token not initialized")
    }

    /// Evaluates whether an agent payment is within behavioral limits, and if
    /// approved, has the contract itself transfer the funds to the recipient.
    ///
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `agent` - Address of the agent requesting payment (must authorize the request)
    /// * `recipient` - Address that receives the XLM
    /// * `amount` - Payment amount in stroops (1 XLM = 10_000_000)
    ///
    /// # Returns
    /// * `Ok(true)` if payment is approved, state is updated, and funds transferred
    ///
    /// # Errors
    /// * `NotInitialized` - contract not initialized yet
    /// * `SinglePaymentLimitExceeded` - amount > max_single_payment
    /// * `BudgetCapExceeded` - cumulative_spent + amount > budget_cap
    /// * `RecipientNotAllowed` - recipient is not on the payout allowlist
    /// * `InsufficientVaultBalance` - contract does not hold enough XLM to pay out
    /// * `ContractPaused` - owner has frozen outgoing payments
    /// * `InvalidAmount` - amount is zero or negative
    pub fn request_payment(
        env: Env,
        agent: Address,
        recipient: Address,
        amount: i128,
    ) -> Result<bool, WatchdogError> {
        if amount <= 0 {
            return Err(WatchdogError::InvalidAmount);
        }

        if env.storage().instance().get(&ConfigKey::Paused).unwrap_or(false) {
            return Err(WatchdogError::ContractPaused);
        }

        agent.require_auth();

        let max_single: i128 = env
            .storage()
            .instance()
            .get(&ConfigKey::MaxSinglePayment)
            .ok_or(WatchdogError::NotInitialized)?;

        let budget_cap: i128 = env
            .storage()
            .instance()
            .get(&ConfigKey::BudgetCap)
            .ok_or(WatchdogError::NotInitialized)?;

        let window_seconds: u64 = env
            .storage()
            .instance()
            .get(&ConfigKey::WindowSeconds)
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
            cumulative_spent: 0,
            window_start: now,
        });

        // Reset window if expired
        if now >= state.window_start + window_seconds {
            state.cumulative_spent = 0;
            state.window_start = now;
        }

        // Rule 2: budget cap ceiling
        if state.cumulative_spent + amount > budget_cap {
            env.events().publish(
                (symbol_short!("watchdog"), symbol_short!("blocked")),
                (agent.clone(), amount, symbol_short!("win_cap"), state.window_start),
            );
            return Err(WatchdogError::BudgetCapExceeded);
        }

        // Rule 3: recipient must be allowlisted
        let allowed: bool = env
            .storage()
            .persistent()
            .get(&AllowlistKey::Recipient(recipient.clone()))
            .unwrap_or(false);
        if !allowed {
            env.events().publish(
                (symbol_short!("watchdog"), symbol_short!("blocked")),
                (agent.clone(), amount, symbol_short!("not_allow")),
            );
            return Err(WatchdogError::RecipientNotAllowed);
        }

        let token_client = token::Client::new(&env, &Self::xlm_sac(&env));
        let contract_address = env.current_contract_address();

        if token_client.balance(&contract_address) < amount {
            return Err(WatchdogError::InsufficientVaultBalance);
        }

        state.cumulative_spent += amount;
        env.storage().persistent().set(&agent, &state);

        token_client.transfer(&contract_address, &recipient, &amount);

        env.events().publish(
            (symbol_short!("watchdog"), symbol_short!("approved")),
            (agent, amount, state.cumulative_spent, state.window_start),
        );

        Ok(true)
    }
}

mod test;
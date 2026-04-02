#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, contracterror, Address, Env};

// EVM equivalent: uint256 constant MAX_SINGLE_PAYMENT = 300_000_000;
const MAX_SINGLE_PAYMENT: i128 = 20_000_000; // 2 XLM (1 XLM = 10_000_000 stroops)
const DAILY_BUDGET: i128 = 40_000_000;        // 4 XLM

// EVM equivalent: error SinglePaymentLimitExceeded(); error DailyBudgetExceeded();
#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum WatchdogError {
    SinglePaymentLimitExceeded = 1,
    DailyBudgetExceeded = 2,
}

// EVM equivalent: struct AgentState { int256 cumulative_24h; uint256 day_start; }
// stored in mapping(address => AgentState)
#[contracttype]
pub struct AgentState {
    pub cumulative_24h: i128,
    pub day_start: u64,
}

// EVM equivalent: contract WatchdogContract { ... }
#[contract]
pub struct WatchdogContract;

#[contractimpl]
impl WatchdogContract {
    // EVM equivalent:
    // function requestPayment(address agent, int256 amount) external returns (bool)
    pub fn request_payment(env: Env, agent: Address, amount: i128) -> Result<bool, WatchdogError> {
        // Rule 1: absolute per-transaction ceiling
        // EVM equivalent: require(amount <= MAX_SINGLE_PAYMENT, "SinglePaymentLimitExceeded")
        if amount > MAX_SINGLE_PAYMENT {
            return Err(WatchdogError::SinglePaymentLimitExceeded);
        }

        // EVM equivalent: block.timestamp
        let now: u64 = env.ledger().timestamp();

        // Load per-agent state from persistent storage
        // EVM equivalent: AgentState storage state = agentStates[agent];
        let mut state: AgentState = env
            .storage()
            .persistent()
            .get(&agent)
            .unwrap_or(AgentState {
                cumulative_24h: 0,
                day_start: now,
            });

        // Reset 24h window if it has expired
        if now >= state.day_start + 86400 {
            state.cumulative_24h = 0;
            state.day_start = now;
        }

        // Rule 2: cumulative daily ceiling
        // EVM equivalent: require(state.cumulative_24h + amount <= DAILY_BUDGET, "DailyBudgetExceeded")
        if state.cumulative_24h + amount > DAILY_BUDGET {
            return Err(WatchdogError::DailyBudgetExceeded);
        }

        state.cumulative_24h += amount;
        env.storage().persistent().set(&agent, &state);

        Ok(true)
    }
}

mod test;

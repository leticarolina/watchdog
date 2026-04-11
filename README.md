<h1>Watchdog<img alt="logo" src="frontend/public/watchdog.png" height="32" style="vertical-align:middle;" /></h1>

A spending safety layer for AI agents, so they can pay for things autonomously without going off the rails.

- [Live Site](https://watchdog-agent.vercel.app)
- [Contract](https://stellar.expert/explorer/testnet/contract/CDK4XFYOHDCJTRXNM4I56ZYUEVLQIRLRLOT7R6XRRYSGPBTGXXSB7DVH)
- [Demo Video](https://www.youtube.com/watch?v=KBViqt0M3Yg&t=13s)

---

## The Problem

AI agents can now hold wallets and spend money on their own with no human approval required. That's powerful but it's also risky. An agent that gets compromised, hallucinates a cost, or hits an infinite loop can drain a wallet before anyone notices. There's no chargeback.

Web2 spending limits live in a database. But agents control their own keys so a database is just a suggestion they can route around. We need safety rails the agent itself cannot override. Watchdog puts these rules on-chain.

---

## What Watchdog Does

Watchdog is a Soroban smart contract that acts between an AI agent and the payment execution. Before any XLM moves on-chain, the contract evaluates the agent's spending behavior against two rules. If the payment is safe, it's approved. If not, it's blocked and the reason is returned.

Every decision is enforced on-chain, not in a server. The agent cannot negotiate with the contract.

---

## How It Works

1. User triggers agent → Agent requests paid service via x402 protocol.
2. Server issues 402 Payment Required challenge
3. Watchdog contract evaluates 2 rules (simulateTransaction) and decides.
4. **APPROVED** — MPP SDK executes real XLM payment → server returns data + two TX hashes
5. **BLOCKED** — no payment executed → reason returned: `SinglePaymentLimitExceeded` or `DailyBudgetExceeded`

Every approved payment produces two verifiable transactions on Stellar Explorer. One for the XLM transfer, one for the Watchdog contract call.

---

## The 2 Rules

**Rule 1 — Single Payment Limit**
No single payment can exceed the configured maximum. If an agent suddenly tries to spend 50 XLM on one request when it normally spends 2, that's possibly hijacked agent, runaway loop, or misconfigured call. Blocked immediately.

**Rule 2 — Daily Budget Cap**
Cumulative spend per agent resets every 24 hours. Even if every individual payment looks safe, Watchdog tracks the running total. A compromised agent making 100 small payments still hits the wall.

The 24h window resets automatically per agent based on ledger timestamp.

> A velocity/cooldown rule was considered and rejected — legitimate agents may request data rapidly and a hard cooldown would break normal usage. For now 2 rules and no false positives.

---

## Why On-Chain?

- **Tamper-proof.** Limits live in a Soroban contract, not a database you can update with a SQL query. The agent cannot override them; neither can a compromised backend.
- **No intermediary.** Agents pay directly from their wallet - no bank, no Stripe, no payment processor. The only thing between the agent and the ledger is the contract.
- **Composable.** Any agent on Stellar can call `request_payment`. Watchdog is a primitive, not a product so any developer can build on top of it.
- **Auditable.** Every approval emits an on-chain event (`watchdog/approved`). The full spending history of any agent is verifiable by anyone.

---

## Tech Stack

| Layer | Technology |
| ------- | ----------- |
| Smart contract | Rust / Soroban SDK |
| Contract testing | Soroban test environment |
| Backend server | TypeScript / Express v5 |
| Payment protocol | [x402](https://x402.org) + MPP SDK (`@stellar/mpp`) |
| Frontend | React + Vite + Tailwind CSS |
| Network | Stellar testnet |
| Native asset | XLM via Stellar Asset Contract (SAC) |

---

## Smart Contract

**Contract ID:** [`CDK4XFYOHDCJTRXNM4I56ZYUEVLQIRLRLOT7R6XRRYSGPBTGXXSB7DVH`](https://stellar.expert/explorer/testnet/contract/CDK4XFYOHDCJTRXNM4I56ZYUEVLQIRLRLOT7R6XRRYSGPBTGXXSB7DVH)
**Network:** Stellar testnet

### Functions

| Function | Access | Description |
| ---------- | -------- | ------------- |
| `initialize(owner, max_single_payment, daily_budget)` | Owner (once) | Deploy-time setup + sets limits and owner address |
| `request_payment(agent, amount)` | Public | Evaluates rules, updates state, emits event |
| `set_limits(caller, max_single_payment, daily_budget)` | Owner only | Update limits post-deploy |
| `get_limits()` | Public (read) | Returns current `(max_single_payment, daily_budget)` |
| `get_agent_state(agent)` | Public (read) | Returns `{ cumulative_24h, day_start }` for any agent |

### Events

- `(watchdog, approved)` — `(agent, amount, cumulative_24h, day_start)`
- `(watchdog, blocked)` — `(agent, amount, reason, [day_start])`

### Current Limits (configurable via `set_limits`)

- `MAX_SINGLE_PAYMENT = 6 XLM` (60_000_000 stroops)
- `DAILY_BUDGET = 10 XLM` (100_000_000 stroops)

### Tests (12 passing)

```bash
test_happy_path
test_single_payment_limit_exceeded
test_daily_budget_exceeded
test_time_reset_24h_window
test_owner_can_update_limits
test_non_owner_cannot_update_limits
test_cannot_initialize_twice
test_malicious_agent_drain_attempt_blocked
test_normal_vs_malicious_agent_behavior
test_get_agent_state_default_zero
test_get_agent_state_updates_after_payment
test_get_agent_state_after_24h_reset
```

---

## Demo

The live demo at [watchdog website](https://watchdog-agent.vercel.app) runs against a real TypeScript server on the backend, making real XLM payments on Stellar testnet.

**Demo limits:** 6 XLM max single payment · 10 XLM daily budget per agent

| Button | What happens |
| -------- | ------------- |
| **Basic Data** | Sends 3 XLM → approved → real XLM moves on-chain |
| **Expensive Data** | Tries 7 XLM → exceeds 6 XLM single limit → `SinglePaymentLimitExceeded` |
| **Drain Attempt** | Auto-fires basic requests until the 10 XLM daily cap is exhausted → `DailyBudgetExceeded` |
| **Reset Demo** | Rotates to the next agent in the pool (fresh 24h window) |

Each approved transaction links to two Stellar Explorer entries — the XLM transfer and the Watchdog contract invocation.

---

## Design Decisions

- **Global limits, not per-agent (v1).** For a demo and v1, one shared policy that applies to all agents. Per-agent limits are the v2 upgrade.

- **2 rules, not 3.** Velocity (rate limiting) was evaluated and cut. At agent inference speeds, the time between requests is already a natural throttle. Adding a third rule increases contract surface area without proportional security benefit.

- **Configurable limits, not hardcoded.** `set_limits` exists so the owner can adjust thresholds post-deploy without redeploying the contract. This is critical for production use where risk tolerance changes over time.

- **Lazy 24h reset.** The contract resets an agent's window on the first `request_payment` call after the window expires — no scheduled task, no cron, no keeper. The Soroban ledger timestamp is the only clock.

---

## Roadmap to Mainnet deployment

- **Per-agent configurable limits** — each agent sets its own risk parameters
- **Multi-token support** — USDC, AQUA, any Stellar asset
- **Agent reputation scoring** — on-chain track record influences allowed limits
- **npm SDK** — `npm install @watchdog/stellar` → The goal is to make watchdog possible to integrate in any agent. The SDK will handle all the x402 payment flow, contract calls, and event parsing so agent developers can adopt watchdog without needing to understand Soroban or Stellar primitives.

---

## Why This Matters

The agent economy is already here. Agents are buying API calls, spinning up compute, and transacting on-chain today. Every one of them needs a spending policy that is enforceable, auditable, and tamper-proof.

Watchdog is that primitive. The same way ERC-20 `approve` patterns let protocols spend on your behalf safely, Watchdog gives agent developers a standard, composable safety layer they can adopt without building it themselves.

---

## Origin

I built LockFi, a security vault that watches for suspicious withdrawal patterns in DeFi and delays them before funds leave.

After building it I kept thinking: this problem isn't unique to DeFi vaults. Anywhere money moves autonomously, you need a behavioral layer watching it.

Agents are the next version of that problem. They have wallets. They spend. Nobody's watching. Watchdog is LockFi's insight applied to the agent economy.

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/leticarolina/watchdog
cd watchdog && cp agent/.env.example agent/.env
# Fill in STELLAR_SECRET_KEY and AGENT_POOL in agent/.env

# 2. Start the backend
cd agent && npm install && npm run dev

# 3. Start the frontend
cd frontend && npm install && npm run dev
```

The frontend connects to the backend at `http://localhost:3000` by default. Set `VITE_API_URL` to point at a deployed backend.

---

## Author

**Leticia Azevedo** — Blockchain Developer

- Twitter/X: [@letiweb3](https://x.com/letiweb3)
- LockFi: [github.com/leticarolina/lock-fi](https://github.com/leticarolina/lock-fi)

Built for the Stellar Agents Hackathon 2026.

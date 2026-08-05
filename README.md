<h1><img alt="logo" src="frontend/public/watchdog.png" height="36" style="vertical-align:middle;" /> Watchdog</h1>

**On-chain spending guardrails for autonomous agent payments.**

Enforcement that lives in the contract holding the funds, not in a database attackers could bypass.

- [Live Site](https://watchdog-agent.vercel.app)
- [Contract](https://stellar.expert/explorer/testnet/contract/CBA2LXX3FZ5TN5HHVGSJ47AUF3ZCLS6NG6AKE2ZZEHC5LEJQLJU6RBT2)
- [Demo Video](https://www.link.com) <!-- update once recorded -->

---

## The problem

AI agents are starting to hold wallets and spend real money autonomously. Every current approach to keeping that spending in check (Cloudflare's newly-launched Wallets product, Coinbase's CDP, most agent-wallet providers) enforces limits at the **wallet or API layer**: an off-chain service checks a policy before letting a payment through. That's the same trust model as a database. If the service is compromised, misconfigured, or has a bug, the money moves anyway.

**Watchdog's answer: if the payment is happening on-chain, the enforcement should happen on-chain too.**

---

## What Watchdog Does

Watchdog is a Soroban smart contract that **holds the funds directly**, like a vault. The owner deposits XLM into it ahead of time. An agent never holds or directly moves the money it's spending, it can only call `request_payment`, proposing a payment. The contract checks that proposal against a set of rules, and if it passes, **the contract itself** executes the transfer to the recipient, in the same transaction.

Because the agent never holds the funds, there's no bypass path. A compromised agent key can, at worst, spend up to whatever the owner already configured, it can't raise limits, add new receivers or touch the vault balance directly. Those require the **owner's** key, a separate keypair with separate authorization checks.

---

## How It Works

```bash
 1. Owner deposits XLM into Watchdog vault
                    
 2. Agent calls request_payment(recipient, amount)
                    
 3. Contract checks, in order:
    • amount valid?
    • not paused?
    • under single-payment ceiling?
    • under budget cap?
    • recipient allowlisted?
    • vault balance sufficient?
                    │
         ┌──────────┴──────────┐
         │                     │
    ALL PASS               ANY FAILS
         │                     │
   Contract transfers      Request rejected
   XLM to recipient        No funds move
   (same transaction)      Reason returned on-chain
```

---

## The six rules

Every `request_payment` call is checked against all of these before any funds move:

| # | Rule | What it prevents |
| --- | ------ | ------------------- |
| 1 | **Amount validity** | Zero or negative amounts |
| 2 | **Pause check** | All outgoing payments frozen if the owner pauses the contract |
| 3 | **Single-payment ceiling** | No individual payment exceeds a configured max |
| 4 | **Budget cap (configurable window)** | Cumulative spend per agent capped within a rolling window the owner sets (e.g. 24h) |
| 5 | **Recipient allowlist** | Funds can only go to owner-approved addresses, even a fully hijacked agent can't pay an arbitrary address |
| 6 | **Vault solvency** | Contract can't promise money it doesn't hold |

Rules 1–4 alone are things a well-built database could also enforce. Rules 5 and 6, and the custody model itself (funds physically held by the contract), are what make this **structurally** unbypassable, an off-chain policy is only as strong as the service enforcing it.

> A velocity/cooldown rule was considered and rejected, legitimate agents may make requests rapidly and a hard cooldown would break normal usage without a reliable way to distinguish it from an attack on-chain.

---

## Why On-Chain

- **Tamper-proof.** Limits live in a Soroban contract, not a database updatable with a query. Neither the agent nor a compromised backend can override them.
- **No intermediary.** The contract itself executes the payout, no separate payment processor, no off-chain settlement step that enforcement could be skipped around.
- **Composable.** Any agent on Stellar can call `request_payment`. Watchdog is a primitive, not a closed product.
- **Auditable.** Every approval and block emits an on-chain event. The full spending history of any agent is verifiable by anyone.

---

## A SDK limitation I hit (and how I handled it)

Stellar's MPP SDK (`@stellar/mpp`) implements 402-style negotiation, but its `stellar.charge()` settlement method only supports a **plain wallet-to-wallet SAC transfer**, it has no way to settle by calling a custom contract function.

That's a mismatch with the custody model: Watchdog's guarantee depends on settlement going *through* the contract, not around it.

**What I built instead:** Kept the 402 negotiation shape (challenge → signed credential → settlement receipt) and replaced the settlement mechanism with a direct call to `request_payment`. The contract's transfer *is* the payment.

That's not a flaw in x402/MPP, it's specific to custody-style architectures, where settlement has to route through a stateful contract rather than a stateless transfer. Worth flagging for anyone else building enforcement-heavy agent payment systems on Stellar.

---

## Tech Stack

| Layer | Technology |
| ------- | ----------- |
| Smart contract | Rust / Soroban SDK |
| Contract testing | Soroban test environment (mock SAC via `register_stellar_asset_contract_v2`) |
| Backend server | TypeScript / Express v5 |
| Payment protocol | [x402](https://x402.org)-style negotiation + custom custody settlement |
| Frontend | React + Vite + Tailwind CSS |
| Network | Stellar testnet |
| Native asset | XLM via Stellar Asset Contract (SAC) |

---

## Design Decisions

- **Custody, not advisory.** Early versions of this idea (and most agent-wallet spending controls today) only *check* rules and let something else move the money. Watchdog holds the funds itself, so the check and the transfer can't be separated or skipped.
- **Configurable, not hardcoded.** `set_limits`, `set_window`, `set_allowlist`, and `set_paused` all exist so the owner can adjust risk parameters post-deploy without redeploying the contract.
- **Lazy window reset.** The contract resets an agent's budget window on the first `request_payment` call after it expires. The Soroban ledger timestamp is the only clock.
- Similar spending-guardrail concepts exist in the Stellar ecosystem. Watchdog's distinction is the custody model: funds are held and released by the contract itself, not just checked by a policy contract.

---

## What's built vs. what's roadmap

**Built, tested, live on Stellar testnet:**

- Custody vault (deposit, balance tracking, contract-executed payouts)
- All six rules above
- Configurable owner controls: limits, budget window, allowlist, emergency pause
- Full backend integration: 402 negotiation → signed request → on-chain settlement
- Demo dashboard showing live approved/blocked flows with real transaction hashes

**Known limitation, by design:** the vault requires a one-time deposit step. Funds sit in the contract, not in the agent's own wallet. This is what makes the enforcement real, but it's also friction.

**Roadmap > smart-account model:** move enforcement into the agent's own wallet via a custom Soroban account contract (`__check_auth`), so the wallet itself won't sign a transaction unless Watchdog's rules pass, no deposit step required, funds never leave the agent's own custody.

**A second direction exploring alongside it:** muxed accounts (SEP-23), which let a single owner-controlled Stellar account represent many virtual agent sub-identities without creating a separate on-chain account — and separate deposit — for each one. Muxed accounts alone don't provide rule enforcement (that still needs to live in a smart-account's `__check_auth` or similar mechanism), but combined with the smart-account model, they could let one deployment support many agents cleanly, without today's per-agent vault-funding overhead.

---

## Why This Matters

The agent economy is already live and evolving, agents are buying API calls, spinning up compute, transacting on-chain today. Every one of them needs a spending policy that's enforceable and auditable, not just configured. The same way ERC-20's `approve` pattern let protocols spend on a user's behalf safely, Watchdog is a standard, composable safety primitive agent developers could adopt instead of building their own, and building their own, per the current state of the ecosystem, usually means another off-chain policy service with the same trust gap this project exists to close.

## Origin

I built LockFi, a self-custody vault on EVM that detects suspicious withdrawal patterns and delays them before funds leave (1st place, Monad Hackathon). Watchdog applies the same core insight — funds checked before release — to autonomous agent payments on Stellar.

## Architecture

```bash
watchdog-agent/
├── contract/                  ← Soroban smart contract
│   └── src/
│       ├── lib.rs             ← contract logic: custody, rules, events
│       └── test.rs            ← 24 tests covering every rule + edge cases
├── agent/                     ← TypeScript backend
│   └── src/
│       ├── contract.ts        ← Stellar SDK client (simulate/execute request_payment)
│       ├── server.ts          ← Express routes, x402-style negotiation
│       ├── middleware/payment.ts  ← 402 challenge + custody settlement
│       └── client.ts          ← internal fetch wrapper for demo routes
└── frontend/                  ← React/Vite dashboard
    └── src/
        ├── App.tsx
        └── components/        ← AgentPanel, TxFeed, ContractState
```

---

## Quick Start

```bash
# Contract
cd contract && cargo test          # run the 24-test suite

# Backend
cd agent && npm install && npm run start

# Frontend
cd frontend && npm install && npm run dev
```

The dashboard demonstrates all six rules live: a normal payment approving, a payment exceeding the single-payment ceiling, a drain attempt hitting the budget cap, a payment to a non-allowlisted recipient being blocked, and an emergency pause halting all payments, each with a real Stellar testnet transaction hash you can verify independently.

---

## Author

Leticia Azevedo — [letiazevedo.com](https://www.letiazevedo.com)

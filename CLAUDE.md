# Watchdog — Claude Context

## What This Project Is

Behavioral risk layer for autonomous agent payments on Stellar.
Agent pays for analysis via x402 → Watchdog Soroban contract evaluates 2 rules → approves or blocks → real XLM tx on testnet.

## Project Structure

- `contracts/watchdog-contract/` — Soroban/Rust smart contract (Phase 1 ✅ complete)
- `agent/` — TypeScript Express v5 server + mock analysis API (Phase 2)
- `frontend/` — React/Next.js UI (Phase 3)

## Contract

- Deployed: `CDVNQCBS26ATIJ7FBQZTPV4UDFLCM2TKZ4E77ONRXU4SN2BCNQRSRESC`
- Network: Stellar testnet
- Function: `request_payment(agent, amount)` → Ok(true) or WatchdogError
- Key: `mykeystellar`

## The 2 Rules

- Rule 1: amount > 20_000_000 stroops (2 XLM) → SinglePaymentLimitExceeded
- Rule 2: cumulative_24h + amount > 40_000_000 stroops (4 XLM) → DailyBudgetExceeded

## Tech Stack

- Smart contract: Rust / Soroban
- Server: TypeScript / Express v5
- Payment: x402 + MPP SDK (@stellar/mpp)
- Frontend: React / Next.js
- Wallet: Freighter
- XLM testnet SAC: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`

## Skills Location
.claude/skills/ — read these before starting any session

For the payment flow
## Agent Identity
- Use a single fixed agent address for testing
- Example: derive from the same secret key or hardcode one address
- Do NOT generate random addresses per request, as that breaks the cumulative 24h tracking

## Key Management (IMPORTANT)
- The secret key is already stored in `.env` as STELLAR_SECRET_KEY
- DO NOT use Stellar CLI commands to fetch keys
- DO NOT run `stellar keys show` or `stellar keys secret`
- Load the key only via `process.env.STELLAR_SECRET_KEY`

## Network
- Use network identifier: stellar:testnet

## Demo Flow

**Contract limits:** 6 XLM max single payment, 10 XLM daily budget
**Endpoints:** `/analysis/basic` = 1 XLM, `/analysis/deep` = 7 XLM

### Step 1 — No payment header

Hit `/analysis/basic` without payment → returns `{ "error": "payment required", "amount": 10000000 }`

### Step 2 — Valid payment

Hit `/analysis/basic` with payment → returns `{ "success": true, "txHash": "<hash>" }`

### Step 3 — Single limit exceeded

Hit `/analysis/deep` → returns `{ "blocked": true, "reason": "SinglePaymentLimitExceeded" }`
7 XLM exceeds 6 XLM single payment limit.

### Step 4 — Daily budget exceeded

Hit `/analysis/basic` repeatedly until → `{ "blocked": true, "reason": "DailyBudgetExceeded" }`
Contract tracks cumulative spend per agent on-chain.

**Reset demo:** change agent address in server.ts + restart server = fresh 24h window.

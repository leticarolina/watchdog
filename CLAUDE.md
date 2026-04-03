# Watchdog — Claude Context

## What This Project Is
Behavioral risk layer for autonomous agent payments on Stellar.
Agent pays for analysis via x402 → Watchdog Soroban contract evaluates 2 rules → approves or blocks → real XLM tx on testnet.

## Project Structure
- `contracts/watchdog-contract/` — Soroban/Rust smart contract (Phase 1 ✅ complete)
- `agent/` — TypeScript Express v5 server + mock analysis API (Phase 2)
- `frontend/` — React/Next.js UI (Phase 3)

## Current Phase
Phase 2 — building the Express v5 server in `agent/`

## Contract
- Deployed: `CDXL6SOYHR4WXSAFHGCX2XD4WDW253PZLZO4X5IYYXYQH4BWJABZXDRK`
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
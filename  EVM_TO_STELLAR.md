# EVM → Stellar / Soroban Cheat Sheet

A quick reference for myself while building on Stellar.

---

# Mental Model

I already know Ethereum.

Think:

> "How would I do this in Solidity?"

and map it.

---

# Wallet

## Ethereum

Private key

```bash
cast wallet address
```

or

```bash
forge script --private-key ...
```

## Stellar

Identity

```bash
stellar keys generate mykeystellar
```

Use it everywhere:

```bash
--source-account mykeystellar
```

Equivalent to using a private key.

---

# Faucet

Ethereum

Sepolia faucet.

Stellar

```bash
stellar keys fund mykeystellar --network testnet
```

---

# Build

Ethereum

```bash
forge build
```

Stellar

```bash
stellar contract build
```

Produces the WASM.

---

# Deploy

Ethereum

```bash
forge script Deploy.s.sol --broadcast
```

Stellar

```bash
stellar contract deploy \
    --wasm target/wasm32v1-none/release/watchdog.wasm \
    --source-account mykeystellar \
    --network testnet
```

Returns a Contract ID.

Update

```ts
const CONTRACT_ID = "...";
```

inside the backend.

---

# Read Function

Ethereum

```bash
cast call
```

Stellar

```bash
stellar contract invoke \
  --id CONTRACT_ID \
  --source-account mykeystellar \
  --network testnet \
  -- \
  get_limits
```

Remember the

```
--
```

before the function name.

---

# Write Function

Ethereum

```bash
cast send
```

Stellar

Exactly the same command.

Example

```bash
stellar contract invoke \
  --id CONTRACT_ID \
  --source-account mykeystellar \
  --network testnet \
  -- \
  set_limits \
  --max-single-payment 60000000 \
  --daily-budget 100000000
```

---

# Tests

Ethereum

```bash
forge test
```

Stellar

```bash
cargo test
```

or

```bash
stellar contract test
```

---

# Explorer

Ethereum

https://etherscan.io

Stellar

https://stellar.expert

Inspect

- transactions
- accounts
- contracts
- events

---

# Contract Storage

Ethereum

```solidity
mapping(...)
```

Stellar

```rust
env.storage().instance()
```

or

```rust
env.storage().persistent()
```

---

# Events

Ethereum

```solidity
emit PaymentApproved(...)
```

Stellar

```rust
env.events().publish(...)
```

---

# Token Transfer

Ethereum

```solidity
IERC20(token).transfer(...)
```

Stellar

```rust
token::Client::new(...).transfer(...)
```

Usually using the XLM SAC.

---

# What is the XLM SAC?

SAC = Stellar Asset Contract.

Think of it as:

```
ERC20 interface
```

for native XLM.

Instead of sending ETH,

the contract calls the XLM SAC.

---

# Simulation

This is one of the biggest differences.

Ethereum

Usually

```
eth_call
```

or

```
callStatic
```

Stellar

```
simulateTransaction()
```

The backend can ask

> "Would this succeed?"

without changing blockchain state.

If simulation succeeds,

submit the real transaction.

---

# Development Loop

Whenever I change Rust:

1. Edit contract
2. Build

```bash
stellar contract build
```

3. Deploy

```bash
stellar contract deploy ...
```

4. Copy Contract ID

5. Update

```ts
CONTRACT_ID
```

6. Restart backend

```bash
npm run dev
```

7. Test

```bash
make config

make basic

make deep
```

---

# Watchdog v1 Architecture

```
Agent
   │
   ▼

Backend

   │

simulate request_payment()

   │

Approved?

   │

Yes

   │

Real payment happens
```

Contract acts as the policy engine.

Funds stay in the agent wallet.

---

# Watchdog v2 Goal

```
Owner deposits XLM

       │

       ▼

Watchdog Contract

       │

request_payment()

       │

Checks rules

       │

transfer()

       ▼

Recipient
```

The contract owns the funds.

The agent only proposes payments.

This removes the ability to bypass Watchdog.

---

# Solidity Mindset

Whenever I'm confused, ask:

> "How would I build this in Solidity?"

Then translate it into Soroban.

The architecture is usually the same.

Only the syntax changes.
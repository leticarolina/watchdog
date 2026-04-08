# Security

This document describes the threat model, design decisions, and known limitations of the Watchdog smart contract.

---

## Threat Model

Watchdog is designed to protect against autonomous agent spending anomalies. The primary threat is not a malicious human attacker,it's an agent that behaves incorrectly due to compromise, misconfiguration, or runaway execution.

### Threats Watchdog Protects Against

| Threat | Description | Rule |
| -------- | ------------- | ------ |
| Large unauthorized purchase | Agent attempts a single payment far exceeding normal behavior | Single Payment Limit |
| Slow drain attack | Agent makes many small payments that individually look safe but cumulatively drain the wallet | Daily Budget Cap |
| Hijacked agent | Compromised agent tries to exfiltrate funds via payment | Both rules |
| Runaway loop | Agent caught in an infinite execution loop making repeated payments | Daily Budget Cap |
| Misconfigured cost estimate | Agent hallucinates or miscalculates a price and requests an absurd amount | Single Payment Limit |

### Threats Watchdog Does NOT Protect Against

- **Key compromise at the owner level** — if the owner key is compromised, limits can be changed via `set_limits`.
- **Social engineering** — Watchdog enforces on-chain rules, not intent. If an agent is instructed to make many legitimate-looking payments, Watchdog will approve them until the daily cap is hit.
- **Flash attacks within a single transaction** — Watchdog evaluates per `request_payment` call. Atomically bundled payments are not in scope.

---

## Contract Design Decisions

### Global limits instead of per-agent limits (v1)

Per-agent limits require an additional initialization step per agent and increase contract surface area. Per-agent limits are planned for v2.

### Only 2 rules instead of more

Each rule adds state, storage reads, and attack surface. A velocity/cooldown rule was evaluated and rejected because legitimate agents may request data rapidly and a hard cooldown would create false positives. Two rules cover the primary threat vectors.

### owner-updatable limits

Hardcoded limits would require a contract redeploy to adjust thresholds. `set_limits` allows the owner to tune risk tolerance post-deploy without disrupting agent state. 

### 24h window reset

The contract resets an agent's spending window on the first `request_payment` call after the window expires. This eliminates an entire class of keeper/oracle dependencies and makes the contract fully self-contained.

---

## Access Control

| Function | Who can call |
| ---------- | ------------- |
| `initialize` | Anyone - only once. |
| `request_payment` | Anyone - designed to be called by any agent |
| `set_limits` | Owner only - enforced via `require_auth` + address comparison |
| `get_limits` | read only |
| `get_agent_state` | read only |

---

## Known Limitations

- **Testnet only.** Watchdog is currently deployed on Stellar testnet. Mainnet deployment requires additional audit and limit calibration.
- **No per-agent initialization.** All agents share the same limits. An agent with different risk requirements cannot have custom limits in v1.
- **Owner key is a single point of failure.** There is no multisig or timelock on `set_limits`. A compromised owner key can change limits immediately.
- **State is not migrateable.** If the contract is redeployed, all agent spending state resets. There is no upgrade path in v1.
- **Events on blocked calls.** When a payment is blocked, the contract reverts before the transaction is submitted. The block event is emitted during simulation but does not land on-chain.

---

## Responsible Disclosure

This contract has not been formally audited. It was built for the Stellar Agents Hackathon 2026.
If you find a vulnerability, please contact:

- Twitter: [@letiweb3](https://x.com/letiweb3)
- GitHub: [github.com/leticarolina/watchdog](https://github.com/leticarolina/watchdog)

---

## Contract

**Deployed:** `CDK4XFYOHDCJTRXNM4I56ZYUEVLQIRLRLOT7R6XRRYSGPBTGXXSB7DVH`
**Network:** Stellar testnet
**Language:** Rust / Soroban SDK v25

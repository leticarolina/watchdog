/**
 * pay-test.ts — end-to-end MPP payment test client
 *
 * Flow:
 *   1. Send GET /analysis/basic  →  server returns 402 + WWW-Authenticate
 *   2. mppx.fetch detects 402, parses challenge, builds + signs Soroban SAC transfer
 *   3. Sends signed XDR back to server (pull mode) — server broadcasts and confirms
 *   4. Retries original request with Authorization credential
 *   5. Prints final JSON response (expected: { success: true, txHash: "..." })
 *
 * Run:
 *   node --loader ts-node/esm scripts/pay-test.ts
 */
import 'dotenv/config';
//# sourceMappingURL=pay-test.d.ts.map
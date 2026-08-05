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
import { Mppx } from 'mppx/client';
import { stellar } from '@stellar/mpp/charge/client';
const SERVER_URL = 'http://localhost:3000';
const ENDPOINT = `${SERVER_URL}/analysis/basic`;
// ─── Client setup ─────────────────────────────────────────────────────────────
const secretKey = process.env.STELLAR_SECRET_KEY;
if (!secretKey) {
    console.error('STELLAR_SECRET_KEY not set in .env');
    process.exit(1);
}
const mppx = Mppx.create({
    polyfill: false, // don't touch globalThis.fetch — use mppx.fetch explicitly
    methods: [
        stellar.charge({
            secretKey,
            onProgress(event) {
                switch (event.type) {
                    case 'challenge':
                        console.log(`[mpp] challenge received — amount: ${event.amount} XLM  recipient: ${event.recipient}`);
                        break;
                    case 'signing':
                        console.log('[mpp] signing Soroban SAC transfer...');
                        break;
                    case 'signed':
                        console.log('[mpp] transaction signed, sending to server for broadcast');
                        break;
                    // 'paying' / 'confirming' / 'paid' fire server-side in pull mode
                }
            },
        }),
    ],
});
// ─── Request ──────────────────────────────────────────────────────────────────
console.log(`\nGET ${ENDPOINT}`);
console.log('─'.repeat(60));
let response;
try {
    // mppx.fetch handles the full 402 → pay → retry cycle automatically.
    response = await mppx.fetch(ENDPOINT);
}
catch (err) {
    console.error('\n[error] request failed:', err.message);
    process.exit(1);
}
// ─── Result ───────────────────────────────────────────────────────────────────
console.log(`\nHTTP ${response.status}`);
// Decode the Payment-Receipt header (base64 JSON, field "reference" = tx hash).
const receiptHeader = response.headers.get('payment-receipt');
if (receiptHeader) {
    try {
        const receipt = JSON.parse(Buffer.from(receiptHeader, 'base64').toString('utf-8'));
        console.log('\n[receipt]');
        console.log('  method    :', receipt.method);
        console.log('  txHash    :', receipt.reference);
        console.log('  status    :', receipt.status);
        console.log('  timestamp :', receipt.timestamp);
        if (receipt.reference) {
            console.log(`  explorer  : https://stellar.expert/explorer/testnet/tx/${receipt.reference}`);
        }
    }
    catch {
        console.log('[receipt] raw:', receiptHeader);
    }
}
// Print the response body.
const body = await response.json();
console.log('\n[body]', JSON.stringify(body, null, 2));
if (!response.ok) {
    console.error('\n[error] request did not succeed — check server logs');
    process.exit(1);
}
console.log('\n✓ done');
//# sourceMappingURL=pay-test.js.map
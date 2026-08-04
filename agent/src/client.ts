/**
 * Internal payment client — mirrors what an external caller does but runs
 * inside the server process. The /run/* endpoints call these instead of the
 * browser hitting /analysis/* directly.
 *
 * middleware/payment.ts no longer speaks real MPP — it hand-rolls a 402
 * challenge + a simple Authorization-header credential check, then settles
 * by calling request_payment itself. So this does a plain two-step fetch
 * instead of going through the mppx client (which expects real MPP challenge
 * shapes and fails Zod validation against this simplified one).
 */
const BASE = 'http://localhost:3000';

export type AnalysisResult =
  | { success: true; txHash: string }
  | { blocked: true; reason: string }
  | { error: string };

/**
 * Run an analysis endpoint through the simplified 402 payment cycle.
 *
 * Flow:
 *   1. Plain fetch hits /analysis/* — server returns 402 + challenge
 *      (unless contract pre-check already blocks it — then returns 200 blocked)
 *   2. Retry with a dummy Authorization header — payment.ts only checks for
 *      credential presence, then signs and submits request_payment itself,
 *      which both verifies and pays out in the same call.
 *   3. Server returns { success, txHash } directly in the body.
 */
export async function runAnalysis(
  path: '/analysis/basic' | '/analysis/deep',
): Promise<AnalysisResult> {
  let response = await fetch(`${BASE}${path}`);

  if (response.status === 402) {
    response = await fetch(`${BASE}${path}`, {
      headers: { Authorization: 'dummy' },
    });
  }

  // Fallback: extract the tx hash from the receipt header (base64 JSON,
  // field = "reference") in case the JSON body ever omits it.
  let receiptTxHash = '';
  const receiptHeader = response.headers.get('payment-receipt');
  if (receiptHeader) {
    try {
      const receipt = JSON.parse(Buffer.from(receiptHeader, 'base64').toString('utf-8'));
      receiptTxHash = receipt.reference ?? '';
    } catch {
      // malformed receipt — proceed without hash
    }
  }

  const body = await response.json() as Record<string, unknown>;

  if (body.blocked) {
    return { blocked: true, reason: String(body.reason ?? 'ContractRejected') };
  }

  if (body.success) {
    return {
      success: true,
      txHash: String(body.txHash ?? receiptTxHash),
    };
  }

  return { error: String(body.error ?? 'Unknown error') };
}

export type AnalysisResult = {
    success: true;
    txHash: string;
    recipient?: string;
} | {
    blocked: true;
    reason: string;
    recipient?: string;
} | {
    error: string;
};
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
export declare function runAnalysis(path: '/analysis/basic' | '/analysis/deep' | '/analysis/basic-blocked'): Promise<AnalysisResult>;
//# sourceMappingURL=client.d.ts.map
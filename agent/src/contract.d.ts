export declare function getConfig(): Promise<{
    success: boolean;
    maxSinglePayment?: number;
    budgetCap?: number;
    windowSeconds?: number;
    error?: string;
}>;
export declare function getAgentState(agent: string): Promise<{
    success: boolean;
    cumulativeSpent?: number;
    windowStart?: number;
    error?: string;
}>;
/**
 * Simulates request_payment without submitting — used to pre-check whether a
 * payment would be approved before asking the agent for a signed credential.
 */
export declare function simulateRequestPayment(agent: string, recipient: string, amount: number): Promise<{
    approved: boolean;
    error?: string;
}>;
/**
 * Signs and submits request_payment using the agent's own keypair. The
 * contract requires agent.require_auth(), so the agent address passed to the
 * call is derived from the signing keypair itself — the caller can't submit
 * on behalf of a different agent address than the one it's signing with.
 *
 * On success this call IS the payment: the contract transfers `amount` XLM
 * to `recipient` itself, so there is no separate transfer step afterward.
 */
export declare function executeRequestPayment(agentSecretKey: string, recipient: string, amount: number): Promise<{
    success: boolean;
    hash?: string;
    error?: string;
}>;
//# sourceMappingURL=contract.d.ts.map
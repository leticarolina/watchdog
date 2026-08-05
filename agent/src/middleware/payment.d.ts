import type { Request, Response, NextFunction } from 'express';
export type PaymentReceipt = {
    /** Stellar transaction hash for the request_payment call. */
    txHash: string;
    /** Settlement method reported (always "watchdog-request-payment"). */
    method: string;
    /** RFC 3339 settlement timestamp. */
    timestamp: string;
};
/**
 * @param recipientEnvVar Which env var to derive the recipient from —
 *   defaults to RECIPIENT_SECRET_KEY_A (allowlisted). Pass
 *   'RECIPIENT_SECRET_KEY_B' to target the deliberately-unallowlisted demo
 *   recipient instead (see /analysis/basic-blocked in server.ts).
 */
export declare function requirePayment(requiredAmount: number, recipientEnvVar?: string): (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=payment.d.ts.map
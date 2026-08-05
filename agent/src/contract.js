import { rpc, TransactionBuilder, Networks, Address, nativeToScVal, scValToNative, Contract, Account, Keypair, } from '@stellar/stellar-sdk';
const CONTRACT_ID = 'CBA2LXX3FZ5TN5HHVGSJ47AUF3ZCLS6NG6AKE2ZZEHC5LEJQLJU6RBT2';
const RPC_URL = 'https://soroban-testnet.stellar.org';
// valid dummy source for simulation only
const DUMMY_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const server = new rpc.Server(RPC_URL);
const contract = new Contract(CONTRACT_ID);
/** Maps a WatchdogError contract code (1-9) to its named string. */
function mapContractError(err) {
    if (err.includes('Error(Contract, #1)'))
        return 'SinglePaymentLimitExceeded';
    if (err.includes('Error(Contract, #2)'))
        return 'BudgetCapExceeded';
    if (err.includes('Error(Contract, #3)'))
        return 'NotInitialized';
    if (err.includes('Error(Contract, #4)'))
        return 'Unauthorized';
    if (err.includes('Error(Contract, #5)'))
        return 'AlreadyInitialized';
    if (err.includes('Error(Contract, #6)'))
        return 'InsufficientVaultBalance';
    if (err.includes('Error(Contract, #7)'))
        return 'RecipientNotAllowed';
    if (err.includes('Error(Contract, #8)'))
        return 'ContractPaused';
    if (err.includes('Error(Contract, #9)'))
        return 'InvalidAmount';
    return `ContractError: ${err.split('\n')[0]}`;
}
export async function getConfig() {
    try {
        const sourceAccount = new Account(DUMMY_SOURCE, '0');
        const operation = contract.call('get_config');
        const tx = new TransactionBuilder(sourceAccount, {
            fee: '100',
            networkPassphrase: Networks.TESTNET,
        })
            .addOperation(operation)
            .setTimeout(30)
            .build();
        const result = await server.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(result)) {
            return { success: false, error: result.error };
        }
        if (!rpc.Api.isSimulationSuccess(result)) {
            return { success: false, error: 'UnknownSimulationFailure' };
        }
        const retval = result.result?.retval;
        if (!retval) {
            return { success: false, error: 'MissingReturnValue' };
        }
        const [maxSinglePayment, budgetCap, windowSeconds] = scValToNative(retval);
        return {
            success: true,
            maxSinglePayment: Number(maxSinglePayment),
            budgetCap: Number(budgetCap),
            windowSeconds: Number(windowSeconds),
        };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
}
export async function getAgentState(agent) {
    try {
        const sourceAccount = new Account(DUMMY_SOURCE, '0');
        const operation = contract.call('get_agent_state', Address.fromString(agent).toScVal());
        const tx = new TransactionBuilder(sourceAccount, {
            fee: '100',
            networkPassphrase: Networks.TESTNET,
        })
            .addOperation(operation)
            .setTimeout(30)
            .build();
        const result = await server.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(result)) {
            return { success: false, error: result.error };
        }
        if (!rpc.Api.isSimulationSuccess(result)) {
            return { success: false, error: 'UnknownSimulationFailure' };
        }
        const retval = result.result?.retval;
        if (!retval) {
            return { success: false, error: 'MissingReturnValue' };
        }
        const rawState = scValToNative(retval);
        // Defensive against either the raw Rust field names (snake_case, as
        // returned by scValToNative) or a camelCase shape, in case the SDK's
        // conversion behavior changes.
        const state = rawState;
        const cumulativeSpent = state.cumulative_spent ?? state.cumulativeSpent ?? 0;
        const windowStart = state.window_start ?? state.windowStart ?? 0;
        return {
            success: true,
            cumulativeSpent: Number(cumulativeSpent),
            windowStart: Number(windowStart),
        };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
}
/**
 * Simulates request_payment without submitting — used to pre-check whether a
 * payment would be approved before asking the agent for a signed credential.
 */
export async function simulateRequestPayment(agent, recipient, amount) {
    const sourceAccount = new Account(DUMMY_SOURCE, '0');
    const operation = contract.call('request_payment', Address.fromString(agent).toScVal(), Address.fromString(recipient).toScVal(), nativeToScVal(BigInt(amount), { type: 'i128' }));
    const tx = new TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
    })
        .addOperation(operation)
        .setTimeout(30)
        .build();
    const result = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationSuccess(result)) {
        return { approved: true };
    }
    if (rpc.Api.isSimulationError(result)) {
        return { approved: false, error: mapContractError(result.error) };
    }
    return { approved: false, error: 'SimulationFailed' };
}
/**
 * Signs and submits request_payment using the agent's own keypair. The
 * contract requires agent.require_auth(), so the agent address passed to the
 * call is derived from the signing keypair itself — the caller can't submit
 * on behalf of a different agent address than the one it's signing with.
 *
 * On success this call IS the payment: the contract transfers `amount` XLM
 * to `recipient` itself, so there is no separate transfer step afterward.
 */
export async function executeRequestPayment(agentSecretKey, recipient, amount) {
    try {
        const keypair = Keypair.fromSecret(agentSecretKey);
        const account = await server.getAccount(keypair.publicKey());
        const operation = contract.call('request_payment', Address.fromString(keypair.publicKey()).toScVal(), Address.fromString(recipient).toScVal(), nativeToScVal(BigInt(amount), { type: 'i128' }));
        let tx = new TransactionBuilder(account, {
            fee: '100',
            networkPassphrase: Networks.TESTNET,
        })
            .addOperation(operation)
            .setTimeout(30)
            .build();
        const sim = await server.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(sim)) {
            return { success: false, error: mapContractError(sim.error) };
        }
        if (!rpc.Api.isSimulationSuccess(sim)) {
            return { success: false, error: 'UnknownSimulationFailure' };
        }
        tx = rpc.assembleTransaction(tx, sim).build();
        tx.sign(keypair);
        const res = await server.sendTransaction(tx);
        return {
            success: true,
            hash: res.hash,
        };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
}
//# sourceMappingURL=contract.js.map
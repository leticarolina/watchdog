import {
  rpc,
  TransactionBuilder,
  Networks,
  Address,
  nativeToScVal,
  scValToNative,
  Contract,
  Account,
  Keypair,
} from '@stellar/stellar-sdk';

const CONTRACT_ID = 'CDK4XFYOHDCJTRXNM4I56ZYUEVLQIRLRLOT7R6XRRYSGPBTGXXSB7DVH';
const RPC_URL = 'https://soroban-testnet.stellar.org';

// valid dummy source for simulation only
const DUMMY_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

const server = new rpc.Server(RPC_URL);
const contract = new Contract(CONTRACT_ID);

export async function getLimits(): Promise<{
  success: boolean;
  maxSinglePayment?: number;
  dailyBudget?: number;
  error?: string;
}> {
  try {
    const sourceAccount = new Account(DUMMY_SOURCE, '0');

    const operation = contract.call('get_limits');

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

    const [maxSinglePayment, dailyBudget] = scValToNative(retval) as [string, string];

    return {
      success: true,
      maxSinglePayment: Number(maxSinglePayment),
      dailyBudget: Number(dailyBudget),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getAgentState(agent: string): Promise<{
  success: boolean;
  cumulative24h?: number;
  dayStart?: number;
  error?: string;
}> {
  try {
    const sourceAccount = new Account(DUMMY_SOURCE, '0');

    const operation = contract.call(
      'get_agent_state',
      Address.fromString(agent).toScVal(),
    );

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

    const state = rawState as {
      cumulative_24h?: string | number | bigint;
      day_start?: string | number | bigint;
      cumulative24h?: string | number | bigint;
      dayStart?: string | number | bigint;
    };

    const cumulative = state.cumulative_24h ?? state.cumulative24h ?? 0;
    const dayStart = state.day_start ?? state.dayStart ?? 0;

    return {
      success: true,
      cumulative24h: Number(cumulative),
      dayStart: Number(dayStart),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function checkPayment(
  agent: string,
  amount: number,
): Promise<{ approved: boolean; error?: string }> {
  const sourceAccount = new Account(DUMMY_SOURCE, '0');

  const operation = contract.call(
    'request_payment',
    Address.fromString(agent).toScVal(),
    nativeToScVal(BigInt(amount), { type: 'i128' }),
  );

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
    const err = result.error;

    if (err.includes('Error(Contract, #1)')) {
      return { approved: false, error: 'SinglePaymentLimitExceeded' };
    }

    if (err.includes('Error(Contract, #2)')) {
      return { approved: false, error: 'DailyBudgetExceeded' };
    }

    return { approved: false, error: `ContractError: ${err.split('\n')[0]}` };
  }

  return { approved: false, error: 'SimulationFailed' };
}

export async function recordPaymentState(
  agent: string,
  amount: number,
): Promise<{ success: boolean; hash?: string; error?: string }> {
  try {
    const secretKey = process.env.STELLAR_SECRET_KEY;

    if (!secretKey) {
      return { success: false, error: 'Missing STELLAR_SECRET_KEY' };
    }

    const keypair = Keypair.fromSecret(secretKey);
    const account = await server.getAccount(keypair.publicKey());

    const operation = contract.call(
      'request_payment',
      Address.fromString(agent).toScVal(),
      nativeToScVal(BigInt(amount), { type: 'i128' }),
    );

    let tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(sim)) {
      const err = sim.error;

      if (err.includes('Error(Contract, #1)')) {
        return { success: false, error: 'SinglePaymentLimitExceeded' };
      }

      if (err.includes('Error(Contract, #2)')) {
        return { success: false, error: 'DailyBudgetExceeded' };
      }

      return { success: false, error: err };
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
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
// worker.js

import { parentPort, workerData } from 'worker_threads';
import OrbiterProvider from '../../libs/utils/src/lib/provider/orbiterPrvoider6';

parentPort.on('message', async (message: any) => {
    const { chainInfo, blockNumbers } = workerData;
    const result = await fetchEthereumData(chainInfo.rpc[0], blockNumbers);
    parentPort.postMessage({
        type: 'data',
        data: result
    });
});
export async function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(null);
        }, ms);
    });
}
async function getBlock(provider: OrbiterProvider, blockNumber: number) {
    try {
        const block = await Promise.race([
            provider.getBlock(blockNumber, true),
            sleep(1000 * 60).then(() => {
                throw new Error('Block request timed out');
            }),
        ]);
        // const block = await provider.getBlock(blockNumber, true);
        if (block) {
            const prefetchedTransactions = await block.prefetchedTransactions;
            if (prefetchedTransactions) {
                const blockInfo = {
                    ...block,
                    prefetchedTransactions,

                }
                return {
                    error: null,
                    number: blockNumber,
                    block: blockInfo,
                }
            }
        }
        return {
            error: new Error(`${blockNumber} Block isEmpty`),
            number: blockNumber,
            block: null,
        }
    } catch (error) {
        return {
            error: error,
            number: blockNumber,
            block: null,
        }
    }
}
async function fetchEthereumData(rpc: string, blockNumbers: number[]) {
    const provider = new OrbiterProvider(rpc);
    const promiseBlocks = blockNumbers.map(blockNumber => {
        return getBlock(provider, blockNumber)
    })
    const results = await Promise.all(promiseBlocks);
    return results;
}

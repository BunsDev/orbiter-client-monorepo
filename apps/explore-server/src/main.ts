import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';


// worker.js

import { parentPort, workerData, isMainThread, threadId } from 'worker_threads';
import { provider as Provider } from '@orbiter-finance/utils';
import fs from 'fs/promises'
async function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(null);
        }, ms);
    });
}
async function getBlock(provider: Provider.Orbiter6Provider, blockNumber: number) {
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
    const provider = new Provider.Orbiter6Provider(rpc);
    const promiseBlocks = blockNumbers.map(blockNumber => {
        return getBlock(provider, blockNumber)
    })
    const results = await Promise.all(promiseBlocks);
    return results;
}


async function runWorker () {
  parentPort.on('message', async (message: any) => {
    await fs.appendFile('worker_request.log', `workerId: ${threadId}, ${message}\n`)
    const { id, type, data, action } = JSON.parse(message);
    try {
      const { chainInfo, blockNumbers } = data
      const result = await fetchEthereumData(chainInfo.rpc[0], blockNumbers);
      parentPort.postMessage({
          id,
          type: 'data',
          data: result
      });
    } catch (error) {
      parentPort.postMessage({
        id,
        data: error.message,
        type: 'error',
      })
    }
  });
  process.on('uncaughtException', (e) => {
    console.log(e)
  })
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  const port = process.env.PORT || 3000;
  await app.listen(port);
  const globalPrefix = "";
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`
  );
}
process.on('uncaughtException', (err) => {
  Logger.error('Unhandled Exception at:', err)
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // process.exit(1);
});

if (isMainThread) {
  bootstrap()
} else {
  runWorker()
}


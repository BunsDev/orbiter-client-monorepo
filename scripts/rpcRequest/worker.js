"use strict";
// worker.js
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = void 0;
const worker_threads_1 = require("worker_threads");
const orbiterPrvoider6_1 = __importDefault(require("../../libs/utils/src/lib/provider/orbiterPrvoider6"));
worker_threads_1.parentPort.on('message', (message) => __awaiter(void 0, void 0, void 0, function* () {
    const { chainInfo, blockNumbers } = worker_threads_1.workerData;
    const result = yield fetchEthereumData(chainInfo.rpc[0], blockNumbers);
    worker_threads_1.parentPort.postMessage({
        type: 'data',
        data: result
    });
}));
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(null);
            }, ms);
        });
    });
}
exports.sleep = sleep;
function getBlock(provider, blockNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const block = yield Promise.race([
                provider.getBlock(blockNumber, true),
                sleep(1000 * 60).then(() => {
                    throw new Error('Block request timed out');
                }),
            ]);
            // const block = await provider.getBlock(blockNumber, true);
            if (block) {
                const prefetchedTransactions = yield block.prefetchedTransactions;
                const blockInfo = Object.assign(Object.assign({}, block), { prefetchedTransactions });
                return {
                    error: null,
                    number: blockNumber,
                    block: blockInfo,
                };
            }
        }
        catch (error) {
            return {
                error: error,
                number: blockNumber,
                block: null,
            };
        }
    });
}
function fetchEthereumData(rpc, blockNumbers) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = new orbiterPrvoider6_1.default(rpc);
        const promiseBlocks = blockNumbers.map(blockNumber => {
            return getBlock(provider, blockNumber);
        });
        const results = yield Promise.all(promiseBlocks);
        return results;
    });
}

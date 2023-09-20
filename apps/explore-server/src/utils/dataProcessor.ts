import { generateSequenceNumbers } from "@orbiter-finance/utils";
import { Level } from "level";
import { readFileSync, outputFile } from 'fs-extra';

export default class DataProcessor {
    private dataSet: Set<number> = new Set();
    private processingSet: Set<number> = new Set();
    private db: Level;
    private maxScanBlockNumber: number | undefined = undefined;
    constructor(private readonly chainId: string) {
        this.db = new Level(`./runtime/data-test/${this.chainId}`);
        this.dataSet = new Set();
        this.initMaxScanBlockNumber();
        this.initStoreData();
    }
    getDataCount() {
        return this.dataSet.size;
    }
    getProcessingCount() {
        return this.processingSet.size;
    }
    private async initStoreData(limit = -1) {
        let result;
        if (limit > 0) {
            result = await this.db.keys({ limit: limit }).all();
        } else {
            result = await this.db.keys().all();
        }
        if (result) {
            this.dataSet = new Set(result.map(n => +n));
            console.log('initStoreData', this.dataSet.size)
        }
    }
    async createRangeScannData(min: number, max: number) {
        const blockNumbers = generateSequenceNumbers(
            min,
            max,
        );
        await this.push(blockNumbers);
        const maxBlockNumber = blockNumbers[blockNumbers.length - 1];
        await this.changeMaxScanBlockNumber(maxBlockNumber);
        return blockNumbers;
    }
    async changeMaxScanBlockNumber(
        blockNumber: number,
    ): Promise<void> {
        const result = await outputFile(
            `runtime/scan/${this.chainId}`,
            blockNumber.toString(),
        );
        this.maxScanBlockNumber = blockNumber;
        return result
    }
    public async getMaxScanBlockNumber(): Promise<number> {
        if (this.maxScanBlockNumber === undefined) {
            await this.initMaxScanBlockNumber();
        }
        return this.maxScanBlockNumber;
    }
    public async initMaxScanBlockNumber(): Promise<number> {
        let blockNumber;
        try {
            blockNumber = +readFileSync(`runtime/scan/${this.chainId}`);
        } catch (error) {
            blockNumber = 0;
        }
        this.maxScanBlockNumber = blockNumber;
        return this.maxScanBlockNumber;
    }
    async getProcessNextBatchData(batchSize: number): Promise<number[]> {
        const batch = [...this.dataSet].filter((data) => !this.processingSet.has(data)).slice(0, batchSize);
        for (const data of batch) {
            this.processingSet.add(data);
        }
        return batch;
    }
    async push(blocks: number[] | number) {
        const blockNumbers = typeof blocks === 'number' ? [blocks] : blocks;
        const batchList = blockNumbers.map(num => {
            return {
                type: 'put',
                key: num.toString(),
                value: Date.now()
            }
        });
        await this.db.batch(batchList as any)
        for (const data of blockNumbers) {
            this.dataSet.add(data)
        }
    }
    async ack(blocks: number[] | number) {
        const blockNumbers = typeof blocks === 'number' ? [blocks] : blocks;
        await this.deleteStoreData(blockNumbers);
        for (const block of blockNumbers) {
            try {
                this.dataSet.delete(block);
                this.processingSet.delete(block);
            } catch (error) {
                console.error(`ack data error ${block}`, error.message);
            }
        }
        console.log('execute ack success', this.dataSet.size, this.processingSet.size)
    }
    deleteStoreData(blocks: number[]) {
        return new Promise(async (resolve, reject) => {
            try {
                const batchs = blocks.map(num => {
                    return {
                        type: 'del',
                        key: num.toString(),
                    }
                });
                await this.db.batch(batchs as any);
                resolve(blocks);
            } catch (error) {
                reject(error)
            }
        })

    }
    noAck(blocks: number[] | number) {
        blocks = typeof blocks === 'number' ? [blocks] : blocks;
        for (const block of blocks) {
            try {
                this.dataSet.add(block);
                this.processingSet.delete(block);
            } catch (error) {
                console.error(`noAck data error ${block}`, error.message);
            }
        }
        console.log('execute NoAck success', this.dataSet.size, this.processingSet.size)
    }
}
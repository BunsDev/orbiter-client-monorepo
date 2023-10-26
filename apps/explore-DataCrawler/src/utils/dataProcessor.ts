import { generateSequenceNumbers } from "@orbiter-finance/utils";
import { Level } from "level";
import winston from "winston";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

export default class DataProcessor {
    private dataSet: Set<number> = new Set();
    private processingSet: Set<number> = new Set();
    private db: Level;
    private nextMaxScanBlockNumber: number | undefined = undefined;

    constructor(
        private readonly chainId: string,
        private readonly logger: winston.Logger
    ) {
        // Initialize the LevelDB instance
        this.db = new Level(`./runtime/data/${this.chainId}`);

        // Initialize data sets and retrieve the max scan block number
        this.dataSet = new Set();
        this.initMaxScanBlockNumber();
        this.initStoreData();
    }

    // Get the count of data in the data set
    getDataCount() {
        return this.dataSet.size;
    }
    async getDataByStorage() {
        const keys = await this.db.keys({ limit: 100 }).all()
        return keys;
    }

    // Get the count of data in the processing set
    getProcessingCount() {
        return this.processingSet.size;
    }

    // Initialize and retrieve data from LevelDB
    private async initStoreData(limit = -1) {
        let result;
        if (limit > 0) {
            result = await this.db.keys({ limit }).all();
        } else {
            result = await this.db.keys().all();
        }
        if (result) {
            this.dataSet = new Set(result.map(n => +n));
            this.logger.info(`${this.chainId} initStoreData`, this.dataSet.size, 'maxScanBlockNumber ', this.nextMaxScanBlockNumber);
        }
    }

    // Create a range of scan data and update max scan block number
    async createRangeScanData(min: number, max: number) {
        const blockNumbers = generateSequenceNumbers(
            min,
            max,
        );
        await this.push(blockNumbers);
        const maxBlockNumber = blockNumbers[blockNumbers.length - 1];
        await this.changeMaxScanBlockNumber(maxBlockNumber + 1);
        return blockNumbers;
    }

    // Change the max scan block number
    async changeMaxScanBlockNumber(
        blockNumber: number,
    ): Promise<void> {
        const directory = `runtime/scan`;
        if (!existsSync(directory)) {
            mkdirSync(directory);
        }
        const result = await writeFileSync(
            `${directory}/${this.chainId}`,
            blockNumber.toString(),
        );
        this.nextMaxScanBlockNumber = blockNumber;
        return result;
    }

    // Get the next max scan block number
    public async getNextScanMaxBlockNumber(): Promise<number> {
        if (this.nextMaxScanBlockNumber === undefined) {
            await this.initMaxScanBlockNumber();
        }
        return this.nextMaxScanBlockNumber;
    }

    // Initialize the max scan block number from file
    public async initMaxScanBlockNumber(): Promise<number> {
        let blockNumber;
        try {
            blockNumber = readFileSync(`runtime/scan/${this.chainId}`);
        } catch (error) {
            blockNumber = 0;
        }
        this.nextMaxScanBlockNumber = +blockNumber;
        return this.nextMaxScanBlockNumber;
    }

    // Get the next batch of data for processing
    async getProcessNextBatchData(batchSize: number): Promise<number[]> {
        const batch: number[] = [];
        for (const data of this.dataSet) {
            if (!this.processingSet.has(data)) {
                this.processingSet.add(data);
                batch.push(data);
                if (batch.length === batchSize) {
                    break;
                }
            }
        }
        return batch;
    }

    // Push data to the data set
    async push(blocks: number[] | number) {
        const blockNumbers = typeof blocks === 'number' ? [blocks] : blocks;
        const batchList = blockNumbers.map(num => {
            this.dataSet.add(num);
            this.processingSet.delete(num);
            return {
                type: 'put',
                key: num.toString(),
                value: Date.now()
            };
        });
        await this.db.batch(batchList as any);
    }

    // Acknowledge processed data
    async ack(blocks: number[] | number) {
        const blockNumbers = typeof blocks === 'number' ? [blocks] : blocks;
        await this.deleteStoreData(blockNumbers);
        for (const block of blockNumbers) {
            try {
                this.dataSet.delete(block);
                this.processingSet.delete(block);
            } catch (error) {
                this.logger.error(`ack data error ${block}`, error);
            }
        }
        this.logger.info(`${this.chainId} execute ack success count = ${blockNumbers.length}, dataSet: ${this.dataSet.size} processingSet: ${this.processingSet.size}`);
    }

    // Delete data from LevelDB
    async deleteStoreData(blocks: number[]) {
        try {
            const batchs = blocks.map(num => {
                return {
                    type: 'del',
                    key: num.toString(),
                };
            });
            await this.db.batch(batchs as any);
            return blocks;
        } catch (error) {
            this.logger.error(`deleteStoreData error`, error);
            throw error;
        }
    }

    // Mark data as not acknowledged for processing
    noAck(blocks: number[] | number) {
        const blockNumbers = typeof blocks === 'number' ? [blocks] : blocks;
        for (const block of blockNumbers) {
            try {
                this.dataSet.add(block);
                this.processingSet.delete(block);
            } catch (error) {
                this.logger.error(`noAck data error ${block}`, error);
            }
        }
        this.logger.info(`${this.chainId} execute noAck success count = ${blockNumbers.length}, dataSet: ${this.dataSet.size} processingSet: ${this.processingSet.size}`);
    }
}

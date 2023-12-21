import dayjs from "dayjs";
import Keyv from "keyv";

type ConsumerFunction<T = any> = (messages: T | T[], ctx: MemoryQueue) => void;

interface QueueOptions<T = any> {
    consumeFunction: ConsumerFunction<T>;
    batchSize: number;
}

export class MemoryQueue<T = any> {
    private queue: T[] = [];
    private consuming: boolean = false;
    private consumeFunction: ConsumerFunction<T>;
    private batchSize: number;
    private processingLock: boolean = false;
    private db: Keyv;
    constructor(public readonly id: string, private options: QueueOptions<T>) {
        this.consumeFunction = options.consumeFunction;
        this.batchSize = options.batchSize;
        this.time();
    }
    get store(): Keyv {
        if (this.db) {
            return this.db;
        }
        this.db = new Keyv(`sqlite://./runtime/db/${this.id}.sqlite`);
        this.db.on('error', (error) => {
            console.error('Failed to initialize cache：', error);
        });
        return this.db;
    }
    setBatchSize(num: number) {
        this.options.batchSize = num;
    }
    add(message: T): void {
        this.queue.push(message);
        this.processQueue();
    }

    addBatch(messages: T[]): void {
        this.queue.push(...messages);
        this.processQueue();
    }

    pause(): void {
        this.consuming = false;
    }

    resume(): void {
        this.consuming = true;
        this.processQueue();
    }
    getQueues() {
        return this.queue.length;
    }
    idle() {
        return this.queue.length === 0;
    }
    isConsume(id: string) {
        return this.store.has(id);
    }
    setEnsureRecord(id: string, value: any) {
        return this.store.set(id, value);
    }
    ensureExists<T>(id: string) {
        return this.store.has(id);
    }
    ensureQueue<T>(id: string) {
        return this.queue.find(tx => tx['sourceId'] === id)
    }
    private time() {
        process.nextTick(async () => {
            this.processQueue()
        });
    }
    private async processQueue(): Promise<void> {
        try {
            if (this.batchSize == -1) {
                this.pause();
            }
            if (this.consuming) {
                return console.log(`${this.id} Pause consuming`);
            }
            if (this.processingLock) {
                return console.log(`${this.id} processingLock consuming`);
            }
            if (!this.store) {
                return console.error(`${this.id} store not initialized`);
            }
            const messagesToConsume = this.queue.splice(0, this.batchSize);
            console.log(messagesToConsume, '=messagesToConsume', this.id)
            this.processingLock = true;
            if (messagesToConsume.length > 0) {
                console.log('准备消费');
                await this.consumeFunction(messagesToConsume.length === 1 ? messagesToConsume[0] : messagesToConsume, this);
                if (messagesToConsume.length === 1) {
                    this.setEnsureRecord(messagesToConsume[0]['sourceId'], true);
                } else {
                    for (const row of messagesToConsume) {
                        this.setEnsureRecord(row['sourceId'], true);
                    }
                }
            }
            // Continue processing if there are remaining messages
            if (this.queue.length > 0) {
                this.processQueue();
            }
        } catch (error) {
            console.error(error, 'processQueue error');
        } finally {
            console.log('解锁--', this.id)
            this.processingLock = false;
        }
    }
}

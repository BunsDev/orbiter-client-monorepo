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
    public batchSize: number;
    private processingLock: boolean = false;
    private db: Keyv;
    public sleep: number = 1000;
    private prevTime: number = Date.now();

    constructor(public readonly id: string, private options: QueueOptions<T>, public readonly store: Keyv) {
        this.consumeFunction = options.consumeFunction;
        this.batchSize = options.batchSize;
        this.time();
    }

    setBatchSize(num: number) {
        this.options.batchSize = num;
    }
    setSleep(num: number) {
        this.sleep = num;
    }
    add(message: T): void {
        this.queue.push(message);
        // this.processQueue();
    }

    addBatch(messages: T[]): void {
        this.queue.push(...messages);
        // this.processQueue();
    }

    pause(): void {
        this.consuming = false;
    }

    resume(): void {
        this.consuming = true;
        // this.processQueue();
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
    delEnsureRecord(id: string) {
        return this.store.delete(id);
    }
    ensureExists<T>(id: string) {
        return this.store.has(id);
    }
    ensureQueue<T>(id: string) {
        return this.queue.find(tx => tx['sourceId'] === id)
    }
    private time() {
        setInterval(() => {
            this.processQueue()
        }, 1000)
    }
    private async processQueue(): Promise<void> {
        try {
            if (Date.now() % 1000 * 60 == 0) {
                console.log(`Heartbeat detection ${this.id} Count: ${this.queue.length} date:${new Date()}`);
            }
            if (Date.now() - this.prevTime < this.sleep) {
                if (Date.now() % 1000 * 60 == 0) {
                    console.log(`Not reaching the consumption interval time ${this.sleep}/ms, Queue Data Count: ${this.queue.length}`);
                }
                return;
            }
            if (this.queue.length==0) {
                return;
            }
            // if (this.batchSize == -1) {
            //     this.pause();
            // }
            if (this.consuming) {
                return console.log(`${this.id} Pause consuming, Queue Data Count: ${this.queue.length}`);
            }
            if (this.processingLock) {
                return console.log(`${this.id} processingLock consuming, Queue Data Count: ${this.queue.length}`);
            }
            if (!this.store) {
                return console.error(`${this.id} store not initialized, Queue Data Count: ${this.queue.length}`);
            }
            this.processingLock = true;
            let messagesToConsume = [];
            if (this.batchSize > 1 && this.queue.length > this.batchSize) {
                // mu
                messagesToConsume = this.queue.splice(0, this.batchSize);
            } else {
                // single
                messagesToConsume = this.queue.splice(0, 1);
            }
            console.log(messagesToConsume, '===messagesToConsume')
            if (messagesToConsume.length > 0) {
                console.log(`ready to consume ${messagesToConsume.map(row => row['sourceId'])}`)
                this.prevTime = Date.now();
                await this.consumeFunction(messagesToConsume.length === 1 ? messagesToConsume[0] : messagesToConsume, this);
                this.prevTime = Date.now();
            }
            // Continue processing if there are remaining messages
            if (this.queue.length > 0) {
                // this.processQueue();
            }
        } catch (error) {
            console.error(error, 'processQueue error');
        } finally {
            // console.log('Consumption processing is completed and unlocked');
            this.processingLock = false;
        }
    }
}

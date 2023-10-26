import { MessageService } from '@orbiter-finance/rabbit-mq';
import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';
import { TransferAmountTransaction } from './transaction.interface';
import { fix0xPadStartAddress } from "@orbiter-finance/utils";
@Injectable()
export class TransactionService {
    #v2Owners: string[] = [];
    constructor(private readonly messageSerice: MessageService, @InjectRedis() private readonly redis: Redis) {
        this.redis.smembers('v2Owners').then(data => {
            this.#v2Owners = data || [];
        })
    }
    public async handleTransfer(
        transfers: TransferAmountTransaction[],
    ) {
        if (transfers.length > 0) {
            await this.messageSerice.sendTransactionReceiptMessage(transfers);
        }
        return transfers;
    }
    public async isWatchAddress(address: string) {
        address = address.toLowerCase()
        if (this.#v2Owners.includes(address)) {
            return true;
        }
        // const v1Exists = await this.redis.sismember('v1FakeMaker', address);
        // if (+v1Exists == 1) {
        //     return true;
        // }
        const v1MakerList = await this.getWatchAddress();
        if (v1MakerList.find(item => fix0xPadStartAddress(item, 66).toLowerCase() === fix0xPadStartAddress(address, 66).toLowerCase())) {
            return true;
        }
        const v2OwnerExists = await this.redis.sismember('v2Owners', address);
        if (+v2OwnerExists == 1) {
            return true;
        }
        const v2FakeMakerExists = await this.redis.sismember('v2FakeMaker', address);
        if (+v2FakeMakerExists == 1) {
            return true;
        }
        return false;
    }

    public async getWatchAddress(): Promise<string[]> {
        const result = await this.redis.smembers('v1FakeMaker');
        return result as any || [];
    }
}

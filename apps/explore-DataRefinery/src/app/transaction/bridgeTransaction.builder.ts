import { Injectable } from '@nestjs/common';
import { BridgeTransaction, Transfers as TransfersModel } from '@orbiter-finance/seq-models';
@Injectable()
export default class BridgeTransactionBuilder {
    async build(transfer: TransfersModel): Promise<typeof BridgeTransaction> {
        // if Standard  new BridgeTransactionStandardBuilder().build()
        // if OBSource new BridgeTransactionOBSourceBuilder().build()
        // if RouterV3 new BridgeTransactionRouterV3Builder().build()
        // if RouterV1 new BridgeTransactionRouterV1Builder().build()
        // build other commom
        throw new Error('unrealized')
    }
}
export class BridgeTransactionStandardBuilder {
    build(transfer: TransfersModel): Promise<typeof BridgeTransaction> {
        throw new Error('unrealized')
    }
}

export class BridgeTransactionOBSourceBuilder {
    build(transfer: TransfersModel): Promise<typeof BridgeTransaction> {
        throw new Error('unrealized')
    }
}

export class BridgeTransactionRouterV3Builder {
    build(transfer: TransfersModel): Promise<typeof BridgeTransaction> {
        throw new Error('unrealized')
    }
}

export class BridgeTransactionRouterV1Builder {
    build(transfer: TransfersModel): Promise<typeof BridgeTransaction> {
        throw new Error('unrealized')
    }
}
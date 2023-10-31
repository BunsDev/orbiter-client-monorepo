import { Injectable } from '@nestjs/common';
import { BridgeTransaction, Transfers as TransfersModel } from '@orbiter-finance/seq-models';
@Injectable()
export default class BridgeTransactionBuilder {
    async build(transfer: TransfersModel): Promise<typeof BridgeTransaction> {
        // build other common 
        const baseData = new StandardBuilder().build(transfer);
        let builderData;
        // if ('source') {
        //     builderData = new EVMOBSourceContractBuilder().build(transfer);
        // } else if ('RouterV3') {
        //     builderData = new EVMRouterV3ContractBuilder().build(transfer);
        // }
        throw Object.assign(baseData, builderData)
    }
}
export class StandardBuilder {
    build(transfer: TransfersModel): Promise<Partial<typeof BridgeTransaction>> {
        throw new Error('unrealized')
    }
}

export class LoopringBuilder {
    build(transfer: TransfersModel): Promise<Partial<typeof BridgeTransaction>> {
        throw new Error('unrealized')
    }
}

export class EVMOBSourceContractBuilder {
    build(transfer: TransfersModel): Promise<Partial<typeof BridgeTransaction>> {
        throw new Error('unrealized')
    }
}

export class StarknetOBSourceContractBuilder {
    build(transfer: TransfersModel): Promise<Partial<typeof BridgeTransaction>> {
        throw new Error('unrealized')
    }
}

export class EVMRouterV3ContractBuilder {
    build(transfer: TransfersModel): Promise<Partial<typeof BridgeTransaction>> {
        throw new Error('unrealized')
    }
}

export class EVMRouterV1ContractBuilder {
    build(transfer: TransfersModel): Promise<Partial<typeof BridgeTransaction>> {
        throw new Error('unrealized')
    }
}
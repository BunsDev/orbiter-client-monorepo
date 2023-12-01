import { Injectable } from '@nestjs/common';
import { NeedProofSubmissionRequest, ProofSubmissionRequest } from '../common/interfaces/Proof.interface';
import { Level } from 'level';
import { InjectModel } from "@nestjs/sequelize";
import { BridgeTransaction } from "../../../../libs/seq-models/src";
import { keccak256, solidityPack } from "ethers/lib/utils";
import { Config, JsonDB } from "node-json-db";

@Injectable()
export class ProofService {
    public jsondb = new JsonDB(new Config("runtime/makerOpenApiDB", true, false, '/'));
    private db: Level;

    constructor(@InjectModel(BridgeTransaction) private bridgeTransactionModel: typeof BridgeTransaction) {
        this.db = new Level('runtime/maker-openapi', { valueEncoding: 'json' });
    }

    async proofSubmission(data: ProofSubmissionRequest) {
        if (+data.status == 1) {
            await this.jsondb.push(`/proof/${data.transaction.toLowerCase()}`, data.proof);
            // this.db.put(data.transaction.toLowerCase(), data.proof);
        }
        return true;
    }

    async getProof(hash: string) {
        return await this.jsondb.getData(`/proof/${hash.toLowerCase()}`);
        // return await this.db.get(hash.toLowerCase());
    }

    async saveNeedProofTransactionList(data: NeedProofSubmissionRequest) {
        if (!data.chainId || !data.hash) {
            throw new Error('Invalid parameters');
        }
        let bridgeTransaction = data.isSource ? await this.bridgeTransactionModel.findOne(<any>{
            attributes: ['sourceId', 'sourceChain', 'sourceToken', 'targetId', 'targetChain', 'targetToken'],
            where: {
                sourceChain: data.chainId,
                sourceId: data.hash
            }
        }) : await this.bridgeTransactionModel.findOne(<any>{
            attributes: ['sourceId', 'sourceChain', 'sourceToken', 'targetId', 'targetChain', 'targetToken'],
            where: {
                targetChain: data.chainId,
                targetId: data.hash
            }
        });

        if (!bridgeTransaction?.sourceChain) {
            throw new Error(`Unable to locate transaction: ${data.chainId} ${data.hash}`);
        }

        const chain0 = toHex(bridgeTransaction.sourceChain);
        const chain1 = toHex(bridgeTransaction.targetChain);
        const token0 = bridgeTransaction.sourceToken;
        const token1 = bridgeTransaction.targetToken;
        const ruleKey: string = keccak256(solidityPack(['uint256', 'uint256', 'uint256', 'uint256'], [chain0, chain1, token0, token1]));
        await this.jsondb.push(`/tx/${data.hash.toLowerCase()}`, [data.hash, chain0, chain1, ruleKey, data.isSource ? 1 : 0]);
    }

    async getNeedProofTransactionList() {
        let txObj = {};
        try {
            txObj = await this.jsondb.getData(`/tx`);
        } catch (e) {
            console.error('getNeedProofTransactionList', e.message);
        }
        return Object.values(txObj);
    }
}

function toHex(num: string | number) {
    return '0x' + Number(num).toString(16);
}

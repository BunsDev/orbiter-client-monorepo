import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
    ArbitrationMakerTransaction, ArbitrationProof,
    ArbitrationRecord,
} from "@orbiter-finance/maker-api-seq-models";

@Injectable()
export class AppService {
    constructor(
        @InjectModel(ArbitrationRecord)
        private arbitrationRecord: typeof ArbitrationRecord,
        @InjectModel(ArbitrationMakerTransaction)
        private arbitrationMakerTransaction: typeof ArbitrationMakerTransaction,
        @InjectModel(ArbitrationProof)
        private arbitrationProof: typeof ArbitrationProof,
    ) {}

    async getArbitrationInfo(type, page, pageSize, hash:string) {
        const limit = Math.min(pageSize || 10, 100);
        const offset = ((page || 1) - 1) * limit;
        switch (type) {
            case 1: {
                if (hash) {
                    return await this.arbitrationRecord.findAll({
                        where: {
                            sourceId: hash.toLowerCase()
                        }
                    });
                } else {
                    return await this.arbitrationRecord.findAll({
                        offset,
                        limit
                    });
                }
            }
            case 2: {
                if (hash) {
                    return await this.arbitrationProof.findAll({
                        where: {
                            hash: hash.toLowerCase()
                        }
                    });
                } else {
                    return await this.arbitrationProof.findAll({
                        offset,
                        limit
                    });
                }
            }
            case 3: {
                if (hash) {
                    return await this.arbitrationMakerTransaction.findAll({
                        where: {
                            hash: hash.toLowerCase()
                        }
                    });
                } else {
                    return await this.arbitrationMakerTransaction.findAll({
                        offset,
                        limit
                    });
                }
            }
        }
        return [];
    }
}

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

    async getArbitrationInfo(type, page: number, pageSize: number, hash: string, status: number) {
        const limit = Math.min(pageSize || 10, 100);
        const offset = ((page || 1) - 1) * limit;
        switch (type) {
            case 1: {
                let where = {};
                if (hash) {
                    where = {
                        sourceId: hash.toLowerCase()
                    };
                } else if (status && [0, 1].includes(status)) {
                    where = {
                        status
                    };
                }
                const dataList: any[] = JSON.parse(JSON.stringify(await this.arbitrationRecord.findAll({
                    where,
                    offset,
                    limit
                }) || []));
                for (const data of dataList) {
                    switch (data.type) {
                        case 11: {
                            data.type = "challenge";
                            break;
                        }
                        case 12: {
                            data.type = "verifyChallengeSource";
                            break;
                        }
                        case 21: {
                            data.type = "verifyChallengeDest";
                            break;
                        }
                        case 31: {
                            data.type = "checkChallenge";
                            break;
                        }
                    }
                }
                return dataList;
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

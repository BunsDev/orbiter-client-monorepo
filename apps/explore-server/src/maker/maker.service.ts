import { Injectable } from '@nestjs/common';
import { ENVConfigService,MakerV1RuleService } from '@orbiter-finance/config'
import { InjectConnection } from 'nest-knexjs';
import { Knex } from 'knex';
import { uniq, maxBy } from '@orbiter-finance/utils'
// import v1MakerRules from '../config/v1MakerConfig';
import winston from 'winston';
import { createLoggerByName } from '../utils/logger';
@Injectable()
export class MakerService {
    #v2Owners: string[] = [];
    #v2OwnerResponseMakers: string[] = [];
    #v2OwnerResponseMakersVid = 0;
    private logger: winston.Logger = createLoggerByName(MakerService.name);
    constructor(protected envConfigService: ENVConfigService, 
        @InjectConnection() private readonly knex: Knex,
        protected makerV1RuleService: MakerV1RuleService,
        ) {
        this.getV2MakerOwnersFromCache()
        this.getV2MakerOwnerResponseFromCache()
    }

    async getV1MakerOwners() {
        const v1MakerRules = this.makerV1RuleService.getAll();
        return uniq(v1MakerRules.filter(r => r.makerAddress).map(r => r.makerAddress.toLocaleLowerCase()));
    }

    async getV1MakerOwnerResponse() {
        const v1MakerRules = this.makerV1RuleService.getAll();
        const list = v1MakerRules.filter(r => r.sender).map(r => r.sender.toLocaleLowerCase());
        // add fake maker
        const resutl = await this.envConfigService.getAsync("v1ResponseMaker") || [];
        const responseAddrs = [...Object.values(resutl).flat(), ...Object.keys(resutl)];
        list.push(...responseAddrs);
        return uniq(list).map(a => a.toLocaleLowerCase());
    }

    private async getV2MakerOwners() {
        const row = await this.knex('factory_manager')
            .column(['vid', 'owners'])
            .orderBy('vid', 'desc')
            .first();
        return row ? row.owners.map(addr => addr.toLocaleLowerCase()) : [];
    }
    async syncV2MakerOwnersToCache() {
        this.getV2MakerOwners().then((result) => {
            if (result && result.length > 0) {
                if (this.#v2Owners.length != result.length) {
                    this.logger.info(`syncV2MakerOwnersToCache:${JSON.stringify(result)}`);
                }
                this.#v2Owners = result.map(addr => addr.toLocaleLowerCase());
            }
        }).catch(error => {
            this.logger.error(`asyncV2MakerOwnersFromCache error: ${error}`, error);
        })
    }
    async getV2MakerOwnersFromCache() {
        if (this.#v2Owners.length <= 0) {
            this.#v2Owners = await this.getV2MakerOwners();
        }
        return this.#v2Owners;
    }
    private async getV2MakerOwnerResponse(vid = 0) {
        const rows = await this.knex('response_maker')
            .distinct('id')
            .column(['vid'])
            .where('vid', '>', vid);
        if (rows && rows.length > 0) {
            const row = maxBy(rows, ['vid']);
            this.#v2OwnerResponseMakersVid = row.vid;
            const v2OwnerResponseMakers = rows.map((row) => row.id.toLocaleLowerCase());
            return v2OwnerResponseMakers;
        }
        return []
    }
    async syncV2MakerOwnerResponseToCache() {
        const lastId = this.#v2OwnerResponseMakersVid;
        this.getV2MakerOwnerResponse(lastId).then((result) => {
            if (result && result.length > 0) {
                this.#v2OwnerResponseMakers.push(...result);
                this.#v2OwnerResponseMakers = uniq(this.#v2OwnerResponseMakers);
                if (lastId != this.#v2OwnerResponseMakersVid) {
                    this.logger.info(`syncV2MakerOwnerResponseToCache:${JSON.stringify(this.#v2OwnerResponseMakers)}`);
                }
            }
        }).catch(error => {
            this.logger.error(`asyncV2MakerOwnerResponseToCache error: ${error}`, error);
        })
    }
    async getV2MakerOwnerResponseFromCache() {
        if (this.#v2OwnerResponseMakers.length <= 0) {
            this.#v2OwnerResponseMakers = await this.getV2MakerOwnerResponse();
        }
        return this.#v2OwnerResponseMakers;
    }
    async getWhiteWalletAddress() {
        const v1Owners = await this.getV1MakerOwners();
        const v1Responses = await this.getV1MakerOwnerResponse();
        const v2Owners = await this.getV2MakerOwnersFromCache();
        const v2Responses = await this.getV2MakerOwnerResponseFromCache();
        return uniq([...v1Owners, ...v1Responses, ...v2Owners, ...v2Responses]);
    }
    public async isWhiteWalletAddress(address: string) {
        if (!address) {
            return {
                version: '0',
                exist: false,
            };
        }
        address = address.toLocaleLowerCase();
        const v1Owners = await this.getV1MakerOwners();
        if (v1Owners.includes(address)) {
            return {
                version: '1',
                exist: true,
            };
        }
        const v1Responses = await this.getV1MakerOwnerResponse();
        if (v1Responses.includes(address)) {
            return {
                version: '1',
                exist: true,
            };
        }
        const v2Owners = await this.getV2MakerOwnersFromCache();
        if (v2Owners.includes(address)) {
            return {
                version: '2',
                exist: true,
            };
        }
        const v2Responses = await this.getV2MakerOwnerResponseFromCache();
        if (v2Responses.includes(address)) {
            return {
                version: '2',
                exist: true,
            };
        }
        return {
            version: '0',
            exist: false,
        };
    }

    public async isV1WhiteWalletAddress(address: string): Promise<boolean> {
        if (!address) {
            return false;
        }
        address = address.toLocaleLowerCase();
        const v1Owners = await this.getV1MakerOwners();
        if (v1Owners.includes(address)) {
            return true;
        }
        const v1Responses = await this.getV1MakerOwnerResponse();
        if (v1Responses.includes(address)) {
            return true;
        }
        return false;
    }
    public async isV2WhiteWalletAddress(address: string): Promise<boolean> {
        if (!address) {
            return false;
        }
        address = address.toLocaleLowerCase();
        const v2Owners = await this.getV2MakerOwnersFromCache();
        if (v2Owners.includes(address)) {
            return true;
        }
        const v2Responses = await this.getV2MakerOwnerResponseFromCache();
        if (v2Responses.includes(address)) {
            return true;
        }
        return false;
    }

}

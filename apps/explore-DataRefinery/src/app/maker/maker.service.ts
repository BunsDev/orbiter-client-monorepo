import { Injectable } from '@nestjs/common';
import { ENVConfigService, MakerV1RuleService } from '@orbiter-finance/config'
import { uniq, maxBy, logger, addressPadStart64, equals } from '@orbiter-finance/utils'
// import v1MakerRules from '../config/v1MakerConfig';
import winston from 'winston';
import { SubgraphClient } from '@orbiter-finance/subgraph-sdk';
import { Transfers } from '@orbiter-finance/seq-models';
import dayjs from 'dayjs';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';
@Injectable()
export class MakerService {
    #v2Owners: string[] = [];
    private logger: winston.Logger = logger.createLoggerByName(MakerService.name);
    constructor(
        @InjectRedis() private readonly redis: Redis,
        protected envConfigService: ENVConfigService,
        protected makerV1RuleService: MakerV1RuleService,
    ) {
    }
    async getV2ChainInfo(chainId: string) {
        return await this.redis.hget('chains', chainId).then(data => data && JSON.parse(data));
    }
    async getV2ChainInfoTokenByMainnetToken(chainId: string, tokenAddr: string) {
        const chain = await this.redis.hget('chains', chainId).then(data => data && JSON.parse(data));
        if (chain && chain.tokens) {
            return chain.tokens.find(token => equals(token.tokenAddress, tokenAddr));
        }
        return null;
    }
    async getV2RuleByTransfer(transfer: Transfers, dealerIndex: number, ebcIndex: number, targetChainIdIndex: number) {
        const sourceChainData = await this.getV2ChainInfo(transfer.chainId);
        if (!sourceChainData) {
            return {
                errno: 1000,
                errmsg: 'sourceChainData not found'
            }
        }
        const sourceToken = sourceChainData.tokens.find(token => equals(token.tokenAddress, addressPadStart64(transfer.token)));
        if (!sourceChainData) {
            return {
                errno: 1000,
                errmsg: 'sourceToken not found'
            }
        }
        const owner = transfer.receiver;
        const txTimestamp = dayjs(transfer.timestamp).unix();
        const subgraphClient = new SubgraphClient(await this.envConfigService.getAsync("SubgraphEndpoint"));
        const securityCodeInfo = await subgraphClient.maker.getCrossChainMakerSecurityCodeInfo(owner, dealerIndex, ebcIndex, targetChainIdIndex, txTimestamp);
        if (!securityCodeInfo) {
            return {
                errno: 1000,
                errmsg: 'securityCodeInfo not found'
            }
        }
        const ebcSnapshot = securityCodeInfo.ebcSnapshot;
        if (ebcSnapshot.length !== 1 || !ebcSnapshot[0]['ebcMappingSnapshot']) {
            return {
                errno: 1000,
                errmsg: 'ebcSnapshot not found'
            }
        }
        const dealerSnapshot = securityCodeInfo.dealerSnapshot;
        if (dealerSnapshot.length !== 1 || !dealerSnapshot[0]['dealerMappingSnapshot']) {
            return {
                errno: 1000,
                errmsg: 'dealerSnapshot not found'
            }
        }
        const chainIdSnapshot = securityCodeInfo.chainIdSnapshot;
        if (chainIdSnapshot.length !== 1 || !chainIdSnapshot[0]['chainIdMappingSnapshot']) {
            return {
                errno: 1000,
                errmsg: 'chainIdSnapshot not found'
            }
        }

        const ebc = ebcSnapshot[0]['ebcMappingSnapshot'][0];
        if (!ebc) {
            return {
                errno: 1000,
                errmsg: 'ebc not found'
            }
        }
        const dealer = dealerSnapshot[0]['dealerMappingSnapshot'][0];
        if (!dealer) {
            return {
                errno: 1000,
                errmsg: 'dealer not found'
            }
        }
        const targetChain = chainIdSnapshot[0]['chainIdMappingSnapshot'][0];
        if (!targetChain) {
            return {
                errno: 1000,
                errmsg: 'targetChain not found'
            }
        }
        const targetChainData = await this.getV2ChainInfo(targetChain.chainId);
        const targetToken = targetChainData.tokens.find(token => equals(token.mainnetToken, sourceToken.mainnetToken));
        const rule = await subgraphClient.maker.getCrossChainMakerSecurityCodeInfoRule(owner, ebc.ebcAddr, +sourceChainData.id, +targetChain.chainId, sourceToken.tokenAddress, targetToken.tokenAddress, txTimestamp);
        return {
            code: 0,
            data: {
                rule,
                ebc,
                dealer,
                sourceToken,
                targetToken
            }
        };

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

    async syncV2MakerOwnersToCache() {
        const subgraphClient = new SubgraphClient(this.envConfigService.get("SubgraphEndpoint"));
        const v2Owners = await subgraphClient.factory.getOwners();
        if (v2Owners) {
            if (v2Owners && v2Owners.length > 0) {
                if (this.#v2Owners.length != v2Owners.length) {
                    this.logger.info(`syncV2MakerOwnersToCache:${JSON.stringify(v2Owners)}`);
                }
                this.#v2Owners = v2Owners.map(addr => addr.toLocaleLowerCase());
            }
        }
    }
    async getV2MakerOwnersFromCache() {
        return this.#v2Owners;
    }
    async getWhiteWalletAddress() {
        const v1Owners = await this.getV1MakerOwners();
        const v1Responses = await this.getV1MakerOwnerResponse();
        const v2Owners = await this.getV2MakerOwnersFromCache();
        return uniq([...v1Owners, ...v1Responses, ...v2Owners]);
    }
    public async isWhiteWalletAddress(address: string) {
        if (!address) {
            return {
                version: '0',
                exist: false,
            };
        }
        address = address.toLocaleLowerCase();
        try {
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
        } catch (error) {
            throw new Error(`isWhiteWalletAddress v1 error ${error.message}`);
        }
        try {
            const v2Owners = await this.getV2MakerOwnersFromCache();
            if (v2Owners.includes(address)) {
                return {
                    version: '2',
                    exist: true,
                };
            }
        } catch (error) {
            throw new Error(`isWhiteWalletAddress v2 error ${error.message}`);
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
        return false;
    }

}

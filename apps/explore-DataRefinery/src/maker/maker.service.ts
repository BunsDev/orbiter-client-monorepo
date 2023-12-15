import { Injectable } from '@nestjs/common';
import { ENVConfigService, MakerV1RuleService } from '@orbiter-finance/config'
import { equals } from '@orbiter-finance/utils'
// import v1MakerRules from '../config/v1MakerConfig';
import { SubgraphClient } from '@orbiter-finance/subgraph-sdk';
import { Transfers } from '@orbiter-finance/seq-models';
import dayjs from 'dayjs';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';
import { uniq } from 'lodash';
import { addressPadStart } from '../utils';
@Injectable()
export class MakerService {
    #v2Owners: string[] = [];
    constructor(
        @InjectRedis() private readonly redis: Redis,
        protected envConfigService: ENVConfigService,
        protected makerV1RuleService: MakerV1RuleService,
    ) {
        this.redis.smembers('v2Owners').then(data => {
            this.#v2Owners = data || [];
        })
    }
    async getSubClient(): Promise<SubgraphClient> {
        const SubgraphEndpoint = await this.envConfigService.getAsync("SubgraphEndpoint");
        if (!SubgraphEndpoint) {
            throw new Error('SubgraphEndpoint not found');
        }
        return new SubgraphClient(SubgraphEndpoint);
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
        const sourceToken = sourceChainData.tokens.find(token => equals(token.tokenAddress, addressPadStart(transfer.token, 66)));
        if (!sourceToken) {
            return {
                errno: 1000,
                errmsg: `sourceToken not found ${addressPadStart(transfer.token, 66)}`
            }
        }
        const owner = transfer.receiver;
        const txTimestamp = dayjs(transfer.timestamp).unix();
        const subgraphClient = await this.getSubClient();
        if (!subgraphClient) {
            return {
                errno: 1000,
                errmsg: 'getV2RuleByTransfer SubClient not found'
            }
        }
        const securityCodeInfo = await subgraphClient.maker.getCrossChainMakerSecurityCodeInfo(owner, dealerIndex, ebcIndex, targetChainIdIndex, txTimestamp);
        if (!securityCodeInfo) {
            return {
                errno: 1000,
                errmsg: 'securityCodeInfo not found'
            }
        }

        const ebc = securityCodeInfo['ebcMappingSnapshot']?.[0];
        if (!ebc) {
            return {
                errno: 1000,
                errmsg: `ebc not found ${ebcIndex}`
            }
        }
        const dealer = securityCodeInfo['dealerMappingSnapshot']?.[0];
        if (!dealer) {
            return {
                errno: 1000,
                errmsg: `dealer not found ${dealerIndex}`
            }
        }
        const targetChain = securityCodeInfo['chainIdMappingSnapshot']?.[0];
        if (!targetChain) {
            return {
                errno: 1000,
                errmsg: `targetChain not found ${targetChainIdIndex}`
            }
        }
        const targetChainData = await this.getV2ChainInfo(targetChain.chainId);
        const targetToken = targetChainData.tokens.find(token => equals(token.mainnetToken, sourceToken.mainnetToken));
        const rule = await subgraphClient.maker.getCrossChainMakerSecurityCodeInfoRule(owner, ebc.ebcAddr, +sourceChainData.id, +targetChain.chainId, sourceToken.tokenAddress, targetToken.tokenAddress, txTimestamp);
        if (!rule) {
            return {
                errno: 1000,
                errmsg: 'rule not found',
                data: {
                    owner,
                    ebcAddr: ebc.ebcAddr,
                    sourceChain: +sourceChainData.id,
                    targetChain: +targetChain.chainId,
                    sourceToken: sourceToken.tokenAddress,
                    targetToken: targetToken.tokenAddress,
                    txTimestamp
                }
            }
        }
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

    async getV2MakerOwnersFromRedis() {
        const owners = await this.redis.smembers('v2Owners');
        this.#v2Owners = owners;
        return owners;
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
        // redis
        if (this.#v2Owners.length <= 0) {
            await this.getV2MakerOwnersFromRedis()
        }
        if (this.#v2Owners.includes(address)) {
            return true;
        }
        const v2FakeMakerExists = await this.redis.sismember('v2FakeMaker', address);
        if (+v2FakeMakerExists == 1) {
            return true;
        }
        return false;
    }

}

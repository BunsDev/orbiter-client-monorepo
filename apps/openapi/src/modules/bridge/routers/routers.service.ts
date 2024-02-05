import { Injectable } from '@nestjs/common';
import { RoutersConfig } from '../bridge.interface';
import { ChainConfigService, ENVConfigService, MakerV1RuleService } from '@orbiter-finance/config';
import { ChainsService } from '../chains/chains.service';
import { padStart, uniq } from 'lodash';
import BigNumber from 'bignumber.js';

@Injectable()
export class RoutersService {
    private dealerRules: { [key: string]: any[] } = {};
    constructor(
        private readonly rulesService: MakerV1RuleService,
        private readonly chainService: ChainsService,
        private readonly envConfigService: ENVConfigService,
        private readonly chainConfigService: ChainConfigService
    ) {
        setInterval(() => {
            for (const dealerId in this.dealerRules) {
                this.syncV3Routers(dealerId);
            }
        }, 1000 * 10)
    }

    /**
     * Get configurations for V1 routers based on rules.
     * @returns An array of V1 router configurations.
     */
    async getV1Routers(whiteMakers:string[] = []): Promise<RoutersConfig[]> {
        // Retrieve information about available chains
        const chains = await this.chainConfigService.getAllChains();
        const v1RouterConfigs: RoutersConfig[] = [];

        // Retrieve rules from Maker V1 service
        const v1Rules = await this.rulesService.configs;
        // Iterate through each rule and convert it to a router configuration
        const notWhiteMakers = [];
        for (const v1Rule of v1Rules) {
            try {
                const internalChainId = v1Rule['chain'].split('-');
                const sourceChain = chains.find(row => row.internalId == internalChainId[0]);
                const targetChain = chains.find(row => row.internalId == internalChainId[1]);
                if (whiteMakers.length > 0 && !whiteMakers.includes(v1Rule['makerAddress'].toLocaleLowerCase())) {
                    notWhiteMakers.push(v1Rule['makerAddress'].toLocaleLowerCase());
                    continue;
                }
                if (!sourceChain || !sourceChain.tokens) {
                    console.log(`v1Rule not find sourceChain ${internalChainId[0]}`, internalChainId);
                    continue;
                }
                if (!targetChain) {
                    console.log(`v1Rule not find targetChain ${internalChainId[1]}`, internalChainId);
                    continue;
                }
                const sourceToken = sourceChain.tokens.find(t => t.symbol == v1Rule['sourceSymbol']);
                if (!sourceToken) {
                    console.log(`v1Rule not find sourceToken`, v1Rule);
                    continue;
                }
                const targetToken = targetChain.tokens.find(t => t.symbol == v1Rule['targetSymbol']);
                if (!targetToken) {
                    console.log(`v1Rule not find targetToken`, v1Rule);
                    continue;
                }
                const withholdingFee = +v1Rule['tradingFee'];
                const minAmount = new BigNumber(v1Rule['minPrice']).plus(withholdingFee);
                const routerConfig: RoutersConfig = {
                    line: '',
                    endpoint: v1Rule['makerAddress'],
                    endpointContract: null,
                    srcChain: String(sourceChain.chainId),
                    tgtChain: String(targetChain.chainId),
                    srcToken: sourceToken.address,
                    tgtToken: targetToken.address,
                    maxAmt: String(v1Rule['maxPrice']),
                    minAmt:minAmount.toString(),
                    tradeFee: String(+v1Rule['gasFee'] * 1000),
                    withholdingFee: String(withholdingFee),
                    vc: String(+internalChainId[1] + 9000),
                    state: 'available',
                    compRatio: 1,
                    spentTime: 60,
                };
                if (sourceToken.symbol != targetToken.symbol) {
                    if (sourceChain && sourceChain.contracts) {
                        const contract = sourceChain.contracts.find(c => c.name === 'OrbiterRouterV3');
                        routerConfig.endpointContract = contract?.address;
                    }
                    if (!routerConfig.endpointContract)
                        routerConfig.state = 'disabled';
                } else if (routerConfig.srcChain == 'SN_MAIN') {
                    if (sourceChain && sourceChain.contracts) {
                        const contract = sourceChain.contracts.find(c => c.name === 'StarknetOrbiterRouter');
                        routerConfig.endpointContract = contract?.address;
                    }

                    if (!routerConfig.endpointContract) {
                        routerConfig.state = 'disabled';
                    }
                }
                else if (routerConfig.tgtChain == 'SN_MAIN') {
                    if (sourceChain && sourceChain.contracts) {
                        const contract = sourceChain.contracts.find(c => c.name === 'OrbiterRouterV3');
                        routerConfig.endpointContract = contract?.address;
                    }
                    if (!routerConfig.endpointContract) {
                        routerConfig.state = 'disabled';
                    }
                }

                // Skip configurations with incorrect vc length
                if (routerConfig.vc.length != 4) {
                    console.log(`v1Rule vc length not 4`, routerConfig);
                    continue;
                }
                routerConfig.line = `${routerConfig.srcChain}/${routerConfig.tgtChain}-${v1Rule['sourceSymbol']}/${v1Rule['targetSymbol']}`;
                v1RouterConfigs.push(routerConfig);
            } catch (error) {
                console.error('getV1Routers error', error);
            }

        }
        if (notWhiteMakers && notWhiteMakers.length > 0) {
            console.log(`v1Rule not white maker ${JSON.stringify(uniq(notWhiteMakers))}`);
        }
        return v1RouterConfigs;
    }

    async getV3Routers(dealer: string) {
        if (this.dealerRules[dealer] && this.dealerRules[dealer].length > 0) {
            return this.dealerRules[dealer];
        }
        this.dealerRules[dealer] = [];
        await this.syncV3Routers(dealer);
        return this.dealerRules[dealer];

    }
    /**
     * Get configurations for V3 routers based on rules.
     * @param dealerAddress The address of the dealer.
     * @returns An array of V3 router configurations.
     */
    async syncV3Routers(dealerAddress: string, whiteMakers:string[] = []): Promise<RoutersConfig[]> {
        // Request V3 router configurations from the remote API
        const { result } = await this.requestRemoteV3Router(dealerAddress);
        if (!result) {
            console.log('syncV3Routers fail', result);
            return;
        }
        const v3RouterConfigs: RoutersConfig[] = [];
        const chains = await this.chainService.getChains();
        // Iterate through each rule from the API response and convert it to a router configuration
        const notWhiteMakers = [];
        for (const v3Rule of result.ruleList) {
            try {
                const { fromChain, toChain } = v3Rule;
                if (whiteMakers.length > 0 && !whiteMakers.includes(v3Rule['recipient'].toLocaleLowerCase())) {
                    notWhiteMakers.push(v3Rule['recipient'].toLocaleLowerCase());
                    continue;
                }
                const withholdingFee = +v3Rule['tradingFee'];
                const minAmount = new BigNumber(fromChain['minPrice']).plus(withholdingFee);
                const routerConfig: RoutersConfig = {
                    line: `${fromChain['chainId']}/${toChain['chainId']}-${fromChain['symbol']}/${toChain['symbol']}`,
                    endpoint: v3Rule['recipient'],
                    endpointContract: null,
                    srcChain: fromChain['chainId'],
                    tgtChain: toChain['chainId'],
                    srcToken: fromChain['tokenAddress'],
                    tgtToken: toChain['tokenAddress'],
                    maxAmt: String(fromChain['maxPrice'] || "0"),
                    minAmt: minAmount.toString(),
                    tradeFee: v3Rule['gasFee'],
                    withholdingFee: String(withholdingFee),
                    vc: `${padStart(v3Rule.dealerId, 2, "0")}${v3Rule['ebcId']}${padStart(toChain.id, 2, "0")}`,
                    state: 'available',
                    compRatio: v3Rule['_compensationRatio'], // 1000000
                    spentTime: v3Rule['spentTime'], // second
                };

                // Skip configurations with incorrect vc length
                if (routerConfig.vc.length != 5) {
                    continue;
                }
                const sourceChain = chains.find(row => row.chainId == routerConfig.srcChain);
                if (fromChain.symbol != toChain.symbol) {
                    for (const addr in sourceChain.contract) {
                        if (sourceChain.contract[addr] === 'OrbiterRouterV3') {
                            routerConfig.endpointContract = addr;
                            break;
                        }
                    }
                    if (!routerConfig.endpointContract) {
                        routerConfig.state = 'disabled';
                    }
                }

                v3RouterConfigs.push(routerConfig);
            } catch (error) {
                console.error('getV3Routers error', error);
            }

        }
        if (notWhiteMakers && notWhiteMakers.length > 0) {
            console.log(`v3Rule not white maker ${JSON.stringify(uniq(notWhiteMakers))}`);
        }
        this.dealerRules[dealerAddress] = v3RouterConfigs;
        return v3RouterConfigs;
    }

    /**
     * Request remote V3 router configurations.
     * @param dealerAddress The address of the dealer.
     * @returns The response from the remote V3 router API.
     */
    async requestRemoteV3Router(dealerAddress: string): Promise<any> {
        // Prepare and send a request to the remote V3 router API
        const raw = JSON.stringify({
            "id": 1,
            "jsonrpc": "2.0",
            "method": "orbiter_getDealerRuleLatest",
            "params": [
                dealerAddress
            ]
        });

        const myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");
        myHeaders.append("Accept", "*/*");
        myHeaders.append("Host", "openapi.orbiter.finance");
        myHeaders.append("Connection", "keep-alive");

        const openapiUrl = this.envConfigService.get("OPENAPI_URL");
        const result = await fetch(openapiUrl, {
            "method": "POST",
            headers: myHeaders,
            "body": raw,
        }).then(res => res.json());

        return result;
    }
}

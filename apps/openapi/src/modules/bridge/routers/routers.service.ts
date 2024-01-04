import { Injectable } from '@nestjs/common';
import { RoutersConfig } from '../bridge.interface';
import { ENVConfigService, MakerV1RuleService } from '@orbiter-finance/config';
import { ChainsService } from '../chains/chains.service';
import { padStart } from 'lodash';

@Injectable()
export class RoutersService {
    constructor(
        private readonly rulesService: MakerV1RuleService,
        private readonly chainService: ChainsService,
        private envConfigService: ENVConfigService,
    ) { }

    /**
     * Get configurations for V1 routers based on rules.
     * @returns An array of V1 router configurations.
     */
    async getV1Routers(): Promise<RoutersConfig[]> {
        // Retrieve information about available chains
        const WHITE_MAKERS = this.envConfigService.get("WHITE_MAKERS", []);
        const chains = await this.chainService.getChains();
        const v1RouterConfigs: RoutersConfig[] = [];

        // Retrieve rules from Maker V1 service
        const v1Rules = await this.rulesService.getAll();

        // Iterate through each rule and convert it to a router configuration
        for (const v1Rule of v1Rules) {
            try {
                const internalChainId = v1Rule['chain'].split('-');
                const sourceChain = chains.find(row => row.internalId == internalChainId[0]);
                const targetChain = chains.find(row => row.internalId == internalChainId[1]);
                if (WHITE_MAKERS.length > 0 && !WHITE_MAKERS.includes(v1Rule['makerAddress'].toLocaleLowerCase())) {
                    console.log(`v1Rule not white maker ${v1Rule['makerAddress'].toLocaleLowerCase()}`);
                    continue;
                }
                if (!sourceChain || !sourceChain.tokens) {
                    console.log(`v1Rule not find sourceChain`, v1Rule.chain);
                    continue;
                }
                if (!targetChain) {
                    console.log(`v1Rule not find targetChain`, v1Rule.tgtChain);
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
                const routerConfig: RoutersConfig = {
                    line: '',
                    endpoint: v1Rule['makerAddress'],
                    endpointContract: null,
                    srcChain: String(sourceChain.chainId),
                    tgtChain: String(targetChain.chainId),
                    srcToken: sourceToken.address,
                    tgtToken: targetToken.address,
                    maxAmt: String(v1Rule['maxPrice']),
                    minAmt: String(v1Rule['minPrice']),
                    tradeFee: String(+v1Rule['gasFee'] * 1000),
                    withholdingFee: String(v1Rule['tradingFee']),
                    vc: String(+internalChainId[1] + 9000),
                    state: 'available',
                    compRatio: 1,
                    spentTime: 60,
                };
                if (sourceToken.symbol != targetToken.symbol) {
                    for (const addr in sourceChain.contract) {
                        if (sourceChain.contract[addr] === 'OrbiterRouterV3') {
                            routerConfig.endpointContract = addr;
                            break;
                        }
                    }
                    if (!routerConfig.endpointContract) {
                        routerConfig.state = 'disabled';
                    }
                } else if (routerConfig.srcChain == 'SN_MAIN') {
                    for (const addr in sourceChain.contract) {
                        if (sourceChain.contract[addr] === 'OBSource') {
                            routerConfig.endpointContract = addr;
                            break;
                        }
                    }
                    if (!routerConfig.endpointContract) {
                        routerConfig.state = 'disabled';
                    }
                }
                else if (routerConfig.tgtChain == 'SN_MAIN') {
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

        return v1RouterConfigs;
    }

    /**
     * Get configurations for V3 routers based on rules.
     * @param dealerAddress The address of the dealer.
     * @returns An array of V3 router configurations.
     */
    async getV3Routers(dealerAddress: string): Promise<RoutersConfig[]> {
        // Request V3 router configurations from the remote API
        const { result } = await this.requestRemoteV3Router(dealerAddress);
        const v3RouterConfigs: RoutersConfig[] = [];
        const chains = await this.chainService.getChains();
        const WHITE_MAKERS = this.envConfigService.get("WHITE_MAKERS", []);
        // Iterate through each rule from the API response and convert it to a router configuration
        for (const v3Rule of result.ruleList) {
            try {
                const { fromChain, toChain } = v3Rule;
                if (WHITE_MAKERS.length > 0 && !WHITE_MAKERS.includes(v3Rule['recipient'].toLocaleLowerCase())) {
                    console.log(`v3Rule not white maker `, v3Rule);
                    continue;
                }


                const routerConfig: RoutersConfig = {
                    line: `${fromChain['chainId']}/${toChain['chainId']}-${fromChain['symbol']}/${toChain['symbol']}`,
                    endpoint: v3Rule['recipient'],
                    endpointContract: null,
                    srcChain: fromChain['chainId'],
                    tgtChain: toChain['chainId'],
                    srcToken: fromChain['tokenAddress'],
                    tgtToken: toChain['tokenAddress'],
                    maxAmt: String(fromChain['maxPrice'] || "0"),
                    minAmt: String(fromChain['minPrice'] || "0"),
                    tradeFee: v3Rule['gasFee'],
                    withholdingFee: v3Rule['tradingFee'],
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

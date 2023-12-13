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
    ) {}

    /**
     * Get configurations for V1 routers based on rules.
     * @returns An array of V1 router configurations.
     */
    async getV1Routers(): Promise<RoutersConfig[]> {
        // Retrieve information about available chains
        const chains = await this.chainService.getChains();
        const v1RouterConfigs: RoutersConfig[] = [];

        // Retrieve rules from Maker V1 service
        const v1Rules = await this.rulesService.getAll();

        // Iterate through each rule and convert it to a router configuration
        for (const v1Rule of v1Rules) {
            const internalChainId = v1Rule['chain'].split('-');
            const sourceChain = chains.find(row => row.internalId == internalChainId[0]);
            const targetChain = chains.find(row => row.internalId == internalChainId[1]);

            const routerConfig: RoutersConfig = {
                endpoint: v1Rule['makerAddress'],
                srcChain: "",
                tgtChain: "",
                srcToken: v1Rule['sourceSymbol'],
                tgtToken: v1Rule['targetSymbol'],
                maxAmt: String(v1Rule['maxPrice']),
                minAmt: String(v1Rule['minPrice']),
                tradeFee: String(+v1Rule['gasFee'] * 1000),
                withholdingFee: String(v1Rule['tradingFee']),
                vc: String(+internalChainId[1] + 9000),
                compRatio: 1,
                spentTime: 1800,
            };

            // Populate source and target chain information if available
            if (sourceChain) {
                routerConfig.srcChain = String(sourceChain.chainId);
            }
            if (targetChain) {
                routerConfig.tgtChain = String(targetChain.chainId);
            }

            // Skip configurations with incorrect vc length
            if (routerConfig.vc.length != 4) {
                continue;
            }

            v1RouterConfigs.push(routerConfig);
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

        // Iterate through each rule from the API response and convert it to a router configuration
        for (const v3Rule of result.ruleList) {
            const { fromChain, toChain } = v3Rule;
            const routerConfig: RoutersConfig = {
                endpoint: v3Rule['recipient'],
                srcChain: fromChain['chainId'],
                tgtChain: toChain['chainId'],
                srcToken: fromChain['symbol'],
                tgtToken: toChain['symbol'],
                maxAmt: String(fromChain['maxPrice'] || "0"),
                minAmt: String(fromChain['minPrice'] || "0"),
                tradeFee: v3Rule['gasFee'],
                withholdingFee: v3Rule['tradingFee'],
                vc: `${padStart(v3Rule.dealerId, 2, "0")}${v3Rule['ebcId']}${padStart(toChain.id, 2, "0")}`,
                compRatio: v3Rule['_compensationRatio'], // 1000000
                spentTime: v3Rule['spentTime'], // second
            };

            // Skip configurations with incorrect vc length
            if (routerConfig.vc.length != 5) {
                continue;
            }

            v3RouterConfigs.push(routerConfig);
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

import { Get, Injectable } from '@nestjs/common';
import { RoutersConfig } from '../bridge.interface';
import { MakerV1RuleService } from '@orbiter-finance/config';
import { ChainsService } from '../chains/chains.service';
import { padStart } from 'lodash';
@Injectable()
export class RoutersService {
    constructor(private readonly rulesService: MakerV1RuleService, private readonly chainService: ChainsService) {
    }
    async getV1Routers() {
        const chains = await this.chainService.getChains();
        const configs: RoutersConfig[] = [];
        const rows = await this.rulesService.getAll();
        for (const row of rows) {
            const internalChainId = row['chain'].split('-');
            const sourceChain = chains.find(row => row.internalId == internalChainId[0]);
            const targetChain = chains.find(row => row.internalId == internalChainId[1]);
            const routerConfig = {
                endpoint: row['makerAddress'],
                srcChain: "",
                tgtChain: "",
                srcToken: row['sourceSymbol'],
                tgtToken: row['targetSymbol'],
                maxAmt: String(row['maxPrice']),
                minAmt: String(row['minPrice']),
                tradeFee: String(+row['gasFee'] * 1000),
                withholdingFee: String(row['tradingFee']),
                vc: String(+internalChainId[1] + 9000),
                compRatio: 1,
                spentTime: 1800
            }
            if (sourceChain) {
                routerConfig.srcChain = String(sourceChain.chainId);
            }
            if (targetChain) {
                routerConfig.tgtChain = String(targetChain.chainId);
            }
            if (routerConfig.vc.length != 4) {
                continue;
            }
            configs.push(routerConfig);
        }
        return configs;
    }
    async getV3Routers(dealerAddress:string) {
        const { result } = await this.requestRemoteV3Router(dealerAddress);
        const configs: RoutersConfig[] = [];
        for (const row of result.ruleList) {
            const { fromChain, toChain } = row;
            const routerConfig = {
                endpoint: row['recipient'],
                srcChain: fromChain['chainId'],
                tgtChain: toChain['chainId'],
                srcToken: fromChain['symbol'],
                tgtToken: toChain['symbol'],
                maxAmt: String(fromChain['maxPrice'] || "0"),
                minAmt: String(fromChain['minPrice'] || "0"),
                tradeFee: row['gasFee'],
                withholdingFee: row['tradingFee'],
                vc: `${padStart(row.dealerId, 2, "0")}${row['ebcId']}${padStart(toChain.id, 2, "0")}`,
                compRatio: row['_compensationRatio'],// 1000000
                spentTime: row['spentTime']// second
            }
            if (routerConfig.vc.length != 5) {
                continue;
            }
            configs.push(routerConfig);
        }
        return configs;
    }

    async requestRemoteV3Router(dealerAddress: string) {
        var raw = JSON.stringify({
            "id": 1,
            "jsonrpc": "2.0",
            "method": "orbiter_getDealerRuleLatest",
            "params": [
                dealerAddress
            ]
        });
        var myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");
        myHeaders.append("Accept", "*/*");
        myHeaders.append("Host", "openapi.orbiter.finance");
        myHeaders.append("Connection", "keep-alive");
        const result = await fetch("http://openapi.orbiter.finance/explore/v3/yj6toqvwh1177e1sexfy0u1pxx5j8o47", {
            "method": "POST",
            headers: myHeaders,
            "body": raw,
        }).then(res => res.json());
        return result;
    }
}

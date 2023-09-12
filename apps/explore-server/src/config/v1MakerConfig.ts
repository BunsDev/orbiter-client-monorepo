import maker1 from './maker-1.json';
import maker2 from './maker-2.json';
import maker3 from './maker-3.json';
import maker4 from './maker-4.json';
const allConfig = [maker1, maker2, maker3, maker4];
function init() {
    const makerRules = [];
    for (const makerConfigs of allConfig) {
        for (const chainId in makerConfigs) {
            const chains = chainId.split('-');
            for (const symbolId in makerConfigs[chainId]) {
                const ruleConfig = makerConfigs[chainId][symbolId];
                const symbols = symbolId.split('-');
                makerRules.push({
                    ...ruleConfig,
                    sourceChainId: chains[0],
                    targetChainId: chains[1],
                    sourceSymbol: symbols[0],
                    targetSymbol: symbols[1],
                });
            }
        }
    }
    return makerRules;
}
export default init();
import { readdirSync, readFileSync } from 'fs';
import { join, extname, parse } from 'path';
import ERC20Abi from './lib/ERC20Abi.json';
import OBSource from './lib/OBSource.json';
import OrbiterRouterV1 from './lib/OrbiterRouterV1.json';
import OrbiterRouterV3 from './lib/OrbiterRouterV3.json';
import ChainLinkAggregatorV3 from './lib/ChainLinkAggregatorV3.json';
import StarknetAccount from './lib/StarknetAccount.json';
import StarknetERC20 from './lib/StarknetERC20.json';
import MakerDeposit from './lib/MakerDeposit.json';
import CrossInscriptions from './lib/CrossInscriptions.json';
import MDCAbi from './lib/MDCAbi.json';
import TransitFinanceRouterV5 from './lib/TransitFinanceRouterV5.json'
import StarknetAccountCairo1 from './lib/StarknetAccountCairo1.json'
type ABI_JSON = any;
const abis: { [key: string]: ABI_JSON } = {};
function loadJsonFiles(directoryPath: string) {
    const files = readdirSync(directoryPath);
    files.forEach(async (file) => {
        const filePath = join(directoryPath, file);
        const fileName = parse(file).name;
        if (extname(file) === '.json') {
            const fileContent = readFileSync(filePath, 'utf8');
            abis[fileName] = JSON.parse(fileContent);
        }
    });
    return abis;
}
loadJsonFiles(join(__dirname));
export {
    StarknetERC20,
    StarknetAccount,
    ChainLinkAggregatorV3,
    ERC20Abi,
    OBSource,
    OrbiterRouterV1,
    OrbiterRouterV3,
    MakerDeposit,
    CrossInscriptions,
    MDCAbi,
    TransitFinanceRouterV5,
    StarknetAccountCairo1
};

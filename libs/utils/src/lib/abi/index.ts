import { readdirSync, readFileSync } from 'fs';
import { join, extname, parse } from 'path';
import ERC20Abi from './ERC20Abi.json';
import OBSource from './OBSource.json';
import OrbiterRouterV1 from './OrbiterRouterV1.json';
import OrbiterRouterV3 from './OrbiterRouterV3.json';
import ChainLinkAggregatorV3 from './ChainLinkAggregatorV3.json';
import StarknetAccount from './StarknetAccount.json';
import StarknetERC20 from './StarknetERC20.json';
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
};

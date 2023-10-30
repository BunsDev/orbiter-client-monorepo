import RLP from 'rlp'
import { utils } from 'ethers';
import BigNumber from 'bignumber.js';

export function decodeV1SwapData(data: string): {
  toChainId: number;
  toTokenAddress: string;
  toWalletAddress: string;
  expectValue: string;
  slippage: number;
} {
  const decoded: any = RLP.decode(data);
  const result: any = {};
  decoded.forEach((item: any, index: number) => {
    switch (index) {
      case 0:
        result.toChainId = Number(utils.hexlify(item));
        break;
      case 1:
        result.toTokenAddress = utils.hexlify(item);
        break;
      case 2:
        result.toWalletAddress = utils.hexlify(item);
        break;
      case 3:
        result.expectValue = new BigNumber(
          utils.hexlify(item),
        ).toString();
        break;
      case 4:
        result.slippage = Number(item.toString());
        break;
    }
  });
  return result;
}

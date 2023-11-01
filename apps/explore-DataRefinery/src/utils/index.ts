import dayjs from 'dayjs';
import { padStart } from 'lodash';
import RLP from 'rlp'
import { utils } from 'ethers';
import BigNumber from 'bignumber.js';

export function addressPadStart(address: string, length: number) {
    if (!address) {
        return address;
    }
    address = address.replace('0x', '');
    if (address.length < length) {
        return `0x${padStart(address, length - 2, '0')}`;
    }
    return address;
}
export function TransactionID(
    fromAddress: string,
    fromChainId: number | string,
    fromTxNonce: string | number,
    symbol: string | undefined,
    timestamp?: number,
) {
    let ext = '';
    if ([8, 88].includes(Number(fromChainId))) {
        ext = timestamp ? `_${dayjs(timestamp).unix()}` : '';
    }
    return `${fromAddress}${padStart(String(fromChainId), 4, '0')}${symbol || 'NULL'
        }${fromTxNonce}${ext}`.toLowerCase();
}

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

export class ValidSourceTxError extends Error {
  public opStatus: number
  public msg: string
  constructor(opStatus: number, msg: string) {
    super(msg)
    this.opStatus = opStatus;
    this.msg = msg;
  }
}

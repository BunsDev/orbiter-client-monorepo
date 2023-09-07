import dayjs from 'dayjs';
import {padStart,MD5} from '@orbiter-finance/utils'
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
    return `${fromAddress}${padStart(String(fromChainId), 4, '0')}${
      symbol || 'NULL'
    }${fromTxNonce}${ext}`.toLowerCase();
  }
  

export function TransferId(
  toChainId: string,
  replyAccount: string,
  userNonce: number | string,
  toSymbol: string,
  toValue: string,
) {
  return MD5(
    `${toChainId}_${replyAccount}_${userNonce}_${toSymbol}_${toValue}`.toLowerCase(),
  ).toString();
}
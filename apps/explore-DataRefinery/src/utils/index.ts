import dayjs from 'dayjs';
import { padStart } from 'lodash';

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
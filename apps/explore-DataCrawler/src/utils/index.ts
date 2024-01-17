import { padStart } from 'lodash';
import { CrossChainParams } from '../transaction/transaction.interface';

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
export function generateSequenceNumbers(
    min: number,
    max: number,
) {
    // save pending scan block
    const blockNumbers = Array.from(
        { length: max - min + 1 },
        (_, index) => min + index,
    );
    return blockNumbers;
}



export class QueryStringUtils {
    static parse(queryString: string): Record<string, string> {
        const urlParams = new URLSearchParams(queryString);
        const params: Record<string, string> = {};

        for (const [key, value] of urlParams) {
            params[key] = value;
        }

        return params;
    }

    static stringify(params: Record<string, string>): string {
        const urlParams = new URLSearchParams();

        for (const key in params) {
            if (params.hasOwnProperty(key)) {
                urlParams.append(key, params[key]);
            }
        }

        return urlParams.toString();
    }
}

export function decodeHex(hexString: string): string {
    const byteArray = new Uint8Array(hexString.match(/[\da-f]{2}/gi)!.map((h) => parseInt(h, 16)));
    const textDecoder = new TextDecoder('utf-8');
    return textDecoder.decode(byteArray);
}

export function decodeOrbiterCrossChainParams(hexString: string): CrossChainParams {
    const str = decodeHex(hexString);
    const result: CrossChainParams = {}
    if (str) {
        const data = QueryStringUtils.parse(str);
        if (data) {
            for (const field in data) {
                switch (field) {
                    case 'c':
                        result.targetChain = data[field];
                        break;
                    case 't':
                        result.targetRecipient = data[field];
                        break;
                }
            }
        }
    }
    return result
}
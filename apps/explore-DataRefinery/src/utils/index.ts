import dayjs from 'dayjs';
import { padStart } from 'lodash';
import RLP from 'rlp'
import { utils } from 'ethers';
import BigNumber from 'bignumber.js';
import { SchedulerRegistry } from '@nestjs/schedule'
import { CronJob } from 'cron'
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
export function isEvmAddress(address: string)  {
  if (!address.startsWith('0x')) {
    return false
  }
  if (address.length != 42) {
    return false
  }
  return true
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

export function addJob(schedulerRegistry: SchedulerRegistry, name: string, cronTime: string, handle: () => void) {
  const job = new CronJob(cronTime, handle)
  schedulerRegistry.addCronJob(name, job as any);
  job.start()
}

export function addInterval(schedulerRegistry: SchedulerRegistry, name: string, intervalTime: number, handle: () => void) {
  const interval = setInterval(handle, intervalTime)
  schedulerRegistry.addInterval(name, interval)
}

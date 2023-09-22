
import {padStart} from '@orbiter-finance/utils'
import * as JSONbig from 'json-bigint';
import crypto from 'crypto';
import dayjs from 'dayjs';
export function JSONStringify(data: any) {
    return JSONbig.stringify(data);
}
export function BigIntToString(newValue: any) {
    if (!newValue) {
        return newValue;
    }
    if (Array.isArray(newValue)) {
        for (let i = 0; i < newValue.length; i++) {
            if (typeof newValue[i] === 'bigint') {
                newValue[i] = BigIntToString(newValue[i]);
            } else if (Array.isArray(newValue[i])) {
                newValue[i] = BigIntToString(newValue[i]);
            } else if (typeof newValue[i] === 'object') {
                newValue[i] = BigIntToString(newValue[i]);
            }
        }
    } else if (typeof newValue === 'object') {
        for (const key in newValue) {
            if (typeof newValue[key] === 'bigint') {
                newValue[key] = String(newValue[`${key}`]);
            } else if (Array.isArray(newValue[key])) {
                newValue[key] = BigIntToString(newValue[key]);
            } else if (typeof newValue[key] === 'object') {
                newValue[key] = BigIntToString(newValue[key]);
            }
        }
    } else if (typeof newValue === 'bigint') {
        newValue = String(newValue);
    }
    return newValue;
}
export async function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(null);
        }, ms);
    });
}
export function equals<T, U extends T>(val1: T, val2: U, ignoreCase = true) {
    if (val1 === val2) {
        return true;
    }
    if (ignoreCase && String(val1).toLowerCase() === String(val2).toLowerCase()) {
        return true;
    }
    return false;
}

export function splitArrayBySize(array: any[], size: number) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}
export function fix0xPadStartAddress(address: string, length: number) {
    if (!address) {
        return address;
    }
    address = address.replace('0x', '');
    if (address.length < length) {
        return `0x${padStart(address, length - 2, '0')}`;
    }
    return address;
}
export function addressPadStart64(address: string) {
    if (!address) {
        return address;
    }
    address = address.replace('0x', '');
    if (address.length < 64) {
        return `0x${padStart(address, 64, '0')}`;
    }
}
export function isObject(obj: any) {
    if (Buffer.isBuffer(obj)) {
        return false;
    }
    return toString.call(obj) === '[object Object]';
}
export function isString(obj: any) {
    return toString.call(obj) === '[object String]';
}
export function isFunction(obj: any) {
    return typeof obj === 'function';
}
const numberReg =
    /^((\-?\d*\.?\d*(?:e[+-]?\d*(?:\d?\.?|\.?\d?)\d*)?)|(0[0-7]+)|(0x[0-9a-f]+))$/i;
export function isNumberString(obj: any) {
    return numberReg.test(obj);
}
export function isNumber(obj: any) {
    return toString.call(obj) === '[object Number]';
}
export function isBoolean(obj: any) {
    return toString.call(obj) === '[object Boolean]';
}
export function isEmpty(obj: any) {
    if (isObject(obj)) {
        let key;
        for (key in obj) {
            return false;
        }
        return true;
    } else if (Array.isArray(obj)) {
        return obj.length === 0;
    } else if (isString(obj)) {
        return obj.length === 0;
    } else if (isNumber(obj)) {
        return obj === 0;
    } else if (obj === null || obj === undefined) {
        return true;
    } else if (isBoolean(obj)) {
        return !obj;
    }
    return false;
}


export function objectToQueryString(obj: Record<string, any>): string {
    const keyValuePairs: string[] = [];

    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            keyValuePairs.push(
                `${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`,
            );
        }
    }

    return keyValuePairs.join('&');
}
async function retry<T>(
    action: () => Promise<T>,
    maxRetries: number,
    delayMs: number,
): Promise<T> {
    let retries = 0;

    while (retries < maxRetries) {
        try {
            const result = await action();
            return result;
        } catch (error: unknown) {
            console.error(`Attempt ${retries + 1} failed: ${(error as Error).message}`);
            retries++;
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    throw new Error(`Max retries (${maxRetries}) reached`);
}
export function arePropertyValuesConsistent<T>(
    objects: T[],
    propertyName: keyof T
): boolean {
    if (objects.length === 0) {
        return true; // No objects to compare, so it's consistent
    }
    const referenceValue = objects[0][propertyName]; // Using the first object's property value as the reference
    for (const obj of objects) {
        if (obj[propertyName] !== referenceValue) {
            return false; // If any property value is different, it's not consistent
        }
    }

    return true; // All property values are the same, so it's consistent
}


export function md5(value: string) {
    const md5 = crypto.createHash('md5');
    return md5.update(value).digest('hex');
}
export function timeoutPromise<T>(
    promiseFn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        clearTimeout(timeoutId);
        reject(new Error(`Promise timed out after ${timeoutMs} ms`));
      }, timeoutMs);
  
      promiseFn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  export function  generateSequenceNumbers(
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

  export function MaxBigInt(bigIntValues: bigint[]): bigint {
    if (bigIntValues.length === 0) {
        throw new Error('missing data');
      }
    
      let maxBigInt: bigint = bigIntValues[0];
      for (let i = 1; i < bigIntValues.length; i++) {
        if (bigIntValues[i] > maxBigInt) {
          maxBigInt = bigIntValues[i];
        }
      }
    
      return maxBigInt;
}
export function promiseWithTimeout<T>(
    promise: Promise<T>,
    timeoutMilliseconds: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        clearTimeout(timeoutId);
        reject(new Error(`Promise timed out`));
      }, timeoutMilliseconds);
      promise
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
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
  return md5(
    `${toChainId}_${replyAccount}_${userNonce}_${toSymbol}_${toValue}`.toLowerCase(),
  ).toString();
}
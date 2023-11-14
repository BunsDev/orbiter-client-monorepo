
import * as JSONbig from 'json-bigint';
import { padStart } from 'lodash';
import crypto from 'crypto'
export function MD5(value: string) {
  const md5 = crypto.createHash("md5");
  return md5.update(value).digest("hex");
}
export function TransferId(
  toChainId: string,
  replySender: string,
  replyAccount: string,
  userNonce: number | string,
  toSymbol: string,
  toValue: string,
) {
  return MD5(
    `${toChainId}_${replySender}_${replyAccount}_${userNonce}_${toSymbol}_${toValue}`.toLowerCase(),
  ).toString();
}
export function JSONStringify(data: any) {
  return JSONbig.stringify(data);
}

export function getObjectKeyByValue(object: any, value: any) {
  return Object.keys(object).find(key => object[key] === value);
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

// export function promiseWithTimeout<T = any>(
//   promiseFn: Promise<any>,
//   timeoutMs: number
// ): Promise<T> {
//   return new Promise<T>((resolve, reject) => {
//     const timeoutId = setTimeout(() => {
//       clearTimeout(timeoutId);
//       reject(new Error(`Promise timed out after ${timeoutMs} ms`));
//     }, timeoutMs);

//     promiseFn()
//       .then((result) => {
//         clearTimeout(timeoutId);
//         resolve(result);
//       })
//       .catch((error) => {
//         clearTimeout(timeoutId);
//         reject(error);
//       });
//   });
// }

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

export function getDecimalBySymbol(symbol: string) {
  return ['USDC', 'USDT'].includes(symbol.toUpperCase()) ? 6 : 18;
}

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

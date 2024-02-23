import {
  FetchRequest,
  JsonRpcApiProviderOptions,
  JsonRpcProvider,
  Network,
  Networkish,
  TransactionReceipt,
  TransactionReceiptParams,
} from 'ethers6';
export default class Orbiter6Provider extends JsonRpcProvider {
  constructor(
    public readonly url?: string | FetchRequest,
    network?: Networkish,
    options?: JsonRpcApiProviderOptions,
  ) {
    super(url, network, options);
  }
  override _wrapTransactionReceipt(
    value: TransactionReceiptParams,
    network: Network,
  ): TransactionReceipt {
    const result = super._wrapTransactionReceipt(value, network);
    const keys = Object.keys(result);
    const extra:any = {};
    for (const k in value) {
      if (!keys.includes(k) && k != 'logs') {
        extra[k] = value[k as keyof TransactionReceiptParams];
      }
    }
    Object.assign(result, {
      extra: extra
    })
    return result;
  }
}

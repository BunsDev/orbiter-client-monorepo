import {
  FetchRequest,
  JsonRpcApiProviderOptions,
  JsonRpcProvider,
  Network,
  Networkish,
  TransactionReceipt,
  TransactionReceiptParams,
} from 'ethers6';
export default class OrbiterProvider extends JsonRpcProvider {
  #url!: string;
  constructor(
    url?: string | FetchRequest,
    network?: Networkish,
    options?: JsonRpcApiProviderOptions,
  ) {
    super(url, network, options);
    if (typeof url === 'string') {
      this.#url = url;
    }
  }
  public getUrl() {
    return this.#url;
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
        extra[k] = value[k];
      }
    }
    result['extra'] = extra;
    return result;
  }
}


export interface IExplorerConfig {
    name: string;
    url: string;
    standard: string;
}
export interface Token {
    id?: number;
    name: string;
    symbol: string;
    decimals: 18;
    address: string;
    isNative?: boolean;
}
export type IChainConfigWorkingStatus = 'running' | 'pause' | 'stop';
export interface IContractConfig {
    name:string;
    address:string;
    methods?:string[]
}
export interface IChainConfig {
    name: string;
    chainId: string;
    internalId: number;
    networkId: string;
    contract: { [key: string]: string };
    rpc: string[];
    batchLimit: number;
    alchemyApi?: { [key: string]: any };
    api: {
        url: string;
        key?: string;
        intervalTime: number;
    };
    router: { [key: string]: string };
    debug: boolean;
    features: Array<any>;
    nativeCurrency: Token;
    targetConfirmation?: number;
    watch: Array<string>;
    explorers: IExplorerConfig[];
    tokens: Array<Token>;
    contracts: Array<IContractConfig>;
    xvmList: Array<string>;
    workingStatus: IChainConfigWorkingStatus;
    service: { [key: string]: string };
}
export interface ConfigModuleOptions {
  envConfigPath?: string
  chainConfigPath?: string
  cachePath?: string
  makerV1RulePath?:string
  tradingPairsPath?: string
}
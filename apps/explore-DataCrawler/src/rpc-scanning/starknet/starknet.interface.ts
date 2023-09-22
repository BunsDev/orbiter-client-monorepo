export interface ExecuteCalldata {
  callArrayLen: number;
  callArray: string[];
  calldataLen: number;
  calldata: string[];
}
export interface CalldataArg {
  name: string;
  signature: string;
  to: string;
  selector: string;
  args: string[];
  index: number;
}

export enum StarknetChainId {
  SN_MAIN = '0x534e5f4d41494e',
  SN_GOERLI = '0x534e5f474f45524c49',
  SN_GOERLI2 = '0x534e5f474f45524c4932',
}

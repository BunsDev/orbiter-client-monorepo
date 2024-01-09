import { Injectable } from '@nestjs/common';
import {
  OrbiterLogger,
  LoggerDecorator,
  equals,
  getObjKeyByValue
} from '@orbiter-finance/utils';
import { BridgeTransactionAttributes, Transfers as TransfersModel, TransferOpStatus, BridgeTransactionStatus } from '@orbiter-finance/seq-models';
import { validateAndParseAddress } from 'starknet'
import { ChainConfigService, ENVConfigService, IChainConfig, MakerV1RuleService, Token } from '@orbiter-finance/config';
import BigNumber from 'bignumber.js';
import { v1MakerUtils} from '@orbiter-finance/utils'
import dayjs from 'dayjs';
import { hexlify } from 'ethers6';
import { TransactionID, ValidSourceTxError, addressPadStart, decodeV1SwapData } from '../utils';
import RLP from "rlp";

export function parseSourceTxSecurityCode(value: string) {
  let index = 0;
  for (let i = value.length - 1; i > 0; i--) {
    if (+value[i] !== 0) {
      index = i;
      break;
    }
  }
  let code = String(+value.substr(index - 3, 4));
  if (code.length !== 4) {
    for (let i = 0; i < 4 - code.length; i++) {
      code += '0';
    }
  } else if ((/^[1-9]90[1-9]$/.test(code))) {
    // To fit values like this 0.026786488299999030
    code = code.slice(1) + '0'
  }
  const nCode = Number(code);
  if (nCode < 9000 || nCode > 10000) {
    return 0;
  }
  return nCode % 1000;
}
export function parseTragetTxSecurityCode(value: string):string {
  return (+value.substring(value.length - 4)).toString();
}

export function parseZksyncLiteSourceTxSecurityCode(value: string) {
  const stringValue = new BigNumber(value).toString()
  let code = stringValue.slice(stringValue.length - 4)
  code = code.slice(code.indexOf('9'))
  if (code.length !== 4) {
    for (let i = 0; i < 4 - code.length; i++) {
      code += '0';
    }
  }
  const nCode = Number(code);
  if (nCode < 9000 || nCode > 10000) {
    return 0;
  }
  return nCode % 1000;
}


export type BuilderData = {
  targetToken: Token
  targetChain: IChainConfig
  targetAddress: string
  targetAmount: string
}



@Injectable()
export class StandardBuilder {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    protected chainConfigService: ChainConfigService,
    protected envConfigService: ENVConfigService,
    protected makerV1RuleService: MakerV1RuleService,
  ) {

  }
  async build(transfer: TransfersModel): Promise<BuilderData> {
    const result = {} as BuilderData
    const targetChainId = parseSourceTxSecurityCode(transfer.amount);
    const targetChain = this.chainConfigService.getChainByKeyValue(
      'internalId',
      targetChainId,
    );
    if (!targetChain) {
      return result
    }
    result.targetChain = targetChain
    //
    const targetToken = this.chainConfigService.getTokenBySymbol(
      targetChain.chainId,
      transfer.symbol,
    );
    if (!targetToken) {
      return result
    }
    result.targetToken = targetToken
    result.targetAddress = transfer.sender;
    return result
  }
}



@Injectable()
export class ZksyncLiteBuilder {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    protected chainConfigService: ChainConfigService,
    protected envConfigService: ENVConfigService,
    protected makerV1RuleService: MakerV1RuleService,
  ) {

  }
  check(transfer: TransfersModel) {
    return ['zksync_test', 'zksync'].includes(transfer.chainId)
  }
  async build(transfer: TransfersModel): Promise<BuilderData> {
    const result = {} as BuilderData
    const targetChainId = parseZksyncLiteSourceTxSecurityCode(transfer.amount);
    const targetChain = this.chainConfigService.getChainByKeyValue(
      'internalId',
      targetChainId,
    );
    if (!targetChain) {
      return result
    }
    result.targetChain = targetChain
    //
    const targetToken = this.chainConfigService.getTokenBySymbol(
      targetChain.chainId,
      transfer.symbol,
    );
    if (!targetToken) {
      return result
    }
    result.targetToken = targetToken
    result.targetAddress = transfer.sender;
    return result
  }
}


@Injectable()
export class LoopringBuilder {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    protected chainConfigService: ChainConfigService,
    protected envConfigService: ENVConfigService,
    protected makerV1RuleService: MakerV1RuleService,
  ) {

  }

  check(transfer: TransfersModel): boolean {
    return ['loopring', 'loopring_test'].includes(transfer.chainId)
  }

  async build(transfer: TransfersModel): Promise<BuilderData> {
    const result = {} as BuilderData
    let targetChainId: number
    if (transfer.calldata && Array.isArray(transfer.calldata) && transfer.calldata.length) {
      targetChainId = Number(transfer.calldata[0]) % 1000;
    }
    const targetChain = this.chainConfigService.getChainByKeyValue(
      'internalId',
      targetChainId,
    );
    if (!targetChain) {
      return result
    }
    result.targetChain = targetChain
    const targetToken = this.chainConfigService.getTokenBySymbol(
      targetChain.chainId,
      transfer.symbol,
    );
    if (!targetToken) {
      return result
    }
    result.targetToken = targetToken
    if (transfer.calldata && Array.isArray(transfer.calldata)) {
      if (transfer.calldata.length === 1) {
        result.targetAddress = transfer.sender;
      } else if (transfer.calldata.length === 2) {
        result.targetAddress = transfer.calldata[1];
      }
    }
    return result
  }
}


@Injectable()
export class EVMOBSourceContractBuilder {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    protected chainConfigService: ChainConfigService,
    protected envConfigService: ENVConfigService,
    protected makerV1RuleService: MakerV1RuleService,
  ) {

  }

  check(transfer: TransfersModel, sourceChain: IChainConfig): boolean {
    const contract = sourceChain.contract
    if (
      !['SN_MAIN', 'SN_GOERLI', 'loopring', 'loopring_test'].includes(transfer.chainId)
      && transfer.contract
      && contract[transfer.contract] === 'OBSource'
    ) {
      return true
    }
    return false
  }

  async build(transfer: TransfersModel): Promise<BuilderData> {
    const result = {} as BuilderData
    const targetChainId = parseSourceTxSecurityCode(transfer.amount);
    const targetChain = this.chainConfigService.getChainByKeyValue(
      'internalId',
      targetChainId,
    );
    if (!targetChain) {
      return result
    }
    result.targetChain = targetChain
    const targetToken = this.chainConfigService.getTokenBySymbol(
      targetChain.chainId,
      transfer.symbol,
    );
    if (!targetToken || !['SN_MAIN', 'SN_GOERLI'].includes(targetChain.chainId)) {
      return result
    }
    result.targetToken = targetToken
    const calldata = transfer.calldata as string[];
    if (calldata.length > 0) {
      if (transfer.signature === 'transfer(address,bytes)') {
        const address = addressPadStart(
          transfer.calldata[1].replace('0x03', ''),
          66,
        );
        result.targetAddress = address.toLocaleLowerCase();
      } else if (
        transfer.signature ===
        'transferERC20(address,address,uint256,bytes)'
      ) {
        const address = addressPadStart(
          transfer.calldata[3].replace('0x03', ''),
          66,
        );
        result.targetAddress = address.toLocaleLowerCase();
      }
    }
    return result
  }
}


@Injectable()
export class StarknetOBSourceContractBuilder {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    protected chainConfigService: ChainConfigService,
    protected envConfigService: ENVConfigService,
    protected makerV1RuleService: MakerV1RuleService,
  ) {

  }

  check(transfer: TransfersModel, sourceChain: IChainConfig): boolean {
    if (
      ['SN_MAIN', 'SN_GOERLI'].includes(transfer.chainId)
    ) {
      return true
    }
    return false
  }

  async build(transfer: TransfersModel): Promise<BuilderData> {
    const result = {} as BuilderData
    const targetChainId = parseSourceTxSecurityCode(transfer.amount);
    const targetChain = this.chainConfigService.getChainByKeyValue(
      'internalId',
      targetChainId,
    );
    if (!targetChain) {
      return result
    }
    result.targetChain = targetChain

    const targetToken = this.chainConfigService.getTokenBySymbol(
      targetChain.chainId,
      transfer.symbol,
    );
    if (!targetToken) {
      return result
    }
    result.targetToken = targetToken

    if (
      Array.isArray(transfer.calldata) &&
      transfer.calldata.length === 5 &&
      ['transferERC20(felt,felt,Uint256,felt)', 'sign_pending_multisig_transaction(felt,felt*,felt,felt,felt)'].includes(transfer.signature)
    ) {
      result.targetAddress = addressPadStart(
        transfer.calldata[4].toLocaleLowerCase(),
        42,
      );
    }
    return result
  }
}


@Injectable()
export class EVMRouterV3ContractBuilder {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;

  constructor(
    protected chainConfigService: ChainConfigService,
    protected envConfigService: ENVConfigService,
    protected makerV1RuleService: MakerV1RuleService,
  ) {

  }

  check(transfer: TransfersModel, sourceChain: IChainConfig): boolean {
    const contract = sourceChain.contract;
    return contract
      && transfer.contract
      && ['transfer(address,bytes)', 'transferToken(address,address,uint256,bytes)'].includes(transfer.signature)
      && getObjKeyByValue(contract, 'OrbiterRouterV3').toLowerCase() === transfer.contract.toLowerCase();
  }

  async build(transfer: TransfersModel): Promise<BuilderData> {
    const result = {} as BuilderData;
    const decodeData = (<any[]>RLP.decode(transfer.calldata[1])).map(item => <any>hexlify(item));
    const type = decodeData[0];
    const targetChainId = +decodeData[1];
    const targetChain = this.chainConfigService.getChainByKeyValue('internalId', targetChainId);
    if (!targetChain) {
      return result;
    }
    switch (type) {
      case '0x01': {
        const targetToken = this.chainConfigService.getTokenBySymbol(
          targetChain.chainId,
          transfer.symbol,
        );
        let targetAddress = String(decodeData[2]).toLowerCase();
        if ([4, 44].includes(targetChainId)) {
          targetAddress = addressPadStart(targetAddress, 66);
        }

        result.targetAddress = targetAddress;
        result.targetChain = targetChain;
        result.targetToken = targetToken;
        break;
      }
      case '0x02': {
        const targetTokenAddress = String(decodeData[2]).toLowerCase();
        const expectValue = +decodeData[3];
        // const slippage = decodeData[4];
        let targetAddress = transfer.sender.toLowerCase();
        if (decodeData.length >= 6) {
          targetAddress = String(decodeData[5]).toLowerCase();
          if ([4, 44].includes(targetChainId)) {
            targetAddress = addressPadStart(targetAddress, 66);
          }
        }
        const targetToken = this.chainConfigService.getTokenByAddress(
          targetChain.chainId,
          targetTokenAddress,
        );
        result.targetAmount = new BigNumber(expectValue).toString();
        result.targetAddress = targetAddress;
        result.targetChain = targetChain;
        result.targetToken = targetToken;
        break;
      }
    }
    return result;
  }
}


@Injectable()
export class EVMRouterV1ContractBuilder {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    protected chainConfigService: ChainConfigService,
    protected envConfigService: ENVConfigService,
    protected makerV1RuleService: MakerV1RuleService,
  ) {

  }

  check(transfer: TransfersModel, sourceChain: IChainConfig): boolean {
    const contract = sourceChain.contract
    if (
      contract
      && transfer.contract
      && contract[transfer.contract] === 'OrbiterRouterV1'
      && transfer.signature === 'swap(address,address,uint256,bytes)'
    ) {
      return true
    }
    return false
  }

  async build(transfer: TransfersModel): Promise<BuilderData> {
    const result = {} as BuilderData
    const decodeData = decodeV1SwapData(transfer.calldata[3])
    result.targetAmount = decodeData.expectValue
    const targetChainId = decodeData.toChainId
    const targetChain = this.chainConfigService.getChainByKeyValue('internalId', targetChainId)
    if (!targetChain) {
      return result
    }
    result.targetChain = targetChain
    const targetToken = this.chainConfigService.getTokenByAddress(
      targetChain.chainId,
      decodeData.toTokenAddress,
    );
    result.targetToken = targetToken
    if (['SN_MAIN', 'SN_GOERLI'].includes(targetChain.chainId)) {
      result.targetAddress = validateAndParseAddress(decodeData.toWalletAddress)
    } else {
      result.targetAddress = decodeData.toWalletAddress
    }
    return result
  }
}




@Injectable()
export default class BridgeTransactionBuilder {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    protected chainConfigService: ChainConfigService,
    protected makerV1RuleService: MakerV1RuleService,
    protected envConfigService: ENVConfigService,
    private standardBuilder: StandardBuilder,
    private loopringBuilder: LoopringBuilder,
    private zksyncLiteBuilder: ZksyncLiteBuilder,
    private evmOBSourceContractBuilder: EVMOBSourceContractBuilder,
    private starknetOBSourceContractBuilder: StarknetOBSourceContractBuilder,
    private evmRouterV3ContractBuilder: EVMRouterV3ContractBuilder,
    private evmRouterV1ContractBuilder: EVMRouterV1ContractBuilder,
  ) { }
  async build(transfer: TransfersModel): Promise<BridgeTransactionAttributes> {
    // build other common
    const createdData: BridgeTransactionAttributes = {
      sourceId: transfer.hash,
      sourceAddress: transfer.sender,
      sourceMaker: transfer.receiver,
      sourceAmount: transfer.amount.toString(),
      sourceChain: transfer.chainId,
      sourceNonce: transfer.nonce,
      sourceSymbol: transfer.symbol,
      sourceToken: transfer.token,
      status:0,
      targetToken: null,
      status:BridgeTransactionStatus.PENDING_PAID,
      sourceTime: transfer.timestamp,
      dealerAddress: null,
      ebcAddress: null,
      targetChain: null,
      ruleId: null,
      targetAmount: null,
      targetAddress: null,
      targetSymbol: null,
      createdAt: new Date(),
      version: transfer.version,
    };
    if (+transfer.nonce >= 9000) {
      throw new ValidSourceTxError(TransferOpStatus.NONCE_EXCEED_MAXIMUM, `Exceeded the maximum nonce value ${transfer.nonce} / 9000`)
    }

    const sourceChain = this.chainConfigService.getChainInfo(transfer.chainId);
    if (!sourceChain) {
      throw new ValidSourceTxError(TransferOpStatus.SOURCE_CHAIN_OR_TOKEN_NOT_FOUND, `${transfer.token} sourceChain not found`)
    }
    const sourceToken = this.chainConfigService.getTokenByAddress(
      sourceChain.chainId,
      transfer.token,
    );
    let builderData: BuilderData
    if (this.evmRouterV3ContractBuilder.check(transfer, sourceChain)) {
      builderData = await this.evmRouterV3ContractBuilder.build(transfer);
    } else if (this.evmRouterV1ContractBuilder.check(transfer, sourceChain)) {
      builderData = await this.evmRouterV1ContractBuilder.build(transfer)
    } else if (this.loopringBuilder.check(transfer)) {
      builderData = await this.loopringBuilder.build(transfer)
    } else if (this.evmOBSourceContractBuilder.check(transfer, sourceChain)) {
      builderData = await this.evmOBSourceContractBuilder.build(transfer)
    } else if (this.starknetOBSourceContractBuilder.check(transfer, sourceChain)) {
      builderData = await this.starknetOBSourceContractBuilder.build(transfer)
    } else if (this.zksyncLiteBuilder.check(transfer)) {
      builderData = await this.zksyncLiteBuilder.build(transfer)
    } else {
      builderData = await this.standardBuilder.build(transfer);
    }
    const { targetAddress: builderDataTargetAddress, targetChain, targetToken, targetAmount } = builderData
    if (!targetChain) {
      throw new ValidSourceTxError(TransferOpStatus.TARGET_CHAIN_OR_TOKEN_NOT_FOUND, `targetChain not found`)
    }
    if (!targetToken) {
      throw new ValidSourceTxError(TransferOpStatus.TARGET_CHAIN_OR_TOKEN_NOT_FOUND, `targetToken not found`)
    }
    let rule;
    if (targetToken) {
      rule = this.makerV1RuleService.getAll().find((rule) => {
        const {
          sourceChainId,
          targetChainId,
          sourceSymbol,
          targetSymbol,
          makerAddress,
        } = rule;
        return (
          equals(sourceChainId, sourceChain.internalId) &&
          equals(targetChainId, targetChain.internalId) &&
          equals(sourceSymbol, sourceToken.symbol) &&
          equals(targetSymbol, targetToken.symbol) &&
          equals(makerAddress, transfer.receiver)
        );
      });
    }
    if (!rule) {
      const errMsg = `sourceChain.internalId: ${sourceChain.internalId}, targetChain.internalId:${targetChain.internalId}, sourceToken.symbol:${sourceToken.symbol}, targetToken.symbol:${targetToken.symbol}, transfer.receiver:${transfer.receiver}`
      throw new ValidSourceTxError(TransferOpStatus.RULE_NOT_FOUND, errMsg)
    }
    if (builderDataTargetAddress) {
      createdData.targetAddress = builderDataTargetAddress.toLowerCase()
    } else {
      throw new ValidSourceTxError(TransferOpStatus.RULE_NOT_FOUND, 'no targetAddress')
    }
    createdData.targetChain = targetChain.chainId
    createdData.targetToken = targetToken.address.toLowerCase()
    createdData.targetSymbol = targetToken.symbol
    if (targetAmount) {
      createdData.targetAmount = new BigNumber(targetAmount)
        .div(10 ** targetToken.decimals)
        .toString();
    } else {
      const amountToSend = v1MakerUtils.getAmountToSend(
        +sourceChain.internalId,
        sourceToken.decimals,
        +targetChain.internalId,
        targetToken.decimals,
        transfer.value,
        rule.tradingFee,
        rule.gasFee,
        createdData.sourceNonce,
      );
      if (amountToSend && amountToSend.state) {
        createdData.targetAmount = new BigNumber(amountToSend.tAmount)
          .div(10 ** targetToken.decimals)
          .toString();
        createdData.tradeFee = amountToSend.tradeFee;
      }
    }
    if (+createdData.targetAmount <= 0) {
      throw new ValidSourceTxError(TransferOpStatus.AMOUNT_TOO_SMALL, 'The payment amount is too small')
    }
    createdData.targetMaker = rule.sender.toLocaleLowerCase();
    createdData.transactionId = TransactionID(
      transfer.sender,
      sourceChain.internalId,
      transfer.nonce,
      transfer.symbol,
      dayjs(transfer.timestamp).valueOf(),
    );
    createdData.withholdingFee = rule.tradingFee;
    createdData.responseMaker = [rule.sender.toLocaleLowerCase()];
    const v1ResponseMaker = this.envConfigService.get("v1ResponseMaker");
    if (v1ResponseMaker) {
      for (const fakeMaker in v1ResponseMaker) {
        if (v1ResponseMaker[fakeMaker].includes(rule.sender.toLocaleLowerCase())) {
          createdData.responseMaker.push(fakeMaker.toLocaleLowerCase());
        }
      }
    }
    return createdData
  }
}

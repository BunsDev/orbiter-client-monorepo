import { Injectable } from '@nestjs/common';
import {
  OrbiterLogger,
  LoggerDecorator,
  decodeV1SwapData,
  ValidSourceTxError,
  equals,
  fix0xPadStartAddress,
  TransactionID
} from '@orbiter-finance/utils';
import { BridgeTransactionAttributes, BridgeTransaction, Transfers as TransfersModel, TransferOpStatus } from '@orbiter-finance/seq-models';
import { validateAndParseAddress } from 'starknet'
import { ChainConfigService, ENVConfigService, IChainConfig, MakerV1RuleService, Token } from '@orbiter-finance/config';
import BigNumber from 'bignumber.js';
import { getAmountToSend } from '../utils/oldUtils'
import dayjs from 'dayjs';
import { utils } from 'ethers'
import { InjectModel } from '@nestjs/sequelize';

function parseSourceTxSecurityCode(value) {
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
      const sourceChain = this.chainConfigService.getChainInfo(transfer.chainId);
      const targetChainId = parseSourceTxSecurityCode(transfer.amount);
      const targetChain = this.chainConfigService.getChainByKeyValue(
        'internalId',
        targetChainId,
      );
      if (!targetChain) {
        return result
      }
      //
      const targetToken = this.chainConfigService.getTokenBySymbol(
        targetChain.chainId,
        transfer.symbol,
      );
      if (!targetToken) {
        return result
      }
      result.targetChain = targetChain
      result.targetToken = targetToken
      const sourceChainID = +sourceChain.internalId;
      const targetChainID = +targetChain.internalId;
      if ([4, 44].includes(targetChainID)) {
        const calldata = transfer.calldata as string[];
        if (calldata.length > 0) {
          if (transfer.signature === 'transfer(address,bytes)') {
            const address = fix0xPadStartAddress(
              transfer.calldata[1].replace('0x03', ''),
              66,
            );
            result.targetAddress = address.toLocaleLowerCase();
          } else if (
            transfer.signature ===
            'transferERC20(address,address,uint256,bytes)'
          ) {
            const address = fix0xPadStartAddress(
              transfer.calldata[3].replace('0x03', ''),
              66,
            );
            result.targetAddress = address.toLocaleLowerCase();
          }
        }
      } else if ([4, 44].includes(sourceChainID)) {
        if (
          Array.isArray(transfer.calldata) &&
          transfer.calldata.length === 5 &&
          transfer.signature === 'transferERC20(felt,felt,Uint256,felt)'
        ) {
          result.targetAddress = fix0xPadStartAddress(
            transfer.calldata[4].toLocaleLowerCase(),
            42,
          );
        }
      } else {
        result.targetAddress = transfer.sender;
      }
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
      const targetToken = this.chainConfigService.getTokenBySymbol(
        targetChain.chainId,
        transfer.symbol,
      );
      if (!targetToken) {
        return result
      }
      if (transfer.calldata && Array.isArray(transfer.calldata)) {
        if (transfer.calldata.length === 1) {
          result.targetAddress = transfer.sender;
        } else if (transfer.calldata.length === 2) {
          result.targetAddress = transfer.calldata[1];
        }
      }
      result.targetChain = targetChain
      result.targetToken = targetToken
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
    async build(transfer: TransfersModel): Promise<BuilderData> {
      throw new Error('unrealized')
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
    build(transfer: TransfersModel): Promise<BuilderData> {
        throw new Error('unrealized')
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
    build(transfer: TransfersModel): Promise<BuilderData> {
        throw new Error('unrealized')

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
    async build(transfer: TransfersModel): Promise<BuilderData> {
      const result = {} as BuilderData
      const decodeData = decodeV1SwapData(transfer.calldata[3])
      result.targetAmount = decodeData.expectValue
      const targetChainId = decodeData.toChainId
      const targetChain = this.chainConfigService.getChainByKeyValue('internalId', targetChainId)
      if (!targetChain) {
        return result
      }
      const targetToken = this.chainConfigService.getTokenByAddress(
        targetChain.chainId,
        decodeData.toTokenAddress,
      );
      result.targetChain = targetChain
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
      @InjectModel(TransfersModel)
      private transfersModel: typeof TransfersModel,
      private standardBuilder: StandardBuilder,
      private loopringBuilder: LoopringBuilder,
      private evmOBSourceContractBuilder: EVMOBSourceContractBuilder,
      private starknetOBSourceContractBuilder: StarknetOBSourceContractBuilder,
      private evmRouterV3ContractBuilder: EVMRouterV3ContractBuilder,
      private evmRouterV1ContractBuilder: EVMRouterV1ContractBuilder,
    ) {}
    async build(transfer: TransfersModel): Promise<{ code: number, errMsg?: string, createdData: BridgeTransactionAttributes }> {
        // build other common

        try {
          const createdData: BridgeTransactionAttributes = {
            sourceId: transfer.hash,
            sourceAddress: transfer.sender,
            sourceMaker: transfer.receiver,
            sourceAmount: transfer.amount.toString(),
            sourceChain: transfer.chainId,
            sourceNonce: transfer.nonce,
            sourceSymbol: transfer.symbol,
            sourceToken: transfer.token,
            targetToken: null,
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
          const contract = sourceChain.contract
          let builderData: BuilderData
          if (
            transfer.contract
            && !['SN_MAIN', 'SN_GOERLI'].includes(transfer.chainId)
            && (contract[transfer.contract] === 'OrbiterRouterV1' || contract[utils.getAddress(transfer.contract)] === 'OrbiterRouterV1')
            && transfer.signature === 'swap(address,address,uint256,bytes)'
          ) {
            builderData = await this.evmRouterV1ContractBuilder.build(transfer)
          } else if (['loopring', 'loopring_test'].includes(transfer.chainId)) {
            builderData = await this.loopringBuilder.build(transfer)
          } else {
            builderData = await this.standardBuilder.build(transfer);
          }

          const { targetAddress: builderDataTargetAddress , targetChain, targetToken, targetAmount } = builderData

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
            const amountToSend = getAmountToSend(
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

          createdData.targetMaker = rule.sender
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
                createdData.responseMaker.push(fakeMaker);
              }
            }
          }
          return { code: 0, createdData }
        } catch (error) {
          if (error instanceof ValidSourceTxError) {
            await this.transfersModel.update(
              {
                opStatus: error.opStatus,
              },
              {
                where: {
                  id: transfer.id,
                },
              },
            );
            this.logger.error(`hash: ${transfer.hash}, chainId:${transfer.chainId} => ${error.message}`);
            return { code: 1, errMsg: error.message, createdData: null }
          } else {
            throw error
          }
        }
    }
}

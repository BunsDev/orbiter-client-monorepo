import { Injectable } from '@nestjs/common';
import { MdcService } from '../thegraph/mdc/mdc.service';
import dayjs from 'dayjs';
import { ThegraphManagerService } from '../thegraph/manager/manager.service';
import { TransactionID } from '../utils';
import { equals, addressPadStart64, padStart } from '@orbiter-finance/utils';
import { BridgeTransactionAttributes, BridgeTransaction, Transfers } from '@orbiter-finance/seq-models';
import { InjectModel } from '@nestjs/sequelize';
import { ChainConfigService } from '@orbiter-finance/config';
import BigNumber from 'bignumber.js';
import { Op } from 'sequelize';
import { Cron } from '@nestjs/schedule';
import { uniq } from '@orbiter-finance/utils';
import { createLoggerByName } from '../utils/logger';
import { Sequelize } from 'sequelize-typescript';
import { MemoryMatchingService } from './memory-matching.service';

@Injectable()
export class TransactionV2Service {
  private logger = createLoggerByName(`${TransactionV2Service.name}`);
  constructor(
    private mdcService: MdcService,
    private thegraphManagerService: ThegraphManagerService,
    @InjectModel(Transfers) private transfersModel: typeof Transfers,
    @InjectModel(BridgeTransaction)
    private bridgeTransactionModel: typeof BridgeTransaction,
    protected chainConfigService: ChainConfigService,
    private sequelize: Sequelize,
    protected memoryMatchingService: MemoryMatchingService,
  ) {
    this.matchScheduleUserSendTask()
      .then((res) => {
        this.matchScheduleMakerSendTask();
      })
      .catch((error) => {
        this.logger.error(
          `constructor matchScheduleUserSendTask error`,
          error,
        );
      });
  }
  @Cron('0 */3 * * * *')
  async matchScheduleUserSendTask() {
    const transfers = await this.transfersModel.findAll({
      raw: true,
      order: [['id', 'desc']],
      limit: 1000,
      where: {
        status: 2,
        opStatus: 0,
        version: '2-0',
        timestamp: {
          [Op.gte]: dayjs().subtract(24, 'hour').toISOString(),
        },
      },
    });
    for (const transfer of transfers) {
      const result = await this.handleTransferBySourceTx(transfer).catch((error) => {
        this.logger.error(
          `matchScheduleTask handleTransferBySourceTx ${transfer.hash} error`,
          error,
        );
      });
      this.logger.info(`handleTransferBySourceTx result:${JSON.stringify(result)}`)
    }
  }
  @Cron('0 */6 * * * *')
  async matchScheduleMakerSendTask() {
    const transfers = await this.transfersModel.findAll({
      raw: true,
      order: [['id', 'desc']],
      limit: 1000,
      where: {
        status: 2,
        opStatus: 0,
        version: '2-1',
        timestamp: {
          [Op.gte]: dayjs().subtract(24, 'hour').toISOString(),
        },
      },
    });
    for (const transfer of transfers) {
      const result = await this.handleTransferByDestTx(transfer).catch((error) => {
        this.logger.error(
          `matchSenderScheduleTask handleTransferByDestTx ${transfer.hash} error`,
          error,
        );
      });
      this.logger.info(`handleTransferByDestTx result:${JSON.stringify(result)}`)
    }
  }

  // @OnEvent('transfersCreate.2-0')
  // handleUserTransferCreatedEvent(payload: TransfersModel) {
  //   if (payload.version != '2-0') {
  //     throw new Error(
  //       `handleUserTransferCreatedEvent incorrect version ${payload.version} expect 2-0`,
  //     );
  //   }
  //   this.messageService.sendTransferMatchMessage(payload);
  //   // return await this.handleTransferBySourceTx(payload);
  // }
  // @OnEvent('transfersCreate.2-1')
  // handleMakerTransferCreatedEvent(payload: TransfersModel) {
  //   if (payload.version != '2-1') {
  //     throw new Error(
  //       `handleMakerTransferCreatedEvent incorrect version ${payload.version} expect 2-1`,
  //     );
  //   }
  //   this.messageService.sendTransferMatchMessage(payload);
  //   // return await this.handleTransferByDestTx(payload);
  // }

  public async validSourceTxInfo(transfer: Transfers) {
    const result: any = {};
    const { dealerId, ebcId, targetChainIdIndex } = this.parseSecurityCode(
      transfer.value,
    );
    if (+transfer.nonce > 9999) {
      return {
        code: 1,
        errmsg: `Exceeded the maximum nonce value ${transfer.nonce} / 9999`,
        data: result,
      };
    }
    const owner = transfer.receiver;
    const txTimestamp = dayjs(transfer.timestamp).unix();
    this.logger.debug(
      `dealerId = ${dealerId}, ebcId = ${ebcId}, targetChainIdIndex = ${targetChainIdIndex}, owner = ${owner}, txTimestamp = ${txTimestamp}, value = ${transfer.amount},  txHash = ${transfer.hash}`,
    );

    const dealerResult = await this.mdcService.getDealerByOwner(
      owner,
      txTimestamp,
      dealerId,
    );
    if (dealerResult && dealerResult.id) {
      result.dealer = dealerResult;
    }
    const ebcResult = await this.mdcService.getEBCByOwner(
      owner,
      txTimestamp,
      ebcId,
    );
    if (ebcResult && ebcResult.id) {
      result.ebc = ebcResult;
    }

    // source
    const sourceChainInfo: any =
      await this.thegraphManagerService.getChainInfoTokenById(transfer.chainId);
    // let mainTokenAddr;
    if (sourceChainInfo) {
      // TODO: test
      result.sourceChain = sourceChainInfo;
      const padTokenAddr = addressPadStart64(transfer.token);
      const tokenInfo = sourceChainInfo.tokenList.find((row) =>
        equals(row.token_address, padTokenAddr),
      );
      if (tokenInfo) {
        result.sourceToken = tokenInfo;
      } else {
        // TODO:
        return {
          code: 1,
          errmsg: `SourceChain Token not found ${transfer.token}`,
          data: result,
        };
      }
    } else {
      return {
        code: 1,
        errmsg: `SourceChain chainInfo not found ${transfer.chainId}`,
        data: result,
      };
    }

    if (result.sourceToken) {
      const targetChainResult = await this.mdcService.getChainIdMapping(
        owner,
        txTimestamp,
        targetChainIdIndex,
      );
      if (targetChainResult) {
        const targetChainId = targetChainResult.chainId;
        // target
        const sourceTokenMainnetToken = result.sourceToken.mainnet_token;
        const targetChainInfo: any =
          await this.thegraphManagerService.getChainInfoTokenById(
            targetChainId,
          );
        if (targetChainInfo) {
          result.targetChain = targetChainInfo;
          const tokenInfo = targetChainInfo.tokenList.find((row) =>
            equals(row.mainnet_token, sourceTokenMainnetToken),
          );
          if (tokenInfo) {
            result.targetToken = tokenInfo;
          } else {
            this.logger.warn(
              `${transfer.hash
              } targetChainInfo Token not found,targetChainIdIndex=${targetChainIdIndex},targetChainId=${targetChainId},sourceTokenMainnetToken=${sourceTokenMainnetToken}, targetTokenList${JSON.stringify(
                targetChainInfo.tokenList,
              )}`,
            );
            return {
              code: 1,
              errmsg: `targetChainInfo Token not found sourceTokenMainnetToken ${sourceTokenMainnetToken}`,
              data: result,
            };
          }
        } else {
          return {
            code: 1,
            errmsg: `targetChainInfo chainInfo not found ${targetChainResult.chainId}`,
            data: result,
          };
        }
      }
    }

    if (result.ebc && result.targetChain) {
      const ebcAddress = result.ebc.address;
      this.logger.debug(
        `getRule ${transfer.hash} owner=${owner}, ebcAddress =${ebcAddress}, sourceChain = ${result.sourceChain.id}, targetChain= ${result.targetChain.id}, sourceToken= ${result.sourceToken.token_address}, targetToken=${result.targetToken.token_address}`,
      );
      const ruleConfig = await this.mdcService.getRule(
        owner,
        txTimestamp,
        ebcAddress,
        result.sourceChain,
        result.targetChain,
        result.sourceToken,
        result.targetToken,
      );
      if (ruleConfig) {
        // valid maxPrice and minPrice}
        let maxPrice, minPrice, responseAmount;
        if (equals(ruleConfig.chain_0.toString(), transfer.chainId)) {
          // from transferId
          minPrice = ruleConfig.chain_0min_price;
          maxPrice = ruleConfig.chain_0max_price;
          responseAmount = this.getResponseIntent(
            transfer.value,
            new BigNumber(ruleConfig.chain_0_trade_fee.toString()).toFixed(0),
            new BigNumber(
              ruleConfig.chain_0_withholding_fee.toString(),
            ).toFixed(0),
            transfer.nonce,
          );
        } else if (equals(ruleConfig.chain_1.toString(), transfer.chainId)) {
          // to transferId
          minPrice = ruleConfig.chain_1min_price;
          maxPrice = ruleConfig.chain_1max_price;
          responseAmount = this.getResponseIntent(
            transfer.value,
            new BigNumber(ruleConfig.chain_1_trade_fee.toString()).toFixed(0),
            new BigNumber(
              ruleConfig.chain_1_withholding_fee.toString(),
            ).toFixed(0),
            transfer.nonce,
          );
        }
        const transferValue = new BigNumber(responseAmount.tradeAmount);
        // TAG: Off minPrice
        // if (transferValue.lt(minPrice)) {
        //   return {
        //     code: -1,
        //     errmsg: `Transfer is less than the min value ${transferValue}/${minPrice}`,
        //   };
        // }
        if (transferValue.gt(maxPrice)) {
          return {
            code: -1,
            errmsg: `Transfer is less than the max value ${transferValue}/${maxPrice}`,
          };
        }
        result.rule = ruleConfig;
      }
    }

    if (!result.rule) {
      return {
        code: 1,
        errmsg: `rule not found`,
        data: result,
      };
    }
    result.targetAddress = transfer.sender.toLocaleLowerCase();
    return {
      code: 0,
      data: result,
    };
  }
  private buildSourceTxData(
    transfer: Transfers,
    createdData: BridgeTransactionAttributes,
    data: any,
  ) {
    const {
      rule,
      ebc,
      dealer,
      sourceChain,
      targetChain,
      sourceToken,
      targetToken,
    } = data;
    if (dealer) {
      createdData.dealerAddress = dealer.address;
    }
    if (ebc) {
      createdData.ebcAddress = ebc.address;
    }
    if (sourceChain) {
      createdData.sourceChain = transfer.chainId;
      if (sourceToken) {
        createdData.sourceToken = transfer.token.toLocaleLowerCase();
        createdData.sourceSymbol = transfer.symbol;
      }
    }
    if (targetChain) {
      createdData.targetChain = targetChain.id;
      if (targetToken) {
        // TAG: starknet address  and evm address
        const byte20Address = targetToken.token_address
          .substring(26)
          .toLocaleLowerCase();
        createdData.targetToken = `0x${byte20Address}`;
        createdData.targetSymbol = targetToken.symbol;
        const tragetTokenInfo = this.chainConfigService.getTokenByAddress(targetChain.id, createdData.targetToken);
        if (tragetTokenInfo) {
           // TAG: tag info
          createdData.targetSymbol = tragetTokenInfo.symbol;
        }
      }
    }
    if (rule) {
      createdData.ruleId = rule.id;
      if (equals(rule.chain_0, transfer.chainId)) {
        createdData.withholdingFee = new BigNumber(rule.chain_0_withholding_fee)
          .div(10 ** targetToken.decimals)
          .toString();
        const result = this.getResponseIntent(
          transfer.value,
          new BigNumber(rule.chain_0_trade_fee.toString()).toFixed(0),
          new BigNumber(rule.chain_0_withholding_fee.toString()).toFixed(0),
          transfer.nonce,
        );
        if (result.code == 0) {
          createdData.withholdingFee = new BigNumber(result.withholdingFee)
            .div(10 ** targetToken.decimals)
            .toString();
          createdData.tradeFee = new BigNumber(result.tradeFee)
            .div(10 ** targetToken.decimals)
            .toString();
          createdData.targetAmount = new BigNumber(result.responseAmount)
            .div(10 ** targetToken.decimals)
            .toString();
        }
      } else if (equals(rule.chain_1, transfer.chainId)) {
        const result = this.getResponseIntent(
          transfer.value,
          new BigNumber(rule.chain_1_trade_fee.toString()).toFixed(0),
          new BigNumber(rule.chain_1_withholding_fee.toString()).toFixed(0),
          transfer.nonce,
        );
        if (result.code == 0) {
          createdData.withholdingFee = new BigNumber(result.withholdingFee)
            .div(10 ** targetToken.decimals)
            .toString();
          createdData.tradeFee = new BigNumber(result.tradeFee)
            .div(10 ** targetToken.decimals)
            .toString();
          createdData.targetAmount = new BigNumber(result.responseAmount)
            .div(10 ** targetToken.decimals)
            .toString();
        }
      }
      createdData.responseMaker = [transfer.receiver];
      if (rule.responseMakers && rule.responseMakers['response_maker_list']) {
        const responseMakers =
          rule.responseMakers['response_maker_list'].map((c) =>
            c.toLocaleLowerCase(),
          ) || [];
        responseMakers.push(transfer.receiver);
        createdData.responseMaker = uniq(responseMakers);
        this.logger.debug(
          `${transfer.hash} response id ${rule.responseMakers.id}`,
        );
      }
    }
    createdData.transactionId = TransactionID(
      transfer.sender,
      `-${transfer.chainId}`,
      transfer.nonce,
      transfer.symbol,
      dayjs(transfer.timestamp).valueOf(),
    );
    createdData.targetAddress = data.targetAddress;
    return createdData;
  }
  errorBreakResult(errmsg: string) {
    this.logger.error(errmsg);
    return {
      errmsg: errmsg
    }
  }
  public async handleTransferBySourceTx(transfer: Transfers) {
    if (transfer.status != 2) {
      return this.errorBreakResult(`validSourceTxInfo fail ${transfer.hash} Incorrect status ${transfer.status}`)
    }
    let data;
    try {
      const { code, errmsg, data:validData } = await this.validSourceTxInfo(transfer);
      data = validData;
      if (code !== 0) {
        return this.errorBreakResult(`validSourceTxInfo fail ${transfer.hash} ${errmsg}`)
      }
    } catch (error) {
      return this.errorBreakResult(`validSourceTxInfo catch ${transfer.hash} ${error.message}`)
    }
    if (!data) {
      return this.errorBreakResult(`validSourceTxInfo catch ${transfer.hash} ValidData not found`)
    }
    const sourceBT = await this.bridgeTransactionModel.findOne({
      where: {
        sourceChain: transfer.chainId,
        sourceId: transfer.hash,
      },
    });
    if (sourceBT && sourceBT.status >= 90) {
      return this.errorBreakResult(`${transfer.hash} Status is in operation Operation not permitted`)
    }
    const t = await this.sequelize.transaction();
    try {
      const createdData: BridgeTransactionAttributes = {
        sourceId: transfer.hash,
        sourceSymbol: transfer.symbol,
        sourceAmount: transfer.amount,
        sourceNonce: transfer.nonce,
        targetToken: null,
        sourceTime: transfer.timestamp,
        dealerAddress: null,
        ebcAddress: null,
        targetChain: null,
        ruleId: null,
        targetAmount: null,
        sourceMaker: transfer.receiver,
        sourceAddress: transfer.sender,
        targetAddress: null,
        targetSymbol: null,
        createdAt: new Date(),
        version: transfer.version,
      };
      this.buildSourceTxData(transfer, createdData, data);
      if (!sourceBT) {
        const createRow = await this.bridgeTransactionModel.create(
          createdData,
          {
            transaction: t,
          },
        );
        if (!createRow || !createRow.id) {
          throw new Error(`${transfer.hash} Create Bridge Transaction Fail`);
        }
        createdData.id = createRow.id
      } else if (sourceBT) {
        if (sourceBT.status < 90) {
          sourceBT.targetChain = createdData.targetChain;
          await sourceBT.update(
            createdData as any,
            {
              where: {
                id: sourceBT.id,
              },
            },
            {
              transaction: t,
            },
          );
        }
      }
      if (transfer.opStatus != 1) {
        await this.transfersModel.update(
          {
            opStatus: 1,
          },
          {
            where: {
              chainId: transfer.chainId,
              hash: transfer.hash,
            },
            transaction: t,
          },
        );
      }
      await t.commit();
      return createdData
    } catch (error) {
      console.error(error);
      this.logger.error(
        `handleTransferBySourceTx ${transfer.hash} error`,
        error,
      );
      t && (await t.rollback());
      throw error;
    }
  }

  public async handleTransferByDestTx(transfer: Transfers) {
    if (transfer.version != '2-1') {
      throw new Error(`handleTransferByDestTx ${transfer.hash} version not 2-1`);
    }
    let t1;
    try {
      const memoryBT =
        await this.memoryMatchingService.matchV1GetBridgeTransactions(transfer);
      if (memoryBT && memoryBT.id) {
        //
        t1 = await this.sequelize.transaction();
        const [rowCount] = await this.bridgeTransactionModel.update(
          {
            targetId: transfer.hash,
            status: 99,
            targetTime: transfer.timestamp,
            targetFee: transfer.feeAmount,
            targetFeeSymbol: transfer.feeToken,
            targetNonce: transfer.nonce,
            targetMaker: transfer.sender
          },
          {
            where: {
              id: memoryBT.id,
              status: [0, 97, 98],
            },
            transaction: t1,
          },
        );
        if (rowCount != 1) {
          throw new Error(
            'The number of modified rows in bridgeTransactionModel is incorrect',
          );
        }
        const [updateTransferRows] = await this.transfersModel.update(
          {
            opStatus: 99,
          },
          {
            where: {
              hash: {
                [Op.in]: [transfer.hash, memoryBT.sourceId],
              },
            },
            transaction: t1,
          },
        );
        if (updateTransferRows != 2) {
          throw new Error(
            'Failed to modify the opStatus status of source and target transactions',
          );
        }
        await t1.commit();
        this.memoryMatchingService.removeTransferMatchCache(memoryBT.sourceId);
        this.memoryMatchingService.removeTransferMatchCache(transfer.hash);
        this.logger.info(
          `match success from cache ${memoryBT.sourceId}  /  ${transfer.hash}`,
        );
        return memoryBT;
      }
    } catch (error) {
      this.logger.error(
        `handleTransferByDestTx matchV1GetBridgeTransactions match error ${transfer.hash}`,
        error,
      );
      t1 && (await t1.rollback());
    }

    // db match
    const t2 = await this.sequelize.transaction();
    try {
      let btTx = await this.bridgeTransactionModel.findOne({
        attributes: ['id', 'sourceId'],
        where: {
          targetChain: transfer.chainId,
          targetId: transfer.hash,
        },
        transaction: t2,
      });
      if (!btTx || !btTx.id) {
        const where = {
          status: [0, 97, 98],
          targetSymbol: transfer.symbol,
          targetAddress: transfer.receiver,
          targetChain: transfer.chainId,
          targetAmount: transfer.amount,
          responseMaker: {
            [Op.contains]: [transfer.sender],
          },
        };
        btTx = await this.bridgeTransactionModel.findOne({
          attributes: ['id', 'sourceId'],
          where,
          transaction: t2,
        });
      }
      if (btTx && btTx.id) {
        btTx.targetId = transfer.hash;
        btTx.status = 99;
        btTx.targetTime = transfer.timestamp;
        btTx.targetFee = transfer.feeAmount;
        btTx.targetFeeSymbol = transfer.feeToken;
        btTx.targetNonce = transfer.nonce;
        btTx.targetMaker = transfer.sender;
        await btTx.save({
          transaction: t2,
        });
        await this.transfersModel.update(
          {
            opStatus: 99,
          },
          {
            where: {
              hash: {
                [Op.in]: [btTx.sourceId, btTx.targetId],
              },
            },
            transaction: t2,
          },
        );
        this.logger.info(
          `match success from db ${btTx.sourceId}  /  ${btTx.targetId}`,
        );
        this.memoryMatchingService.removeTransferMatchCache(btTx.sourceId);
        this.memoryMatchingService.removeTransferMatchCache(btTx.targetId);
      } else {
        this.memoryMatchingService
          .addTransferMatchCache(transfer)
          .catch((error) => {
            this.logger.error(
              `${transfer.hash} addTransferMatchCache error`,
              error,
            );
          });
      }
      await t2.commit();
    } catch (error) {
      t2 && (await t2.rollback());
      throw error;
    }
  }

  private getSecurityCode(value: string): string {
    // const code = value.substring(value.length - 4, value.length);
    const code = new BigNumber(value).mod(10000).toString();
    return code;
  }
  private parseSecurityCode(value: string): {
    dealerId: number;
    ebcId: number;
    targetChainIdIndex: number;
  } {
    const code = this.getSecurityCode(value);
    const dealerId = Number(code[0]);
    const ebcId = Number(code[1]);
    const targetChainIdIndex = Number(code.substring(2));
    return { dealerId, ebcId, targetChainIdIndex };
  }

  private getResponseIntent(
    amount: string,
    tradeFee: string,
    withholdingFee: string,
    targetSafeCode: string,
  ) {
    const securityCode = this.getSecurityCode(amount);
    const tradeAmount =
      BigInt(amount) - BigInt(securityCode) - BigInt(withholdingFee);
    //  tradeAmount valid max and min
    const tradingFee = (tradeAmount * BigInt(tradeFee)) / 1000000n;
    const responseAmount = ((tradeAmount - tradingFee) / 10000n) * 10000n;
    const responseAmountStr = responseAmount.toString();
    const result = {
      code: 0,
      value: amount,
      tradeAmount: tradeAmount.toString(),
      tradeFee: tradingFee.toString(),
      withholdingFee,
      responseAmountOrigin: responseAmountStr,
      responseAmount: `${responseAmountStr.substring(
        0,
        responseAmountStr.length - 4,
      )}${padStart(targetSafeCode, 4, '0')}`,
    };
    return result;
  }
}

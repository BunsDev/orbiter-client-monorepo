import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { equals } from '@orbiter-finance/utils';
import { BridgeTransactionAttributes, BridgeTransaction, Transfers } from '@orbiter-finance/seq-models';
import { InjectModel } from '@nestjs/sequelize';
import { ChainConfigService, ENVConfigService } from '@orbiter-finance/config';
import BigNumber from 'bignumber.js';
import { Op } from 'sequelize';
import { Cron } from '@nestjs/schedule';
import { Sequelize } from 'sequelize-typescript';
import { MemoryMatchingService } from './memory-matching.service';
import { MakerService } from '../maker/maker.service';
import { V3RuleInterface, V3TokenInterface } from './transaction.interface'
import { ethers } from 'ethers6';
import { OrbiterLogger, LoggerDecorator } from '@orbiter-finance/utils';
import { padStart } from 'lodash';
import { TransactionID } from '../utils';
export interface handleTransferReturn {
  errno: number;
  errmsg?: string;
  data?: any
}
@Injectable()
export class TransactionV2Service {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    @InjectModel(Transfers) private transfersModel: typeof Transfers,
    @InjectModel(BridgeTransaction)
    private bridgeTransactionModel: typeof BridgeTransaction,
    protected chainConfigService: ChainConfigService,
    private sequelize: Sequelize,
    protected memoryMatchingService: MemoryMatchingService,
    protected makerService: MakerService,
    protected envConfigService: ENVConfigService,
  ) {
    this.matchScheduleUserSendTask()
      .then((_) => {
        this.matchScheduleMakerSendTask();
      })
      .catch((error) => {
        this.logger.error(
          `constructor matchScheduleUserSendTask error`,
          error,
        );
      });
  }
  @Cron('0 */5 * * * *')
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
  @Cron('*/5 * * * * *')
  async fromCacheMatch() {
    for (const transfer of this.memoryMatchingService.transfers) {
      if (transfer.version === '2-1') {
        const matchTx = this.memoryMatchingService.matchV1GetBridgeTransactions(transfer);
        if (matchTx) {
          this.handleTransferByDestTx(transfer as any);
        }
      }
    }
  }
  @Cron('0 */10 * * * *')
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
      const result = await this.handleTransferByDestTx(transfer).then(result => {
        if (result && result.errno != 0) {
          this.memoryMatchingService.addTransferMatchCache(transfer);
        }
        return result;
      }).catch((error) => {
        this.logger.error(
          `matchSenderScheduleTask handleTransferByDestTx ${transfer.hash} error`,
          error,
        );
      });
      this.logger.info(`${transfer.hash} handleTransferByDestTx result:${JSON.stringify(result)}`)
    }
  }

  errorBreakResult(errmsg: string, errno: number = 1): handleTransferReturn {
    this.logger.error(errmsg);
    return {
      errno: errno,
      errmsg: errmsg
    }
  }
  public async handleTransferBySourceTx(transfer: Transfers): Promise<handleTransferReturn> {
    if (transfer.status != 2) {
      return this.errorBreakResult(`validSourceTxInfo fail ${transfer.hash} Incorrect status ${transfer.status}`)
    }
    const sourceBT = await this.bridgeTransactionModel.findOne({
      where: {
        sourceChain: transfer.chainId,
        sourceId: transfer.hash,
      },
    });
    if (sourceBT && sourceBT.status >= 90) {
      return this.errorBreakResult(`${transfer.hash} The transaction exists, the status is greater than 90, and it is inoperable.`, sourceBT.status)
    }
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
    const { dealerId, ebcId, targetChainIdIndex } = this.parseSecurityCode(
      transfer.value,
    );
    if (+transfer.nonce > 9999) {
      await this.transfersModel.update(
        {
          opStatus: 5,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      return this.errorBreakResult(`${transfer.hash} Exceeded the maximum nonce value ${transfer.nonce} / 9999`,)
    }
    const txTimestamp = dayjs(transfer.timestamp).unix();
    const result = await this.makerService.getV2RuleByTransfer(transfer, +dealerId, +ebcId, +targetChainIdIndex);
    if (!result) {
      return this.errorBreakResult(`${transfer.hash} getV2RuleByTransfer result not found`)
    }
    this.logger.info(`handleTransferBySourceTx ${transfer.hash}  dealerId: ${dealerId}, ebcId: ${ebcId}. targetChainIdIndex: ${targetChainIdIndex}, txTimestamp: ${txTimestamp}, owners: ${transfer.receiver}`);
    if (result.code != 0) {
      return this.errorBreakResult(`${transfer.hash} getV2RuleByTransfer fail ${result.errmsg} ${JSON.stringify(result)}`)
    }
    const { ebc, dealer, sourceToken, targetToken, rule } = result.data;
    const targetTokenAddrSub = `0x${targetToken.tokenAddress.substring(26).toLocaleLowerCase()}`;
    if (!ethers.isAddress(targetTokenAddrSub)) {
      return this.errorBreakResult(`${transfer.hash} targetTokenAddrSub ${targetTokenAddrSub} isAddress error`)
    }
    // get config center
    const configCenterTargetToken = await this.chainConfigService.getTokenByChain(targetToken.chainId, targetTokenAddrSub);
    if (!configCenterTargetToken) {
      return this.errorBreakResult(`${transfer.hash} configCenterTargetToken ${targetToken.chainId} - ${targetTokenAddrSub} not found`)
    }
    createdData.sourceChain = transfer.chainId;
    createdData.sourceToken = transfer.token;
    createdData.targetToken = targetTokenAddrSub;
    createdData.targetSymbol = configCenterTargetToken.symbol;
    createdData.dealerAddress = dealer.dealerAddr;
    createdData.ebcAddress = ebc.ebcAddr;
    createdData.targetChain = targetToken.chainId;
    createdData.ruleId = rule.id;
    createdData.targetAddress = transfer.sender;
    createdData.responseMaker = [transfer.receiver];

    const v3ResponseMaker = this.envConfigService.get("v3ResponseMaker");
    console.log('v3ResponseMaker:', v3ResponseMaker);
    if (v3ResponseMaker) {
      const addrList = v3ResponseMaker[transfer.receiver] || [];
      createdData.responseMaker.push(...addrList);
      console.log('createdData.responseMaker:', createdData.responseMaker);
    }
    createdData.transactionId = TransactionID(
      transfer.sender,
      `-${transfer.chainId}`,
      transfer.nonce,
      transfer.symbol,
      dayjs(transfer.timestamp).valueOf(),
    );
    const calcResult = await this.calculateRebateAmount(sourceToken, targetToken, transfer, rule);
    if (!calcResult) {
      return this.errorBreakResult(`${transfer.hash} targetAmount not found`)
    }
    createdData.targetAmount = calcResult['responseAmount'];
    createdData.tradeFee = calcResult['tradeFee'];
    createdData.withholdingFee = calcResult['withholdingFee'];
    const t = await this.sequelize.transaction();
    try {
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
      return {
        errno: 0,
        data: createdData
      }
    } catch (error) {
      this.logger.error(
        `handleTransferBySourceTx ${transfer.hash} error`,
        error,
      );
      t && (await t.rollback());
      throw error;
    }
  }
  public async calculateRebateAmount(sourceToken: V3TokenInterface, targetToken: V3TokenInterface, transfer: Transfers, rule: V3RuleInterface) {
    const sourceChainId = +sourceToken.chainId;
    const targetChainId = +targetToken.chainId;
    if (equals(sourceChainId, +rule.chain0) && equals(targetChainId, +rule.chain1)) {
      // chain0 to chain1
      const withholdingFee = new BigNumber(rule.chain0WithholdingFee).div(10 ** sourceToken.decimals).toString();
      const result = this.getResponseIntent(
        transfer.value,
        new BigNumber(rule.chain0TradeFee).toFixed(0),
        new BigNumber(rule.chain0WithholdingFee).toFixed(0),
        transfer.nonce,
      );
      if (result.code == 0) {
        return {
          withholdingFee,
          tradeFee: new BigNumber(result.tradeFee)
            .div(10 ** targetToken.decimals)
            .toFixed(18),
          responseAmount: new BigNumber(result.responseAmount)
            .div(10 ** targetToken.decimals)
            .toFixed(18)
        }
      }

    }
    if (equals(sourceChainId, +rule.chain1) && equals(targetChainId, +rule.chain0)) {
      // chain to chain0
      const withholdingFee = new BigNumber(rule.chain1WithholdingFee).div(10 ** sourceToken.decimals).toString();
      const result = this.getResponseIntent(
        transfer.value,
        new BigNumber(rule.chain1TradeFee).toFixed(0),
        new BigNumber(rule.chain1WithholdingFee).toFixed(0),
        transfer.nonce,
      );
      if (result.code == 0) {
        return {
          withholdingFee,
          tradeFee: new BigNumber(result.tradeFee)
            .div(10 ** targetToken.decimals)
            .toFixed(18),
          responseAmount: new BigNumber(result.responseAmount)
            .div(10 ** targetToken.decimals)
            .toFixed(18)
        }
      }

    }
    return null;
  }
  public async handleTransferByDestTx(transfer: Transfers): Promise<handleTransferReturn> {
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
            limit: 1,
            where: {
              id: memoryBT.id,
              status: [0, 97, 98],
              sourceTime: {
                [Op.lt]: dayjs(transfer.timestamp).add(5, 'minute').toISOString(),
                [Op.gt]: dayjs(transfer.timestamp).subtract(120, 'minute').toISOString(),
              }
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
            opStatus: transfer.status == 3 ? 97 : 99,
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
        return {
          errno: 0,
          data: memoryBT,
          errmsg: 'memory success'
        };
      }
    } catch (error) {
      this.logger.error(
        `handleTransferByDestTx matchV1GetBridgeTransactions match error ${transfer.hash}`,
        error,
      );
      t1 && (await t1.rollback());
    }

    const result = {
      errmsg: '',
      data: null,
      errno: 0
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
        btTx.status = transfer.status == 3 ? 97 : 99;
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
        this.memoryMatchingService.removeTransferMatchCache(btTx.sourceId);
        this.memoryMatchingService.removeTransferMatchCache(btTx.targetId);
        result.errno = 0;
        result.errmsg = 'success';
      } else {
        this.memoryMatchingService
          .addTransferMatchCache(transfer)
          .catch((error) => {
            this.logger.error(
              `${transfer.hash} addTransferMatchCache error`,
              error,
            );
          });
        result.errno = 1001;
        result.errmsg = 'bridgeTransaction not found';
      }
      await t2.commit();
      result.data = btTx;
      return result;
    } catch (error) {
      t2 && (await t2.rollback());
      throw error;
    }
  }

  private getSecurityCode(value: string): string {
    const code = value.substring(value.length - 5, value.length);
    // const code = new BigNumber(value).mod(100000).toString();
    return code;
  }
  private parseSecurityCode(value: string): {
    dealerId: number;
    ebcId: number;
    targetChainIdIndex: number;
  } {
    const code = this.getSecurityCode(value);
    const dealerId = Number(code.substring(0, 2));
    const ebcId = Number(code[2]);
    const targetChainIdIndex = Number(code.substring(3));
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

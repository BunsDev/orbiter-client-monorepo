import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { equals } from '@orbiter-finance/utils';
import { BridgeTransactionAttributes, BridgeTransaction, Transfers, BridgeTransactionStatus } from '@orbiter-finance/seq-models';
import { InjectModel } from '@nestjs/sequelize';
import { ChainConfigService, ENVConfigService } from '@orbiter-finance/config';
import BigNumber from 'bignumber.js';
import { Op } from 'sequelize';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { Sequelize } from 'sequelize-typescript';
import { MemoryMatchingService } from './memory-matching.service';
import { MakerService } from '../maker/maker.service';
import { V3RuleInterface, V3TokenInterface } from './transaction.interface'
import { ethers } from 'ethers6';
import { OrbiterLogger, LoggerDecorator } from '@orbiter-finance/utils';
import { padStart, uniq } from 'lodash';
import { TransactionID, addJob } from '../utils';
import {TransactionV1Service} from './transactionV1.service';
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
    private schedulerRegistry: SchedulerRegistry,
    private transactionV1Service: TransactionV1Service
  ) {

    if (this.envConfigService.get('START_VERSION') && this.envConfigService.get('START_VERSION').includes('2-0')) {
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
      addJob(this.schedulerRegistry, 'v2-matchScheduleUserSendTask', '0 */5 * * * *', this.matchScheduleUserSendTask.bind(this))
      addJob(this.schedulerRegistry, 'v2-fromCacheMatch', '*/5 * * * * *', this.fromCacheMatch.bind(this))
      addJob(this.schedulerRegistry, 'v2-matchScheduleMakerSendTask', '0 */10 * * * *', this.matchScheduleMakerSendTask.bind(this))

    }
  }
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
  async fromCacheMatch() {
    for (const transfer of this.memoryMatchingService.transfers) {
      if (transfer.version === '2-1') {
        const matchTx = this.memoryMatchingService.matchV1GetBridgeTransactions(transfer);
        if (matchTx) {
          this.transactionV1Service.handleTransferByDestTx(transfer as any);
        }
      }
    }
  }
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
      const result = await this.transactionV1Service.handleTransferByDestTx(transfer).then(result => {
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
      status: BridgeTransactionStatus.PENDING_PAID,
      targetAmount: null,
      sourceMaker: transfer.receiver,
      sourceAddress: transfer.sender,
      targetAddress: null,
      targetSymbol: null,
      createdAt: new Date(),
      version: transfer.version,
    };
    // let dealerId,ebcId,targetChainIdIndex;
    const code = this.getSecurityCode(transfer);
    let { dealerId, ebcId, targetChainIdIndex } = this.parseSecurityCode(code);
    if (ebcId === 0 || dealerId === 0 || targetChainIdIndex === 0) {
      const diffMinute = dayjs().diff(transfer.timestamp, 'minute');
      if (diffMinute > 10) {
        await this.transfersModel.update(
          {
            opStatus: 4,
          },
          {
            where: {
              hash: transfer.hash,
            },
          },
        );
      }

      return this.errorBreakResult(`${transfer.hash} Rule Not Found`)
    }
    if (+transfer.nonce > 999999) {
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
      const diffMinute = dayjs().diff(transfer.timestamp, 'minute');
      if (diffMinute > 10) {
        await this.transfersModel.update(
          {
            opStatus: 4,
          },
          {
            where: {
              hash: transfer.hash,
            },
          },
        );
      }
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
      const diffHours = dayjs().diff(transfer.timestamp, 'hours');
      if (diffHours > 24) {
        await this.transfersModel.update(
          {
            opStatus: 3,
          },
          {
            where: {
              hash: transfer.hash,
            },
          },
        );
      }
      return this.errorBreakResult(`${transfer.hash} configCenterTargetToken ${targetToken.chainId} - ${targetTokenAddrSub} not found`)
    }
    createdData.targetMaker = createdData.sourceMaker;
    createdData.sourceChain = transfer.chainId;
    createdData.sourceToken = transfer.token;
    createdData.targetToken = targetTokenAddrSub;
    createdData.targetSymbol = configCenterTargetToken.symbol;
    createdData.dealerAddress = dealer.dealerAddr;
    createdData.ebcAddress = ebc.ebcAddr;
    createdData.targetChain = targetToken.chainId;
    createdData.ruleId = rule.id;
    createdData.targetAddress = transfer.sender;
    createdData.responseMaker = [createdData.sourceMaker];

    const responseMaker = this.envConfigService.get("PAID_RESPONSE_MAKER");
    if (responseMaker) {
      for (const fakeAddr in responseMaker) {
        if (responseMaker[fakeAddr].includes(createdData.sourceMaker.toLocaleLowerCase())) {
          createdData.responseMaker.push(fakeAddr.toLocaleLowerCase());
        }
      }
    }
    createdData.responseMaker = uniq(createdData.responseMaker);
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
        transfer,
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
        transfer,
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


  private getSecurityCode(transfer: Transfers): string {
    const value = transfer.crossChainParams && transfer.crossChainParams['targetChain'] ? transfer.crossChainParams['targetChain'] : transfer.value;
    const code = value.substring(value.length - 5, value.length);
    return code
  }
  private parseSecurityCode(code: string): {
    dealerId: number;
    ebcId: number;
    targetChainIdIndex: number;
  } {
    const dealerId = Number(code.substring(0, 2));
    const ebcId = Number(code[2]);
    const targetChainIdIndex = Number(code.substring(3));
    return { dealerId, ebcId, targetChainIdIndex };
  }

  private getResponseIntent(
    transfer:Transfers,
    tradeFee: string,
    withholdingFee: string,
    targetSafeCode: string,
  ) {
    const securityCode = this.getSecurityCode(transfer);
    const amount = transfer.value;
    const tradeAmount =
      BigInt(amount) - BigInt(securityCode) - BigInt(withholdingFee);
    //  tradeAmount valid max and min
    const tradingFee = (tradeAmount * BigInt(tradeFee)) / 1000000n;
    const responseAmount = ((tradeAmount - tradingFee) / 10000n) * 10000n;
    const responseAmountStr = responseAmount.toString();
    const targetSafeCodeLength = String(targetSafeCode).length
    const result = {
      code: 0,
      value: amount,
      tradeAmount: tradeAmount.toString(),
      tradeFee: tradingFee.toString(),
      withholdingFee,
      responseAmountOrigin: responseAmountStr,
      responseAmount: `${responseAmountStr.substring(
        0,
        responseAmountStr.length - targetSafeCodeLength,
      )}${padStart(targetSafeCode,targetSafeCodeLength, '0')}`,
    };
    return result;
  }
}

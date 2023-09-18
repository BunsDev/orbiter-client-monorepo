import { Injectable } from '@nestjs/common';
import { padEnd } from 'lodash';
import dayjs from 'dayjs';
import { TransactionID } from '../utils'
import { equals, fix0xPadStartAddress } from '@orbiter-finance/utils';
import { BridgeTransactionAttributes, BridgeTransaction as BridgeTransactionModel, Transfers as TransfersModel } from '@orbiter-finance/seq-models';
import { InjectModel } from '@nestjs/sequelize';
import { ChainConfigService, ENVConfigService, MakerV1RuleService } from '@orbiter-finance/config';
import { getAmountToSend } from '../utils/oldUtils';
import BigNumber from 'bignumber.js';
import { Op } from 'sequelize';
import { Cron } from '@nestjs/schedule';
import { MemoryMatchingService } from './memory-matching.service';
import { createLoggerByName } from '../utils/logger';
import { Sequelize } from 'sequelize-typescript';
@Injectable()
export class TransactionV1Service {
  private logger = createLoggerByName(`${TransactionV1Service.name}`);
  constructor(
    @InjectModel(TransfersModel)
    private transfersModel: typeof TransfersModel,
    @InjectModel(BridgeTransactionModel)
    private bridgeTransactionModel: typeof BridgeTransactionModel,
    protected chainConfigService: ChainConfigService,
    protected memoryMatchingService: MemoryMatchingService,
    private sequelize: Sequelize,
    protected envConfigService: ENVConfigService,
    protected makerV1RuleService: MakerV1RuleService,
  ) {
    this.matchScheduleTask()
      .then((res) => {
        this.matchSenderScheduleTask();
      })
      .catch((error) => {
        this.logger.error(
          `constructor matchScheduleTask error `,
          error,
        );
      });
  }
  @Cron('0 */5 * * * *')
  async matchScheduleTask() {
    const transfers = await this.transfersModel.findAll({
      raw: true,
      order: [['id', 'desc']],
      limit: 500,
      where: {
        status: 2,
        opStatus: 0,
        version: '1-0',
        timestamp: {
          [Op.gte]: dayjs().subtract(24, 'hour').toISOString(),
        },
        // nonce: {
        //   [Op.lt]: 9000
        // }
      },
    });
    for (const transfer of transfers) {
      await this.handleTransferBySourceTx(transfer).catch((error) => {
        this.logger.error(
          `matchScheduleTask handleTransferBySourceTx ${transfer.hash} error`,
          error,
        );
      });
    }
  }

  @Cron('0 */7 * * * *')
  async matchSenderScheduleTask() {
    const transfers = await this.transfersModel.findAll({
      raw: true,
      order: [['id', 'desc']],
      limit: 1000,
      where: {
        status: 2,
        opStatus: 0,
        version: '1-1',
        timestamp: {
          [Op.gte]: dayjs().subtract(24, 'hour').toISOString(),
        },
      },
    });
    for (const transfer of transfers) {
      await this.handleTransferByDestTx(transfer).catch((error) => {
        this.logger.error(
          `matchSenderScheduleTask handleTransferByDestTx ${transfer.hash} error`,
          error,
        );
      });
    }
  }

  public async validSourceTxInfo(transfer: TransfersModel) {
    const result: any = {};
    if (+transfer.nonce >= 9000) {
      return {
        code: 1,
        errmsg: `Exceeded the maximum nonce value ${transfer.nonce} / 9000`,
        data: result,
      };
    }
    const sourceChain = this.chainConfigService.getChainInfo(transfer.chainId);
    if (!sourceChain) {
      await this.transfersModel.update(
        {
          opStatus: 2,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      this.logger.error(
        `${transfer.hash} ${transfer.chainId} sourceChain not found`,
      );
      return {
        code: 1,
        errmsg: 'sourceChain not found',
        data: result,
      };
    }
    result.sourceChain = sourceChain;
    const sourceToken = this.chainConfigService.getTokenByAddress(
      sourceChain.chainId,
      transfer.token,
    );
    if (!sourceToken) {
      await this.transfersModel.update(
        {
          opStatus: 2,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      this.logger.error(
        `${transfer.hash} ${transfer.token} sourceToken not found`,
      );
      return {
        code: 1,
        errmsg: 'sourceToken not found',
        data: result,
      };
    }
    result.sourceToken = sourceToken;
    let targetChainId = this.parseSourceTxSecurityCode(transfer.amount);
    // targetChainId
    if ([9, 99].includes(+sourceChain.internalId)) {
      // TODO:
      if (transfer.calldata && Array.isArray(transfer.calldata)) {
        if (transfer.calldata.length === 1) {
          targetChainId = Number(transfer.calldata[0]) % 1000;
        } else if (transfer.calldata.length === 2) {
          targetChainId = Number(transfer.calldata[0]) % 1000;
        }
      }
    }
    const targetChain = this.chainConfigService.getChainByKeyValue(
      'internalId',
      targetChainId,
    );
    if (!targetChain) {
      // change data
      await this.transfersModel.update(
        {
          opStatus: 3,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      this.logger.error(
        `${transfer.hash} ${targetChain} targetChain not found`,
      );
      return {
        code: 1,
        errmsg: 'targetChain not found',
        data: result,
      };
    }
    result.targetChain = targetChain;
    //
    const targetToken = await this.chainConfigService.getTokenBySymbol(
      targetChain.chainId,
      sourceToken.symbol,
    );
    if (!targetChain) {
      await this.transfersModel.update(
        {
          opStatus: 3,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      this.logger.error(`${transfer.hash}  targetToken not found`);
      return {
        code: 1,
        errmsg: 'targetToken not found',
        data: result,
      };
    }
    result.targetToken = targetToken;
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
      await this.transfersModel.update(
        {
          opStatus: 4,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      return {
        code: 1,
        errmsg: 'Rule not found',
        data: result,
      };
    }
    result.targetMaker = rule.sender;
    result.rule = rule;
    if (targetChain) {
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
      } else if ([9, 99].includes(sourceChainID)) {
        if (transfer.calldata && Array.isArray(transfer.calldata)) {
          if (transfer.calldata.length === 1) {
            result.targetAddress = transfer.sender;
          } else if (transfer.calldata.length === 2) {
            result.targetAddress = transfer.calldata[1];
          }
        }
      } else {
        result.targetAddress = transfer.sender;
      }
    }
    if (!result.targetAddress) {
      return {
        code: 1,
        errmsg: 'targetAddress not found',
        data: result,
      };
    }
    return {
      code: 0,
      errmsg: '',
      data: result,
    };
  }
  private buildSourceTxData(
    transfer: TransfersModel,
    createdData: BridgeTransactionAttributes,
    data: any,
  ) {
    const { rule, sourceChain, targetChain, sourceToken, targetToken } = data;
    if (data.dealer) {
      createdData.dealerAddress = data.dealer.address;
    }
    if (data.ebc) {
      createdData.ebcAddress = data.ebc.address;
    }
    if (data.targetChain) {
      if (data.sourceChain) {
        createdData.sourceChain = data.sourceChain.chainId;
        const sourceToken = data.sourceToken;
        if (sourceToken) {
          createdData.targetToken = sourceToken.address.toLowerCase();
          createdData.targetSymbol = sourceToken.symbol;
        }
      }
    }
    if (data.targetChain) {
      createdData.targetChain = data.targetChain.chainId;
      const targetToken = data.targetToken;
      if (targetToken) {
        createdData.targetToken = targetToken.address.toLowerCase();
        createdData.targetSymbol = targetToken.symbol;
      }
    }
    createdData.targetMaker = data.targetMaker;
    const amountToSend = getAmountToSend(
      +sourceChain.internalId,
      sourceToken.decimals,
      +targetChain.internalId,
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
    createdData.transactionId = TransactionID(
      transfer.sender,
      sourceChain.internalId,
      transfer.nonce,
      transfer.symbol,
      dayjs(transfer.timestamp).valueOf(),
    );
    createdData.withholdingFee = rule.tradingFee;
    // if (data.targetAddress) {
    createdData.targetAddress = data.targetAddress.toLowerCase();
    // }
    createdData.responseMaker = [rule.sender.toLocaleLowerCase()];
    const v1ResponseMaker = this.envConfigService.get("v1ResponseMaker");
    if (v1ResponseMaker) {
      for (const fakeMaker in v1ResponseMaker) {
        if (v1ResponseMaker[fakeMaker].includes(rule.sender.toLocaleLowerCase())) {
          createdData.responseMaker.push(fakeMaker);
        }
      }
    }
  }
  public async handleTransferBySourceTx(transfer: TransfersModel) {
    if (transfer.status != 2) {
      this.logger.error(
        `validSourceTxInfo fail ${transfer.hash} Incorrect status ${transfer.status}`
      );
      return {
        errmsg: `validSourceTxInfo fail ${transfer.hash} Incorrect status ${transfer.status}`
      }
    }

    const { code, errmsg, data } = await this.validSourceTxInfo(transfer);
    if (code !== 0) {
      this.logger.error(
        `validSourceTxInfo fail ${transfer.hash} ${errmsg}`,
      );
      return {
        errmsg: `validSourceTxInfo fail ${transfer.hash} ${errmsg}`
      }
    }
    const sourceBT = await this.bridgeTransactionModel.findOne({
      attributes: ['id', 'status', 'targetChain'],
      where: {
        sourceChain: transfer.chainId,
        sourceId: transfer.hash,
      },
    });
    if (sourceBT && sourceBT.status >= 90) {
      this.logger.error(
        `${transfer.hash} Status is in operation Operation not permitted`,
      );
      return {
        errmsg: `${transfer.hash} Status is in operation Operation not permitted`
      }
    }

    const t = await this.sequelize.transaction();
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
      this.buildSourceTxData(transfer, createdData, data);
      if (createdData.targetAddress.length >= 100) {
        return {
          errmsg: `${transfer.hash} There is an issue with the transaction format`
        }
      }
      if (sourceBT && sourceBT.id) {
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
      } else {
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
        this.memoryMatchingService
          .addBridgeTransaction(createRow.toJSON())
          .catch((error) => {
            this.logger.error(
              `${sourceBT.sourceId} addBridgeTransaction error`,
              error,
            );
          });
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

  public async handleTransferByDestTx(transfer: TransfersModel) {
    if (transfer.version != '1-1') {
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
        `handleTransferByDestTx matchV1GetBridgeTransactions match error ${transfer.hash} `,
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
              `${transfer.hash} addTransferMatchCache error `,
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

  private parseSourceTxSecurityCode(value: string): number {
    const kindex = value.lastIndexOf('9');
    const code = value.substring(kindex, kindex + 4);
    const chainId = +`${padEnd(code, 4, '0')}` % 1000;
    return chainId;
  }

  private parseDestTxSecurityCode(value: string): number {
    const code = value.substring(value.length - 4, value.length);
    return +code;
  }
}

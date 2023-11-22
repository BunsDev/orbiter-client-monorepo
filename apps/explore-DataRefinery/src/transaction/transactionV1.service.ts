import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { equals } from '@orbiter-finance/utils';
import { BridgeTransactionAttributes, BridgeTransaction as BridgeTransactionModel, Transfers as TransfersModel, TransferOpStatus } from '@orbiter-finance/seq-models';
import { InjectModel } from '@nestjs/sequelize';
import { ChainConfigService, ENVConfigService, MakerV1RuleService, Token } from '@orbiter-finance/config';
import { Op } from 'sequelize';
import { Cron } from '@nestjs/schedule';
import { MemoryMatchingService } from './memory-matching.service';
import { Sequelize } from 'sequelize-typescript';
import { OrbiterLogger } from '@orbiter-finance/utils';
import { LoggerDecorator } from '@orbiter-finance/utils';
import { utils } from 'ethers'
import { validateAndParseAddress } from 'starknet'
import BridgeTransactionBuilder from './bridgeTransaction.builder'
import { ValidSourceTxError, decodeV1SwapData, addressPadStart } from '../utils';
import { MessageService } from '@orbiter-finance/rabbit-mq'
export interface handleTransferReturn {
  errno: number;
  errmsg?: string;
  data?: any
}
@Injectable()
export class TransactionV1Service {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
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
    protected bridgeTransactionBuilder: BridgeTransactionBuilder,
    private messageService: MessageService,
  ) {
    this.matchScheduleTask()
      .then((_res) => {
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
      const result = await this.handleTransferBySourceTx(transfer).catch((error) => {
        this.logger.error(
          `matchScheduleTask handleTransferBySourceTx ${transfer.hash} error`,
          error,
        );
      });
      if (result && result.errno === 0 && +this.envConfigService.get('enableDataSync') === 1) {
        await this.messageService.sendMessageToDataSynchronization({ type: '2', data: transfer })
      }
    }
  }
  @Cron('*/5 * * * * *')
  async fromCacheMatch() {
    for (const transfer of this.memoryMatchingService.transfers) {
      if (transfer.version === '1-1') {
        const matchTx = this.memoryMatchingService.matchV1GetBridgeTransactions(transfer);
        if (matchTx) {
          this.logger.info(
            `memory match success: source hash:${matchTx.sourceId}，dest hash:${transfer.hash}`,
          );
          const result = await this.handleTransferByDestTx(transfer as any);
          if (result && result.errno === 0) {
            this.logger.info(
              `memory match success: source hash:${matchTx.sourceId}，dest hash:${transfer.hash} delete`,
            );
          }
        }
      }
    }
  }
  @Cron('0 */10 * * * *')
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
      const result = await this.handleTransferByDestTx(transfer).then(result=> {
        if (result && result.errno!=0){
          this.memoryMatchingService.addTransferMatchCache(transfer);
        }
        return result;
      }).catch((error) => {
        this.logger.error(
          `matchSenderScheduleTask handleTransferByDestTx ${transfer.hash} error`,
          error,
        );
      });
      if (result && result.errno === 0 && +this.envConfigService.get('enableDataSync') === 1) {
        await this.messageService.sendMessageToDataSynchronization({ type: '2', data: transfer })
      }
    }
  }
  errorBreakResult(errmsg: string, errno:number = 1): handleTransferReturn {
    this.logger.error(errmsg);
    return {
      errno: errno,
      errmsg: errmsg
    }
  }
  public async handleTransferBySourceTx(transfer: TransfersModel): Promise<handleTransferReturn> {
    if (transfer.status != 2) {
      return this.errorBreakResult(`validSourceTxInfo fail ${transfer.hash} Incorrect status ${transfer.status}`)
    }
    const sourceBT = await this.bridgeTransactionModel.findOne({
      attributes: ['id', 'status', 'targetChain'],
      where: {
        sourceChain: transfer.chainId,
        sourceId: transfer.hash,
      },
    });
    if (sourceBT && sourceBT.status >= 90) {
      return this.errorBreakResult(`${transfer.hash} The transaction exists, the status is greater than 90, and it is inoperable.`, sourceBT.status)
    }
    let createdData: BridgeTransactionAttributes
    try {
      createdData = await this.bridgeTransactionBuilder.build(transfer)
    } catch (error) {
      if (error instanceof ValidSourceTxError) {
        this.logger.error(`ValidSourceTxError hash: ${transfer.hash}, chainId:${transfer.chainId} => ${error.message}`);
        const r = await this.transfersModel.update(
          {
            opStatus: error.opStatus,
          },
          {
            where: {
              id: transfer.id,
            },
          },
        );
        return this.errorBreakResult(`ValidSourceTxError update transferId: ${transfer.id} result: ${JSON.stringify(r)}`)
      } else {
        this.logger.error(`ValidSourceTxError throw`, error)
        throw error
      }
    }

    const t = await this.sequelize.transaction();

    try {
      if (createdData.targetAddress.length >= 100) {
        return this.errorBreakResult(`${transfer.hash} There is an issue with the transaction format`)
      }

      if (sourceBT && sourceBT.id) {
        sourceBT.targetChain = createdData.targetChain;
        await sourceBT.update(createdData, {
          where: { id: sourceBT.id },
          transaction: t,
        })
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
        // this.logger.info(`Create bridgeTransaction ${createdData.sourceId}`);
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
      return { errno: 0, data: createdData }
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

  public async handleTransferByDestTx(transfer: TransfersModel): Promise<handleTransferReturn> {
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
            status: transfer.status == 3 ? 97 : 99,
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
                [Op.gt]: dayjs(transfer.timestamp).subtract(120, 'minute').toISOString(),
                [Op.lt]: dayjs(transfer.timestamp).add(5, 'minute').toISOString(),
              }
            },
            transaction: t1,
          },
        );
        if (rowCount != 1) {
          throw new Error(
            `The number of modified rows(${rowCount}) in bridgeTransactionModel is incorrect`,
          );
        }
        // source status 1 ，dest status = 0
        const [updateTransferRows] = await this.transfersModel.update(
          {
            opStatus: 99,
          },
          {
            where: {
              opStatus: [0, 1],
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
        // this.logger.info(
        //   `match success from cache ${memoryBT.sourceId}  /  ${transfer.hash}`,
        // );
        return {
          errno: 0,
          data: memoryBT,
          errmsg: 'memory success'
        };
      }
    } catch (error) {
      this.logger.error(
        `handleTransferByDestTx matchV1GetBridgeTransactions match error ${transfer.hash} `,
        error,
      );
      t1 && (await t1.rollback());
    }

    // db match
    const result = {
      errmsg: '',
      data: null,
      errno:0
    }
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
          targetId: null,
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
              opStatus: [0, 1],
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
        result.errno = 0;
        result.errmsg = 'success';
      } else {
        this.memoryMatchingService
          .addTransferMatchCache(transfer)
          .catch((error) => {
            this.logger.error(
              `${transfer.hash} addTransferMatchCache error `,
              error,
            );
          });
          result.errno = 1001;
          result.errmsg = 'bridgeTransaction not found';
      }
      await t2.commit();
      result.data = btTx;
      return result
    } catch (error) {
      t2 && (await t2.rollback());
      throw error;
    }
  }
}

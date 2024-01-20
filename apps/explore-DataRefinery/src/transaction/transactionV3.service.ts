import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { equals } from '@orbiter-finance/utils';
import {
  BridgeTransactionAttributes,
  BridgeTransaction as BridgeTransactionModel,
  Transfers as TransfersModel,
  TransferOpStatus,
  BridgeTransactionStatus,
  InscriptionOpType,
  DeployRecord,
  IDeployRecord,
  UserBalance as UserBalanceModel,
  IUserBalance,
} from '@orbiter-finance/seq-models';
import { InjectModel } from '@nestjs/sequelize';
import {
  ChainConfigService,
  ENVConfigService,
  MakerV1RuleService,
  Token,
} from '@orbiter-finance/config';
import { Op, where, fn, literal, Transaction } from 'sequelize';
import { Cron } from '@nestjs/schedule';
import { InscriptionMemoryMatchingService } from './inscription-memory-matching.service';
import { Sequelize } from 'sequelize-typescript';
import { OrbiterLogger } from '@orbiter-finance/utils';
import { LoggerDecorator } from '@orbiter-finance/utils';
import { utils } from 'ethers';
import { validateAndParseAddress } from 'starknet';
import InscriptionBuilder from './inscription.builder';
import {
  ValidSourceTxError,
  decodeV1SwapData,
  addressPadStart,
} from '../utils';
import { MessageService } from '@orbiter-finance/rabbit-mq';
import { parseTragetTxSecurityCode } from './bridgeTransaction.builder';
import BigNumber from 'bignumber.js';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';
export interface handleTransferReturn {
  errno: number;
  errmsg?: string;
  data?: any;
}
@Injectable()
export class TransactionV3Service {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    @InjectModel(TransfersModel)
    private transfersModel: typeof TransfersModel,
    @InjectModel(BridgeTransactionModel)
    private bridgeTransactionModel: typeof BridgeTransactionModel,
    @InjectModel(DeployRecord)
    private deployRecordModel: typeof DeployRecord,
    @InjectModel(UserBalanceModel)
    private userBalanceModel: typeof UserBalanceModel,
    protected chainConfigService: ChainConfigService,
    protected inscriptionMemoryMatchingService: InscriptionMemoryMatchingService,
    private sequelize: Sequelize,
    protected envConfigService: ENVConfigService,
    protected makerV1RuleService: MakerV1RuleService,
    protected inscriptionBuilder: InscriptionBuilder,
    private messageService: MessageService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    this.matchScheduleTask()
      .then((_res) => {
        this.matchSenderScheduleTask();
      })
      .catch((error) => {
        this.logger.error(
          `constructor TransactionV3Service matchScheduleTask error `,
          error,
        );
      });
  }
  errorBreakResult(errmsg: string, errno: number = 1): handleTransferReturn {
    this.logger.error(errmsg);
    return {
      errno: errno,
      errmsg: errmsg,
    };
  }

  // @Cron('0 */5 * * * *')
  async matchScheduleTask() {
    this.logger.info('matchScheduleTask start');
    const transfers = await this.transfersModel.findAll({
      raw: true,
      order: [['id', 'desc']],
      limit: 500,
      where: {
        status: 2,
        opStatus: 0,
        version: '3-0',
        timestamp: {
          [Op.gte]: dayjs().subtract(48, 'hour').toISOString(),
        },
        // nonce: {
        //   [Op.lt]: 9000
        // }
      },
    });
    this.logger.info(`matchScheduleTask transfers.length: ${transfers.length}`);
    for (const transfer of transfers) {
      const result = await this.handleClaimTransfer(transfer).catch((error) => {
        this.logger.error(
          `TransactionV3Service matchScheduleTask handleTransferBySourceTx ${transfer.hash} error`,
          error,
        );
      });
    }
  }
  @Cron('*/5 * * * * *')
  async fromCacheMatch() {
    for (const transfer of this.inscriptionMemoryMatchingService.transfers) {
      if (transfer.version === '3-1') {
        const callData = transfer.calldata as any;
        if (!callData || !callData.fc) {
          continue;
        }
        const { fc } = callData;
        const fromChainInternalId = +fc;
        const sourceChainInfo =
          this.chainConfigService.getChainInfo(+fromChainInternalId);
        if (!sourceChainInfo) {
          continue;
        }
        const matchTx =
          this.inscriptionMemoryMatchingService.matchV3GetBridgeTransactions(
            transfer,
            sourceChainInfo,
          );
        if (matchTx) {
          this.handleMintTransfer(transfer as any);
        }
      }
    }
  }
  // @Cron('0 */10 * * * *')
  async matchSenderScheduleTask() {
    const transfers = await this.transfersModel.findAll({
      raw: true,
      order: [['id', 'desc']],
      limit: 1000,
      where: {
        status: 2,
        opStatus: 0,
        version: '3-1',
        timestamp: {
          [Op.gte]: dayjs().subtract(48, 'hour').toISOString(),
        },
      },
    });
    for (const transfer of transfers) {
      const result = await this.handleMintTransfer(transfer)
        .then((result) => {
          if (result && result.errno != 0) {
            this.inscriptionMemoryMatchingService.addTransferMatchCache(
              transfer,
            );
          }
          return result;
        })
        .catch((error) => {
          this.logger.error(
            `matchSenderScheduleTask handleTransferByDestTx ${transfer.hash} error`,
            error,
          );
        });
    }
  }
  public async handleClaimTransfer(
    transfer: TransfersModel,
  ): Promise<handleTransferReturn> {
    if (transfer.status != 2) {
      return this.errorBreakResult(
        `handleClaimTransfer fail ${transfer.hash} Incorrect status ${transfer.status}`,
      );
    }
    if (transfer.version != '3-0') {
      return this.errorBreakResult(
        `handleClaimTransfer fail ${transfer.hash} Incorrect version ${transfer.version}`,
      );
    }
    const callData = transfer.calldata as any;
    if (
      !callData ||
      !callData.op ||
      !callData.p ||
      !callData.tick ||
      !callData.amt ||
      new BigNumber(callData.amt).decimalPlaces() !== 0
    ) {
      await this.transfersModel.update(
        {
          opStatus: TransferOpStatus.INVALID_OP_PARAMS,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      return this.errorBreakResult(
        `handleDeployTransfer fail ${
          transfer.hash
        } Incorrect params : ${JSON.stringify(callData)}`,
      );
    }
    const { tick, op, p } = callData;
    if (op !== InscriptionOpType.Claim) {
      await this.transfersModel.update(
        {
          opStatus: TransferOpStatus.INVALID_OP,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      return this.errorBreakResult(
        `handleClaimTransfer fail ${transfer.hash} Incorrect InscriptionOpType: ${callData.op}, must be ${InscriptionOpType.Claim}`,
      );
    }
    const deployTick = await this.deployRecordModel.findOne({
      raw: true,
      where: {
        to: transfer.receiver,
        protocol: p,
        tick: tick,
      },
    });
    if (!deployTick) {
      await this.transfersModel.update(
        {
          opStatus: TransferOpStatus.DEPLOY_RECORD_NOT_FOUND,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      return this.errorBreakResult(
        `handleClaimTransfer fail ${transfer.hash} deployTick nof found`,
      );
    }
    const sourceBT = await this.bridgeTransactionModel.findOne({
      attributes: ['id', 'status', 'targetChain'],
      where: {
        sourceChain: transfer.chainId,
        sourceId: transfer.hash,
      },
    });
    if (sourceBT && sourceBT.status >= 90) {
      return this.errorBreakResult(
        `${transfer.hash} The transaction exists, the status is greater than 90, and it is inoperable.`,
        sourceBT.status,
      );
    }
    let createdData: BridgeTransactionAttributes;
    try {
      createdData = await this.inscriptionBuilder.build(transfer, deployTick);
    } catch (error) {
      if (error instanceof ValidSourceTxError) {
        this.logger.error(
          `ValidClaimTransferError hash: ${transfer.hash}, chainId:${transfer.chainId} => ${error.message}`,
        );
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
        return this.errorBreakResult(
          `ValidClaimTransfer update transferId: ${
            transfer.id
          } result: ${JSON.stringify(r)}`,
        );
      } else {
        console.error(error);
        this.logger.error(`ValidClaimTransferError throw`, error);
        throw error;
      }
    }

    const t = await this.sequelize.transaction();
    try {
      if (createdData.targetAddress.length >= 100) {
        return this.errorBreakResult(
          `${transfer.hash} There is an issue with the transaction format`,
        );
      }
      if (sourceBT && sourceBT.id) {
        sourceBT.targetChain = createdData.targetChain;
        await sourceBT.update(createdData, {
          where: { id: sourceBT.id },
          transaction: t,
        });
        createdData = sourceBT.toJSON();
      } else {
        const createRow = await this.bridgeTransactionModel.create(
          createdData,
          {
            transaction: t,
          },
        );
        if (!createRow || !createRow.id) {
          throw new Error(
            `${transfer.hash} Create Inscription Bridge Transaction Fail`,
          );
        }
        createdData = createRow.toJSON();
        const dr = await this.deployRecordModel.update(
          {
            currentMintedAmount: Sequelize.literal(
              `"currentMintedAmount" + ${createdData.targetAmount}`,
            ),
            currentMintedTx: Sequelize.literal(`"currentMintedTx" + 1`),
          },
          {
            where: {
              tick: tick,
              protocol: p,
            },
            transaction: t,
          },
        );
        await this.incUserBalance({
          address: createdData.sourceAddress,
          chainId: createdData.targetChain,
          value: createdData.targetAmount
        }, t)
        // this.logger.info(`Create bridgeTransaction ${createdData.sourceId}`);
        this.inscriptionMemoryMatchingService
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
            opStatus: TransferOpStatus.VALID,
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
      return { errno: 0, data: createdData };
    } catch (error) {
      this.logger.error(`handleClaimTransfer ${transfer.hash} error`, error);
      t && (await t.rollback());
      throw error;
    }
  }

  public async handleMintTransfer(
    transfer: TransfersModel,
  ): Promise<handleTransferReturn> {
    if (transfer.version != '3-1') {
      return this.errorBreakResult(
        `handleMintTransfer fail ${transfer.hash} Incorrect version ${transfer.version}`,
      );
    }

    const callData = transfer.calldata as any;
    if (
      !callData ||
      !callData.p ||
      !callData.tick ||
      !callData.amt ||
      !/^[1-9]\d*(\.\d+)?$/.test(callData.amt) ||
      !callData.fc) {
      await this.transfersModel.update(
        {
          opStatus: TransferOpStatus.INVALID_OP_PARAMS,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      return this.errorBreakResult(
        `handleMintTransfer fail ${
          transfer.hash
        } Incorrect params : ${JSON.stringify(callData)}`,
      );
    }
    const { tick, op, p, amt, fc } = callData;
    if (op !== InscriptionOpType.Mint) {
      return this.errorBreakResult(
        `handleMintTransfer fail ${transfer.hash} Incorrect InscriptionOpType: ${callData.op}, must be ${InscriptionOpType.Mint}`,
      );
    }
    const fromChainInternalId = +fc;
    const chainInfo = this.chainConfigService.getChainInfo(fromChainInternalId);
    if (!chainInfo) {
      await this.transfersModel.update(
        {
          opStatus: TransferOpStatus.INCORRECT_FC,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      return this.errorBreakResult(
        `handleMintTransfer fail ${
          transfer.hash
        } Incorrect from chain : ${JSON.stringify(callData)}`,
      );
    }
    let t1;
    try {
      const memoryBT =
        await this.inscriptionMemoryMatchingService.matchV3GetBridgeTransactions(
          transfer,
          chainInfo,
        );
      if (memoryBT && memoryBT.id) {
        //
        t1 = await this.sequelize.transaction();
        const [rowCount] = await this.bridgeTransactionModel.update(
          {
            targetId: transfer.hash,
            status:
              transfer.status == 3
                ? BridgeTransactionStatus.PAID_CRASH
                : BridgeTransactionStatus.BRIDGE_SUCCESS,
            targetTime: transfer.timestamp,
            targetFee: transfer.feeAmount,
            targetFeeSymbol: transfer.feeToken,
            targetNonce: transfer.nonce,
            targetMaker: transfer.sender,
          },
          {
            where: {
              id: memoryBT.id,
              status: [
                0,
                BridgeTransactionStatus.READY_PAID,
                BridgeTransactionStatus.PAID_CRASH,
                BridgeTransactionStatus.PAID_SUCCESS,
              ],
              sourceTime: {
                [Op.gt]: dayjs(transfer.timestamp)
                  .subtract(120, 'minute')
                  .toISOString(),
                [Op.lt]: dayjs(transfer.timestamp)
                  .add(5, 'minute')
                  .toISOString(),
              },
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
            opStatus: BridgeTransactionStatus.BRIDGE_SUCCESS,
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
        this.inscriptionMemoryMatchingService.removeTransferMatchCache(
          memoryBT.sourceId,
        );
        this.inscriptionMemoryMatchingService.removeTransferMatchCache(
          transfer.hash,
        );
        this.logger.info(
          `match success from cache ${memoryBT.sourceId}  /  ${transfer.hash}`,
        );
        return {
          errno: 0,
          data: memoryBT,
          errmsg: 'memory success',
        };
      }
    } catch (error) {
      if (
        error?.message &&
        error.message.indexOf('The number of modified') !== -1
      ) {
        this.logger.warn(
          `handleMintTransfer ${transfer.hash} ${error.message}`,
        );
      } else {
        this.logger.error(
          `handleMintTransfer matchV1GetBridgeTransactions match error ${transfer.hash} `,
          error,
        );
      }
      t1 && (await t1.rollback());
    }

    // db match
    const result = {
      errmsg: '',
      data: null,
      errno: 0,
    };
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
          status: [
            0,
            BridgeTransactionStatus.READY_PAID,
            BridgeTransactionStatus.PAID_CRASH,
            BridgeTransactionStatus.PAID_SUCCESS,
          ],
          sourceChain: chainInfo.chainId,
          targetId: null,
          targetSymbol: tick,
          targetAddress: transfer.receiver,
          targetChain: transfer.chainId,
          targetAmount: amt,
          sourceNonce: transfer.value,
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
        btTx.status =
          transfer.status == 3
            ? BridgeTransactionStatus.PAID_CRASH
            : BridgeTransactionStatus.BRIDGE_SUCCESS;
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
            opStatus: BridgeTransactionStatus.BRIDGE_SUCCESS,
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
        this.inscriptionMemoryMatchingService.removeTransferMatchCache(
          btTx.sourceId,
        );
        this.inscriptionMemoryMatchingService.removeTransferMatchCache(
          btTx.targetId,
        );
        this.logger.info(
          `match success from db ${btTx.sourceId}  /  ${btTx.targetId}`,
        );
        result.errno = 0;
        result.errmsg = 'success';
      } else {
        this.inscriptionMemoryMatchingService
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
      return result;
    } catch (error) {
      t2 && (await t2.rollback());
      throw error;
    }
  }

  public async handleDeployTransfer(
    transfer: TransfersModel,
  ): Promise<handleTransferReturn> {
    if (transfer.status != 2) {
      return this.errorBreakResult(
        `handleDeployTransfer fail ${transfer.hash} Incorrect status ${transfer.status}`,
      );
    }
    const callData = transfer.calldata as any;
    if (
      !callData ||
      !callData.op ||
      !callData.p ||
      !callData.lim ||
      !/^[1-9]\d*$/.test(callData.lim) ||
      !callData.max ||
      !/^[1-9]\d*$/.test(callData.max) ||
      callData.op !== InscriptionOpType.Deploy
    ) {
      await this.transfersModel.update(
        {
          opStatus: TransferOpStatus.INVALID_OP_PARAMS,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      return this.errorBreakResult(
        `handleDeployTransfer fail ${
          transfer.hash
        } Incorrect params : ${JSON.stringify(callData)}`,
      );
    }
    const { lim, max, tick, op, p } = callData;
    if (op !== InscriptionOpType.Deploy) {
      await this.transfersModel.update(
        {
          opStatus: TransferOpStatus.INVALID_OP,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      return this.errorBreakResult(
        `handleDeployTransfer fail ${transfer.hash} Incorrect InscriptionOpType: ${callData.op}, must be ${InscriptionOpType.Deploy}`,
      );
    }
    const makers = await this.envConfigService.getAsync('MAKERS');
    if (!makers.map((e) => e.toLocaleLowerCase()).includes(transfer.receiver)) {
      await this.transfersModel.update(
        {
          opStatus: TransferOpStatus.INVALID_DEPLOY_MAKER,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      return this.errorBreakResult(
        `handleDeployTransfer fail ${
          transfer.hash
        } Incorrect params : ${JSON.stringify(callData)}`,
      );
    }
    const createData: IDeployRecord = {
      blockNumber: +transfer.blockNumber,
      hash: transfer.hash,
      chainId: transfer.chainId,
      timestamp: transfer.timestamp,
      callData: transfer.calldata,
      protocol: p,
      currentMintedAmount: '0',
      currentMintedTx: '0',
      tick: tick,
      max: max,
      limit: lim,
      from: transfer.sender,
      to: transfer.receiver,
      value: transfer.value,
    };
    const deployRecord = await this.deployRecordModel.findOne({
      where: { tick: tick, protocol: p },
    });
    if (deployRecord) {
      return this.errorBreakResult(
        `handleDeployTransfer fail ${
          transfer.hash
        } already deploy : ${JSON.stringify(callData)}`,
      );
    }
    const t = await this.sequelize.transaction();
    try {
      const result = await this.deployRecordModel.create(createData, {
        transaction: t,
      });
      const updateR = await this.transfersModel.update(
        { opStatus: TransferOpStatus.MATCHED },
        {
          where: {
            hash: transfer.hash,
            chainId: transfer.chainId,
          },
          transaction: t,
        },
      );
      await t.commit();
      return { errno: 0, data: result };
    } catch (error) {
      this.logger.error(`handleDeployTransfer ${transfer.hash} error`, error);
      await t.rollback();
      throw error;
    }
  }

  public async incUserBalance(
    params: { address: string; chainId: string; value: string, createdAt?: string, updatedAt?: string},
    t: Transaction,
  ) {
    const { address, chainId, value } = params
    let { updatedAt, createdAt } = params;
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss.sss')
    if (!updatedAt) {
      updatedAt = now
    }
    if (!createdAt) {
      createdAt = now
    }
    const config = await this.envConfigService.getAsync('DATABASE_URL')
    let schema = 'public'
    if (config.schema) {
      schema = config.schema
    }
    const sql = `
    INSERT INTO "${schema}"."user_balance" ( "address", "chainId", "balance", "createdAt", "updatedAt" )
    VALUES
      ( '${address}','${chainId}',${value},'${createdAt}','${updatedAt}' ) ON CONFLICT ( "address", "chainId" ) DO
    UPDATE
      SET "balance" = EXCLUDED."balance" + "user_balance"."balance",
      "updatedAt" = EXCLUDED."updatedAt"
      RETURNING "id",
      "address",
      "chainId",
      "balance",
      "createdAt",
      "updatedAt";
    `
    const result = await this.userBalanceModel.sequelize.query(sql, { transaction: t })
    return result;
  }
  public async handleCrossTransfer(transfer: TransfersModel) {
    const { calldata } = transfer;
    if (transfer.status != 2) {
      return this.errorBreakResult(
        `handleCrossTransfer fail ${transfer.hash} Incorrect status ${transfer.status}`,
      );
    }
  }
  public async handleCrossOverTransfer(transfer: TransfersModel) {
    const { calldata } = transfer;
  }
  public async handleTransferTransfer(transfer: TransfersModel) {
    const { calldata } = transfer;
  }
}

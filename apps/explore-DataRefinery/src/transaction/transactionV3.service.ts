import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { equals } from '@orbiter-finance/utils';
import { Mutex } from "async-mutex";
import {
  BridgeTransactionAttributes,
  BridgeTransaction as BridgeTransactionModel,
  Transfers as TransfersModel,
  TransfersAttributes,
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
import { Op, where, fn, literal, Transaction, Filterable, WhereOptions } from 'sequelize';
import { Cron } from '@nestjs/schedule';
import { InscriptionMemoryMatchingService } from './inscription-memory-matching.service';
import { InscriptionCrossMemoryMatchingService } from './inscription-cross-memory-matching.service';
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
  isEvmAddress,
} from '../utils';
import { MessageService } from '@orbiter-finance/rabbit-mq';
import { parseTragetTxSecurityCode } from './bridgeTransaction.builder';
import BigNumber from 'bignumber.js';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';
import { MakerService } from '../maker/maker.service'
export interface handleTransferReturn {
  errno: number;
  errmsg?: string;
  data?: any;
}
@Injectable()
export class TransactionV3Service {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  private readonly mutexMap: { [key in string]: Mutex } = {}
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
    protected inscriptionCrossMemoryMatchingService: InscriptionCrossMemoryMatchingService,
    private sequelize: Sequelize,
    protected envConfigService: ENVConfigService,
    protected makerV1RuleService: MakerV1RuleService,
    protected inscriptionBuilder: InscriptionBuilder,
    private messageService: MessageService,
    private makerService: MakerService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    if (this.envConfigService.get('START_VERSION') && this.envConfigService.get('START_VERSION').includes('3-0')) {
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
      this.bookKeeping()
    }
  }
  errorBreakResult(errmsg: string, errno: number = 1): handleTransferReturn {
    this.logger.error(errmsg);
    return {
      errno: errno,
      errmsg: errmsg,
    };
  }

  @Cron('0 */1 * * * *')
  async matchScheduleTask() {
    this.logger.info('v3 matchScheduleTask start');
    const transfers = await this.transfersModel.findAll({
      raw: true,
      order: [['id', 'desc']],
      limit: 1000,
      where: {
        status: 2,
        opStatus: 0,
        version: '3-0',
        timestamp: {
          [Op.gte]: dayjs().subtract(24 * 30, 'hour').toISOString(),
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

  async matchALlVersion3_0() {
    this.logger.info('matchALlVersion3_0 start');
    let done = false
    const limit = 500
    do {
      const transfers = await this.transfersModel.findAll({
        raw: true,
        order: [['id', 'desc']],
        limit: limit,
        where: {
          status: 2,
          opStatus: 0,
          version: '3-0',
          timestamp: {
            [Op.gte]: dayjs().subtract(48, 'hour').toISOString(),
            [Op.lte]: dayjs().subtract(1, 'hour').toISOString(),
          },
          // nonce: {
          //   [Op.lt]: 9000
          // }
        },
      });
      this.logger.info(`matchALlVersion3_0 transfers.length: ${transfers.length}, ${transfers[0] ? transfers[0].id : 'null'}`);
      for (const transfer of transfers) {
        const result = await this.handleClaimTransfer(transfer).catch((error) => {
          this.logger.error(
            `TransactionV3Service matchALlVersion3_0 handleTransferBySourceTx ${transfer.hash} error`,
            error,
          );
        });
      }
      if (transfers.length < limit) {
        done = true
      }
    } while (!done)
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
  @Cron('0 */1 * * * *')
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
        `handleDeployTransfer fail ${transfer.hash
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
          `ValidClaimTransfer update transferId: ${transfer.id
          } result: ${JSON.stringify(r)}`,
        );
      } else {
        console.error(error);
        this.logger.error(`ValidClaimTransferError throw`, error);
        throw error;
      }
    }
    if (createdData.targetAddress.length >= 100) {
      return this.errorBreakResult(
        `${transfer.hash} There is an issue with the transaction format`,
      );
    }
    const t = await this.sequelize.transaction();
    try {
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
          value: createdData.targetAmount,
          protocol: p,
          tick: tick,
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
        `handleMintTransfer fail ${transfer.hash
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
        `handleMintTransfer fail ${transfer.hash
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
        `handleDeployTransfer fail ${transfer.hash
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
    const isInscriptionMaker = await this.makerService.isInscriptionMakers(transfer.receiver)
    if (!isInscriptionMaker) {
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
        `handleDeployTransfer fail ${transfer.hash
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
        `handleDeployTransfer fail ${transfer.hash
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
    params: { address: string; chainId: string; protocol: string; tick: string; value: string, createdAt?: string, updatedAt?: string },
    t: Transaction,
  ) {
    const { address, chainId, value, protocol, tick } = params
    let { updatedAt, createdAt } = params;
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss.sss');
    if (!updatedAt) {
      updatedAt = now;
    }
    if (!createdAt) {
      createdAt = now;
    }
    const config = await this.envConfigService.getAsync('DATABASE_URL');
    let schema = 'public';
    if (config.schema) {
      schema = config.schema;
    }
    const sql = `
    INSERT INTO "${schema}"."user_balance" ( "address", "chainId", "protocol", "tick", "balance", "createdAt", "updatedAt" )
    VALUES
      ( '${address}','${chainId}','${protocol}','${tick}',${value},'${createdAt}','${updatedAt}' ) ON CONFLICT ( "address", "chainId", "protocol", "tick" ) DO
    UPDATE
      SET "balance" = EXCLUDED."balance" + "user_balance"."balance",
      "updatedAt" = EXCLUDED."updatedAt"
      RETURNING "id",
      "address",
      "chainId",
      "protocol",
      "tick",
      "balance",
      "createdAt",
      "updatedAt";
    `;
    const result = await this.userBalanceModel.sequelize.query(sql, {
      transaction: t,
    });
    return result;
  }
  public async handleCrossTransfer(transfer: TransfersModel) {
    const { calldata } = transfer;
    if (transfer.status != 2) {
      return this.errorBreakResult(
        `handleCrossTransfer fail ${transfer.hash} Incorrect status ${transfer.status}`,
      );
    }
    if (transfer.version != '3-3') {
      return this.errorBreakResult(
        `handleCrossTransfer fail ${transfer.hash} Incorrect version ${transfer.version}`,
      );
    }
    const callData = transfer.calldata as any;
    if (
      !callData ||
      !callData.op ||
      !callData.p ||
      !callData.tick ||
      !callData.amt ||
      !/^[1-9]\d*(\.\d+)?$/.test(callData.amt) ||
      callData.op != InscriptionOpType.Cross ||
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
        `handleCrossTransfer fail ${transfer.hash
        } Incorrect params : ${JSON.stringify(callData)}`,
      );
    }
    const { tick, p } = callData;
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
        `handleCrossTransfer fail ${transfer.hash} deployTick not found`,
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
      createdData = await this.inscriptionBuilder.buildCross(transfer, deployTick);
    } catch (error) {
      if (error instanceof ValidSourceTxError) {
        this.logger.error(
          `ValidCrossTransferError hash: ${transfer.hash}, chainId:${transfer.chainId} => ${error.message}`,
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
          `ValidCrossTransfer update transferId: ${transfer.id
          } result: ${JSON.stringify(r)}`,
        );
      } else {
        console.error(error);
        this.logger.error(`ValidCrossTransferError throw`, error);
        throw error;
      }
    }
    const t = await this.sequelize.transaction();
    try {
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
            `${transfer.hash} Create Inscription Cross Bridge Transaction Fail`,
          );
        }
        createdData = createRow.toJSON();
        await this.incUserBalance(
          {
            address: createdData.sourceAddress,
            chainId: createdData.sourceChain,
            protocol: p,
            tick: tick,
            value: `-${createdData.targetAmount}`,
          },
          t,
        );
        // this.logger.info(`Create bridgeTransaction ${createdData.sourceId}`);
        this.inscriptionCrossMemoryMatchingService
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
      this.logger.error(`handleCrossTransfer ${transfer.hash} error`, error);
      t && (await t.rollback());
      throw error;
    }
  }
  public async handleCrossOverTransfer(transfer: TransfersModel) {
    if (transfer.version != '3-4') {
      return this.errorBreakResult(
        `handleCrossOverTransfer fail ${transfer.hash} Incorrect version ${transfer.version}`,
      );
    }
    const callData = transfer.calldata as any;
    if (
      !callData ||
      !callData.op ||
      !callData.p ||
      !callData.tick ||
      !callData.amt ||
      !/^[1-9]\d*(\.\d+)?$/.test(callData.amt) ||
      !callData.fc ||
      callData.op !== InscriptionOpType.CrossOver
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
        `handleCrossOverTransfer fail ${transfer.hash
        } Incorrect params : ${JSON.stringify(callData)}`,
      );
    }
    const { tick, amt, fc, p } = callData;
    const deployRecord = await this.deployRecordModel.findOne({
      raw: true,
      where: {
        to: transfer.sender,
        protocol: p,
        tick: tick
      }
    })
    if (!deployRecord) {
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
        `handleTransferTransfer fail ${transfer.hash} deployTick nof found`,
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
        `handleCrossOverTransfer fail ${transfer.hash
        } Incorrect from chain : ${JSON.stringify(callData)}`,
      );
    }
    let t1;
    try {
      const memoryBT =
        await this.inscriptionCrossMemoryMatchingService.matchV3GetBridgeTransactions(
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
        await this.incUserBalance({
          address: memoryBT.targetAddress,
          chainId: memoryBT.targetChain,
          value: memoryBT.targetAmount,
          tick: tick,
          protocol: p
        }, t1)
        await t1.commit();
        this.inscriptionCrossMemoryMatchingService.removeTransferMatchCache(
          memoryBT.sourceId,
        );
        this.inscriptionCrossMemoryMatchingService.removeTransferMatchCache(
          transfer.hash,
        );
        this.logger.info(
          `match inscription cross success from cache ${memoryBT.sourceId}  /  ${transfer.hash}`,
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
          `handleCrossOverTransfer ${transfer.hash} ${error.message}`,
        );
      } else {
        this.logger.error(
          `handleCrossOverTransfer matchV3GetBridgeTransactions match error ${transfer.hash} `,
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
          version: '3-3',
          responseMaker: {
            [Op.contains]: [transfer.sender],
          },
        };
        btTx = await this.bridgeTransactionModel.findOne({
          // attributes: ['id', 'sourceId', 'targetAddress', 'targetChain'],
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
        await this.incUserBalance({
          address: btTx.targetAddress,
          chainId: btTx.targetChain,
          protocol: p,
          tick: tick,
          value: btTx.targetAmount,
        }, t2)
        this.inscriptionCrossMemoryMatchingService.removeTransferMatchCache(
          btTx.sourceId,
        );
        this.inscriptionCrossMemoryMatchingService.removeTransferMatchCache(
          btTx.targetId,
        );
        this.logger.info(
          `match inscription cross success from db ${btTx.sourceId}  /  ${btTx.targetId}`,
        );
        result.errno = 0;
        result.errmsg = 'success';
      } else {
        this.inscriptionCrossMemoryMatchingService
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
  public async handleTransferTransfer(transfer: TransfersModel) {
    const calldata = transfer.calldata as any;
    if (transfer.status != 2) {
      return this.errorBreakResult(
        `handleTransferTransfer fail ${transfer.hash} Incorrect status ${transfer.status}`,
      );
    }
    if (transfer.version != '3-5') {
      return this.errorBreakResult(
        `handleTransferTransfer fail ${transfer.hash} Incorrect version ${transfer.version}`,
      );
    }
    if (
      !calldata ||
      !calldata.op ||
      !calldata.tick ||
      !calldata.p ||
      !calldata.amt ||
      !calldata.to ||
      !isEvmAddress(calldata.to) ||
      calldata.op != InscriptionOpType.Transfer
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
        `handleTransferTransfer fail ${transfer.hash
        } Incorrect params : ${JSON.stringify(calldata)}`,
      );
    }
    const { p, tick, to } = calldata
    const targetTransferAddress = to.toLowerCase()
    const deployRecord = await this.deployRecordModel.findOne({
      raw: true,
      where: {
        to: transfer.receiver,
        protocol: p,
        tick: tick
      }
    })
    if (!deployRecord) {
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
        `handleTransferTransfer fail ${transfer.hash} deployTick nof found`,
      );
    }
    const sourceUserBalance = await this.userBalanceModel.findOne({
      where: {
        address: transfer.sender,
        chainId: transfer.chainId,
        protocol: p,
        tick: tick,
      },
    });
    const transferAmount = new BigNumber(calldata.amt);
    if (
      !sourceUserBalance ||
      new BigNumber(sourceUserBalance.balance).isLessThan(
        transferAmount,
      )
    ) {
      await this.transfersModel.update(
        {
          opStatus: TransferOpStatus.NOT_SUFFICIENT_FUNDS,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      return this.errorBreakResult(
        `handleTransferTransfer fail ${transfer.hash
        } NOT_SUFFICIENT_FUNDS : ${JSON.stringify(calldata)}`,
      );
    }
    const t = await this.userBalanceModel.sequelize.transaction();
    try {
      const incR = await Promise.all([
        this.incUserBalance(
          {
            address: transfer.sender,
            chainId: transfer.chainId,
            protocol: p,
            tick: tick,
            value: `-${transferAmount.toString()}`,
          },
          t,
        ),
        this.incUserBalance(
          {
            address: targetTransferAddress,
            chainId: transfer.chainId,
            protocol: p,
            tick: tick,
            value: transferAmount.toString(),
          },
          t,
        ),
      ]);
      await this.transfersModel.update(
        {
          opStatus: TransferOpStatus.MATCHED,
        },
        {
          where: {
            id: transfer.id,
          },
          transaction: t,
        },
      );
      await t.commit()
    } catch (error) {
      await t.rollback();
    }
  }
  @Cron('0 */1 * * * *')
  public async bookKeeping() {
    const inscriptionChains = await this.envConfigService.getAsync('INSCRIPTION_SUPPORT_CHAINS') as [string]
    if (!inscriptionChains) {
      return console.warn('not config inscriptionChains');
    }
    for (const chainId of inscriptionChains) {
      if (!this.mutexMap[chainId]) {
        this.mutexMap[chainId] = new Mutex()
      }
      const mutex = this.mutexMap[chainId]
      if (mutex.isLocked()) {
        return
      }
      mutex.runExclusive(async () => {
        await this.bookKeepingByChain(chainId)
      })
    }
  }
  public async bookKeepingByChain(chainId: string) {
    if (!chainId) {
      throw new Error('chainId must not be null')
    }
    const endTime = dayjs().add(-1, 'minute').format('YYYY-MM-DD HH:mm:ss');
    const where: WhereOptions<TransfersAttributes> = {
      timestamp: { [Op.lte]: endTime },
      version: ['3-3', '3-4', '3-5'],
      opStatus: [0],
      chainId: chainId,
    }
    const allTransfers = await this.transfersModel.findAll({
      raw: true,
      where: where,
      limit: 1000,
      order: [['timestamp', 'asc'], ['blockNumber', 'asc'], ['transactionIndex', 'asc']]
    })
    for (const transfer of allTransfers) {
      if (transfer.version === '3-3') {
        const result = await this.handleCrossTransfer(transfer)
        if (result && result.errno === 0) {
          this.messageService.sendClaimTransferToMakerClient(result.data)
        }
      } else if (transfer.version === '3-4') {
        await this.handleCrossOverTransfer(transfer)
      } else if (transfer.version === '3-5') {
        await this.handleTransferTransfer(transfer)
      }
    }
  }
}

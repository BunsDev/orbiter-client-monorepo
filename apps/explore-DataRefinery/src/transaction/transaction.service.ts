import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { BigIntToString, equals } from '@orbiter-finance/utils';
import { TransferAmountTransaction } from 'apps/explore-DataCrawler/src/transaction/transaction.interface';
import { Transfers as TransfersModel, TransferOpStatus, InscriptionOpType, RefundRecord as RefundRecordModel } from '@orbiter-finance/seq-models';
import { InjectModel } from '@nestjs/sequelize';
import { MessageService, ConsumerService } from '@orbiter-finance/rabbit-mq';
import { TransactionV1Service } from './transactionV1.service';
import { TransactionV2Service } from './transactionV2.service';
import { TransactionV3Service } from './transactionV3.service';
import { MakerService } from '../maker/maker.service'
import { OrbiterLogger } from '@orbiter-finance/utils';
import { LoggerDecorator } from '@orbiter-finance/utils';
import { ENVConfigService, MakerV1RuleService } from '@orbiter-finance/config';
import { Op } from 'sequelize';
import { Interval } from '@nestjs/schedule';
@Injectable()
export class TransactionService {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    @InjectModel(TransfersModel)
    private transfersModel: typeof TransfersModel,
    @InjectModel(RefundRecordModel)
    private refundRecordModel: typeof RefundRecordModel,
    private messageService: MessageService,
    private consumerService: ConsumerService,
    private transactionV1Service: TransactionV1Service,
    private transactionV2Service: TransactionV2Service,
    private transactionV3Service: TransactionV3Service,
    private makerService: MakerService,
    private envConfig: ENVConfigService,
    private makerV1RuleService: MakerV1RuleService
  ) {
    const ruleConfigs = this.makerV1RuleService.configs || [];
    if (!ruleConfigs || ruleConfigs.length <= 0 && (this.envConfig.get('START_VERSION').includes('1-0') || this.envConfig.get('START_VERSION').includes('2-0'))) {
      throw new Error('Load ruleConfigs fail');
    }
    if (!this.envConfig.get('RABBITMQ_URL')) {
      throw new Error('Get RABBITMQ_URL Config fail');
    }
    if (!this.envConfig.get('LOCAL_DEBUG_PROD')) {
      this.consumerService.consumeScanTransferReceiptMessages(this.batchInsertTransactionReceipt.bind(this))
      this.consumerService.consumeScanTransferSaveDBAfterMessages(this.executeMatch.bind(this))
      this.matchRefundRecord()
    }
  }
  public async execCreateTransactionReceipt(
    transfers: TransferAmountTransaction[],
  ) {
    if (transfers.length > 0) {
      await this.messageService.sendTransactionReceiptMessage(transfers);
    }
    return transfers;
  }

  public async batchInsertTransactionReceipt(
    transfers: TransferAmountTransaction[],
  ) {
    if (transfers) {
      // this.logger.info(`batchInsertTransactionReceipt: ${transfers.map(item => item.hash).join(', ')}`);
      for (const transfer of transfers) {
        // this.logger.debug(`handleScanBlockResult ${transfer.blockNumber}-${transfer.hash}, receipt:${JSON.stringify(transfer.receipt)}`)
        // this.logger.debug(
        //   `handleScanBlockResult ${transfer.blockNumber}-${transfer.hash}`,
        // );
        const sender = (transfer.sender || '').toLocaleLowerCase();
        const receiver = (transfer.receiver || '').toLocaleLowerCase();
        const tokenAddr = (transfer.token || '').toLocaleLowerCase();
        const contractAddr = (transfer.contract || '').toLocaleLowerCase();
        const calldata = BigIntToString(transfer.calldata);
        const txTime = dayjs(transfer.timestamp).toDate(); // TODO: time
        // valid v1 or v2

        const upsertData: Partial<TransfersModel> = {
          hash: transfer.hash,
          chainId: transfer.chainId,
          blockNumber: transfer.blockNumber.toString(),
          sender,
          receiver,
          amount: transfer.amount,
          value: transfer.value,
          token: tokenAddr,
          symbol: transfer.symbol,
          fee: transfer.fee,
          feeAmount: transfer.feeAmount,
          nonce: String(transfer.nonce),
          calldata: calldata,
          status: transfer.status,
          timestamp: txTime,
          contract: contractAddr || null,
          selector: transfer.selector,
          signature: transfer.signature,
          version: "",
          feeToken: transfer.feeToken,
          transactionIndex: String(transfer.transactionIndex),
          syncStatus: 0,
          crossChainParams: transfer.crossChainParams,
          label: transfer.label
        }
        let versionStr = null;
        const ignoreAddress = this.envConfig.get("IgnoreAddress", '').toLocaleLowerCase().split(',');
        if (ignoreAddress.includes(transfer.sender) && ignoreAddress.includes(transfer.receiver)) {
          upsertData.opStatus = TransferOpStatus.BALANCED_LIQUIDITY;
        } else if ((await this.makerService.isInscriptionMakers(transfer.sender)) || await this.makerService.isInscriptionMakers(transfer.receiver)) {
          // upsertData.opStatus = TransferOpStatus.INIT_STATUS;
          const calldata = upsertData.calldata as any;
          if (await this.makerService.isInscriptionMakers(transfer.receiver)) {
            versionStr = '3-0'; // All tx transfers to maker are 3-0 by default
            if (calldata && calldata.op && calldata.op === InscriptionOpType.Deploy) {
              versionStr = '3-2';
            } else if ((calldata && calldata.op && calldata.op === InscriptionOpType.Claim)) {
              versionStr = '3-0';
            } else if ((calldata && calldata.op && calldata.op === InscriptionOpType.Cross)) {
              upsertData.crossChainParams = { targetRecipient: calldata.to ? calldata.to.toLowerCase() : transfer.sender }
              versionStr = '3-3';
            } else if ((calldata && calldata.op && calldata.op === InscriptionOpType.Transfer)) {
              upsertData.crossChainParams = { targetRecipient: calldata.to ? calldata.to.toLowerCase() : '' }
              versionStr = '3-5';
            }
          } else if (await this.makerService.isInscriptionMakers(transfer.sender)) {
            versionStr = '3-1' // All maker transfers out of tx are 3-1 by default
            if (calldata && calldata.op && calldata.op === InscriptionOpType.Mint) {
              versionStr = '3-1';
            } if (calldata && calldata.op && calldata.op === InscriptionOpType.CrossOver) {
              versionStr = '3-4';
            }
          }
        } else {
          if (await this.makerService.isV1WhiteWalletAddress(transfer.receiver) && await this.makerService.isV1WhiteWalletAddress(transfer.sender)) {
            upsertData.opStatus = TransferOpStatus.BALANCED_LIQUIDITY;
          } else if (await this.makerService.isV2WhiteWalletAddress(transfer.receiver) && await this.makerService.isV2WhiteWalletAddress(transfer.sender)) {
            upsertData.opStatus = TransferOpStatus.BALANCED_LIQUIDITY;
          } else if (await this.makerService.isV1WhiteWalletAddress(transfer.receiver)) {
            versionStr = '1-0';
          } else if (await this.makerService.isV2WhiteWalletAddress(transfer.receiver)) {
            versionStr = '2-0';
          } else {
            // maker out
            if (await this.makerService.isV2WhiteWalletAddress(transfer.sender)) {
              versionStr = '2-1';
            } else if (await this.makerService.isV1WhiteWalletAddress(transfer.sender)) {
              versionStr = '1-1';
            }
          }
          if (!transfer.version && transfer.sender === transfer.receiver) {
            upsertData.opStatus = TransferOpStatus.VALID;
          }
        }
        upsertData.version = versionStr;
        await this.transfersModel
          .upsert(
            upsertData,
            {
              conflictFields: ['chainId', 'hash'],
            },
          )
          .then(([instance, _created]) => {
            transfer['id'] = instance.id;
            this.messageService.sendTransferMatchMessage(instance.toJSON());
          })
          .catch((error) => {
            this.logger.error(
              `insert data error ${transfer.hash}`,
              error,
            );
            throw error;
          });
      }
    }
    return transfers;
  }
  public async executeMatch(payload: TransfersModel) {
    if (payload.status != 2) {
      {
        return {
          errmsg: `Transaction status is incorrect ${payload.status}/2`
        }
      }
    }
    try {
      let result;
      if (payload.version === '1-0') {
        result = await this.transactionV1Service.handleTransferBySourceTx(payload);
      } else if (payload.version === '1-1') {
        result = await this.transactionV1Service.handleTransferByDestTx(payload);
        if (+this.envConfig.get("enablePointsSystem") == 1 && result.errno === 0) {
          this.messageService.sendMessageToPointsSystem(result.data)
        }
        if (+this.envConfig.get("enablePointsSystemGray") == 1 && result.errno === 0) {
          this.messageService.sendMessageToPointsSystemGray(result.data)
        }
      } else if (payload.version === '2-0') {
        result =
          await this.transactionV2Service.handleTransferBySourceTx(payload);
      } else if (payload.version === '2-1') {
        result = await this.transactionV1Service.handleTransferByDestTx(payload);
        if (+this.envConfig.get("enablePointsSystem") == 1 && result.errno === 0) {
          this.messageService.sendMessageToPointsSystem(result.data)
        }
        if (+this.envConfig.get("enablePointsSystemGray") == 1 && result.errno === 0) {
          this.messageService.sendMessageToPointsSystemGray(result.data)
        }
      } else if (payload.version === '3-0') {
        result = await this.transactionV3Service.handleClaimTransfer(payload)
        if (result && result.errno === 0) {
          this.messageService.sendClaimTransferToMakerClient(result.data)
        }
      } else if (payload.version === '3-1') {
        result = this.transactionV3Service.handleMintTransfer(payload);
      } else if (payload.version === '3-2') {
        result = this.transactionV3Service.handleDeployTransfer(payload);
      } else if (['3-3', '3-4', '3-5'].includes(payload.version)) {
        // nothing to do
        result = { errno: 0 }
      } else {
        this.logger.error(`${payload.hash} incorrect version ${payload.version}`);
      }
      // send to maker client when side is 0
      if (result) {
        if (result.errno != 0) {
          this.logger.info(`${payload.hash} ${payload.version} executeMatch result: errno ${result.errno}, errmsg: ${result.errmsg}`);
        }
      } else {
        this.logger.error(`${payload.hash} ${payload.version} executeMatch result: No result returned`);
      }
      if (result && result.errno == 0 && ['1-0', '2-0', '3-0'].includes(payload.version)) {
        const RECEIVER_MATCH_QUEUE = this.envConfig.get('RECEIVER_MATCH_QUEUE');
        const RECEIVER_MATCH_QUEUE_FILTER_CHAIN = this.envConfig.get('RECEIVER_MATCH_QUEUE_FILTER_CHAIN', {});
        const receiver = payload.receiver.toLocaleLowerCase();
        if (!RECEIVER_MATCH_QUEUE_FILTER_CHAIN[receiver] || RECEIVER_MATCH_QUEUE_FILTER_CHAIN[receiver].includes(payload.chainId)) {
          if (RECEIVER_MATCH_QUEUE) {
            for (const addr in RECEIVER_MATCH_QUEUE) {
              if (equals(addr, receiver)) {
                for (const queue of RECEIVER_MATCH_QUEUE[addr]) {
                  this.messageService.sendToMakerClientMessage(result.data, queue)
                }
              }
            }
          }
        }
      }
      return result;
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return {
          errmsg: error.errors
        }
      } else {
        throw error;
      }
    }

  }
  @Interval(1000 * 60 * 5)
  async matchRefundRecord() {
    const transfers = await this.transfersModel.findAll({
      raw: true,
      order: [['id', 'desc']],
      attributes: ['id', 'hash', 'chainId', 'amount', 'version', 'receiver', 'symbol', 'timestamp', 'version'],
      where: {
        version: ['1-1', '2-1'],
        opStatus: 0,
        timestamp: {
          [Op.gte]: dayjs().subtract(1, 'month').toISOString(),
          [Op.lte]: dayjs().subtract(10, 'minute').toISOString(),
        },
        status: 2,
        sender: ['0x646592183ff25a0c44f09896a384004778f831ed', '0x06e18dd81378fd5240704204bccc546f6dfad3d08c4a3a44347bd274659ff328']
      },
      limit: 100
    });
    console.log(`matchRefundRecord:${transfers.length}`)
    for (const transfer of transfers) {
      await this.matchRefundRecordHandle(transfer);
    }
  }
  @Interval(1000 * 60 * 10)
  async matchRefundRecordMakerAddr() {
    const transfers = await this.transfersModel.findAll({
      raw: true,
      order: [['id', 'desc']],
      attributes: ['id', 'hash', 'chainId', 'amount', 'version', 'receiver', 'symbol', 'timestamp', 'version'],
      where: {
        version: ['1-1', '2-1'],
        opStatus: 0,
        timestamp: {
          [Op.gte]: dayjs().subtract(1, 'month').toISOString(),
          [Op.lte]: dayjs().subtract(30, 'minute').toISOString(),
        },
        status: 2,
        // sender: ['0x80c67432656d59144ceff962e8faf8926599bcf8', '0xe4edb277e41dc89ab076a1f049f4a3efa700bce8', '0x41d3d33156ae7c62c094aae2995003ae63f587b3', '']
      },
      limit: 100
    });
    console.log(`matchRefundRecordMakerAddr:${transfers.length}`)
    for (const transfer of transfers) {
      await this.matchRefundRecordHandle(transfer);
    }
  }
  async matchRefundRecordHandle(transfer: TransfersModel) {
    const refundRecord = await this.refundRecordModel.findOne({
      attributes: ['id', 'sourceId'],
      where: {
        targetId: transfer.hash
      }
    })
    if (refundRecord) {
      const t = await this.refundRecordModel.sequelize.transaction();
      try {
        const sourceTx = await this.transfersModel.findOne({
          raw: true,
          attributes: ['id', 'hash', 'amount', 'chainId', 'symbol', 'opStatus', 'timestamp'],
          where: {
            hash: refundRecord.sourceId
          },
          transaction: t
        })
        if (!sourceTx) {
          throw new Error(`matchRefundRecord1 sourceTx not found ${refundRecord.sourceId}`)
        }
        refundRecord.sourceAmount = sourceTx.amount;
        refundRecord.sourceChain = sourceTx.chainId;
        refundRecord.sourceSymbol = sourceTx.symbol;
        refundRecord.sourceMaker = sourceTx.receiver;
        refundRecord.sourceTime = sourceTx.timestamp;
        refundRecord.targetAmount = transfer.amount;
        refundRecord.status = TransferOpStatus.REFUND;
        refundRecord.reason = sourceTx.opStatus.toString();
        refundRecord.targetAmount = transfer.amount;
        await refundRecord.save({
          transaction: t
        })
        const [rows] = await this.transfersModel.update({
          opStatus: TransferOpStatus.REFUND,
          updatedAt: new Date()
        }, {
          where: {
            id: [transfer.id, sourceTx.id],
          }
        });
        if (rows != 2) {
          throw new Error(`matchRefundRecord1 match refund change status rows fail ${rows}/2`)
        }
        t && await t.commit();
      } catch (error) {
        this.logger.error(`matchRefundRecord1 error:${transfer.hash} msg:${error.message}`, error);
        t && await t.rollback();
      }

    }
    if (!refundRecord) {
      const version = transfer.version === '1-1' ? '1-0' : '2-0';
      const where = {
        version: version,
        status: 2,
        opStatus: {
          [Op.in]: [2, 3, 4, 5, 6, 81]
        },
        chainId: transfer.chainId,
        sender: transfer.receiver,
        amount: transfer.amount,
        symbol: transfer.symbol,
        timestamp: {
          // [Op.gte]: dayjs(transfer.timestamp).subtract(1, 'month').toISOString(),
          [Op.lte]: dayjs(transfer.timestamp).add(10, 'minute').toISOString(),
        }
      }
      const sourceTx = await this.transfersModel.findOne({
        raw: true,
        attributes: ['id', 'hash', 'amount', 'chainId', 'symbol', 'opStatus', 'timestamp'],
        where
      })
      if (sourceTx) {
        const refundRecord = await this.refundRecordModel.findOne({
          attributes: ['id'],
          where: {
            [Op.or]: [
              { targetId: transfer.hash },
              { sourceId: sourceTx.hash }
            ]
          }
        });
        if (!refundRecord || !refundRecord.id) {
          const t = await this.refundRecordModel.sequelize.transaction();
          try {
            const createData = await this.refundRecordModel.create({
              targetId: transfer.hash,
              sourceAmount: sourceTx.amount,
              sourceChain: sourceTx.chainId,
              sourceId: sourceTx.hash,
              sourceSymbol: sourceTx.symbol,
              sourceTime: sourceTx.timestamp,
              reason: sourceTx.opStatus.toString(),
              status: TransferOpStatus.REFUND,
              targetAmount: transfer.amount,
              createdAt: new Date(),
            }, {
              transaction: t
            })
            if (!createData) {
              throw new Error('refund record create fail')
            }
            const [rows] = await this.transfersModel.update({
              opStatus: TransferOpStatus.REFUND,
              updatedAt: new Date()
            }, {
              where: {
                id: [transfer.id, sourceTx.id],
              }
            });
            if (rows != 2) {
              throw new Error(`matchRefundRecord2 match refund change status rows fail ${rows}/2`)
            }
            t && await t.commit();
          } catch (error) {
            console.error(error);
            this.logger.error(`matchRefundRecord2 error:${transfer.hash} msg:${error.message}`, error);
            t && await t.rollback();
          }
        } else {
          if (refundRecord.targetId && refundRecord.status == TransferOpStatus.REFUND) {
            throw new Error(`${transfer.hash} / ${sourceTx.hash} A matching record already exists`)
          }
          const t = await this.refundRecordModel.sequelize.transaction();
          try {
            const createData = await this.refundRecordModel.update({
              targetId: transfer.hash,
              sourceAmount: sourceTx.amount,
              sourceChain: sourceTx.chainId,
              sourceId: sourceTx.hash,
              sourceSymbol: sourceTx.symbol,
              sourceTime: sourceTx.timestamp,
              reason: sourceTx.opStatus.toString(),
              status: TransferOpStatus.REFUND,
              targetAmount: transfer.amount,
              createdAt: new Date(),
            }, {
              where: {
                sourceId: sourceTx.hash
              },
              transaction: t

            });
            if (!createData) {
              throw new Error('refund record create fail')
            }
            const [rows] = await this.transfersModel.update({
              opStatus: TransferOpStatus.REFUND,
              updatedAt: new Date()
            }, {
              where: {
                id: [transfer.id, sourceTx.id],
              }
            });
            if (rows != 2) {
              throw new Error(`matchRefundRecord2 match refund change status rows fail ${rows}/2`)
            }
            t && await t.commit();
          } catch (error) {
            console.error(error);
            this.logger.error(`matchRefundRecord2 error:${transfer.hash} msg:${error.message}`, error);
            t && await t.rollback();
          }
        }
      }
    }
  }
}

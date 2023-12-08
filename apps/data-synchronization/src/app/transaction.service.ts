import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { BigIntToString } from '@orbiter-finance/utils';
import { TransferAmountTransaction } from 'apps/explore-DataCrawler/src/transaction/transaction.interface';
import { Transfers as TransfersModel, BridgeTransaction as BridgeTransactionModel, TransfersAttributes, BridgeTransactionAttributes } from '@orbiter-finance/seq-models';
import { MakerTransaction as MakerTransactionModel, MakerTransactionAttributes, Transaction as TransactionModel, ITransaction } from '@orbiter-finance/v1-seq-models'
import { InjectModel, InjectConnection } from '@nestjs/sequelize';
import { MessageService, ConsumerService } from '@orbiter-finance/rabbit-mq';
import { OrbiterLogger } from '@orbiter-finance/utils';
import { Cron, Interval } from '@nestjs/schedule';
import { utils } from 'ethers'
import { LoggerDecorator, TransferId } from '@orbiter-finance/utils';
import { ChainConfigService } from '@orbiter-finance/config'
import { Op } from 'sequelize';
import { Sequelize, UpdatedAt } from 'sequelize-typescript';
import { Mutex } from 'async-mutex'
import BigNumber from 'bignumber.js';
import { getPTextFromTAmount } from './oldUtils'
@Injectable()
export class TransactionService {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  private readonly mutex: Mutex
  constructor(
    @InjectModel(TransfersModel, 'v3')
    private transfersModel: typeof TransfersModel,
    @InjectModel(BridgeTransactionModel, 'v3')
    private bridgeTransactionModel: typeof BridgeTransactionModel,
    @InjectModel(TransactionModel, 'v1')
    private transactionModel: typeof TransactionModel,
    @InjectModel(MakerTransactionModel, 'v1')
    private makerTransactionModel: typeof MakerTransactionModel,
    @InjectConnection('v1')
    private readonly v1Sequelize: Sequelize,
    @InjectConnection('v3')
    private readonly v3Sequelize: Sequelize,
    private messageService: MessageService,
    private consumerService: ConsumerService,
    private chainConfigService: ChainConfigService
  ) {
    this.mutex = new Mutex()
    // this.syncV3ToV1FromDatabase()
    this.readV1NotMatchTx()
    this.consumerService.consumeDataSynchronizationMessages(this.consumeDataSynchronizationMessages.bind(this))
  }
  async syncTransferByHash(hash: string) {
    try {
      const transfer = await this.transfersModel.findOne({
        where: {
          hash
        }
      });
      if (!transfer) {
        throw new Error('transfer not found');
      }
      if (transfer.status != 2) {
        transfer.syncStatus = 9;
        await transfer.save();
        return {
          errno: 0,
          errmsg: 'fail tx'
        }
      }
      if (transfer.version === '1-0' && transfer.opStatus == 0) {
        return {
          errno: 0,
          errmsg: '1-0 opStatus is 0'
        }
      }
      const v1Transfer = await this.transactionModel.findOne({
        raw: true,
        where: {
          hash
        }
      });
      if (!v1Transfer || transfer.syncStatus != 99) {
        const chainInfo = this.chainConfigService.getChainInfo(transfer.chainId);
        const result = getPTextFromTAmount(
          Number(chainInfo.internalId),
          transfer.value.toString()
        )
        const transaction = {
          hash,
          nonce: transfer.nonce,
          blockNumber: transfer.blockNumber,
          transactionIndex: transfer.transactionIndex,
          from: transfer.sender,
          to: transfer.receiver,
          value: transfer.value,
          symbol: transfer.symbol,
          status: 1,
          tokenAddress: transfer.token,
          timestamp: transfer.timestamp,
          fee: transfer.fee,
          feeToken: transfer.feeToken,
          chainId: chainInfo.internalId,
          source: 'sync',
          memo: '',
          side: '',
          transferId: '',
          expectValue: '',
          replyAccount: '',
          replySender: '',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        if (transfer.version == '1-0') {
          const v1BTX = await this.bridgeTransactionModel.findOne({
            where: {
              sourceId: hash
            }
          });
          if (!v1BTX) {
            throw new Error('BT Not Found')
          }
          const targetChain = await this.chainConfigService.getChainInfo(v1BTX.targetChain);
          if (!targetChain) {
            throw new Error('targetChain not found');
          }
          const targetChainToken = await this.chainConfigService.getTokenBySymbol(v1BTX.targetChain, v1BTX.targetSymbol);
          if (!targetChainToken) {
            throw new Error('targetChainToken not found');
          }
          transaction.side = '0';
          transaction.expectValue = new BigNumber(v1BTX.targetAmount).times(10 ** 18).toFixed(0);
          transaction.replyAccount = v1BTX.targetAddress;
          transaction.replySender = v1BTX.targetMaker;
          transaction.memo = String(targetChain.internalId);
          transaction.transferId = transaction.transferId = TransferId(
            String(transaction.memo),
            transaction.replySender,
            String(transaction.replyAccount),
            String(transaction.nonce),
            String(transaction.symbol),
            transaction.expectValue,
          );
        } else if (transfer.version == '1-1') {
          transaction.side = '1';
          transaction.expectValue = null;
          transaction.replyAccount = transfer.receiver;
          transaction.replySender = transfer.sender
          transaction.memo = String(+result.pText)
          transaction.transferId = TransferId(
            String(transaction.chainId),
            String(transaction.replySender),
            String(transaction.replyAccount),
            String(transaction.memo),
            String(transaction.symbol),
            String(transaction.value),
          );
        }
        if ([2, 3, 4, 5, 6].includes(transfer.opStatus)) {
          // ff
          transaction.status = 3;
        }
        if (v1Transfer && v1Transfer.status >= 96) {
          transaction.status = 99;
        }
        if (v1Transfer && v1Transfer.id) {
          await this.transactionModel.update(transaction as any, {
            where: {
              id: v1Transfer.id
            }
          })
        } else {
          await this.transactionModel.create(transaction as any)
        }
        transfer.syncStatus = 9;
        await transfer.save();
        if (transfer.opStatus == 99) {
          this.syncBTTransfer(transfer.hash).then(result => {
            console.log('sync result', result);
          })
        }
      }
    } catch (error) {
      console.error('sync transfer error', error);
    }
  }
  async syncBTTransfer(hash: string) {
    try {
      const v1Transfer = await this.transactionModel.findOne({
        raw: true,
        where: {
          hash
        }
      });
      if (!v1Transfer) {
        await this.syncTransferByHash(hash);
        return {
          errno: 0,
          errmsg: 'v1 transfer not found'
        }
      }
      if (v1Transfer.status == 99) {
        return {
          errno: 0,
          errmsg: 'Exception transfer'
        }
      }
      const v3Transfer = await this.transfersModel.findOne({
        where: {
          hash
        }
      });
      if (!v3Transfer) {
        return {
          errno: 0,
          errmsg: 'V3 transfer not found'
        }
      }
      if (v3Transfer.opStatus != 99) {
        return {
          errno: 0,
          errmsg: 'v3Transfer transfer status not 99'
        }
      }
      if (v3Transfer.opStatus == 99) {
        let where: any = {
          version: '-'
        }
        if (v3Transfer.version === '1-0') {
          where = {
            version: '1-0',
            sourceId: hash,
          }

        } else if (v3Transfer.version === '1-1') {
          where = {
            version: '1-0',
            targetId: hash,
          }

        }
        const bridgeTransaction = await this.bridgeTransactionModel.findOne({
          where,
          raw: true
        });
        if (!bridgeTransaction) {
          throw new Error('btTx not found');
        }
        const sourceTx = await this.transactionModel.findOne({
          attributes: ['id', 'value'],
          where: {
            hash: bridgeTransaction.sourceId
          }
        });
        if (!sourceTx) {
          await this.syncTransferByHash(bridgeTransaction.sourceId);
          // throw new Error(`${bridgeTransaction.sourceId} bridgeTransaction.sourceId not found`);
          return {
            errno: 0,
            errmsg: 're match 1'
          }
        }
        const targetTx = await this.transactionModel.findOne({
          attributes: ['id', 'value'],
          where: {
            hash: bridgeTransaction.targetId
          }
        });
        if (!targetTx) {
          await this.syncTransferByHash(bridgeTransaction.targetId);
          return {
            errno: 0,
            errmsg: 're match 2'
          }
        }
        const sourceChain = this.chainConfigService.getChainInfo(bridgeTransaction.sourceChain);
        if (!sourceChain) {
          throw new Error('sourceChain not found');
        }
        const targetChain = this.chainConfigService.getChainInfo(bridgeTransaction.targetChain);
        if (!targetChain) {
          throw new Error('targetChain not found');
        }
        const mtCreateData: MakerTransactionAttributes = {
          transcationId: bridgeTransaction.transactionId,
          inId: sourceTx.id,
          outId: targetTx.id,
          fromChain: sourceChain.internalId,
          toChain: Number(targetChain.internalId),
          toAmount: targetTx.value,
          replySender: bridgeTransaction.targetMaker,
          replyAccount: bridgeTransaction.targetAddress,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        const v1MtTx = await this.makerTransactionModel.findOne({
          attributes: ['id'],
          where: {
            inId: sourceTx.id
          }
        });
        const t = await this.v1Sequelize.transaction()
        try {
          if (v1MtTx && v1MtTx.id) {
            const [updateTransferRows] = await this.makerTransactionModel.update(mtCreateData, {
              where: {
                id: v1MtTx.id
              },
              transaction: t
            })
            if (updateTransferRows != 1) {
              throw new Error('updateTransferRows row error !=1');
            }
          } else {
            const res = await this.makerTransactionModel.create(mtCreateData, {
              transaction: t,
            });
            if (!res || !res.id) {
              throw new Error('create makerTransactionModel error');
            }
          }
          const [updateTransferRows2] = await this.transactionModel.update({
            status: 99
          }, {
            where: {
              id: [sourceTx.id, targetTx.id],
              status: {
                [Op.not]: 99
              }
            }, transaction: t
          });
          if (updateTransferRows2 != 2) {
            throw new Error('updateTransferRows row error !=2');
          }
          await t.commit();
          return {
            errno: 0,
            errmsg: 'success'
          }
        } catch (error) {
          await t.rollback();
          throw error;
        }
      }
    } catch (error) {
      console.error('syncBTTransfer error', error);
    }
  }

  async consumeDataSynchronizationMessages(data: { type: string; data: TransfersAttributes }) {
    // console.log(data)
    try {
      const transfer = data.data
      this.logger.info(`${transfer.chainId} transfer: ${transfer.hash}, ${transfer.version}`)
      await this.syncTransferByHash(transfer.hash);
    } catch (error) {
      this.logger.error('handleBridgeTransaction error', error)
      this.logger.error('handleBridgeTransaction error transfer data', data.data)
      // throw error
    }
    return
  }
  // async handleTransfer(transfer: TransfersAttributes, bridgeTransaction?: BridgeTransactionAttributes) {
  //   const chain = this.chainConfigService.getChainInfo(transfer.chainId)
  //   if (!chain) {
  //     return
  //   }
  //   const transaction: ITransaction = {
  //     hash: transfer.hash,
  //     nonce: transfer.nonce,
  //     blockHash: null, // no blockHash
  //     blockNumber: Number(transfer.blockNumber),
  //     transactionIndex: Number(transfer.transactionIndex),
  //     from: transfer.sender,
  //     to: transfer.receiver,
  //     value: transfer.value,
  //     symbol: transfer.symbol,
  //     gasPrice: null,
  //     gas: null,
  //     input: '',
  //     status: bridgeTransaction ? 1 : (transfer.version === '1-1' ? 1 : 3), //Change the status of invalid transfer to 3
  //     tokenAddress: transfer.token,
  //     timestamp: transfer.timestamp,
  //     fee: transfer.fee,
  //     feeToken: transfer.feeToken,
  //     chainId: chain.internalId,
  //     source: 'sync',
  //     memo: '0',
  //     side: transfer.version === '1-0' ? 0 : 1,
  //     extra: {},
  //     makerId: null,
  //     lpId: null,
  //     replyAccount: null,
  //     replySender: null,
  //     expectValue: null,
  //     transferId: '',
  //     createdAt: new Date(),
  //     updatedAt: new Date(),
  //   }
  //   if (transfer.chainId === 'SN_MAIN' && transfer.hash.includes("#0")) {
  //     transaction.hash = transfer.hash.replace('#0', '');
  //     console.log('replace hash:', transaction.hash, transfer.hash)
  //   }
  //   if (bridgeTransaction) {
  //     transaction.extra = { toSymbol: bridgeTransaction.targetSymbol }
  //     if (transaction.side === 0) {
  //       transaction.replyAccount = bridgeTransaction.targetAddress
  //       transaction.replySender = bridgeTransaction.targetMaker
  //       const targetToken = this.chainConfigService.getTokenBySymbol(bridgeTransaction.targetChain, bridgeTransaction.targetSymbol)
  //       const targetChain = this.chainConfigService.getChainInfo(bridgeTransaction.targetChain)
  //       const decimals = targetToken ? targetToken.decimals : 18
  //       transaction.expectValue = utils.parseUnits(bridgeTransaction.targetAmount || '0', decimals).toString()
  //       transaction.memo = String(targetChain?.internalId)
  //     } else {
  //       transaction.memo = bridgeTransaction.sourceNonce
  //     }
  //     transaction.replyAccount = bridgeTransaction.targetAddress
  //     transaction.replySender = bridgeTransaction.targetMaker
  //   }

  //   if (transaction.side === 1) {
  //     transaction.replyAccount = transfer.receiver
  //     transaction.replySender = transfer.sender
  //     transaction.transferId = TransferId(
  //       String(transaction.chainId),
  //       String(transaction.replySender),
  //       String(transaction.replyAccount),
  //       String(transaction.memo),
  //       String(transaction.symbol),
  //       String(transaction.value),
  //     );
  //   } else {
  //     transaction.transferId = TransferId(
  //       String(transaction.memo),
  //       transaction.replySender,
  //       String(transaction.replyAccount),
  //       String(transaction.nonce),
  //       String(transaction.symbol),
  //       transaction.expectValue,
  //     );
  //   }

  //   // In order to adapt to the problem that the fee is not exhausted
  //   if (new BigNumber(transaction.fee).decimalPlaces() > 0) {
  //     transaction.fee = new BigNumber(transaction.fee).toFixed(0)
  //   }

  //   const t = await this.transactionModel.findOne({ where: { hash: transaction.hash, chainId: transaction.chainId } })
  //   if (!t) {
  //     await this.transactionModel.upsert(transaction, { conflictFields: ['chainId', 'hash'] })
  //   } else {
  //     const w = { hash: transaction.hash, chainId: transaction.chainId, status: { [Op.ne]: 99 } }
  //     delete transaction.createdAt
  //     await this.transactionModel.update(transaction, { where: w })
  //   }
  //   const syncStatus = bridgeTransaction ? 2 : 1; // If the bridgeTransaction exists, then the transfer is a valid cross-chain transaction
  //   await this.transfersModel.update({ syncStatus }, { where: { hash: transfer.hash, chainId: transfer.chainId, syncStatus: { [Op.ne]: 3 } } })
  // }
  // async handleBridgeTransaction(data: TransfersAttributes) {
  //   let bridgeTransaction: BridgeTransactionAttributes
  //   const transfer = data
  //   if (transfer.version === '1-0') {
  //     bridgeTransaction = await this.bridgeTransactionModel.findOne({ where: { sourceId: transfer.hash } })
  //   } else {
  //     bridgeTransaction = await this.bridgeTransactionModel.findOne({ where: { targetId: transfer.hash } })
  //   }
  //   await this.handleTransfer(transfer, bridgeTransaction)
  //   if (!bridgeTransaction) {
  //     this.logger.info(`bridgeTransaction not found, hash: ${transfer.hash}, version: ${transfer.version}`)
  //     return
  //   }
  //   const transaction = await this.transactionModel.findOne({ where: { hash: transfer.hash } })
  //   let inTransaction: ITransaction
  //   let outTransaction: ITransaction
  //   if (!transaction) {
  //     console.log('transaction not found:', transfer.hash)
  //     return
  //   }
  //   // console.log('----', transaction.hash, bridgeTransaction.sourceId, bridgeTransaction.targetId)
  //   const findWhere = {} as any
  //   if (transaction.side === 0) {
  //     findWhere.inId = transaction.id
  //     inTransaction = transaction
  //     if (bridgeTransaction.targetId) {
  //       outTransaction = await this.transactionModel.findOne({ where: { hash: bridgeTransaction.targetId } })
  //       if (!outTransaction) {
  //         const outTransferV3 = await this.transfersModel.findOne({ where: { hash: bridgeTransaction.targetId, chainId: bridgeTransaction.targetChain } })
  //         if (outTransferV3) {
  //           await this.handleTransfer(outTransferV3, bridgeTransaction)
  //           outTransaction = await this.transactionModel.findOne({ where: { hash: bridgeTransaction.targetId } })
  //         }
  //       }
  //     }
  //   } else {
  //     inTransaction = await this.transactionModel.findOne({ where: { hash: bridgeTransaction.sourceId } })
  //     if (!inTransaction) {
  //       const inTransferV3 = await this.transfersModel.findOne({ where: { hash: bridgeTransaction.sourceId, chainId: bridgeTransaction.sourceChain } })
  //       await this.handleTransfer(inTransferV3, bridgeTransaction)
  //       inTransaction = await this.transactionModel.findOne({ where: { hash: bridgeTransaction.sourceId } })
  //     }
  //     outTransaction = transaction
  //     findWhere.outId = outTransaction.id
  //   }
  //   const mt = await this.makerTransactionModel.findOne({ where: findWhere })
  //   if (mt && mt.inId && mt.outId) {
  //     this.logger.info(`already matched ${transfer.id}: ${mt.transcationId} inId/outId: ${mt.inId}/${mt.outId}`)
  //     this.transfersModel.update(
  //       { syncStatus: 3 },
  //       {
  //         where: {
  //           hash: [bridgeTransaction.sourceId, bridgeTransaction.targetId],
  //           chainId: [bridgeTransaction.sourceChain, bridgeTransaction.targetChain],
  //           syncStatus: { [Op.ne]: 3 }
  //         }
  //       }
  //     ).catch((error) => {
  //       this.logger.error(`update transfersModel syncStatus to 3 error sourceId:${bridgeTransaction.sourceId}, targetId:${bridgeTransaction.targetId}`, error)
  //     });
  //     return mt
  //   }
  //   const t = await this.v1Sequelize.transaction()
  //   try {
  //     let mtResult
  //     if (!mt && transaction.side === 0) {
  //       const mtCreateData: MakerTransactionAttributes = {
  //         transcationId: bridgeTransaction.transactionId,
  //         inId: inTransaction.id,
  //         outId: null,
  //         fromChain: inTransaction.chainId,
  //         toChain: Number(inTransaction.memo),
  //         toAmount: inTransaction.expectValue,
  //         replySender: inTransaction.replySender,
  //         replyAccount: inTransaction.replyAccount,
  //         createdAt: new Date(),
  //         updatedAt: new Date(),
  //       }
  //       if (outTransaction) {
  //         mtCreateData.outId = outTransaction.id
  //       }
  //       mtResult = await this.makerTransactionModel.create(mtCreateData, { transaction: t })
  //       if (outTransaction) {
  //         await this.transactionModel.update({ status: 99 }, {
  //           where: {
  //             id: [inTransaction.id, outTransaction.id]
  //           },
  //           transaction: t
  //         })
  //         this.transfersModel.update(
  //           { syncStatus: 3 },
  //           {
  //             where: {
  //               hash: [bridgeTransaction.sourceId, bridgeTransaction.targetId],
  //               chainId: [bridgeTransaction.sourceChain, bridgeTransaction.targetChain],
  //               syncStatus: { [Op.ne]: 3 }
  //             }
  //           }
  //         ).catch((error) => {
  //           this.logger.error(`update transfersModel syncStatus to 3 error sourceId:${bridgeTransaction.sourceId}, targetId:${bridgeTransaction.targetId}`, error)
  //         });
  //         this.logger.info(`v1 match success(create mt) id: ${inTransaction.id} / ${outTransaction.id}, hash: ${inTransaction.hash} / ${outTransaction.hash} `)
  //       }
  //     } else if (mt) {
  //       const updateData = {
  //         outId: null,
  //         UpdatedAt: new Date(),
  //       } as any
  //       if (transaction.side === 1 && outTransaction) {
  //         updateData.outId = outTransaction.id
  //       } else if (transaction.side === 0 && inTransaction) {
  //         updateData.toAmount = inTransaction.expectValue
  //         updateData.replyAccount = inTransaction.replyAccount
  //         updateData.replySender = inTransaction.replySender
  //         if (bridgeTransaction.targetId) {
  //           outTransaction = await this.transactionModel.findOne({ where: { hash: bridgeTransaction.targetId } })
  //           if (outTransaction) {
  //             updateData.outId = outTransaction.id
  //           }
  //         }
  //       }
  //       mtResult = await this.makerTransactionModel.update(updateData, {
  //         where: {
  //           transcationId: bridgeTransaction.transactionId,
  //           inId: inTransaction.id
  //         },
  //         transaction: t
  //       })
  //       if (updateData.outId) {
  //         await this.transactionModel.update({ status: 99 }, {
  //           where: {
  //             id: [inTransaction.id, outTransaction.id]
  //           },
  //           transaction: t
  //         })
  //         this.transfersModel.update(
  //           { syncStatus: 3 },
  //           {
  //             where: {
  //               hash: [bridgeTransaction.sourceId, bridgeTransaction.targetId],
  //               chainId: [bridgeTransaction.sourceChain, bridgeTransaction.targetChain],
  //               syncStatus: { [Op.ne]: 3 }
  //             }
  //           }
  //         ).catch((error) => {
  //           this.logger.error(`update transfersModel syncStatus to 3 error sourceId:${bridgeTransaction.sourceId}, targetId:${bridgeTransaction.targetId}`, error)
  //         });
  //         this.logger.info(`v1 match success(update mt) id: ${inTransaction.id} / ${outTransaction.id}, hash: ${inTransaction.hash} / ${outTransaction.hash} `)
  //       }
  //     }
  //     await t.commit()
  //     return mtResult
  //   } catch (error) {
  //     t.rollback()
  //     this.logger.error('handleBridgeTransaction error', error)
  //   }
  // }
  @Cron("* */5 * * * *")
  private async syncV3ToV1FromDatabase() {
    if (this.mutex.isLocked()) {
      return
    }
    const limit = 200;
    this.logger.info('syncV3V1FromDatabase start')
    this.mutex.runExclusive(async () => {
      let index = 0;
      const list2 = await this.transfersModel.findAll({
        where: {
          // [Op.or]: [{ syncStatus: [0, 2] }, { syncStatus: 1, opStatus: 99 }],
          // version: ['1-1', '1-0'],
          // status: [2],
          // opStatus: [1, 99],
          syncStatus: {
            [Op.not]: 9
          },
          timestamp: {
            [Op.gte]: dayjs().subtract(60 * 24, 'minutes').toISOString(),
            [Op.lte]: dayjs().subtract(10, 'minutes').toISOString(),
          },
        },
        order: [['id', 'desc']],
        limit: limit
      })
      console.log('LIST TOTAL:', list2.length, new Date());
      for (const row of list2) {
        console.log(`${index} sync = ${row.hash}`);
        index++;
        await this.syncTransferByHash(row.hash).catch(error => {
          this.logger.info(row.toJSON());
          this.logger.error('syncV3V1FromDatabase error', error)
        })
      }
    })
  }
  @Cron("*/30 * * * * *")
  private async readV1NotMatchTx() {
    const rows = await this.makerTransactionModel.findAll({
      attributes: ['inId'],
      raw: true,
      where: {
        outId: null,
        createdAt: {
          [Op.gte]: dayjs().subtract(60 * 2, 'minutes').toISOString(),
          [Op.lte]: dayjs().subtract(1, 'minutes').toISOString(),
        },
      },
      limit: 100
    });
    let index = 0;
    console.log(`ready match ${index}/${rows.length} `);
    for (const row of rows) {
      const tx = await this.transactionModel.findOne({
        raw: true,
        attributes: ['hash', 'status'],
        where: {
          id: row.inId
        }
      });
      if (tx.status != 99) {
        const transfer = await this.transfersModel.findOne({
          where: {
            hash: tx.hash
          }
        })
        if (transfer) {
          await this.syncBTTransfer(transfer.hash).catch(error => {
            this.logger.error('syncV3V1FromDatabase error', error)
          });
        }
        console.log(`match 2 ${index}/${rows.length} hash: ${tx.hash}`);
      }
    }
  }

}

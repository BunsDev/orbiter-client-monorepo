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
    this.consumerService.consumeDataSynchronizationMessages(this.consumeDataSynchronizationMessages.bind(this))
    // TODO: Receive and process mq messages
    // TAG:data-synchronization
  }
  async consumeDataSynchronizationMessages(data: { type: string; data: TransfersAttributes }) {
    // console.log(data)
    try {
      await this.handleBridgeTransaction(data.data)
    } catch (error) {
      this.logger.error('handleBridgeTransaction error', error, data.data)
      console.log('handleBridgeTransaction error', data.data)
      throw error
    }
    return
  }
  async handleTransfer(transfer: TransfersAttributes,  bridgeTransaction?: BridgeTransactionAttributes){
    const chain =  this.chainConfigService.getChainInfo(transfer.chainId)
    if (!chain) {
      return
    }
    const transaction: ITransaction = {
      hash: transfer.hash,
      nonce: transfer.nonce,
      blockHash: null, // 无blocHash
      blockNumber: Number(transfer.blockNumber),
      transactionIndex: Number(transfer.transactionIndex),
      from: transfer.sender,
      to: transfer.receiver,
      value: transfer.value,
      symbol: transfer.symbol,
      gasPrice: null,
      gas: null,
      input: '',
      status: bridgeTransaction ? 1 : (transfer.version === '1-1' ? 1 : 3), //Change the status of invalid transfer to 3
      tokenAddress: transfer.token,
      timestamp: transfer.timestamp,
      fee: transfer.fee,
      feeToken: transfer.feeToken,
      chainId: chain.internalId,
      source: 'rpc',
      memo: '0',
      side: transfer.version === '1-0' ? 0 : 1,
      extra: {},
      makerId: null,
      lpId: null,
      replyAccount: transfer.receiver,
      replySender: transfer.sender,
      expectValue: null,
      transferId: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    if (bridgeTransaction) {

      if (transaction.side === 0) {
        const targetToken = this.chainConfigService.getTokenBySymbol(bridgeTransaction.targetChain, bridgeTransaction.targetSymbol)
        const targetChain = this.chainConfigService.getChainInfo(bridgeTransaction.targetChain)
        transaction.expectValue = utils.parseUnits(bridgeTransaction.targetAmount, targetToken.decimals).toString()
        transaction.memo = String(targetChain?.internalId)
      }
      transaction.replyAccount = bridgeTransaction.targetAddress
      transaction.replySender = bridgeTransaction.targetMaker
    }

    if (transaction.side === 1) {
      transaction.transferId = TransferId(
        String(transaction.chainId),
        String(transaction.replySender),
        String(transaction.replyAccount),
        String(transaction.memo),
        String(transaction.symbol),
        String(transaction.value),
      );
    } else {
      transaction.transferId = TransferId(
        String(transaction.memo),
        transaction.replySender,
        String(transaction.replyAccount),
        String(transaction.nonce),
        String(transaction.symbol),
        transaction.expectValue,
      );
    }
    const t = await this.transactionModel.findOne({ where: { hash: transaction.hash, chainId: transaction.chainId } })
    if (!t) {
      await this.transactionModel.upsert(transaction, { conflictFields: ['chainId', 'hash'] })
    } else {
      const w = { hash: transaction.hash, chainId: transaction.chainId, status: { [Op.ne]: 99 } }
      delete transaction.createdAt
      await this.transactionModel.update(transaction, { where: w })
    }
    await this.transfersModel.update({ syncStatus: 1 }, { where: { hash: transfer.hash, chainId: transfer.chainId } })
  }
  async handleBridgeTransaction(data: TransfersAttributes) {
    let bridgeTransaction: BridgeTransactionAttributes
    const transfer = data
    if (transfer.version === '1-0') {
      bridgeTransaction = await this.bridgeTransactionModel.findOne({ where: { sourceId: transfer.hash } })
    } else {
      bridgeTransaction = await this.bridgeTransactionModel.findOne({ where: { targetId: transfer.hash } })
    }
    await this.handleTransfer(transfer, bridgeTransaction)
    if (!bridgeTransaction) {
      console.log('bridgeTransaction not found sourceId:', transfer.hash)
      return
    }
    const transaction = await this.transactionModel.findOne({ where: { hash: transfer.hash } })
    let inTransaction: ITransaction
    let outTransaction: ITransaction
    if (!transaction) {
      console.log('transaction not found:', transfer.hash)
      return
    }
    const findWhere = {} as any
    if (transaction.side === 0) {
      findWhere.inId = transaction.id
      inTransaction = transaction
    } else {
      inTransaction = await this.transactionModel.findOne({ where: { hash: bridgeTransaction.sourceId } })
      if (!inTransaction) {
        const inTransferV3 = await this.transfersModel.findOne({ where: { hash: bridgeTransaction.sourceId, chainId: bridgeTransaction.sourceChain } })
        await this.handleTransfer(inTransferV3, bridgeTransaction)
        inTransaction = await this.transactionModel.findOne({ where: { hash: bridgeTransaction.sourceId } })
      }
      outTransaction = transaction
      findWhere.inId = inTransaction.id
    }
    const mt = await this.makerTransactionModel.findOne({ where: findWhere })
    if (mt && mt.inId && mt.outId) {
      this.logger.info(`already matched: ${mt.transcationId} `)
      return
    }
    if (!mt && transaction && transaction.side === 0) {
      const mtCreateData: MakerTransactionAttributes = {
        transcationId: bridgeTransaction.transactionId,
        inId: inTransaction.id,
        outId: null,
        fromChain: inTransaction.chainId,
        toChain: Number(inTransaction.memo),
        toAmount: inTransaction.expectValue,
        replySender: inTransaction.replySender,
        replyAccount: inTransaction.replyAccount,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      // delete mtCreateData.createdAt
      // delete mtCreateData.updatedAt
      const mtResult = await this.makerTransactionModel.create(mtCreateData)
      return mtResult
    } else if (mt && transaction.side === 1 && outTransaction) {
      const updateData = {
        outId: outTransaction.id,
        UpdatedAt: new Date(),
      }
      const t = await this.v1Sequelize.transaction()
      const mtResult = await this.makerTransactionModel.update(updateData, {
        where: {
          transcationId: bridgeTransaction.transactionId,
          inId: inTransaction.id
        },
        transaction: t
      })
      await this.transactionModel.update({ status: 99 }, {
        where: {
          id: [inTransaction.id, outTransaction.id]
        },
        transaction: t
      })
      t.commit()
      return mtResult
    }
  }
  @Cron('0 */1 * * * *')
  private async syncV3V1FromDatabase() {
    if (this.mutex.isLocked()) {
      return
    }
    this.mutex.runExclusive(async () => {
      let done = false
      // sync in tx
      const inWhere = {
        syncStatus: 0,
        version: ['1-0'],
        timestamp: {
          [Op.lte]: dayjs().subtract(5, 'minutes').toISOString(),
        },
      } as any;
      const limit = 1000
      let maxId = 0
      do {
        const list = await this.transfersModel.findAll({
          where: inWhere,
          order: [['id', 'asc']],
          limit: limit
        })
        for (const row of list) {
          await this.handleBridgeTransaction(row).catch(error => {
            this.logger.error('syncV3V1FromDatabase error', error)
          })
        }
        if (list.length < limit) {
          done = true
        } else {
          inWhere.id = { [Op.gt]: list[list.length - 1].id }
        }
        maxId = Number(list[list.length - 1]?.id)
      } while(!done)
      console.log('maxId', maxId)
      // sync out tx
      done = false
      const outWhere = {
        syncStatus: 0,
        version: ['1-1'],
        timestamp: {
          [Op.lte]: dayjs().subtract(5, 'minutes').toISOString(),
        },
      } as any;
      if (maxId) {
        outWhere.id = { [Op.lt]: maxId }
      }
      do {
        const list = await this.transfersModel.findAll({
          where: outWhere,
          order: [['id', 'asc']],
          limit: limit
        })
        for (const row of list) {
          await this.handleBridgeTransaction(row).catch(error => {
            this.logger.error('syncV3V1FromDatabase error', error)
          })
        }
        if (list.length < limit) {
          done = true
        } else {
          outWhere.id = { [Op.gt]: list[list.length - 1].id }
          if (maxId) {
            outWhere.id = { [Op.gt]: list[list.length - 1].id, [Op.lt]: maxId }
          }
        }
      } while(!done)
    })
  }
}

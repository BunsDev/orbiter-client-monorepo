import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { BigIntToString } from '@orbiter-finance/utils';
import { TransferAmountTransaction } from 'apps/explore-DataCrawler/src/transaction/transaction.interface';
import {
  Transfers as TransfersModel,
  BridgeTransaction as BridgeTransactionModel,
  TransfersAttributes,
  BridgeTransactionAttributes,
} from '@orbiter-finance/seq-models';
import {
  MakerTransaction as MakerTransactionModel,
  MakerTransactionAttributes,
  Transaction as TransactionModel,
  ITransaction,
} from '@orbiter-finance/v1-seq-models';
import {  MakerTransactionSyncStatus as MakerTransactionSyncStatusModel } from './models/status.model'
import { InjectModel, InjectConnection } from '@nestjs/sequelize';
import { MessageService, ConsumerService } from '@orbiter-finance/rabbit-mq';
import { OrbiterLogger } from '@orbiter-finance/utils';
import { Cron, Interval } from '@nestjs/schedule';
import { utils } from 'ethers';
import { LoggerDecorator, TransferId } from '@orbiter-finance/utils';
import { ChainConfigService } from '@orbiter-finance/config';
import { Op, col, FindOptions, Attributes } from 'sequelize';
import { Sequelize, UpdatedAt } from 'sequelize-typescript';
import { Mutex } from 'async-mutex';
import BigNumber from 'bignumber.js';
import _ from 'lodash';
import { appendFile, writeFile } from 'fs/promises'
import fs from 'fs'
import path from 'path'
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

function createFileWithDirectory(filePath, content) {
  ensureDirectoryExistence(filePath);
  fs.writeFileSync(filePath, content);
}
dayjs.extend(utc);
dayjs.extend(timezone);
@Injectable()
export class TransactionV1ToV3Service {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  private readonly mutex: Mutex;
  constructor(
    @InjectModel(TransfersModel, 'v3')
    private transfersModel: typeof TransfersModel,
    @InjectModel(BridgeTransactionModel, 'v3')
    private bridgeTransactionModel: typeof BridgeTransactionModel,
    @InjectModel(TransactionModel, 'v1')
    private transactionModel: typeof TransactionModel,
    @InjectModel(MakerTransactionModel, 'v1')
    private makerTransactionModel: typeof MakerTransactionModel,
    @InjectModel(MakerTransactionSyncStatusModel, 'v1_sync_status')
    private makerTransactionSyncStatusModel: typeof MakerTransactionSyncStatusModel,
    @InjectConnection('v1')
    private readonly v1Sequelize: Sequelize,
    @InjectConnection('v3')
    private readonly v3Sequelize: Sequelize,
    private messageService: MessageService,
    private consumerService: ConsumerService,
    private chainConfigService: ChainConfigService,
  ) {
    this.mutex = new Mutex();
    this.V1DataToV3Sql()
  }
  async V1DataToV3Sql() {
    const maxId = 20299857;
    // const maxId = 1001;
    const where = {
      id: { [Op.gt]: 0, [Op.lte]: maxId },
      outId: { [Op.not]: null },
    };
    const limit = 5000;
    let done = false;
    const fileName = path.resolve(__dirname, `./sqls/bt.sql`);
    ensureDirectoryExistence(fileName)
    await writeFile(fileName, '');
    this.logger.info(`start V1DataToV3Sql`)
    do {
      const createDataList = []
      const options: FindOptions<Attributes<MakerTransactionModel>> = {
        raw: true,
        where: where,
        limit: limit,
        order: [['id', 'asc']],
      }
      const mtList = await this.makerTransactionModel.findAll(options);
      const inIdList = mtList.map((e) => e.inId);
      const outIdList = mtList.map((e) => e.outId);
      this.logger.info(`---mtList.length ${mtList.length}, ${inIdList.length}, ${outIdList.length}`);
      const transactions = await this.transactionModel.findAll({
        raw: true,
        where: {
          id: [...inIdList, ...outIdList],
        },
      });
      this.logger.info(`----transactions.length ${transactions.length}`)
      const transactionMap = {};
      for (const transaction of transactions) {
        transactionMap[transaction.id] = transaction;
      }
      for (const mt of mtList) {
        try {
          const createData = await this.buildCreateData(mt, transactionMap[mt.inId], transactionMap[mt.outId], true)
          createDataList.push(createData);
          await this.markSyncStatus(mt, 1);
        } catch (error) {
          await this.markSyncStatus(mt, 2);
          this.logger.error(`buildCreateData error, mt.id: ${mt.id}, `, error);
        }
      }
      await this.appendSql(fileName, createDataList);
      if (mtList.length < limit) {
        done = true;
      } else {
        const nextId = mtList[mtList.length - 1].id;
        where.id = { [Op.gt]: nextId, [Op.lte]: maxId };
        this.logger.info(`nextId ${mtList[mtList.length - 1].id}`)
      }
    } while (!done);
    this.logger.info('done')
  }

  async markSyncStatus(mt: MakerTransactionModel, status: number) {
    const id = mt.id;
    await this.makerTransactionSyncStatusModel.upsert({ id, status: status }, { conflictFields: ['id'] });
  }

  async buildCreateData(
    mt: MakerTransactionModel,
    inTransaction: TransactionModel,
    outTransaction: TransactionModel,
    getSql?: boolean,
  ) {
    const { toChain, fromChain } = mt
    const sourceChainInfo = this.chainConfigService.getChainInfo(+fromChain);
    const targetChainInfo = this.chainConfigService.getChainInfo(+toChain);
    const sourceTokenInfo = this.chainConfigService.getTokenBySymbol(sourceChainInfo.chainId, inTransaction.symbol);
    const targetTokenInfo = this.chainConfigService.getTokenBySymbol(targetChainInfo.chainId, outTransaction.symbol);
    const targetFeeTokenInfo = this.chainConfigService.getTokenBySymbol(targetChainInfo.chainId, outTransaction.feeToken)
    try {
      const decimalsPlaces = new BigNumber(outTransaction.fee).decimalPlaces()
      const createData: BridgeTransactionAttributes = {
        transactionId: mt.transcationId,
        sourceId: inTransaction.hash.toLowerCase(),
        targetId: outTransaction.hash.toLowerCase(),
        sourceChain: sourceChainInfo.chainId,
        targetChain: targetChainInfo.chainId,
        sourceAmount: utils.formatUnits(inTransaction.value, sourceTokenInfo.decimals),
        targetAmount: utils.formatUnits(outTransaction.value, targetTokenInfo.decimals),
        sourceMaker:  inTransaction.to.toLowerCase(),
        targetMaker: outTransaction.from.toLowerCase(),
        sourceAddress: inTransaction.from.toLowerCase(),
        targetAddress: outTransaction.to.toLowerCase(),
        sourceSymbol: sourceTokenInfo.symbol,
        targetSymbol: targetTokenInfo.symbol,
        status: 99,
        sourceTime: inTransaction.timestamp,
        targetTime: outTransaction.timestamp,
        targetFee: decimalsPlaces > 0 ? outTransaction.fee : utils.formatUnits(outTransaction.fee, targetFeeTokenInfo.decimals),
        targetFeeSymbol: targetFeeTokenInfo.symbol,
        sourceNonce: inTransaction.nonce,
        targetNonce: outTransaction.nonce,
        ruleId: '',
        dealerAddress: '',
        ebcAddress: '',
        createdAt: mt.createdAt,
        updatedAt: mt.updatedAt,
        sourceToken: sourceTokenInfo.address.toLowerCase(),
        targetToken: targetTokenInfo.address.toLowerCase(),
        version: '1-0',
        responseMaker: [outTransaction.from],
      }
      if (sourceChainInfo.chainId === 'SN_MAIN' && createData.sourceId.includes('#')) {
        createData.sourceId = createData.sourceId.replace(/#\d*$/, '');
      }
      if (targetChainInfo.chainId === 'SN_MAIN' && !createData.targetId.includes('#')) {
        const isMultiTransfer = await this.checkIsMultiTransfer(createData.targetId)
        if (isMultiTransfer) {
          createData.targetId = `${createData.targetId}#0`
        }
      }
      if (!getSql) {
        return createData;
      }
      const instance = this.bridgeTransactionModel.build(createData);
      const dataValues = {...instance.dataValues};
      delete dataValues.id
      const queryGenerator = BridgeTransactionModel.sequelize.getQueryInterface().queryGenerator as any
      const { query, bind: params } = queryGenerator.insertQuery(this.bridgeTransactionModel.getTableName(), dataValues);
      let sql = query;
      params.forEach((value, index) => {
        const placeHolder = `$${index+1}`;
        let insertValue = value;
        if (typeof value === 'string') {
          insertValue = `'${value}'`
        } else if (value instanceof Date) {
          insertValue = `'${value.toISOString()}'`
        } else if (Array.isArray(value)) {
          insertValue = `'{${value[0]}}'`
        }
        sql = sql.replace(placeHolder, insertValue)
      })
      return sql
    } catch (error) {
      console.log('---error', error)
      console.log(inTransaction.value, outTransaction.value, outTransaction.fee, targetFeeTokenInfo, outTransaction.id)
      console.log(new BigNumber(outTransaction.fee).decimalPlaces())
      throw error
    }
  }

  async checkIsMultiTransfer(hash: string) {
    const list = await this.transactionModel.findAll({
      raw: true,
      where: {
        hash: { [Op.like]: `${hash}%` }
      }
    })
    return list.length > 1

  }

  async batchWriteSqlFileByChunk(sqlList: any) {
    const chunkList = _.chunk(sqlList, 50 * 10000)
    for (let i = 0 ; i < chunkList.length; i++) {
      const chunk = chunkList[i]
      const fileName = path.resolve(__dirname, `../../../export/${i + 1}.sql`);
      await writeFile(fileName, '');
      for (const sql of chunk) {
        await appendFile(fileName, `${sql}\n`)
      }
    }
  }

  async appendSql(fileName: string, sqlList: string[]) {
    for (const sql of sqlList) {
      await appendFile(fileName, `${sql}\n`)
    }
  }

  async batchInsertData(createDataList: any, concurrency: number = 100) {
    const chunkList = _.chunk(createDataList, concurrency);
    for (const chunk of chunkList) {
      const promiseTask = []
      for (const createData of chunk) {
        promiseTask.push(this.bridgeTransactionModel.upsert(createData));
      }
      await Promise.all(promiseTask)
    }
  }
}

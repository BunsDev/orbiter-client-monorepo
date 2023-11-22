import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { BigIntToString } from '@orbiter-finance/utils';
import { TransferAmountTransaction } from 'apps/explore-DataCrawler/src/transaction/transaction.interface';
import { Transfers as TransfersModel, TransferOpStatus } from '@orbiter-finance/seq-models';
import { InjectModel } from '@nestjs/sequelize';
import { MessageService, ConsumerService } from '@orbiter-finance/rabbit-mq';
import { TransactionV1Service } from './transactionV1.service';
import { TransactionV2Service } from './transactionV2.service';
import { MakerService } from '../maker/maker.service'
import { OrbiterLogger } from '@orbiter-finance/utils';
import { LoggerDecorator } from '@orbiter-finance/utils';
import { ENVConfigService } from '@orbiter-finance/config';

@Injectable()
export class TransactionService {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    @InjectModel(TransfersModel)
    private transfersModel: typeof TransfersModel,
    private messageService: MessageService,
    private consumerService: ConsumerService,
    private transactionV1Service: TransactionV1Service,
    private transactionV2Service: TransactionV2Service,
    private makerService: MakerService,
    private envConfig: ENVConfigService
  ) {
    this.consumerService.consumeScanTransferReceiptMessages(this.batchInsertTransactionReceipt.bind(this))
    this.consumerService.consumeScanTransferSaveDBAfterMessages(this.executeMatch.bind(this))
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

        const upsertData: any = {
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
          transactionIndex: transfer.transactionIndex,
          syncStatus: 0,
        }
        let versionStr = null;
        const ignoreAddress = this.envConfig.get("IgnoreAddress", '').toLocaleLowerCase().split(',');
        if (ignoreAddress.includes(transfer.sender) && ignoreAddress.includes(transfer.receiver)) {
          upsertData.opStatus = TransferOpStatus.BALANCED_LIQUIDITY;
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
          if (transfer.sender === transfer.receiver) {
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
        if (+this.envConfig.get("enableDataSync") == 1) {
          // TAG:data-synchronization
          this.messageService.sendMessageToDataSynchronization({ type: '2', data: payload })
        }
      } else if (payload.version === '1-1') {
        result = await this.transactionV1Service.handleTransferByDestTx(payload);
        if (+this.envConfig.get("enableDataSync") == 1) {
          // TAG:data-synchronization
          this.messageService.sendMessageToDataSynchronization({ type: '2', data: payload })
        }
        if (+this.envConfig.get("enablePointsSystem") == 1 && result.errno === 0) {
          this.messageService.sendMessageToPointsSystem(result.data)
        }

      } else if (payload.version === '2-0') {
        result =
          await this.transactionV2Service.handleTransferBySourceTx(payload);
      } else if (payload.version === '2-1') {
        result = await this.transactionV2Service.handleTransferByDestTx(payload);
        if (+this.envConfig.get("enablePointsSystem") == 1 && result.errno === 0) {
          this.messageService.sendMessageToPointsSystem(result.data)
        }
      } else {
        this.logger.error(`${payload.hash} incorrect version ${payload.version}`);
      }
      // send to maker client when side is 0
      if (result && result.errno != 0) {
        this.logger.info(`${payload.hash} ${payload.version} executeMatch result: errno ${result.errno}, errmsg: ${result.errmsg}`);
      } else if (!result) {
        this.logger.error(`${payload.hash} ${payload.version} executeMatch result: No result returned`);
      }
      if (['2-0'].includes(payload.version) && result && result.errno === 0 && this.envConfig.get("enableTransfer")) {
        this.messageService.sendTransferToMakerClient(result.data)
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
}

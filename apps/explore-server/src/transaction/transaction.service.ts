import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { MdcService } from '../thegraph/mdc/mdc.service';
import dayjs from 'dayjs';
import { BigIntToString, JSONStringify } from '@orbiter-finance/utils';
import { TransferAmountTransaction } from '../rpc-scanning/rpc-scanning.interface';
import { Transfers as TransfersModel } from '@orbiter-finance/seq-models';
import { InjectModel } from '@nestjs/sequelize';
import { MessageService, ConsumerService } from '@orbiter-finance/rabbit-mq';
import { TransactionV1Service } from '../transaction/transactionV1.service';
import { TransactionV2Service } from '../transaction/transactionV2.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { MakerService } from '../maker/maker.service'
@Injectable()
export class TransactionService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService,
    @InjectModel(TransfersModel)
    private transfersModel: typeof TransfersModel,
    private messageService: MessageService,
    private consumerService: ConsumerService,
    private transactionV1Service: TransactionV1Service,
    private transactionV2Service: TransactionV2Service,
    private makerService: MakerService
  ) {
    this.consumerService.consumeTransferWaitMessages(this.executeMatch.bind(this))
    this.consumerService.consumeTransactionReceiptMessages(this.batchInsertTransactionReceipt.bind(this))
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
        this.logger.debug(
          `handleScanBlockResult ${transfer.blockNumber}-${transfer.hash}`,
        );
        const sender = (transfer.sender || '').toLocaleLowerCase();
        const receiver = (transfer.receiver || '').toLocaleLowerCase();
        const tokenAddr = (transfer.token || '').toLocaleLowerCase();
        const contractAddr = (transfer.contract || '').toLocaleLowerCase();
        const calldata = BigIntToString(transfer.calldata);
        const txTime = dayjs(transfer.timestamp).utc().toDate();

        // valid v1 or v2
        let versionStr = null;
        if (await this.makerService.isV1WhiteWalletAddress(transfer.sender)) {
          versionStr = '1-1';
        } else if (await this.makerService.isV1WhiteWalletAddress(transfer.receiver)) {
          versionStr = '1-0';
        } else if (await this.makerService.isV2WhiteWalletAddress(transfer.receiver)) {
          versionStr = '2-0';
        } else if (await this.makerService.isV2WhiteWalletAddress(transfer.sender)) {
          versionStr = '2-1';
        }
        if (versionStr) {
          transfer.version = versionStr;
        }
        const upsertData:any = {
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
          version: transfer.version,
          feeToken: transfer.feeToken,
        }
        if (transfer.sender === transfer.receiver) {
          upsertData.opStatus = 3;
        }
        await this.transfersModel
          .upsert(
            upsertData,
            {
              conflictFields: ['chainId', 'hash'],
            },
          )
          .then(([instance, _created]) => {
            transfer['id'] = instance.id;
            // this.memoryMatchingService.addTransferMatchCache(instance.toJSON())
            // this.eventEmitter.emit(
            //   `transfersCreate.${versionStr}`,
            //   instance.toJSON(),
            // );
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
    let result;
    if (payload.version === '1-0') {
      result =
        await this.transactionV1Service.handleTransferBySourceTx(payload);
    } else if (payload.version === '1-1') {
      result = await this.transactionV1Service.handleTransferByDestTx(payload);
    } else if (payload.version === '2-0') {
      result =
        await this.transactionV2Service.handleTransferBySourceTx(payload);
    } else if (payload.version === '2-1') {
      result = await this.transactionV2Service.handleTransferByDestTx(payload);
    } else {
      throw new Error(` incorrect version ${payload.version}`);
    }

    // send to maker client when side is 0
    if (['1-0', '2-0'].includes(payload.version) && result && result.id && result.sourceId) {
      this.messageService.sendTransferToMakerClient(result)
    }
    return result;
  }
}

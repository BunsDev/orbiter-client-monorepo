import { Injectable } from '@nestjs/common';
import { MdcService } from '../thegraph/mdc/mdc.service';
import dayjs from 'dayjs';
import { BigIntToString, JSONStringify } from '@orbiter-finance/utils';
import { TransferAmountTransaction } from '../rpc-scanning/rpc-scanning.interface';
import { Transfers as TransfersModel } from '@orbiter-finance/seq-models';
import { InjectModel } from '@nestjs/sequelize';
import { MessageService } from '../rabbit-mq/message.service';
import { TransactionV1Service } from '../transaction/transactionV1.service';
import { TransactionV2Service } from '../transaction/transactionV2.service';
import { createLoggerByName } from '../utils/logger';
import { MemoryMatchingService } from './memory-matching.service';
@Injectable()
export class TransactionService {
  private logger = createLoggerByName(`${TransactionService.name}`);
  constructor(
    private mdcService: MdcService,
    @InjectModel(TransfersModel)
    private transfersModel: typeof TransfersModel,
    private messageService: MessageService,
    private transactionV1Service: TransactionV1Service,
    private transactionV2Service: TransactionV2Service
  ) { }
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

        let versionStr = `${transfer.version || ''}-0`;
        const { exist } = await this.mdcService.validMakerOwnerAddress(
          transfer.receiver,
        );
        if (exist) {
          versionStr = `${transfer.version || ''}-0`;
        } else {
          // valid from is response addres
          const { exist: existSender } =
            await this.mdcService.validMakerOwnerAddress(transfer.sender);
          if (existSender) {
            versionStr = `${transfer.version || ''}-1`;
          }
        }

        await this.transfersModel
          .upsert(
            {
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
              version: versionStr,
              feeToken: transfer.feeToken,
            },
            {
              conflictFields: ['chainId', 'hash'],
            },
          )
          .then(([instance, _created]) => {
            transfer['id'] = instance.id;
            if (!_created) {
              this.logger.info(
                `transfer update ${instance.hash} transfer: ${JSONStringify(
                  transfer,
                )}`,
              );
            } else {
              this.logger.info(
                `transfer create ${instance.hash} transfer: ${JSONStringify(
                  transfer,
                )}`,
              );
            }
            // this.memoryMatchingService.addTransferMatchCache(instance.toJSON())
            // this.eventEmitter.emit(
            //   `transfersCreate.${versionStr}`,
            //   instance.toJSON(),
            // );
            this.messageService.sendTransferMatchMessage(instance.toJSON());
          })
          .catch((error) => {
            this.logger.error(
              `insert data error ${transfer.hash} ${error.message}`,
              error.stack,
            );
            this.logger.error(JSONStringify(transfer));
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
    return result;
  }
}

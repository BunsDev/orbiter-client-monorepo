import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/sequelize";
import { ChainConfigService, ENVConfigService } from "@orbiter-finance/config";
import { Transfers as TransfersModel, BridgeTransaction as BridgeTransactionModel } from "@orbiter-finance/seq-models";
import { ValidatorService } from "../validator/validator.service";
import { BridgeTransaction, BridgeTransactionStatus } from "@orbiter-finance/seq-models";
import { AlertMessageChannel, AlertService } from "@orbiter-finance/alert";
import {
  type MonitorState,
  type TransferAmountTransaction,
} from "./sequencer.interface";
import { LoggerDecorator, arePropertyValuesConsistent, isEmpty, OrbiterLogger, sleep, equals, JSONStringify } from "@orbiter-finance/utils";
import { Op } from "sequelize";
import dayjs from "dayjs";
import { BridgeTransactionAttributes } from '@orbiter-finance/seq-models';
import { ConsumerService } from '@orbiter-finance/rabbit-mq';
import { MemoryQueue } from '../../utils/MemoryQueue'
import { AccountFactoryService } from "../../factory";
import BigNumber from "bignumber.js";
import * as Errors from "../../utils/Errors";
import { EVMAccount, OrbiterAccount, StoreService, TransactionSendAfterError, TransactionSendIgError, TransferResponse } from "@orbiter-finance/blockchain-account";
import { ethers } from "ethers6";

@Injectable()
export class TransferService {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  private readonly applicationStartupTime: number = Date.now();
  private queue: { [key: string]: MemoryQueue<BridgeTransactionModel> } = {};
  constructor(
    private readonly chainConfigService: ChainConfigService,
    private readonly validatorService: ValidatorService,
    @InjectModel(BridgeTransactionModel)
    private readonly bridgeTransactionModel: typeof BridgeTransactionModel,
    private readonly envConfig: ENVConfigService,
    private alertService: AlertService,
    private readonly consumerService: ConsumerService) {
  }

  async execSingleInscriptionTransfer(
    transfer: TransferAmountTransaction,
    wallet: OrbiterAccount,
  ) {
    const sourceChainId = transfer.sourceChain;
    const sourceHash = transfer.sourceId;
    const sourceChain = this.chainConfigService.getChainInfo(sourceChainId);
    if (!sourceChain) {
      throw new Error('sourceChain not found');
    }
    this.logger.info(
      `execSingleTransfer: ${sourceChainId}-${sourceHash}, owner:${wallet.address}`
    );
    const transaction =
      await this.bridgeTransactionModel.sequelize.transaction();
    let sourceTx: BridgeTransactionModel;
    try {
      sourceTx = await this.bridgeTransactionModel.findOne({
        attributes: [
          "id",
          "sourceChain",
          "sourceId",
          "status",
          "targetChain",
          "targetSymbol",
          "targetAmount",
          "targetId",
        ],
        where: {
          sourceId: sourceHash,
          sourceChain: sourceChainId,
        },
        transaction,
      });
      if (!sourceTx) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} SourceTx not exist`
        );
      }
      if (sourceTx.status != 0) {
        throw new Errors.AlreadyPaid(`${sourceHash} status ${sourceTx.status}`);
      }
      if (!isEmpty(sourceTx.targetId)) {
        throw new Errors.AlreadyPaid(`${sourceHash} targetId ${sourceTx.targetId}`)
      }
      if (!equals(sourceTx.targetChain, transfer.targetChain)) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} Inconsistent target network (${sourceTx.targetChain}/${transfer.targetChain})`
        );
      }

      if (!new BigNumber(sourceTx.targetAmount).eq(transfer.targetAmount)) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} Inconsistent targetAmount (${sourceTx.targetAmount}/${transfer.targetAmount})`
        );
      }

      if (sourceTx.targetSymbol != transfer.targetSymbol) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} Inconsistent targetSymbol (${sourceTx.targetSymbol}/${transfer.targetSymbol})`
        );
      }
      sourceTx.status = BridgeTransactionStatus.READY_PAID;
      const updateRes = await sourceTx.save({
        transaction,
      });
      if (!updateRes) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} Change status fail`
        );
      }
    } catch (error) {
      transaction && (await transaction.rollback());
      throw error;
    }
    // transfer.targetAddress = '0xEFc6089224068b20197156A91D50132b2A47b908';
    let transferResult: TransferResponse;
    try {
      const account = wallet as EVMAccount;
      const input = Buffer.from(`data:,${JSON.stringify({
        p: transfer.ruleId,
        op: 'mint',
        tick: transfer.targetSymbol,
        amt:new BigNumber(transfer.targetAmount).toFixed(0),
        fc: (+sourceChain.internalId) + 9000,
      })}`)

      transferResult = await account.mintInscription({
        to: transfer.targetAddress,
        data: input as any,
        value: transfer.sourceNonce,
      });
      sourceTx.status = BridgeTransactionStatus.PAID_SUCCESS;
      sourceTx.targetId = transferResult.hash;
      const updateRes = await sourceTx.save({
        transaction,
      });
      if (!updateRes) {
        throw new TransactionSendAfterError(
          `${sourceChainId} - ${sourceHash} Change status fail`
        );
      }
      await transaction.commit();
    } catch (error) {
      if (error instanceof Errors.PaidRollbackError || !transferResult?.from) {
        console.error('transferResult', transferResult);
        await transaction.rollback();
      } else {
        sourceTx.status = BridgeTransactionStatus.PAID_CRASH;
        sourceTx.targetMaker = transferResult.from;
        sourceTx.targetId = transferResult && transferResult.hash;
        await sourceTx.save({
          transaction,
        });
        await transaction.commit();
      }
      throw error;
    }
    if (transferResult) {
      // success change targetId
      wallet
        .waitForTransactionConfirmation(transferResult.hash)
        .then(async (tx) => {
          await this.bridgeTransactionModel.update(
            {
              status: BridgeTransactionStatus.BRIDGE_SUCCESS,
              targetMaker: tx.from,
            },
            {
              where: {
                id: sourceTx.id,
              },
            }
          );
        })
        .catch((error) => {
          this.alertService.sendMessage(`execSingleTransfer success waitForTransaction error ${transfer.targetChain} - ${transferResult.hash}`, [AlertMessageChannel.TG]);
          this.logger.error(
            `${transferResult.hash} waitForTransactionConfirmation error ${transfer.targetChain}`,
            error
          );
        });
    }
    return sourceTx.toJSON();
  }
  async execSingleTransfer(
    transfer: TransferAmountTransaction,
    wallet: OrbiterAccount,
  ) {
    const sourceChainId = transfer.sourceChain;
    const sourceHash = transfer.sourceId;
    const transferToken = this.chainConfigService.getTokenByAddress(
      transfer.targetChain,
      transfer.targetToken
    );

    this.logger.info(
      `execSingleTransfer: ${sourceChainId}-${sourceHash}, owner:${wallet.address}`
    );
    const transaction =
      await this.bridgeTransactionModel.sequelize.transaction();
    let sourceTx: BridgeTransactionModel;
    try {
      if (!transferToken) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} Inconsistent transferToken (${transfer.targetChain}/${transfer.targetToken})`
        );
      }
      sourceTx = await this.bridgeTransactionModel.findOne({
        attributes: [
          "id",
          "sourceChain",
          "sourceId",
          "status",
          "targetChain",
          "targetSymbol",
          "targetAmount",
          "targetId",
        ],
        where: {
          sourceId: sourceHash,
          sourceChain: sourceChainId,
        },
        transaction,
      });
      if (!sourceTx) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} SourceTx not exist`
        );
      }
      if (sourceTx.status != 0) {
        throw new Errors.AlreadyPaid(`${sourceHash} status ${sourceTx.status}`);
      }
      if (!isEmpty(sourceTx.targetId)) {
        throw new Errors.AlreadyPaid(`${sourceHash} targetId ${sourceTx.targetId}`)
      }
      if (!equals(sourceTx.targetChain, transfer.targetChain)) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} Inconsistent target network (${sourceTx.targetChain}/${transfer.targetChain})`
        );
      }

      if (!new BigNumber(sourceTx.targetAmount).eq(transfer.targetAmount)) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} Inconsistent targetAmount (${sourceTx.targetAmount}/${transfer.targetAmount})`
        );
      }

      if (sourceTx.targetSymbol != transfer.targetSymbol) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} Inconsistent targetSymbol (${sourceTx.targetSymbol}/${transfer.targetSymbol})`
        );
      }
      sourceTx.status = BridgeTransactionStatus.READY_PAID;
      const updateRes = await sourceTx.save({
        transaction,
      });
      if (!updateRes) {
        throw new Errors.PaidRollbackError(
          `${sourceChainId} - ${sourceHash} Change status fail`
        );
      }
    } catch (error) {
      transaction && (await transaction.rollback());
      throw error;
    }
    // transfer.targetAddress = '0xEFc6089224068b20197156A91D50132b2A47b908';
    let transferResult: TransferResponse;
    try {
      const transferAmount = new BigNumber(transfer.targetAmount).times(
        10 ** transferToken.decimals
      );
      if (transferToken.isNative) {
        transferResult = await wallet.transfer(
          transfer.targetAddress,
          BigInt(transferAmount.toFixed(0)),
        );
      } else {
        transferResult = await wallet.transferToken(
          transferToken.address,
          transfer.targetAddress,
          BigInt(transferAmount.toFixed(0)),
        );
      }
      sourceTx.status = BridgeTransactionStatus.PAID_SUCCESS;
      sourceTx.targetId = transferResult.hash;
      const updateRes = await sourceTx.save({
        transaction,
      });
      if (!updateRes) {
        throw new TransactionSendAfterError(
          `${sourceChainId} - ${sourceHash} Change status fail`
        );
      }
      await transaction.commit();
    } catch (error) {
      if (error instanceof Errors.PaidRollbackError || !transferResult?.from) {
        console.error('transferResult', transferResult);
        await transaction.rollback();
      } else {
        sourceTx.status = BridgeTransactionStatus.PAID_CRASH;
        sourceTx.targetMaker = transferResult.from;
        sourceTx.targetId = transferResult && transferResult.hash;
        await sourceTx.save({
          transaction,
        });
        await transaction.commit();
      }
      throw error;
    }
    if (transferResult) {
      // success change targetId
      wallet
        .waitForTransactionConfirmation(transferResult.hash)
        .then(async (tx) => {
          await this.bridgeTransactionModel.update(
            {
              status: BridgeTransactionStatus.BRIDGE_SUCCESS,
              targetMaker: tx.from,
            },
            {
              where: {
                id: sourceTx.id,
              },
            }
          );
        })
        .catch((error) => {
          this.alertService.sendMessage(`execSingleTransfer success waitForTransaction error ${transfer.targetChain} - ${transferResult.hash}`, [AlertMessageChannel.TG]);
          this.logger.error(
            `${transferResult.hash} waitForTransactionConfirmation error ${transfer.targetChain}`,
            error
          );
        });
    }
    return sourceTx.toJSON();
  }
  async execBatchTransfer(
    transfers: TransferAmountTransaction[],
    wallet: OrbiterAccount
  ) {
    const targetChainId = transfers[0].targetChain;
    const transferToken = this.chainConfigService.getTokenByAddress(
      transfers[0].targetChain,
      transfers[0].targetToken
    );
    let transferResult: TransferResponse;
    const sourecIds = transfers.map((tx) => tx.sourceId);
    const toAddressList = transfers.map((tx) => tx.targetAddress);
    const toValuesList = transfers.map((tx) => {
      return BigInt(
        new BigNumber(tx.targetAmount)
          .times(10 ** transferToken.decimals)
          .toFixed(0)
      );
    });
    // lock
    const transaction =
      await this.bridgeTransactionModel.sequelize.transaction();
    //
    try {
      const result = await this.bridgeTransactionModel.update(
        {
          targetMaker: wallet.address,
          status: BridgeTransactionStatus.READY_PAID,
        },
        {
          where: {
            sourceId: sourecIds,
            status: 0,
          },
          transaction,
        }
      );
      if (result[0] != sourecIds.length) {
        throw new Error(
          `The number of successful modifications is inconsistent ${sourecIds.join(',')}`
        );
      }
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    try {
      if (transferToken.isNative) {
        transferResult = await wallet.transfers(
          toAddressList,
          toValuesList,
        );
      } else {
        transferResult = await wallet.transferTokens(
          transferToken.address,
          toAddressList,
          toValuesList,
        );
      }
      // CHANGE 98
      for (let i = 0; i < transfers.length; i++) {
        await this.bridgeTransactionModel.update(
          {
            status: BridgeTransactionStatus.PAID_SUCCESS,
            targetMaker: wallet.address,
            targetId: transferResult && `${transferResult.hash}#${i}`
          },
          {
            where: {
              sourceId: transfers[i].sourceId,
            },
            transaction,
          }
        );
      }
      await transaction.commit();
    } catch (error) {
      if (error instanceof Errors.PaidRollbackError) {
        console.error('transferResult', transferResult);
        await transaction.rollback();
      } else {
        for (let i = 0; i < transfers.length; i++) {
          await this.bridgeTransactionModel.update(
            {
              status: BridgeTransactionStatus.PAID_CRASH,
              targetId: transferResult && `${transferResult.hash}#${i}`
            },
            {
              where: {
                sourceId: transfers[i].sourceId,
              },
              transaction,
            }
          );
        }
        await transaction.commit();
      }
      throw error;
    }
    if (transferResult) {
      // success change targetId
      wallet
        .waitForTransactionConfirmation(transferResult.hash)
        .then(async (tx) => {
          await this.bridgeTransactionModel.update(
            {
              status: BridgeTransactionStatus.BRIDGE_SUCCESS,
              targetMaker: tx.from,
            },
            {
              where: {
                sourceId: sourecIds,
              },
            }
          );
        })
        .catch((error) => {
          this.alertService.sendMessage(`execBatchTransfer success waitForTransaction error ${targetChainId} - ${transferResult.hash}`, [AlertMessageChannel.TG]);
          this.logger.error(
            `${transferResult.hash} waitForTransactionConfirmation error ${targetChainId}`,
            error
          );
        });
    }
    return transferResult;
  }

}
import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/sequelize";
import { ChainConfigService, ENVConfigService } from "@orbiter-finance/config";
import { BridgeTransaction as BridgeTransactionModel } from "@orbiter-finance/seq-models";
import { ValidatorService } from "../validator/validator.service";
import { BridgeTransactionStatus } from "@orbiter-finance/seq-models";
import { AlertMessageChannel, AlertService } from "@orbiter-finance/alert";
import {
  type TransferAmountTransaction,
} from "./sequencer.interface";
import { LoggerDecorator, isEmpty, OrbiterLogger, sleep, equals, getObjKeyByValue } from "@orbiter-finance/utils";
import BigNumber from "bignumber.js";
import * as Errors from "../../utils/Errors";
import { EVMAccount, OrbiterAccount, TransactionSendAfterError, TransactionSendConfirmFail, TransferResponse } from "@orbiter-finance/blockchain-account";
import { Interface, ethers } from "ethers6";
import * as abis from '@orbiter-finance/abi'

@Injectable()
export class TransferService {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  private readonly applicationStartupTime: number = Date.now();
  constructor(
    private readonly chainConfigService: ChainConfigService,
    @InjectModel(BridgeTransactionModel)
    private readonly bridgeTransactionModel: typeof BridgeTransactionModel,
    private alertService: AlertService) {
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
      sourceTx.targetNonce = String(transferResult && transferResult.nonce);
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
      if (error instanceof Errors.PaidRollbackError) {
        console.error('transferResult', transferResult);
        await transaction.rollback();
      } else {
        sourceTx.targetNonce = String(transferResult && transferResult.nonce);
        sourceTx.status = BridgeTransactionStatus.PAID_CRASH;
        sourceTx.targetMaker = transferResult && transferResult.from;
        sourceTx.targetId = transferResult && transferResult.hash;
        await sourceTx.save({
          transaction,
        });
        await transaction.commit();
      }
      throw error;
    }
    if (transferResult && transferResult.hash) {
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
            `${transferResult.hash} waitForTransactionConfirmation error ${transfer.targetChain} ${error.message}`,
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
            targetId: transferResult && `${transferResult.hash}#${i}`,
            targetNonce: String(transferResult && transferResult.nonce)
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
              targetId: transferResult && `${transferResult.hash}#${i}`,
              targetNonce: String(transferResult && transferResult.nonce)
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
          // this.alertService.sendMessage(`execBatchTransfer success waitForTransaction error ${targetChainId} - ${transferResult.hash}`, [AlertMessageChannel.TG]);
          this.logger.error(
            `${transferResult.hash} waitForTransactionConfirmation error ${targetChainId}`,
            error
          );
        });
    }
    return transferResult;
  }

  async execBatchInscriptionTransfer(
    transfers: TransferAmountTransaction[],
    wallet: OrbiterAccount
  ) {
    const targetChainId = transfers[0].targetChain;
    let transferResult: TransferResponse;
    const calldata: any = [[], [], [], []];
    const transaction = await this.bridgeTransactionModel.sequelize.transaction();
    let contractAddress;
    try {
      for (const tx of transfers) {
        const sourceChain = this.chainConfigService.getChainInfo(tx.sourceChain);
        if (sourceChain) {
          calldata[0].push(tx.sourceId);
          calldata[1].push(tx.targetAddress);
          calldata[2].push(BigInt(tx.sourceNonce));
          const input = Buffer.from(`data:,${JSON.stringify({
            p: tx.ruleId,
            op: 'mint',
            tick: tx.targetSymbol,
            amt: new BigNumber(tx.targetAmount).toFixed(0),
            fc: String((+sourceChain.internalId)),
          })}`)
          calldata[3].push(input);
        }
      }
      const result = await this.bridgeTransactionModel.update(
        {
          targetMaker: wallet.address,
          status: BridgeTransactionStatus.READY_PAID,
        },
        {
          where: {
            sourceId: calldata[0],
            status: 0,
          },
          transaction,
        }
      );
      if (result[0] != calldata[0].length) {
        throw new Error(
          `The number of successful modifications is inconsistent ${calldata[0].join(',')}`
        );
      }
      const targetChain = this.chainConfigService.getChainInfo(targetChainId);
      if (!targetChain) {
        throw new Errors.PaidBeforeCheck('The target chain information does not exist')
      }
      contractAddress = getObjKeyByValue(targetChain.contract, 'CrossInscriptions');
      if (!contractAddress) {
        throw new Errors.PaidBeforeCheck('Sending the inscription did not obtain the contract address')
      }
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    try {
      const account = wallet as EVMAccount;
      const ifa = new Interface(abis.CrossInscriptions);
      const data = ifa.encodeFunctionData("transfers", [calldata[1], calldata[2], calldata[3]]);
      const totalValue = calldata[2].reduce(
        (accumulator, currentValue) => accumulator + currentValue,
        0n
      );
      transferResult = await account.mintInscription({
        to: contractAddress,
        data: data,
        value: totalValue,
      })
      // CHANGE 98
      for (let i = 0; i < transfers.length; i++) {
        await this.bridgeTransactionModel.update(
          {
            status: BridgeTransactionStatus.PAID_SUCCESS,
            targetMaker: wallet.address,
            targetId: transferResult && `${transferResult.hash}#${i}`,
            targetNonce: String(transferResult.nonce)
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
      console.error('execBatchInscriptionTransfer error', transferResult);
      if (error instanceof Errors.PaidRollbackError || error instanceof TransactionSendConfirmFail) {
        await transaction.rollback();
      } else {
        try {
          for (let i = 0; i < transfers.length; i++) {
            await this.bridgeTransactionModel.update(
              {
                status: BridgeTransactionStatus.PAID_CRASH,
                targetId: transferResult && `${transferResult.hash}#${i}`,
                targetNonce: String(transferResult && transferResult.nonce)
              },
              {
                where: {
                  sourceId: transfers[i].sourceId,
                },
                transaction,
              }
            );
          }
        } catch (error) {
          this.logger.error(`execBatchInscriptionTransfer error update status PAID_CRASH error ${error.message}`, error);
        }
        await transaction.commit();
      }
      this.logger.error(`execBatchInscriptionTransfer error ${error.message}`);
      throw error;
    }
    // if (transferResult && transferResult.hash) {
    // success change targetId
    // wallet
    //   .waitForTransactionConfirmation(transferResult.hash)
    //   .then((tx) => {
    //     this.bridgeTransactionModel.update(
    //       {
    //         status: BridgeTransactionStatus.BRIDGE_SUCCESS,
    //         targetMaker: tx.from,
    //       },
    //       {
    //         where: {
    //           sourceId: calldata[0],
    //         },
    //       }
    //     ).catch((error) => {
    //       this.logger.error(
    //         `${calldata[0].join(',')} - ${transferResult.hash} waitForTransactionConfirmation update error ${targetChainId} ${error.message}`,
    //         error
    //       );
    //     })
    //   })
    //   .catch((error) => {
    //     // this.alertService.sendMessage(`execBatchTransfer success waitForTransaction error ${targetChainId} - ${transferResult.hash}`, [AlertMessageChannel.TG]);
    //     this.logger.error(
    //       `${calldata[0].join(',')} - ${transferResult.hash} waitForTransactionConfirmation error ${targetChainId} ${error.message}`,
    //       error
    //     );
    //   });
    // }
    return transferResult;
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
      `execSingleInscriptionTransfer: ${sourceChainId}-${transfer.targetChain} sourceHash:${sourceHash}, owner:${wallet.address}`
    );
    const transaction =
      await this.bridgeTransactionModel.sequelize.transaction();
    let sourceTx: BridgeTransactionModel;
    try {
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
      let transferResult: TransferResponse;
      try {
        const account = wallet as EVMAccount;
        const input = Buffer.from(`data:,${JSON.stringify({
          p: transfer.ruleId,
          op: 'mint',
          tick: transfer.targetSymbol,
          amt: new BigNumber(transfer.targetAmount).toFixed(0),
          fc: String((+sourceChain.internalId)),
        })}`)
        transferResult = await account.mintInscription({
          to: transfer.targetAddress,
          data: ethers.hexlify(input),
          value: transfer.sourceNonce,
        })
        sourceTx.status = BridgeTransactionStatus.PAID_SUCCESS;
        sourceTx.targetId = transferResult.hash;
        sourceTx.targetNonce = String(transferResult.nonce);
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
        if (error instanceof Errors.PaidRollbackError || error instanceof TransactionSendConfirmFail) {
          await transaction.rollback();
        } else {
          try {
            if (transferResult) {
              sourceTx.targetNonce = String(transferResult.nonce);
              sourceTx.targetMaker = transferResult.from;
              sourceTx.targetId = transferResult.hash;
            }
            sourceTx.status = BridgeTransactionStatus.PAID_CRASH;
            await sourceTx.save({
              transaction,
            });
          } catch (error) {
            this.logger.error(`execSingleInscriptionTransfer error ${sourceHash} update status PAID_CRASH error ${error.message}`, error);
            this.alertService.sendMessage(`execSingleInscriptionTransfer error update status error ${error.message}`, error)
          }
          await transaction.commit();
        }
        throw error;
      }
      // if (transferResult && transferResult.hash) {
      //   // success change targetId
      //   wallet
      //     .waitForTransactionConfirmation(transferResult.hash)
      //     .then((tx) => {
      //       this.bridgeTransactionModel.update(
      //         {
      //           status: BridgeTransactionStatus.BRIDGE_SUCCESS,
      //           targetMaker: tx.from,
      //         },
      //         {
      //           where: {
      //             id: sourceTx.id,
      //           },
      //         }
      //       );
      //     })
      //     .catch((error) => {
      //       // this.alertService.sendMessage(`execSingleTransfer success waitForTransaction error ${transfer.targetChain} - ${transferResult.hash}`, [AlertMessageChannel.TG]);
      //       this.logger.error(
      //         `${transfer.sourceId} - ${transferResult.hash} waitForTransactionConfirmation error ${transfer.targetChain} ${error.message}`,
      //         error
      //       );
      //     });
      // }
      return sourceTx.toJSON();
    } catch (error) {
      this.logger.error(`execSingleInscriptionTransfer ${sourceHash} error ${error.message}`, error)
      throw error;
    }
  }
}

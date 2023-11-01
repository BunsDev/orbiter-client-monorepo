import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { equals } from '@orbiter-finance/utils';
import { BridgeTransactionAttributes, BridgeTransaction as BridgeTransactionModel, Transfers as TransfersModel, TransferOpStatus } from '@orbiter-finance/seq-models';
import { InjectModel } from '@nestjs/sequelize';
import { ChainConfigService, ENVConfigService, MakerV1RuleService, Token } from '@orbiter-finance/config';
import { Op } from 'sequelize';
import { Cron } from '@nestjs/schedule';
import { MemoryMatchingService } from './memory-matching.service';
import { Sequelize } from 'sequelize-typescript';
import { OrbiterLogger } from '@orbiter-finance/utils';
import { LoggerDecorator } from '@orbiter-finance/utils';
import { utils } from 'ethers'
import { validateAndParseAddress } from 'starknet'
import BridgeTransactionBuilder from './bridgeTransaction.builder'
import { ValidSourceTxError, decodeV1SwapData, addressPadStart } from '../utils';
@Injectable()
export class TransactionV1Service {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    @InjectModel(TransfersModel)
    private transfersModel: typeof TransfersModel,
    @InjectModel(BridgeTransactionModel)
    private bridgeTransactionModel: typeof BridgeTransactionModel,
    protected chainConfigService: ChainConfigService,
    protected memoryMatchingService: MemoryMatchingService,
    private sequelize: Sequelize,
    protected envConfigService: ENVConfigService,
    protected makerV1RuleService: MakerV1RuleService,
    protected bridgeTransactionBuilder: BridgeTransactionBuilder
  ) {
    this.matchScheduleTask()
      .then((_res) => {
        this.matchSenderScheduleTask();
      })
      .catch((error) => {
        this.logger.error(
          `constructor matchScheduleTask error `,
          error,
        );
      });
  }
  @Cron('0 */5 * * * *')
  async matchScheduleTask() {
    const transfers = await this.transfersModel.findAll({
      raw: true,
      order: [['id', 'desc']],
      limit: 500,
      where: {
        status: 2,
        opStatus: 0,
        version: '1-0',
        timestamp: {
          [Op.gte]: dayjs().subtract(24, 'hour').toISOString(),
        },
        // nonce: {
        //   [Op.lt]: 9000
        // }
      },
    });
    for (const transfer of transfers) {
      await this.handleTransferBySourceTx(transfer).catch((error) => {
        this.logger.error(
          `matchScheduleTask handleTransferBySourceTx ${transfer.hash} error`,
          error,
        );
      });
    }
  }

  @Cron('0 */7 * * * *')
  async matchSenderScheduleTask() {
    const transfers = await this.transfersModel.findAll({
      raw: true,
      order: [['id', 'desc']],
      limit: 1000,
      where: {
        status: 2,
        opStatus: 0,
        version: '1-1',
        timestamp: {
          [Op.gte]: dayjs().subtract(24, 'hour').toISOString(),
        },
      },
    });
    for (const transfer of transfers) {
      await this.handleTransferByDestTx(transfer).catch((error) => {
        this.logger.error(
          `matchSenderScheduleTask handleTransferByDestTx ${transfer.hash} error`,
          error,
        );
      });
    }
  }

  public async validSourceTxInfo(transfer: TransfersModel) {
    const result: any = {};
    try {
      if (+transfer.nonce >= 9000) {
        throw new ValidSourceTxError(TransferOpStatus.NONCE_EXCEED_MAXIMUM, `Exceeded the maximum nonce value ${transfer.nonce} / 9000`)
      }
      const sourceChain = this.chainConfigService.getChainInfo(transfer.chainId);
      if (!sourceChain) {
        throw new ValidSourceTxError(TransferOpStatus.SOURCE_CHAIN_OR_TOKEN_NOT_FOUND, `sourceChain not found`)
      }
      result.sourceChain = sourceChain;
      const sourceToken = this.chainConfigService.getTokenByAddress(
        sourceChain.chainId,
        transfer.token,
      );
      if (!sourceToken) {
        throw new ValidSourceTxError(TransferOpStatus.SOURCE_CHAIN_OR_TOKEN_NOT_FOUND, `${transfer.token} sourceToken not found`)
      }
      result.sourceToken = sourceToken;
      let targetChainId: number
      let xvmTargetInfo = {} as {
        toChainId: number;
        toTokenAddress: string;
        toWalletAddress: string;
        expectValue: string;
        slippage: number;
      };
      let isXvm = false
      const contract = sourceChain.contract;
      if (transfer.contract && !['SN_MAIN', 'SN_TEST'].includes(transfer.chainId) && (contract[transfer.contract] === 'OrbiterRouterV1' || contract[utils.getAddress(transfer.contract)] === 'OrbiterRouterV1')) {
        if (transfer.signature === 'swap(address,address,uint256,bytes)') {
          const targetInfo = decodeV1SwapData(transfer.calldata[3])
          isXvm = true
          xvmTargetInfo = targetInfo
          result.targetAmount = xvmTargetInfo.expectValue
        }
      }
      targetChainId = this.parseSourceTxSecurityCode(transfer.amount);
      if (isXvm) {
        targetChainId = xvmTargetInfo.toChainId
      } else if ([9, 99].includes(+sourceChain.internalId)) {
        if (transfer.calldata && Array.isArray(transfer.calldata) && transfer.calldata.length) {
          targetChainId = Number(transfer.calldata[0]) % 1000;
        }
      }


      // targetChainId
      const targetChain = this.chainConfigService.getChainByKeyValue(
        'internalId',
        targetChainId,
      );
      if (!targetChain) {
        throw new ValidSourceTxError(TransferOpStatus.TARGET_CHAIN_OR_TOKEN_NOT_FOUND, `targetChain.chainId:${targetChain.chainId} targetChain not found`)
      }
      result.targetChain = targetChain;
      //
      let targetToken: Token
      if (isXvm) {
        targetToken = this.chainConfigService.getTokenByAddress(
          targetChain.chainId,
          xvmTargetInfo.toTokenAddress,
        );
      } else {
        targetToken = this.chainConfigService.getTokenBySymbol(
          targetChain.chainId,
          sourceToken.symbol,
        );
      }
      if (!targetToken) {
        throw new ValidSourceTxError(TransferOpStatus.TARGET_CHAIN_OR_TOKEN_NOT_FOUND, `targetChain.chainId:${targetChain.chainId}, targetToken not found`)
      }
      result.targetToken = targetToken;
      let rule;
      if (targetToken) {
        rule = this.makerV1RuleService.getAll().find((rule) => {
          const {
            sourceChainId,
            targetChainId,
            sourceSymbol,
            targetSymbol,
            makerAddress,
          } = rule;
          return (
            equals(sourceChainId, sourceChain.internalId) &&
            equals(targetChainId, targetChain.internalId) &&
            equals(sourceSymbol, sourceToken.symbol) &&
            equals(targetSymbol, targetToken.symbol) &&
            equals(makerAddress, transfer.receiver)
          );
        });
      }

      if (!rule) {
        const errMsg = `sourceChain.internalId: ${sourceChain.internalId}, targetChain.internalId:${targetChain.internalId}, sourceToken.symbol:${sourceToken.symbol}, targetToken.symbol:${targetToken.symbol}, transfer.receiver:${transfer.receiver}`
        throw new ValidSourceTxError(TransferOpStatus.RULE_NOT_FOUND, errMsg)
      }
      result.targetMaker = rule.sender;
      result.rule = rule;
      if (targetChain) {
        const sourceChainID = +sourceChain.internalId;
        const targetChainID = +targetChain.internalId;
        if ([4, 44].includes(targetChainID)) {
          const calldata = transfer.calldata as string[];
          if (calldata.length > 0) {
            if (transfer.signature === 'transfer(address,bytes)') {
              const address = addressPadStart(
                transfer.calldata[1].replace('0x03', ''),
                66,
              );
              result.targetAddress = address.toLocaleLowerCase();
            } else if (
              transfer.signature ===
              'transferERC20(address,address,uint256,bytes)'
            ) {
              const address = addressPadStart(
                transfer.calldata[3].replace('0x03', ''),
                66,
              );
              result.targetAddress = address.toLocaleLowerCase();
            } else if (isXvm && xvmTargetInfo.toWalletAddress) {
              result.targetAddress = validateAndParseAddress(xvmTargetInfo.toWalletAddress)
            }
          }
        } else if ([4, 44].includes(sourceChainID)) {
          if (
            Array.isArray(transfer.calldata) &&
            transfer.calldata.length === 5 &&
            transfer.signature === 'transferERC20(felt,felt,Uint256,felt)'
          ) {
            result.targetAddress = addressPadStart(
              transfer.calldata[4].toLocaleLowerCase(),
              42,
            );
          }
        } else if ([9, 99].includes(sourceChainID)) {
          if (transfer.calldata && Array.isArray(transfer.calldata)) {
            if (transfer.calldata.length === 1) {
              result.targetAddress = transfer.sender;
            } else if (transfer.calldata.length === 2) {
              result.targetAddress = transfer.calldata[1];
            }
          }
        } else {
          result.targetAddress = transfer.sender;
        }
      }
      if (!result.targetAddress) {
        throw new ValidSourceTxError(TransferOpStatus.RULE_NOT_FOUND, `targetAddress not found`)
      }
      return {
        code: 0,
        errmsg: '',
        data: result,
      };
    } catch (error) {
      if (!(error instanceof ValidSourceTxError)) {
        throw error
      }
      const validSourceTxError = error as ValidSourceTxError
      await this.transfersModel.update(
        {
          opStatus: validSourceTxError.opStatus,
        },
        {
          where: {
            id: transfer.id,
          },
        },
      );
      this.logger.error(`hash: ${transfer.hash}, chainId:${transfer.chainId} => ${validSourceTxError.message}`);
      return {
        code: 1,
        errmsg: validSourceTxError.message,
        data: result,
      };
    }
  }

  public async handleTransferBySourceTx(transfer: TransfersModel) {
    if (transfer.status != 2) {
      this.logger.error(
        `validSourceTxInfo fail ${transfer.hash} Incorrect status ${transfer.status}`
      );
      return {
        errmsg: `validSourceTxInfo fail ${transfer.hash} Incorrect status ${transfer.status}`
      }
    }

    // const { code, errmsg, data } = await this.validSourceTxInfo(transfer);
    // if (code !== 0) {
    //   this.logger.error(
    //     `validSourceTxInfo fail ${transfer.hash} ${errmsg}`,
    //   );
    //   return {
    //     errmsg: `validSourceTxInfo fail ${transfer.hash} ${errmsg}`
    //   }
    // }
    const sourceBT = await this.bridgeTransactionModel.findOne({
      attributes: ['id', 'status', 'targetChain'],
      where: {
        sourceChain: transfer.chainId,
        sourceId: transfer.hash,
      },
    });
    if (sourceBT && sourceBT.status >= 90) {
      return {
        errmsg: `${transfer.hash} The transaction exists, the status is greater than 90, and it is inoperable.`
      }
    }
    let createdData: BridgeTransactionAttributes
    try {
      createdData = await this.bridgeTransactionBuilder.build(transfer)
    } catch (error) {
      if (error instanceof ValidSourceTxError) {
        this.logger.error(`ValidSourceTxError hash: ${transfer.hash}, chainId:${transfer.chainId} => ${error.message}`);
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
        this.logger.info(`ValidSourceTxError update transferId: ${transfer.id} result: ${JSON.stringify(r)}`)
        return { errmsg: error.message }
      } else {
        this.logger.error(`ValidSourceTxError throw`, error)
        throw error
      }
    }

    const t = await this.sequelize.transaction();

    try {

      // const createdData: BridgeTransactionAttributes = {
      //   sourceId: transfer.hash,
      //   sourceAddress: transfer.sender,
      //   sourceMaker: transfer.receiver,
      //   sourceAmount: transfer.amount.toString(),
      //   sourceChain: transfer.chainId,
      //   sourceNonce: transfer.nonce,
      //   sourceSymbol: transfer.symbol,
      //   sourceToken: transfer.token,
      //   targetToken: null,
      //   sourceTime: transfer.timestamp,
      //   dealerAddress: null,
      //   ebcAddress: null,
      //   targetChain: null,
      //   ruleId: null,
      //   targetAmount: null,
      //   targetAddress: null,
      //   targetSymbol: null,
      //   createdAt: new Date(),
      //   version: transfer.version,
      // };
      // this.buildSourceTxData(transfer, createdData, data);
      if (createdData.targetAddress.length >= 100) {
        return {
          errmsg: `${transfer.hash} There is an issue with the transaction format`
        }
      }

      if (sourceBT && sourceBT.id) {
        sourceBT.targetChain = createdData.targetChain;
        await sourceBT.update(createdData, {
          where: { id: sourceBT.id },
          transaction: t,
        })
      } else {
        const createRow = await this.bridgeTransactionModel.create(
          createdData,
          {
            transaction: t,
          },
        );
        if (!createRow || !createRow.id) {
          throw new Error(`${transfer.hash} Create Bridge Transaction Fail`);
        }
        createdData.id = createRow.id
        this.logger.info(`Create bridgeTransaction ${createdData.sourceId}`);
        this.memoryMatchingService
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
            opStatus: 1,
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
      return createdData
    } catch (error) {
      console.error(error);
      this.logger.error(
        `handleTransferBySourceTx ${transfer.hash} error`,
        error,
      );
      t && (await t.rollback());
      throw error;
    }
  }

  public async handleTransferByDestTx(transfer: TransfersModel) {
    if (transfer.version != '1-1') {
      throw new Error(`handleTransferByDestTx ${transfer.hash} version not 2-1`);
    }
    let t1;
    try {
      const memoryBT =
        await this.memoryMatchingService.matchV1GetBridgeTransactions(transfer);
      if (memoryBT && memoryBT.id) {
        //
        t1 = await this.sequelize.transaction();
        const [rowCount] = await this.bridgeTransactionModel.update(
          {
            targetId: transfer.hash,
            status: transfer.status == 3 ? 97 : 99,
            targetTime: transfer.timestamp,
            targetFee: transfer.feeAmount,
            targetFeeSymbol: transfer.feeToken,
            targetNonce: transfer.nonce,
            targetMaker: transfer.sender
          },
          {
            where: {
              id: memoryBT.id,
              status: [0, 97, 98],
              sourceTime: {
                [Op.lt]: dayjs(transfer.timestamp).add(5, 'minute').toISOString(),
                [Op.gt]: dayjs(transfer.timestamp).subtract(120, 'minute').toISOString(),
              }
            },
            transaction: t1,
          },
        );
        if (rowCount != 1) {
          throw new Error(
            'The number of modified rows in bridgeTransactionModel is incorrect',
          );
        }
        const [updateTransferRows] = await this.transfersModel.update(
          {
            opStatus: 99,
          },
          {
            where: {
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
        this.memoryMatchingService.removeTransferMatchCache(memoryBT.sourceId);
        this.memoryMatchingService.removeTransferMatchCache(transfer.hash);
        this.logger.info(
          `match success from cache ${memoryBT.sourceId}  /  ${transfer.hash}`,
        );
        return memoryBT;
      }
    } catch (error) {
      this.logger.error(
        `handleTransferByDestTx matchV1GetBridgeTransactions match error ${transfer.hash} `,
        error,
      );
      t1 && (await t1.rollback());
    }

    // db match
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
          status: [0, 97, 98],
          targetSymbol: transfer.symbol,
          targetAddress: transfer.receiver,
          targetChain: transfer.chainId,
          targetAmount: transfer.amount,
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
        btTx.status = transfer.status == 3 ? 97 : 99;
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
            opStatus: 99,
          },
          {
            where: {
              hash: {
                [Op.in]: [btTx.sourceId, btTx.targetId],
              },
            },
            transaction: t2,
          },
        );
        this.logger.info(
          `match success from db ${btTx.sourceId}  /  ${btTx.targetId}`,
        );
        this.memoryMatchingService.removeTransferMatchCache(btTx.sourceId);
        this.memoryMatchingService.removeTransferMatchCache(btTx.targetId);
      } else {
        this.memoryMatchingService
          .addTransferMatchCache(transfer)
          .catch((error) => {
            this.logger.error(
              `${transfer.hash} addTransferMatchCache error `,
              error,
            );
          });
      }
      await t2.commit();
    } catch (error) {
      t2 && (await t2.rollback());
      throw error;
    }
  }

  private parseSourceTxSecurityCode(value) {
    let index = 0;
    for (let i = value.length - 1; i > 0; i--) {
      if (+value[i] !== 0) {
        index = i;
        break;
      }
    }
    let code = String(+value.substr(index - 3, 4));
    if (code.length !== 4) {
      for (let i = 0; i < 4 - code.length; i++) {
        code += '0';
      }
    }
    const nCode = Number(code);
    if (nCode < 9000 || nCode > 10000) {
      return 0;
    }
    return nCode % 1000;
  }
}

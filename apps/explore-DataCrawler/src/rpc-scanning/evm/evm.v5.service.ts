import { RpcScanningService } from '../rpc-scanning.service';
import BigNumber from 'bignumber.js';
import { isEmpty, JSONStringify } from '@orbiter-finance/utils';
import { ZeroAddress } from 'ethers6';
import ethers from 'ethers';
export type TransactionResponse = ethers.providers.TransactionResponse;
export type TransactionReceipt = ethers.providers.TransactionReceipt;
export type BlockWithTransactions = any;
export type Block = ethers.providers.Block | BlockWithTransactions;
import EVMV5Utils from './lib/v6';
import { TransferAmountTransaction, TransferAmountTransactionStatus } from '../../transaction/transaction.interface';
import EVMVUtils from './lib/v6';
import { Orbiter5Provider } from '@orbiter-finance/blockchain-account';
export class EVMRpcScanningV5Service extends RpcScanningService {
  #provider: Orbiter5Provider;
  getProvider() {
    const chainConfig = this.chainConfig;
    const rpc = chainConfig.rpc[0];

    if (!this.#provider) {
      this.#provider = new Orbiter5Provider(rpc);
    }
    if (this.#provider && this.#provider.connection.url != rpc) {
      this.logger.info(
        `rpc url changes new ${rpc} old ${this.#provider.connection.url}`,
      );
      this.#provider = new Orbiter5Provider(rpc);
    }
    return this.#provider;
  }
  async getLatestBlockNumber(): Promise<number> {
    const provider = this.getProvider();
    return await provider.getBlockNumber();
  }

  async handleBlock(block: Block): Promise<TransferAmountTransaction[]> {
    const transactions = block.transactions; // TAG: v5/v6 difference
    if (!transactions) {
      this.logger.info(`transactions empty: ${JSONStringify(block)}`);
      throw new Error(`${block.number} transactions empty `);
    }
    const filterBeforeTransactions =
      await this.filterBeforeTransactions<TransactionResponse>(transactions);
    // this.logger.info(`block ${block.number} filterBeforeTransactions: ${JSON.stringify(filterBeforeTransactions.map(tx=> tx.hash))}`)
    if (filterBeforeTransactions.length <= 0) {
      return [];
    }
    const receipts = await Promise.all(
      filterBeforeTransactions.map((tx) => this.retryRequestGetTransactionReceipt(tx.hash)),
    );

    const isErrorTx = receipts.find((row) => !isEmpty(row.error));
    if (isErrorTx) {
      this.logger.error(
        `handleBlock ${block.number
        } retryRequestGetTransactionReceipt error:${JSON.stringify(
          isErrorTx,
        )} `,
      );
      throw new Error(`handleBlock get receipt error ${block.number}`);
    }


    const txTransfersArray = await Promise.all(
      filterBeforeTransactions.map(async (transaction) => {
        const receipt = receipts.find((tx) => tx.hash === transaction.hash);
        if (isEmpty(receipt) || isEmpty(receipt.data)) {
          throw new Error(`${transaction.hash} receipt not found`);
        }
        return this.handleTransaction(transaction, receipt.data);
      }),
    );

    const transfers: TransferAmountTransaction[] = [];
    for (const txTransfers of txTransfersArray) {
      if (txTransfers && txTransfers.length > 0) {
        transfers.push(
          ...txTransfers.map((row) => {
            row.timestamp = block.timestamp * 1000;
            return row;
          }),
        );
      }
    }
    return transfers;
  }

  async handleTransaction(
    transaction: TransactionResponse,
    receipt?: TransactionReceipt,
  ): Promise<TransferAmountTransaction[] | null> {
    try {
      let transfers: TransferAmountTransaction[] = [];
      if (transaction.to == ZeroAddress) {
        return transfers;
      }
      const provider = this.getProvider();
      if (!receipt.blockNumber || !receipt.blockHash) {
        throw new Error(
          `${transaction.hash} ${transaction.blockNumber} receipt block info not exist`,
        );
      }
      // valid toAddress is contract
      if (!receipt) {
        receipt = await provider.getTransactionReceipt(transaction.hash);
      }
      // fix v6/v5 difference
      const receiptHash = receipt.transactionHash;
      receipt['hash'] = receiptHash;
      if (transaction.hash != receiptHash) {
        this.logger.error(`${transaction.hash} Hash inconsistency ${JSONStringify(receipt)}`)
        throw new Error(
          `${transaction.hash}/${receiptHash} Hash inconsistency`,
        );
      }
      const chainConfig = this.chainConfig;
      const { nonce } = transaction;
      const fee = await this.getTransferFee(transaction, receipt);
      const chainId = transaction.chainId || this.chainId;
      if (transaction.chainId && transaction.chainId.toString() != this.chainId) {
        throw new Error(`${transaction.hash} chainId {${transaction.chainId}} != config chainId {${this.chainId}}`)
      }
      const status = receipt.status
        ? TransferAmountTransactionStatus.confirmed
        : TransferAmountTransactionStatus.failed;
      // console.log(`block:${transaction.blockNumber}, hash:${transaction.hash},index:${receipt.index}, status:${receipt.status}`);
      // toAddr is token contract
      const tokenInfo = this.getChainConfigToken(transaction.to);
      const contractInfo = this.getChainConfigContract(transaction.to);
      if (tokenInfo) {
        transfers = EVMV5Utils.evmStandardTokenTransfer(
          chainConfig,
          transaction as any,
          receipt as any,
        );
      } else if (contractInfo) {
        if (contractInfo.name === 'OBSource') {
          transfers = EVMV5Utils.evmOBSource(chainConfig, transaction as any, receipt as any);
        } else if (contractInfo.name === 'OrbiterRouterV1') {
          transfers = EVMV5Utils.evmObRouterV1(chainConfig, transaction as any, receipt as any);
        } else if (EVMV5Utils.name === 'OrbiterRouterV3') {
          const methodId = transaction.data.substring(0, 10);
          if (['0x29723511', '0xf9c028ec'].includes(methodId)) {
            transfers = await this.ctx.contractParser.parseContract(this.chainId, contractInfo.contract, transaction, receipt);
          } else {
            transfers = EVMV5Utils.evmObRouterV3(chainConfig, transaction as any, receipt as any);
          }
        } else if (contractInfo.name === 'CrossInscriptions') {
          transfers = EVMV5Utils.crossInscriptions(
            chainConfig,
            transaction as any,
            receipt as any,
          );
        } else {
          console.log('other contract', contractInfo)
        }
      } else {
        if (transaction.data.length > 14 && transaction.data.substring(0, 14) === '0x646174613a2c') {
          const decodeData = EVMV5Utils.decodeInscriptionCallData(transaction.data);
          if (decodeData) {
            const value = transaction.value.toString();
            transfers.push({
              chainId: String(chainId),
              hash: transaction.hash,
              blockNumber: transaction.blockNumber,
              transactionIndex: receipt.transactionIndex,
              sender: transaction.from,
              receiver: transaction.to,
              amount: new BigNumber(value)
                .div(Math.pow(10, chainConfig.nativeCurrency.decimals))
                .toString(),
              value,
              token: chainConfig.nativeCurrency.address,
              symbol: chainConfig.nativeCurrency.symbol,
              fee: fee.toString(),
              feeToken: chainConfig.nativeCurrency.symbol,
              feeAmount: new BigNumber(fee.toString())
                .div(Math.pow(10, chainConfig.nativeCurrency.decimals))
                .toString(),
              timestamp: 0,
              selector: decodeData.op,
              calldata: decodeData,
              status,
              nonce,
              version: '3',
              receipt
            });
          }
        } else if (transaction.data === '0x' || await provider.getCode(transaction.to) === '0x') {
          // tag:
          const value = transaction.value.toString();
          transfers.push({
            chainId: String(chainId),
            hash: transaction.hash,
            blockNumber: transaction.blockNumber,
            transactionIndex: receipt.transactionIndex,
            sender: transaction.from,
            receiver: transaction.to,
            amount: new BigNumber(value)
              .div(Math.pow(10, chainConfig.nativeCurrency.decimals))
              .toString(),
            value,
            token: chainConfig.nativeCurrency.address,
            symbol: chainConfig.nativeCurrency.symbol,
            fee: fee.toString(),
            feeToken: chainConfig.nativeCurrency.symbol,
            feeAmount: new BigNumber(fee.toString())
              .div(Math.pow(10, chainConfig.nativeCurrency.decimals))
              .toString(),
            timestamp: 0,
            status,
            nonce,
            receipt
          });
        }
      }
      transfers = transfers.map((tx) => {
        tx.transactionIndex = receipt.transactionIndex;
        tx.sender = tx.sender && tx.sender.toLocaleLowerCase();
        tx.receiver = tx.receiver && tx.receiver.toLocaleLowerCase();
        tx.contract = tx.contract && tx.contract.toLocaleLowerCase();
        tx.token = tx.token && tx.token.toLocaleLowerCase();
        tx.nonce = nonce;
        tx.receipt = receipt;
        tx.fee = new BigNumber(fee.toString())
          .dividedBy(transfers.length)
          .toFixed(0);
        tx.feeAmount = new BigNumber(tx.fee)
          .div(Math.pow(10, chainConfig.nativeCurrency.decimals))
          .toString();
        tx.status = status === TransferAmountTransactionStatus.failed ? TransferAmountTransactionStatus.failed : tx.status;
        return tx;
      });
      return await this.handleTransactionAfter(transfers);
    } catch (error) {
      this.logger.error(
        `handleTransaction error ${transaction.hash} `,
        error,
      );
      throw error;
    }
  }
  async handleTransactionAfter(transfers: TransferAmountTransaction[]): Promise<TransferAmountTransaction[]> {
    return transfers.map(transfer => {

      if (transfer.status === TransferAmountTransactionStatus.confirmed) {
        if (!this.ctx.chainConfigService.inValidMainToken(transfer.chainId, transfer.token)) {
          // erc20
          // TAG: event
          if (!transfer.receipt) {
            transfer.status = TransferAmountTransactionStatus.failed;
            return transfer;
          }
          const logs = transfer.receipt.logs;
          const event = EVMVUtils.getTransferEvent(
            logs,
            transfer.sender,
            transfer.receiver,
            transfer.value,
          );
          transfer.status = !isEmpty(event) ? TransferAmountTransactionStatus.confirmed : transfer.status;
        }
      } else {
        // main token

      }
      return transfer;
    });
  }
  async getBlock(blockNumber: number): Promise<Block> {
    const provider = this.getProvider();
    const data = await provider.getBlockWithTransactions(blockNumber);
    if (isEmpty(data)) {
      throw new Error('Block isEmpty');
    }
    return data;
  }
  async getTransactionReceipt(hash: string): Promise<TransactionReceipt> {
    const provider = this.getProvider();
    const receipt = await provider.getTransactionReceipt(hash);
    if (receipt.transactionHash != hash) {
      throw new Error(`provider getTransactionReceipt hash inconsistent expect ${hash} get ${receipt.transactionHash}`);
    }
    return receipt;
  }
  async getTransferFee(
    transaction: TransactionResponse,
    receipt: TransactionReceipt,
  ): Promise<string> {
    const gasUsed = receipt.gasUsed.toString();
    const gasPrice = transaction.gasPrice.toString();
    return new BigNumber(gasUsed).multipliedBy(gasPrice).toFixed(0);
  }
  async filterBeforeTransactions<T>(transactions: T[]): Promise<T[]> {
    const rows = [];
    const contractList = this.chainConfig.contract
      ? Object.keys(this.chainConfig.contract || {}).map((addr) => addr.toLocaleLowerCase())
      : [];

    for (const row of transactions) {
      try {
        if (row['to'] == ZeroAddress) {
          continue;
        }
        const toAddrLower = (row['to'] || "").toLocaleLowerCase();
        const fromAddrLower = (row['from'] || "").toLocaleLowerCase();
        // is to contract addr
        if (contractList.includes(toAddrLower)) {
          rows.push(row);
          continue;
        }
        const senderValid = await this.isWatchAddress(fromAddrLower);
        if (senderValid) {
          // transfer.version = senderValid.version;
          rows.push(row);
          continue;
        }
        const receiverValid = await this.isWatchAddress(toAddrLower);
        if (receiverValid) {
          // transfer.version = receiverValid.version;
          rows.push(row);
          continue;
        }

        if (row['data'] && row['data'] != '0x') {
          const calldata = row['data'].slice(10);
          if (isEmpty(calldata)) {
            continue;
          }
          const tokenInfo = this.ctx.chainConfigService.getTokenByAddress(
            this.chainId,
            toAddrLower,
          );
          if (tokenInfo && EVMV5Utils.isERC20Transfer(row['data'])) {
            // valid from || to
            const result = EVMV5Utils.decodeERC20TransferData(row['data']);
            if (result && result.args) {
              if (!Array.isArray(result.args)) {
                this.logger.error(
                  `filterTransactions error break ${row['hash']
                  } ${JSONStringify(result.args)}`,
                );
                continue;
              }
              const erc20Receiver = result.args[0];
              const receiverValid = await this.isWatchAddress(erc20Receiver);
              if (receiverValid) {
                rows.push(row);
                continue;
              }
            }
          }

          // is to contract addr
          if (contractList.includes(toAddrLower)) {
            // decode
            const transfers = await this.ctx.contractParser.parseContract(this.chainId, toAddrLower, row);
            for (const transfer of transfers) {
              const toAddrLower = (transfer.receiver).toLocaleLowerCase();
              const fromAddrLower = (transfer.sender).toLocaleLowerCase();
              // eoa
              const senderValid = await this.isWatchAddress(fromAddrLower);
              if (senderValid) {
                rows.push(row);
                break;
              }
              const receiverValid = await this.isWatchAddress(toAddrLower);
              if (receiverValid) {
                rows.push(row);
                break;
              }
            }
          }
        }
      } catch (error) {
        this.logger.error(
          `filterTransactions error ${row['hash']}`,
          error,
        );
        throw error;
      }
    }
    return rows;
  }
}

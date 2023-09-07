import { RpcScanningService } from '../rpc-scanning.service';
import BigNumber from 'bignumber.js';
import { provider, isEmpty, JSONStringify } from '@orbiter-finance/utils';
import { ZeroAddress } from 'ethers6';
import {
  Block,
  TransactionReceipt,
  TransactionResponse,
  TransferAmountTransaction,
  TransferAmountTransactionStatus,
} from '../rpc-scanning.interface';
import EVMV5Utils from './lib/v6';
export class EVMRpcScanningV5Service extends RpcScanningService {
  #provider: provider.Orbiter5Provider;
  getProvider() {
    const chainConfig = this.chainConfigService.getChainInfo(this.chainId);
    const rpc = chainConfig.rpc[0];
    if (!this.#provider) {
      this.#provider = new provider.Orbiter5Provider(rpc);
    }
    if (this.#provider && this.#provider.connection.url != rpc) {
      this.logger.info(
        `rpc url changes new ${rpc} old ${this.#provider.connection.url}`,
      );
      this.#provider = new provider.Orbiter5Provider(rpc);
    }
    return this.#provider;
  }
  async getLatestBlockNumber(): Promise<number> {
    const provider = this.getProvider();
    return await provider.getBlockNumber();
  }
  public getScanBlockNumbers(
    lastScannedBlockNumber: number,
    safetyBlockNumber: number,
  ) {
    // return [12867233];
    return super.getScanBlockNumbers(lastScannedBlockNumber, safetyBlockNumber);
  }
  async handleBlock(block: Block): Promise<TransferAmountTransaction[]> {
    const transactions = block.transactions; // TAG: v5/v6 difference
    if (!transactions) {
      throw new Error(`${block.number} transactions empty `);
    }
    const receipts = await Promise.all(
      transactions.map((tx) => this.retryRequestGetTransactionReceipt(tx.hash)),
    );

    const isErrorTx = receipts.find((row) => !isEmpty(row.error));
    if (isErrorTx) {
      this.logger.error(
        `handleBlock ${
          block.number
        } retryRequestGetTransactionReceipt error:${JSON.stringify(
          isErrorTx,
        )} `,
      );
      throw new Error(`receipt error ${block.number}`);
    }

    const filterBeforeTransactions =
      await this.filterBeforeTransactions<TransactionResponse>(transactions);

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
      // if (transaction.to == ZeroAddress || transaction.from == ZeroAddress) {
      //     return transfers;
      // }
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
      receipt.hash = receipt.transactionHash;
      if (transaction.hash != receipt.hash) {
        throw new Error(
          `${transaction.hash}/${receipt.hash} Hash inconsistency`,
        );
      }
      const chainConfig = this.chainConfigService.getChainInfo(this.chainId);
      const { nonce } = transaction;
      const fee = await this.getTransferFee(transaction, receipt);
      const chainId = transaction.chainId || this.chainId;
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
          transaction,
          receipt,
        );
      } else if (contractInfo) {
        transfers = EVMV5Utils.evmContract(
          chainConfig,
          contractInfo,
          transaction,
          receipt,
        );
      } else {
        if (transaction.data === '0x') {
          // tag:
          const value = transaction.value.toString();
          transfers.push({
            chainId: String(chainId),
            hash: transaction.hash,
            blockNumber: transaction.blockNumber,
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
          });
        }
      }
      transfers = transfers.map((tx) => {
        tx.sender = tx.sender && tx.sender.toLocaleLowerCase();
        tx.receiver = tx.receiver && tx.receiver.toLocaleLowerCase();
        tx.contract = tx.contract && tx.contract.toLocaleLowerCase();
        tx.token = tx.token && tx.token.toLocaleLowerCase();
        tx.nonce = nonce;
        tx.fee = new BigNumber(fee.toString())
          .dividedBy(transfers.length)
          .toString();
        tx.feeAmount = new BigNumber(tx.fee)
          .div(Math.pow(10, chainConfig.nativeCurrency.decimals))
          .toString();
        return tx;
      });
      return transfers;
    } catch (error) {
      this.logger.error(
        `handleTransaction error ${transaction.hash} ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getBlock(blockNumber: number): Promise<Block> {
    const provider = this.getProvider();
    const data = await provider.getBlockWithTransactions(blockNumber);
    return data;
  }
  async getTransactionReceipt(hash: string): Promise<TransactionReceipt> {
    const provider = this.getProvider();
    return await provider.getTransactionReceipt(hash);
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
    let contractList = [];
    const chainConfig = this.chainConfigService.getChainInfo(this.chainId);
    if (chainConfig.contract) {
      contractList = Object.keys(chainConfig.contract).map((addr) =>
        addr.toLocaleLowerCase(),
      );
    }

    for (const row of transactions) {
      try {
        if (row['to'] == ZeroAddress) {
          continue;
        }
        const senderValid = await this.mdcService.validMakerOwnerAddress(
          row['from'],
        );
        if (senderValid.exist) {
          rows.push(row);
          continue;
        }
        const receiverValid = await this.mdcService.validMakerOwnerAddress(
          row['to'],
        );
        if (receiverValid.exist) {
          rows.push(row);
          continue;
        }
        const senderResponseValid =
          await this.mdcService.validMakerResponseAddress(row['from']);
        if (senderResponseValid.exist) {
          rows.push(row);
          continue;
        }
        const receiverResponseValid =
          await this.mdcService.validMakerResponseAddress(row['to']);
        if (receiverResponseValid.exist) {
          rows.push(row);
          continue;
        }
        // is fllow contract
        if (contractList.includes(row['to'])) {
          rows.push(row);
          continue;
        }
        if (row['data'] && row['data'] != '0x') {
          const tokenInfo = this.chainConfigService.getTokenByAddress(
            this.chainId,
            row['to'],
          );
          if (tokenInfo && EVMV5Utils.isERC20Transfer(row['data'])) {
            // verift from || to
            const result = EVMV5Utils.decodeERC20TransferData(row['data']);
            if (result && result.args) {
              if (!Array.isArray(result.args)) {
                this.logger.error(
                  `filterTransactions error break ${
                    row['hash']
                  } ${JSONStringify(result.args)}`,
                );
                continue;
              }
              const erc20Receiver = result.args[0];
              const senderValid =
                await this.mdcService.validMakerOwnerAddress(erc20Receiver);
              if (senderValid.exist) {
                rows.push(row);
                continue;
              }
              const receiverValid =
                await this.mdcService.validMakerOwnerAddress(erc20Receiver);
              if (receiverValid.exist) {
                rows.push(row);
                continue;
              }
            }
          }
        }
      } catch (error) {
        this.logger.error(
          `filterTransactions error ${row['hash']} ${error.message}`,
          error.stack,
        );
        throw error;
      }
    }
    return transactions;
  }
}

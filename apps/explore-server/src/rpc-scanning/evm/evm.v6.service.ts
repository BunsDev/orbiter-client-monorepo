import {
  TransactionResponse,
  TransactionReceipt,
  ZeroAddress,
  Block,
  ethers,
  isAddress
} from 'ethers6';
import { provider, isEmpty, JSONStringify } from '@orbiter-finance/utils';
import { RpcScanningService } from '../rpc-scanning.service';
import BigNumber from 'bignumber.js';
import {
  RetryBlockRequestResponse,
  TransferAmountTransaction,
  TransferAmountTransactionStatus,
} from '../rpc-scanning.interface';
import EVMV6Utils from './lib/v6';

export class EVMRpcScanningV6Service extends RpcScanningService {
  #provider: provider.Orbiter6Provider;
  getProvider() {
    const rpc = this.chainConfig.rpc[0];
    if (!this.#provider) {
      this.#provider = new provider.Orbiter6Provider(rpc);
    }
    if (this.#provider && this.#provider.getUrl() != rpc) {
      this.logger.info(
        `rpc url changes new ${rpc} old ${this.#provider.getUrl()}`,
      );
      this.#provider = new provider.Orbiter6Provider(rpc);
    }
    return this.#provider;
  }

  async getLatestBlockNumber(): Promise<number> {
    const provider = this.getProvider();
    return await provider.getBlockNumber();
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
        const senderValid = await this.ctx.makerService.isWhiteWalletAddress(fromAddrLower);
        if (senderValid.exist) {
          // transfer.version = senderValid.version;
          rows.push(row);
          continue;
        }
        const receiverValid = await this.ctx.makerService.isWhiteWalletAddress(toAddrLower);
        if (receiverValid.exist) {
          // transfer.version = receiverValid.version;
          rows.push(row);
          continue;
        }
        if (row['data'] && row['data'] != '0x') {
          const tokenInfo = this.ctx.chainConfigService.getTokenByAddress(
            this.chainId,
            toAddrLower,
          );
          if (tokenInfo && EVMV6Utils.isERC20Transfer(row['data'])) {
            // valid from || to
            const result = EVMV6Utils.decodeERC20TransferData(row['data']);
            if (result && result.args) {
              if (!Array.isArray(result.args)) {
                this.logger.error(
                  `filterTransactions error break ${row['hash']
                  } ${JSONStringify(result.args)}`,
                );
                continue;
              }
              const erc20Receiver = result.args[0];
              const senderValid =
                await this.ctx.makerService.isWhiteWalletAddress(erc20Receiver);
              if (senderValid.exist) {
                rows.push(row);
                continue;
              }
            }
          }
        }
      } catch (error) {
        this.logger.error(
          `filterTransactions error ${row['hash']} `, error,
        );
        throw error;
      }
    }
    return rows;
  }
  async filterTransfers(transfers: TransferAmountTransaction[]) {
    transfers =  await super.filterTransfers(transfers)
    return transfers.filter(row=> {
      if(isAddress(row.sender) && isAddress(row.receiver)) {
        return true;
      }
      this.logger.warn(`${row.hash} Address format verification failed ${JSON.stringify(row)}`)
      return false;
    })
  }

  async handleBlock(block: Block): Promise<TransferAmountTransaction[]> {
    if (!block) {
      throw new Error(`Get Block Empty`);
    }
    const transactions = block.prefetchedTransactions;
    if (!transactions) {
      this.logger.info(`transactions empty: ${JSONStringify(block)}`);
      throw new Error(`${block.number} transactions empty `);
    }

    const filterBeforeTransactions =
      await this.filterBeforeTransactions<TransactionResponse>(transactions);
    // this.logger.info(`block ${block.number} filterBeforeTransactions: ${JSON.stringify(filterBeforeTransactions.map(tx=> tx.hash))}`)
    if (filterBeforeTransactions.length<=0) {
      return [];
    }
    const receipts = await Promise.all(
      filterBeforeTransactions.map((tx) => this.retryRequestGetTransactionReceipt(tx.hash)),
    );
    const isErrorTx = receipts.find((row) => !isEmpty(row.error));
    if (isErrorTx) {
      this.logger.error(
        `handleBlock ${block.number
        } retryRequestGetTransactionReceipt error:${JSON.stringify(isErrorTx)}`,
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

  public async getBlocks(
    blockNumbers: number[],
  ): Promise<RetryBlockRequestResponse[]> {
    const action = 'getBlocks'
    const params = {
      chainInfo: this.chainConfig,
      blockNumbers,
    }
    const blocks = await this.ctx.workerService.runTask(action, params);
    return blocks;
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
      if (transaction.hash != receipt.hash) {
        this.logger.error(`${transaction.hash}/${receipt.hash} Hash inconsistency ${JSONStringify({
          receipt,
          transaction
        })}`)
        throw new Error(
          `${transaction.hash}/${receipt.hash} Hash inconsistency`,
        );
      }
      const chainConfig = this.chainConfig;
      const { nonce } = transaction;
      const fee = await this.getTransferFee(transaction, receipt);
      const chainId = transaction.chainId || this.chainId;
      const status = +receipt.status
        ? TransferAmountTransactionStatus.confirmed
        : TransferAmountTransactionStatus.failed;
      // toAddr is token contract
      const tokenInfo = this.getChainConfigToken(transaction.to);
      const contractInfo = this.getChainConfigContract(transaction.to);
      if (tokenInfo) {
        if (EVMV6Utils.isERC20Transfer(transaction.data)) {
          transfers = EVMV6Utils.evmStandardTokenTransfer(
            chainConfig,
            transaction,
            receipt,
          );
        }
      } else if (contractInfo) {
        transfers = EVMV6Utils.evmContract(
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
            receipt
          });
        }
      }
      transfers = transfers.map((tx) => {
        tx.sender = tx.sender && tx.sender.toLocaleLowerCase();
        tx.receiver = tx.receiver && tx.receiver.toLocaleLowerCase();
        tx.contract = tx.contract && tx.contract.toLocaleLowerCase();
        tx.token = tx.token && tx.token.toLocaleLowerCase();
        tx.nonce = nonce;
        tx.receipt = receipt;
        tx.fee = new BigNumber(fee.toString())
          .dividedBy(transfers.length)
          .toString();
        tx.feeAmount = new BigNumber(tx.fee)
          .div(Math.pow(10, chainConfig.nativeCurrency.decimals))
          .toString();

        tx.status = status === TransferAmountTransactionStatus.failed ?TransferAmountTransactionStatus.failed:tx.status;
        return tx;
      });
      return transfers;
    } catch (error) {
      console.error(error);
      this.logger.error(
        `handleTransaction error ${transaction.hash}`,
        error,
      );
      throw error;
    }
  }

  async getBlock(blockNumber: number): Promise<Block> {
    const provider = this.getProvider();
    const data = await provider.getBlock(blockNumber, true);
    return data;
  }
  async getTransactionReceipt(hash: string): Promise<TransactionReceipt> {
    const provider = this.getProvider();
    const receipt = await provider.getTransactionReceipt(hash);
    if (!receipt) {
      throw new Error(`${hash} receipt empty`);
    }
    if (receipt.hash!=hash) {
      throw new Error(`provider getTransactionReceipt hash inconsistent expect ${hash} get ${receipt.hash}`);
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
}

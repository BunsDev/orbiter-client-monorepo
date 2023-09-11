import {
  TransactionResponse,
  TransactionReceipt,
  ZeroAddress,
  Block,
} from 'ethers6';
import { provider, isEmpty, JSONStringify } from '@orbiter-finance/utils';
import { RpcScanningService } from '../rpc-scanning.service';
import BigNumber from 'bignumber.js';
import {
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
  public getScanBlockNumbers(
    lastScannedBlockNumber: number,
    safetyBlockNumber: number,
  ) {
    return super.getScanBlockNumbers(lastScannedBlockNumber, safetyBlockNumber);
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
        const senderValid = await this.ctx.mdcService.validMakerOwnerAddress(
          fromAddrLower,
        );
        if (senderValid.exist) {
          rows.push(row);
          continue;
        }
        const receiverValid = await this.ctx.mdcService.validMakerOwnerAddress(
          toAddrLower,
        );
        if (receiverValid.exist) {
          rows.push(row);
          continue;
        }
        const senderResponseValid =
          await this.ctx.mdcService.validMakerResponseAddress(fromAddrLower);
        if (senderResponseValid.exist) {
          rows.push(row);
          continue;
        }
        const receiverResponseValid =
          await this.ctx.mdcService.validMakerResponseAddress(toAddrLower);
        if (receiverResponseValid.exist) {
          rows.push(row);
          continue;
        }
        // is to contract addr
        if (contractList.includes(toAddrLower)) {
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
                await this.ctx.mdcService.validMakerOwnerAddress(erc20Receiver);
              if (senderValid.exist) {
                rows.push(row);
                continue;
              }
              const receiverValid =
                await this.ctx.mdcService.validMakerOwnerAddress(erc20Receiver);
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
    return rows;
  }

  async handleBlock(block: Block): Promise<TransferAmountTransaction[]> {
    const transactions = block.prefetchedTransactions;
    if (!transactions) {
      throw new Error(`${block.number} transactions empty `);
    }
 
    const filterBeforeTransactions =
      await this.filterBeforeTransactions<TransactionResponse>(transactions);
    this.logger.info(`block ${block.number} filterBeforeTransactions: ${filterBeforeTransactions.map(tx=> tx.hash)}`)
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
      throw new Error(`receipt error ${block.number}`);
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
      const status = receipt.status
        ? TransferAmountTransactionStatus.confirmed
        : TransferAmountTransactionStatus.failed;
      // console.log(`block:${transaction.blockNumber}, hash:${transaction.hash},index:${receipt.index}, status:${receipt.status}`);
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
        return tx;
      });
      return transfers;
    } catch (error) {
      console.error(error);
      this.logger.error(
        `handleTransaction error ${transaction.hash} ${error.message}`,
        error.stack,
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

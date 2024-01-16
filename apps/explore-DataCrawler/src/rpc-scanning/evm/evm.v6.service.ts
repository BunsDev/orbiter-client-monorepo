import {
  TransactionResponse,
  TransactionReceipt,
  ZeroAddress,
  Block,
  Network
} from 'ethers6';
import { isEmpty, JSONStringify } from '@orbiter-finance/utils';
import { RpcScanningService } from '../rpc-scanning.service';
import BigNumber from 'bignumber.js';


import EVMV6Utils from './lib/v6';
import { TransferAmountTransaction, TransferAmountTransactionStatus } from '../../transaction/transaction.interface';
import { Orbiter6Provider } from '@orbiter-finance/blockchain-account';

export class EVMRpcScanningV6Service extends RpcScanningService {

  #provider: Orbiter6Provider;
  getProvider() {
    const rpc = this.chainConfig.rpc[0];
    const network = new Network(this.chainConfig.name, this.chainConfig.chainId);
    if (!this.#provider) {
      const provider = new Orbiter6Provider(rpc,
        network, {
        staticNetwork: network,
      });
      this.#provider = provider;
    }
    if (this.#provider && this.#provider.getUrl() != rpc) {
      this.logger.info(
        `rpc url changes new ${rpc} old ${this.#provider.getUrl()}`,
      );
      this.#provider = new Orbiter6Provider(rpc, network, {
        staticNetwork: network
      });
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
        // eoa
        const senderValid = await this.isWatchAddress(fromAddrLower);
        if (senderValid) {
          rows.push(row);
          continue;
        }
        const receiverValid = await this.isWatchAddress(toAddrLower);
        if (receiverValid) {
          rows.push(row);
          continue;
        }
        // end eoa
        if (row['data'] && row['data'] != '0x') {
          const calldata = row['data'].slice(10);
          if (isEmpty(calldata)) {
            continue;
          }
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
                await this.isWatchAddress(erc20Receiver);
              if (senderValid) {
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
          `filterTransactions error ${row['hash']} `, error,
        );
        throw error;
      }
    }
    return rows;
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
      if (transaction.chainId && transaction.chainId.toString() != this.chainId) {
        throw new Error(`${transaction.hash} chainId {${transaction.chainId}} != config chainId {${this.chainId}}`)
      }
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
        if (contractInfo.name === 'OBSource') {
          transfers = EVMV6Utils.evmOBSource(chainConfig, transaction, receipt);
        } else if (contractInfo.name === 'OrbiterRouterV1') {
          transfers = EVMV6Utils.evmObRouterV1(chainConfig, transaction, receipt);
        } else if (contractInfo.name === 'OrbiterRouterV3') {
          const methodId = transaction.data.substring(0,10);
          if(['0x29723511', '0xf9c028ec'].includes(methodId)) {
            transfers = await this.ctx.contractParser.parseContract(this.chainId, contractInfo.contract, transaction, receipt);
          } else {
            transfers = EVMV6Utils.evmObRouterV3(chainConfig, transaction, receipt);
          }
      
        } else if (contractInfo.name === 'CrossInscriptions') {
          transfers = EVMV6Utils.crossInscriptions(
            chainConfig,
            transaction,
            receipt,
          );
        } else {
          transfers = await this.ctx.contractParser.parseContract(this.chainId, contractInfo.contract, transaction, receipt);
          console.log('other contract', contractInfo, transfers)
        }
      } else {
        // 0x646174613a2c
        if (transaction.data.length > 14 && transaction.data.substring(0, 14) === '0x646174613a2c') {
          const decodeData = EVMV6Utils.decodeInscriptionCallData(transaction.data)
          if (decodeData) {
            const value = transaction.value.toString();
            transfers.push({
              chainId: String(chainId),
              hash: transaction.hash,
              blockNumber: transaction.blockNumber,
              transactionIndex: transaction.index,
              sender: transaction.from,
              receiver: transaction.to,
              amount: new BigNumber(value)
                .div(Math.pow(10, chainConfig.nativeCurrency.decimals))
                .toString(),
              value,
              calldata: decodeData,
              token: chainConfig.nativeCurrency.address,
              symbol: chainConfig.nativeCurrency.symbol,
              fee: fee.toString(),
              feeToken: chainConfig.nativeCurrency.symbol,
              feeAmount: new BigNumber(fee.toString())
                .div(Math.pow(10, chainConfig.nativeCurrency.decimals))
                .toString(),
              timestamp: 0,
              selector: decodeData.op,
              version: '3',
              status,
              nonce,
              receipt
            })
          }
        }
        else if (transaction.data === '0x' || (transaction.to && await provider.getCode(transaction.to) === '0x')) {
          const value = transaction.value.toString();
          transfers.push({
            chainId: String(chainId),
            hash: transaction.hash,
            blockNumber: transaction.blockNumber,
            transactionIndex: transaction.index,
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
        tx.transactionIndex = receipt.index;
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
        `${this.chainConfig.name} handleTransaction error ${transaction.hash}`,
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
          const event = EVMV6Utils.getTransferEvent(
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
    const data = await provider.getBlock(blockNumber, true);
    if (isEmpty(data)) {
      throw new Error('Block isEmpty');
    }
    return data;
  }
  async getTransactionReceipt(hash: string): Promise<TransactionReceipt> {
    const provider = this.getProvider();
    const receipt = await provider.getTransactionReceipt(hash);
    if (!receipt) {
      throw new Error(`${hash} receipt empty`);
    }
    if (receipt.hash != hash) {
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

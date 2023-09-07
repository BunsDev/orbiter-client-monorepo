import {
  TransferAmountTransaction,
  TransferAmountTransactionStatus,
} from '../rpc-scanning.interface';
import { RpcScanningService } from '../rpc-scanning.service';
import {
  isEmpty,
  equals,
  splitArrayBySize,
  fix0xPadStartAddress,
  sleep
} from '@orbiter-finance/utils';
import {
  ExecuteCalldata,
  CalldataArg,
  StarknetChainId,
} from './starknet.interface';
import BigNumber from 'bignumber.js';
import { RpcProvider, RPC } from 'starknet';
export class StarknetRpcScanningService extends RpcScanningService {
  #provider: RpcProvider;
  init() {
    this.batchLimit = 5;
    this.requestTimeout = 1000 * 60 * 2;
  }
  getProvider() {
    const chainConfig = this.chainConfig;
    const chainId = StarknetChainId[this.chainId];
    if (!this.#provider) {
      this.#provider = new RpcProvider({
        nodeUrl: chainConfig.rpc[0],
        chainId,
      });
    }
    if (this.#provider && this.#provider.nodeUrl != chainConfig.rpc[0]) {
      this.#provider = new RpcProvider({
        nodeUrl: chainConfig.rpc[0],
        chainId,
      });
    }
    return this.#provider;
  }
  public getScanBlockNumbers(
    lastScannedBlockNumber: number,
    safetyBlockNumber: number,
  ) {
    return super.getScanBlockNumbers(lastScannedBlockNumber, safetyBlockNumber);
  }

  async getLatestBlockNumber(): Promise<number> {
    const provider = this.getProvider();
    const block = await provider.getBlockNumber();
    return block;
  }
  async filterBeforeTransactions<T>(transactions: T[]): Promise<T[]> {
    return transactions.filter((tx) => {
      if (tx['type'] === 'INVOKE') {
        const executeCalldata = this.decodeExecuteCalldata(tx['calldata']);
        if (executeCalldata) {
          const parseData = this.parseContractCallData(executeCalldata);
          return parseData && parseData.length > 0;
        }
      }
      return false;
    });
  }
  async handleBlock(
    block: RPC.GetBlockWithTxs,
  ): Promise<TransferAmountTransaction[]> {
    const transactions = block.transactions;
    const blockNumber = block['block_number'];
    if (!transactions) {
      throw new Error(`${blockNumber} transactions empty `);
    }
    const receipts = await Promise.all(
      transactions.map((tx) =>
        this.retryRequestGetTransactionReceipt(tx.transaction_hash),
      ),
    );

    const isErrorTx = receipts.find((row) => !isEmpty(row.error));
    if (isErrorTx) {
      this.logger.error(
        `handleBlock ${blockNumber} retryRequestGetTransactionReceipt error:${JSON.stringify(
          isErrorTx,
        )}`,
      );
      throw new Error(`receipt error ${blockNumber}`);
    }

    const filterBeforeTransactions =
      await this.filterBeforeTransactions<any>(transactions);

    const txTransfersArray = await Promise.all(
      filterBeforeTransactions.map(async (transaction) => {
        const receipt = receipts.find(
          (tx) => tx.hash === transaction.transaction_hash,
        );
        if (isEmpty(receipt.data)) {
          this.logger.warn(`${transaction.transaction_hash} receipt not found`);
          return [];
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
  private getStatus(receipt: any): TransferAmountTransactionStatus {
    const status = receipt['status'] || receipt['finality_status'];
    if (['ACCEPTED_ON_L1', 'ACCEPTED_ON_L2'].includes(status)) {
      return TransferAmountTransactionStatus.confirmed;
    } else if (['PENDING'].includes(status)) {
      return TransferAmountTransactionStatus.pending;
    }
    if (
      receipt['execution_status'] &&
      receipt['execution_status'] != 'SUCCEEDED'
    ) {
      return TransferAmountTransactionStatus.failed;
    }
    return TransferAmountTransactionStatus.failed;
  }
  async handleTransaction(
    transaction: any,
    receipt?: RPC.TransactionReceipt,
  ): Promise<TransferAmountTransaction[]> {
    const executeCalldata = this.decodeExecuteCalldata(transaction.calldata);
    if (!executeCalldata || executeCalldata.callArray.length <= 0) {
      return [];
    }
    const parseData = this.parseContractCallData(executeCalldata);
    const transfers: TransferAmountTransaction[] = [];
    if (transaction.type != 'INVOKE') {
      return [];
    }
    if (!receipt || !receipt['block_number']) {
      this.logger.error(
        `${transaction.transaction_hash} The block number in the transaction receipt does not exist`,
      );
      throw new Error(
        `${transaction.transaction_hash} The block number in the transaction receipt does not exist`,
      );
    }
    const chainConfig = this.chainConfig;
    const fee = new BigNumber(receipt['actual_fee']);
    for (const row of parseData) {
      try {
        const to = fix0xPadStartAddress(row.to, 66);
        const args = row.args;
        const transfer: TransferAmountTransaction = {
          chainId: String(this.chainId),
          hash: fix0xPadStartAddress(receipt.transaction_hash, 66),
          blockNumber: receipt['block_number'],
          sender: fix0xPadStartAddress(transaction.sender_address, 66),
          receiver: null,
          value: null,
          amount: null,
          token: null,
          symbol: null,
          fee: fee.toFixed(0),
          feeToken: chainConfig.nativeCurrency.symbol,
          feeAmount: fee
            .div(Math.pow(10, chainConfig.nativeCurrency.decimals))
            .toString(),
          timestamp: 0,
          status: this.getStatus(receipt),
          nonce: +transaction.nonce,
          calldata: args,
          selector: row.selector,
          signature: row.signature,
          receipt: receipt,
        };
        if (row.name) {
          let isMatch = false;
          if (row.name === 'transfer') {
            transfer.receiver = fix0xPadStartAddress(args[0], 66);
            transfer.token = fix0xPadStartAddress(to, 66);
            const value = new BigNumber(args[1]);
            transfer.value = value.toFixed(0);
            // transfer.contract = transfer.token;
            const tokenInfo = this.getChainConfigToken(to);
            if (tokenInfo) {
              transfer.symbol = tokenInfo.symbol;
              transfer.amount = value
                .div(Math.pow(10, tokenInfo.decimals))
                .toString();
            }
            isMatch = true;
          } else if (row.name === 'sign_pending_multisig_transaction') {
            // find
            const transferData = args[1].slice(-5) as any;
            const tokenAddrss = fix0xPadStartAddress(transferData[0], 66);
            transfer.receiver = fix0xPadStartAddress(transferData[1], 66);
            transfer.token = tokenAddrss;
            const value = new BigNumber(transferData[2]);
            transfer.value = value.toFixed(0);
            transfer.calldata = transferData;
            const tokenInfo = this.getChainConfigToken(tokenAddrss);
            if (tokenInfo) {
              transfer.symbol = tokenInfo.symbol;
              transfer.amount = value
                .div(Math.pow(10, tokenInfo.decimals))
                .toString();
            }
            isMatch = true;
          } else if (row.name === 'transferERC20') {
            const tokenAddress = fix0xPadStartAddress(args[0], 66);
            transfer.token = tokenAddress;
            transfer.receiver = fix0xPadStartAddress(args[1], 66);
            const value = new BigNumber(args[2]);
            transfer.value = value.toFixed(0);
            transfer.contract = to;
            const tokenInfo = this.getChainConfigToken(tokenAddress);
            if (tokenInfo) {
              transfer.symbol = tokenInfo.symbol;
              transfer.amount = value
                .div(Math.pow(10, tokenInfo.decimals))
                .toString();
            }
            isMatch = true;
          }
          if (isMatch) {
            // 0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9 = transfer event topic
            const events = receipt['events'].filter(
              (e) =>
                e.keys[0] ===
                '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9' &&
                equals(
                  fix0xPadStartAddress(e.from_address, 66),
                  transfer.token,
                ),
            );
            const transferEvent = events.find((ev) => {
              const fromAddress = fix0xPadStartAddress(ev.data[0], 66);
              const toAddress = fix0xPadStartAddress(ev.data[1], 66);
              const value = new BigNumber(ev.data[2]).toFixed(0);
              return (
                equals(fromAddress, transfer.sender) &&
                equals(toAddress, transfer.receiver) &&
                equals(value, transfer.value)
              );
            });
            if (transferEvent) {
              if (transfers.length > 0) {
                transfer.hash = `${transfer.hash}#${row.index}`;
              }
              transfers.push(transfer);
            } else {
              this.logger.error(
                `${transfer.hash} not find event ${JSON.stringify(row)}`,
              );
            }
          }
        }
      } catch (error) {
        this.logger.error(
          `handleTransaction for calldata ${row.name} error ${error.message}`,
          error.stack,
        );
        throw error;
      }
    }
    return transfers.map((tx) => {
      tx.fee = new BigNumber(fee.toString())
        .dividedBy(transfers.length)
        .toString();
      tx.feeAmount = new BigNumber(tx.fee)
        .div(Math.pow(10, chainConfig.nativeCurrency.decimals))
        .toString();
      return tx;
    });
  }
  decodeExecuteCalldata(inputs: string[]): ExecuteCalldata {
    if (!inputs) {
      return undefined;
    }
    try {
      let index = 0;
      const callArrayLen = +inputs[index];
      if (callArrayLen > 0) {
        index += 1;
        const callArray = inputs.slice(index, callArrayLen * 4 + 1);
        index += callArrayLen * 4;
        const calldataLen = +inputs[index];
        index += 1;
        const calldata = inputs.slice(index, calldataLen + index);
        return {
          callArrayLen: callArrayLen,
          callArray: splitArrayBySize(callArray, 4),
          calldataLen: calldataLen,
          calldata,
        };
      }
    } catch (error) {
      this.logger.error(
        `decodeExecuteCalldata error ${JSON.stringify(inputs)} ${error.message
        }`,
        error.stack,
      );
      throw error;
    }
  }
  parseContractCallData(data: ExecuteCalldata): CalldataArg[] {
    try {
      const calldata: CalldataArg[] = [];
      let index = 0;
      let opIndex = -1;
      for (const items of data.callArray) {
        const argStart = +items[2];
        index += Number(items[3]);
        opIndex++;
        const result: CalldataArg = {
          name: '',
          signature: '',
          to: items[0],
          selector: items[1],
          args: data.calldata.slice(argStart, index),
          index: opIndex,
        };
        if (
          result.selector ===
          '0x1a256b309f5305c9cebef13e453384c78753c556a1b339faddc674a1950d228'
        ) {
          // sign_pending_multisig_transaction
          result.name = 'sign_pending_multisig_transaction';
          result.signature =
            'sign_pending_multisig_transaction(felt,felt*,felt,felt,felt)';
          result.args = this.parseSignPendingMultisigCalldata(result.args);
          calldata.push(result);
        } else if (
          result.selector ===
          '0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e'
        ) {
          // transfer token
          result.name = 'transfer';
          result.signature = 'transfer(felt,Uint256)';
          calldata.push(result);
        } else if (
          result.selector ===
          '0x68bcbdba7cc8cac2832d23e2c32e9eec39a9f1d03521eff5dff800a62725fa' &&
          result.to ===
          '0x173f81c529191726c6e7287e24626fe24760ac44dae2a1f7e02080230f8458b'
        ) {
          // orbiter contract
          result.name = 'transferERC20';
          result.signature = 'transferERC20(felt,felt,Uint256,felt)';
          calldata.push(result);
        }
        // else if (
        //   result.selector ===
        //   '0x219209e083275171774dab1df80982e9df2096516f06319c5c6d71ae0a8480c'
        // ) {
        //   result.name = 'approve';
        //   result.signature = 'approve(felt,Uint256)';
        //   calldata.push(result);
        // }
      }
      return calldata;
    } catch (error) {
      this.logger.error(
        `parseContractCallData error ${JSON.stringify(data)} ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
  parseSignPendingMultisigCalldata(inputs: string[]): any[] {
    let index = 0;
    const call_array_len = +inputs[index];
    index = 1;
    const pending_calldata = inputs.slice(index, call_array_len + index);
    index = call_array_len + index;
    const pending_nonce = +inputs[index]; // TODO: Inconsistent with the nonce calculated by the block browser
    index++;
    const pending_max_fee = BigInt(+inputs[index]).toString();
    index++;
    const pending_transaction_version = +inputs[index];
    const calldata = [
      call_array_len,
      pending_calldata,
      pending_nonce,
      pending_max_fee,
      pending_transaction_version,
    ];
    return calldata;
  }
  async getBlock(blockNumber: number): Promise<RPC.GetBlockWithTxs> {
    const provider = this.getProvider();
    const result = await provider.getBlockWithTxs(blockNumber);
    return result;
  }
  async requestTransactionReceipt(hash: string, timeoutMs: number) {
    try {
      const data = await Promise.race([
        this.getTransactionReceipt(hash),
        sleep(timeoutMs).then(() => {
          throw new Error('Block request timed out');
        }),
      ]);
      return data;
    } catch (error) {
      if (error.message.includes('-32603')) {
        return null;
      }
      throw new Error(
        `Failed to request transaction receipt: ${hash} ${error.message}`,
      );
    }
  }

  async getTransactionReceipt(hash: string): Promise<RPC.TransactionReceipt> {
    const provider = this.getProvider();
    const data = await provider.getTransactionReceipt(hash);
    return data;
  }
}

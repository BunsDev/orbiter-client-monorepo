import { RpcScanningService } from '../rpc-scanning.service';
import {
  isEmpty,
  equals,
  splitArrayBySize,
  fix0xPadStartAddress,
  sleep,
  JSONStringify
} from '@orbiter-finance/utils';
import {
  ExecuteCalldata,
  CalldataArg,
  StarknetChainId,
} from './starknet.interface';
import BigNumber from 'bignumber.js';
import { RpcProvider, RPC } from 'starknet';
import { TransferAmountTransaction, TransferAmountTransactionStatus } from '../../transaction/transaction.interface';
export class StarknetRpcScanningService extends RpcScanningService {
  #provider: RpcProvider;
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

  async getLatestBlockNumber(): Promise<number> {
    const provider = this.getProvider();
    const block = await provider.getBlockNumber();
    return block;
  }
  async filterBeforeTransactions<T>(transactions: T[]): Promise<T[]> {
    return transactions.filter((tx) => {
      if (tx['type'] === 'INVOKE') {
        // TODO: 
        const executeCalldata = this.decodeExecuteCalldataCairo0(tx['calldata']);
        if (executeCalldata && executeCalldata.length > 0) {
          return true;
        }
        const executeCalldata2 = this.decodeExecuteCalldataCairo1(tx['calldata']);
        if (executeCalldata2 && executeCalldata2.length > 0) {
          return true;
        }
        return false;
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
    const filterBeforeTransactions = await this.filterBeforeTransactions<any>(transactions);
    if (filterBeforeTransactions.length <= 0) {
      return [];
    }
    const receipts = await Promise.all(
      filterBeforeTransactions.map((tx) =>
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
      throw new Error(`handleBlock block receipt ${blockNumber} ${JSONStringify(isErrorTx)}`);
    }


    const txTransfersArray = await Promise.all(
      filterBeforeTransactions.map(async (transaction) => {
        const receipt = receipts.find(
          (tx) => tx.hash === transaction.transaction_hash,
        );
        if (isEmpty(receipt) || isEmpty(receipt.data)) {
          throw new Error(`${transaction.transaction_hash} receipt not found`);
        }
        if (receipt.data['finality_status'] === 'REVERTED') {
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
    if (receipt['finality_status'] && receipt['execution_status']) {
      // cairo 1
      if (receipt['execution_status'] === 'SUCCEEDED') {
        // if (receipt['finality_status'] === 'ACCEPTED_ON_L2') {
        //   return TransferAmountTransactionStatus.confirmed;
        // }
        // return TransferAmountTransactionStatus.pending;
        return TransferAmountTransactionStatus.confirmed;
      } else if (receipt['execution_status'] === 'REVERTED' || receipt['execution_status'] === 'REJECTED') {
        return TransferAmountTransactionStatus.failed;
      }
    } else {
      // cairo 0
      const status = receipt['status'];
      if (['ACCEPTED_ON_L1', 'ACCEPTED_ON_L2'].includes(status)) {
        return TransferAmountTransactionStatus.confirmed;
      } else if (['PENDING'].includes(status)) {
        return TransferAmountTransactionStatus.pending;
      }
    }
    return TransferAmountTransactionStatus.failed;
  }
  async handleTransaction(
    transaction: any,
    receipt?: RPC.TransactionReceipt,
  ): Promise<TransferAmountTransaction[]> {
    let parseData = this.decodeExecuteCalldataCairo0(transaction.calldata);
    if (!parseData || parseData.length <= 0) {
      parseData = this.decodeExecuteCalldataCairo1(transaction.calldata) as any;
    }
    if (!parseData) {
      return [];
    }
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
        if (parseData.length > 1) {
          transfer.hash = `${transfer.hash}#${row.index}`;
        }
        if (row.name) {
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
            transfers.push(transfer);
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
            transfers.push(transfer);
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
            transfers.push(transfer);
          }
        }
      } catch (error) {
        this.logger.error(
          `handleTransaction for calldata ${row.name} error`,
          error,
        );
        throw error;
      }
    }
    // valid event
    for (const transfer of transfers) {
      if (transfer.status === TransferAmountTransactionStatus.confirmed) {
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
        transfer.status = isEmpty(transferEvent) ? TransferAmountTransactionStatus.failed : transfer.status;
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
  decodeExecuteCalldataCairo0(inputs: string[]): CalldataArg[] {
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
        const data = {
          callArrayLen: callArrayLen,
          callArray: splitArrayBySize(callArray, 4),
          calldataLen: calldataLen,
          calldata,
        };
        return this.parseContractCallData(data);
      }
    } catch (error) {
      this.logger.error(
        `decodeExecuteCalldata V1 error ${JSON.stringify(inputs)}`,
        error,
      );
      throw error;
    }
  }
  decodeExecuteCalldataCairo1(inputs: string[]): CalldataArg[] {
    if (!inputs) {
      return undefined;
    }
    try {
      const result: object[] = [];
      let currentIndex = 1;

      while (currentIndex < inputs.length) {
        const length = +inputs[0];
        if (length<=0) {
          break;
        }
        for (let i = 0; i < length; i++) {
          const calldataValueLength = +inputs[currentIndex + 2];
          const calldataValue = inputs.slice(currentIndex + 3, currentIndex + 2 + calldataValueLength + 1)
          const selector = inputs[currentIndex + 1];
          const to = inputs[currentIndex];
          const calldataObject = {
            name: '',
            signature: '',
            to,
            selector,
            index: result.length,
            args: calldataValue,
          };
          const selectorItem = this.getSelectorName(to, selector);
          if (selectorItem) {
            calldataObject.name = selectorItem.name;
            calldataObject.signature = selectorItem.signature;
            result.push(calldataObject);
          }
          currentIndex += calldataValueLength + 3;
        }

      }
      return result as any;
    } catch (error) {
      this.logger.error(
        `decodeExecuteCalldata V2 error ${JSON.stringify(inputs)}`,
        error,
      );
      return null
    }
  }
  getSelectorName(to: string, selector: string) {
    if (
      selector ===
      '0x1a256b309f5305c9cebef13e453384c78753c556a1b339faddc674a1950d228'
    ) {
      return {
        name: 'sign_pending_multisig_transaction',
        signature: 'sign_pending_multisig_transaction(felt,felt*,felt,felt,felt)'
      }
    } else if (
      selector ===
      '0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e'
    ) {
      return {
        name: 'transfer',
        signature: 'transfer(felt,Uint256)'
      }
    } else if (
      selector ===
      '0x68bcbdba7cc8cac2832d23e2c32e9eec39a9f1d03521eff5dff800a62725fa' &&
      to ===
      '0x173f81c529191726c6e7287e24626fe24760ac44dae2a1f7e02080230f8458b'
    ) {
      return {
        name: 'transferERC20',
        signature: 'transferERC20(felt,felt,Uint256,felt)'
      }
    }
  }
  private parseContractCallData(data: ExecuteCalldata): CalldataArg[] {
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
        const selectorItem = this.getSelectorName(result.to, result.selector);
        if (selectorItem) {
          result.name = selectorItem.name;
          result.signature = selectorItem.signature;
          if (selectorItem.name === 'transfer' && result.args.length == 3) {
            calldata.push(result);
          } else if (selectorItem.name === 'transferERC20' && result.args.length == 5) {
            calldata.push(result);
          } else if (selectorItem.name === 'sign_pending_multisig_transaction') {
            try {
              result.args = this.parseSignPendingMultisigCalldata(result.args);
              calldata.push(result);
            } catch (error) {
              this.logger.error(
                `parseContractCallData parseSignPendingMultisigCalldata error ${JSON.stringify(result.args)}`,
                error)
            }
          }
        }
      }
      return calldata;
    } catch (error) {
      console.log(error);
      this.logger.error(
        `parseContractCallData error ${JSON.stringify(data)}`,
        error,
      );
      return null;
    }
  }
  private parseSignPendingMultisigCalldata(inputs: string[]): any[] {
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
    const data = await provider.getBlockWithTxs(blockNumber);
    if(isEmpty(data)) {
      throw new Error('Block isEmpty');
    }
    return data;
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
        return {
          finality_status: "REVERTED"
        };
      }
      throw new Error(
        `Failed to request transaction receipt: ${hash} ${error.message}`,
      );
    }
  }

  async getTransactionReceipt(hash: string): Promise<RPC.TransactionReceipt> {
    const provider = this.getProvider();
    const receipt = await provider.getTransactionReceipt(hash);
    if (isEmpty(receipt)) {
      throw new Error(`${hash} receipt empty`);
    }
    if (receipt.transaction_hash != hash) {
      throw new Error(`provider getTransactionReceipt hash inconsistent expect ${hash} get ${receipt.transaction_hash}`);
    }
    return receipt;
  }
}

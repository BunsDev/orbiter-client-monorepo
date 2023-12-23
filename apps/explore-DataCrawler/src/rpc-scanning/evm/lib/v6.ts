import { Interface, InterfaceAbi, id, TransactionDescription, LogDescription, getAddress, BigNumberish, TransactionResponse, TransactionReceipt, hexlify } from 'ethers6';
import { IChainConfig } from '@orbiter-finance/config';
import { equals } from '@orbiter-finance/utils';
import BigNumber from 'bignumber.js';
import * as abis from '@orbiter-finance/abi'
import _, { clone } from 'lodash'
import { TransferAmountTransaction, TransferAmountTransactionStatus } from 'apps/explore-DataCrawler/src/transaction/transaction.interface';

class Interface2 extends Interface {
  constructor(fragments: InterfaceAbi) {
    super(fragments)
  }
  checkArgs(args) {
    const length = args.length
    const newArgs = []
    _.set(newArgs, 'toArray', function () {
      const result = [];
      this.forEach((item) => {
        result.push(item);
      });
      return result;
    })
    for (let i = 0; i < length; i++) {
      try {
        const arg = args[i]
        newArgs.push(arg)
      } catch (error) {
        const e = error.error
        if (e.code === 'NUMERIC_FAULT' && e.fault === 'overflow' && e.baseType === 'address') {
          const valueString = new BigNumber(e.value).toString(16)
          const address = '0x' + valueString.slice(-40)
          newArgs.push(getAddress(address))
        } else {
          throw error
        }
      }
    }
    return newArgs
  }
  parseTransaction(tx: { data: string, value?: BigNumberish }): null | TransactionDescription {
    try {
      const parsedData = super.parseTransaction(tx)
      const { args, ...residualParsedData } = parsedData
      const newArgs: unknown = this.checkArgs(args)
      return { ...residualParsedData, args: newArgs } as TransactionDescription;
    } catch (error) {
      if (error.code === 'BUFFER_OVERRUN') {
        return null
      }
      throw error
    }
  }
}

export default class EVMVUtils {
  public static isERC20Transfer(data: string) {
    //0xa9059cbb = transfer(address,uint256)
    return (
      id('transfer(address,uint256)').substring(0, 10) === data.substring(0, 10)
    );
    // verify symbol decimal
  }
  public static decodeERC20TransferData(data: string): TransactionDescription {
    if (!EVMVUtils.isERC20Transfer(data)) {
      throw new Error(`signature not 0xa9059cbb`);
    }
    const contractInterface = new Interface2(abis.ERC20Abi);
    const parsedData = contractInterface.parseTransaction({ data: data });
    return parsedData;
  }
  public static evmStandardTokenTransfer(
    chainInfo: IChainConfig,
    transaction: TransactionResponse,
    receipt: TransactionReceipt,
  ): TransferAmountTransaction[] {
    const contractInterface = new Interface2(abis['ERC20Abi']);
    const transfers: TransferAmountTransaction[] = [];
    const parsedData = contractInterface.parseTransaction({
      data: transaction.data,
    });
    if (!parsedData) {
      return transfers;
    }

    const { nonce } = transaction;

    if (parsedData && parsedData.signature === 'transfer(address,uint256)') {
      // find log
      const txData: TransferAmountTransaction = {
        chainId: chainInfo.chainId,
        hash: transaction.hash,
        blockNumber: transaction.blockNumber,
        transactionIndex: transaction.index,
        sender: transaction.from,
        receiver: parsedData.args[0],
        amount: null,
        value: null,
        token: transaction.to,
        symbol: '',
        fee: null,
        feeAmount: null,
        feeToken: chainInfo.nativeCurrency.symbol,
        timestamp: 0,
        status: +receipt.status
          ? TransferAmountTransactionStatus.confirmed
          : TransferAmountTransactionStatus.failed,
        nonce,
        // contract: transaction.to,
        calldata: parsedData.args.toArray(),
        selector: parsedData.selector,
        signature: parsedData.signature,
      };

      txData.value = new BigNumber(parsedData.args[1]).toFixed(0);
      const tokenInfo = chainInfo.tokens.find((t) =>
        equals(t.address, transaction.to),
      );
      if (tokenInfo) {
        txData.amount = new BigNumber(txData.value)
          .div(Math.pow(10, tokenInfo.decimals))
          .toString();
        txData.symbol = tokenInfo.symbol;
      }
      transfers.push(txData);
    }

    return transfers;
  }
  public static evmContract(
    chainInfo: IChainConfig,
    contractInfo: any,
    transaction: TransactionResponse,
    receipt: TransactionReceipt,
  ): TransferAmountTransaction[] {
    let transfers: TransferAmountTransaction[] = [];
    const abi = abis[contractInfo.name];
    if (!abi) {
      throw new Error(`${transaction.hash} ${contractInfo.name} abi not found`);
    }
    const contractInterface = new Interface2(abi);
    const parsedData = contractInterface.parseTransaction({
      data: transaction.data,
    });
    if (!parsedData) {
      return transfers;
    }
    if (contractInfo.name === 'OBSource') {
      transfers = this.evmOBSource(chainInfo, transaction, receipt);
    } else if (contractInfo.name === 'OrbiterRouterV1') {
      transfers = this.evmObRouterV1(chainInfo, transaction, receipt);
    } else if (contractInfo.name === 'OrbiterRouterV3') {
      transfers = this.evmObRouterV3(chainInfo, transaction, receipt);
    }
    return transfers;
  }
  public static crossInscriptions(
    chainInfo: IChainConfig,
    transaction: TransactionResponse,
    receipt: TransactionReceipt,
  ): TransferAmountTransaction[] {
    const transfers: TransferAmountTransaction[] = [];
    const { nonce } = transaction;
    const contractInterface = new Interface2(abis.CrossInscriptions);
    const parsedData = contractInterface.parseTransaction({
      data: transaction.data,
    });
    if (!parsedData) {
      return transfers;
    }
    const txData: TransferAmountTransaction = {
      chainId: chainInfo.chainId,
      hash: transaction.hash,
      blockNumber: transaction.blockNumber,
      transactionIndex: transaction.index,
      sender: transaction.from,
      receiver: parsedData.args[0],
      amount: null,
      value: null,
      token: null,
      symbol: '',
      fee: null,
      feeAmount: null,
      feeToken: chainInfo.nativeCurrency.symbol,
      timestamp: 0,
      status: +receipt.status
        ? TransferAmountTransactionStatus.confirmed
        : TransferAmountTransactionStatus.failed,
      nonce,
      calldata: parsedData.args.toArray(),
      contract: transaction.to,
      selector: parsedData.selector,
      signature: parsedData.signature,
      receipt,
    };
    const logs = receipt.logs;
    const hitLogs = []
    if (parsedData.signature === 'transfers(address[],uint256[],bytes[])') {
      logs.forEach((log, index) => {
        const parsedLogData = contractInterface.parseLog(log as any);
        // console.log(parsedLogData, '=parsedLogData')
        if (
          parsedLogData &&
          parsedLogData.signature === 'Transfer(address,uint256)' &&
          parsedLogData.topic ===
          '0x69ca02dd4edd7bf0a4abb9ed3b7af3f14778db5d61921c7dc7cd545266326de2'
        ) {
          hitLogs.push(log)
        }
      })
      hitLogs.forEach((log, index) => {
        const parsedLogData = contractInterface.parseLog(log as any);
        const decodeData = this.decodeInscriptionCallData(parsedData.args[2][index])
        if (!decodeData) {
          return;
        }
        const value = new BigNumber(parsedLogData.args[1]).toFixed(0);
        const copyTxData = clone(txData);
        copyTxData.hash = `${txData.hash}#${transfers.length}`;
        copyTxData.token = chainInfo.nativeCurrency.address;
        copyTxData.symbol = chainInfo.nativeCurrency.symbol;
        copyTxData.calldata = decodeData;
        copyTxData.receiver = parsedLogData.args[0];
        copyTxData.value = value;
        copyTxData.amount = new BigNumber(value)
          .div(Math.pow(10, chainInfo.nativeCurrency.decimals))
          .toString();
        copyTxData.version = '3'
        copyTxData.selector = decodeData.op
        transfers.push(copyTxData);
      })
    }
    return transfers;
  }
  public static evmOBSource(
    chainInfo: IChainConfig,
    transaction: TransactionResponse,
    receipt: TransactionReceipt,
  ): TransferAmountTransaction[] {
    const transfers: TransferAmountTransaction[] = [];
    const { nonce } = transaction;
    const contractInterface = new Interface(abis['OBSource']);
    const parsedData = contractInterface.parseTransaction({
      data: transaction.data,
    });
    if (!parsedData) {
      return transfers;
    }
    const txData: TransferAmountTransaction = {
      chainId: chainInfo.chainId,
      hash: transaction.hash,
      blockNumber: transaction.blockNumber,
      transactionIndex: transaction.index,
      sender: transaction.from,
      receiver: parsedData.args[0],
      amount: null,
      value: null,
      token: null,
      symbol: null,
      fee: null,
      feeAmount: null,
      feeToken: chainInfo.nativeCurrency.symbol,
      timestamp: 0,
      status: +receipt.status
        ? TransferAmountTransactionStatus.confirmed
        : TransferAmountTransactionStatus.failed,
      nonce,
      calldata: parsedData.args.toArray(),
      contract: transaction.to,
      selector: parsedData['selector'],
      signature: parsedData.signature,
      receipt,
    };
    // const chainInfo = ChainUtil.getChainInfoByChainId(chainId);
    if (parsedData.signature == 'transfer(address,bytes)') {
      const tokenInfo = chainInfo.nativeCurrency;
      txData.value = new BigNumber(transaction.value.toString()).toFixed(0);
      txData.amount = new BigNumber(txData.value)
        .div(Math.pow(10, tokenInfo.decimals))
        .toString();
      txData.symbol = tokenInfo.symbol;
      txData.token = tokenInfo.address;
      txData.status = txData.status === TransferAmountTransactionStatus.failed ? TransferAmountTransactionStatus.failed : TransferAmountTransactionStatus.confirmed;
      transfers.push(txData);
    } else if (
      parsedData.signature == 'transferERC20(address,address,uint256,bytes)'
    ) {
      // get event
      const [token, to, amount, ext] = parsedData.args;
      txData.token = token;
      txData.sender = transaction.from;
      txData.receiver = to;
      txData.value = new BigNumber(amount).toFixed(0);
      const tokenInfo = chainInfo.tokens.find((t) =>
        equals(t.address, token),
      );
      if (tokenInfo) {
        txData.symbol = tokenInfo.symbol;
        txData.amount = new BigNumber(txData.value)
          .div(Math.pow(10, tokenInfo.decimals))
          .toString();
      }

      transfers.push(txData);
    }
    return transfers;
  }
  public static evmObRouterV3(
    chainInfo: IChainConfig,
    transaction: TransactionResponse,
    receipt: TransactionReceipt,
  ): TransferAmountTransaction[] {
    const transfers: TransferAmountTransaction[] = [];
    const { nonce } = transaction;
    const contractInterface = new Interface2(abis['OrbiterRouterV3']);
    const parsedData = contractInterface.parseTransaction({
      data: transaction.data,
    });
    if (!parsedData) {
      return transfers;
    }
    const txData: TransferAmountTransaction = {
      chainId: chainInfo.chainId,
      hash: transaction.hash,
      blockNumber: transaction.blockNumber,
      transactionIndex: transaction.index,
      sender: transaction.from,
      receiver: parsedData.args[0],
      amount: null,
      value: null,
      token: null,
      symbol: '',
      fee: null,
      feeAmount: null,
      feeToken: chainInfo.nativeCurrency.symbol,
      timestamp: 0,
      status: +receipt.status
        ? TransferAmountTransactionStatus.confirmed
        : TransferAmountTransactionStatus.failed,
      nonce,
      calldata: parsedData.args.toArray(),
      contract: transaction.to,
      selector: parsedData.selector,
      signature: parsedData.signature,
      receipt,
    };
    const logs = receipt.logs;
    if (parsedData.signature === 'transfers(address[],uint256[])') {
      for (const log of logs) {
        const parsedLogData = contractInterface.parseLog(log as any);
        if (
          parsedLogData &&
          parsedLogData.signature === 'Transfer(address,uint256)' &&
          parsedLogData.topic ===
          '0x69ca02dd4edd7bf0a4abb9ed3b7af3f14778db5d61921c7dc7cd545266326de2'
        ) {
          const value = new BigNumber(parsedLogData.args[1]).toFixed(0);
          const copyTxData = clone(txData);
          copyTxData.hash = `${txData.hash}#${transfers.length}`;
          copyTxData.token = chainInfo.nativeCurrency.address;
          copyTxData.symbol = chainInfo.nativeCurrency.symbol;
          copyTxData.receiver = parsedLogData.args[0];
          copyTxData.value = value;
          copyTxData.amount = new BigNumber(value)
            .div(Math.pow(10, chainInfo.nativeCurrency.decimals))
            .toString();
          transfers.push(copyTxData);
        }
      }
    } else if (
      parsedData.signature === 'transferTokens(address, address[],uint256[])'
    ) {
      for (const log of logs) {
        const parsedLogData = contractInterface.parseLog(log as any);
        if (
          parsedLogData &&
          parsedLogData.signature === 'Transfer(address,uint256)' &&
          parsedLogData.topic ===
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        ) {
          const copyTxData = clone(txData);
          const value = new BigNumber(parsedLogData.args[2]).toFixed(0);
          copyTxData.hash = `${txData.hash}#${transfers.length}`;
          copyTxData.token = parsedData.args[0];
          copyTxData.sender = parsedLogData.args[0];
          copyTxData.receiver = parsedLogData.args[1];
          copyTxData.value = value;
          const tokenInfo = chainInfo.tokens.find((t) =>
            equals(t.address, copyTxData.token),
          );
          if (tokenInfo) {
            copyTxData.symbol = tokenInfo.symbol;
            copyTxData.amount = new BigNumber(value)
              .div(Math.pow(10, tokenInfo.decimals))
              .toString();
          }
          transfers.push(copyTxData);
        }
      }
    } else if (parsedData.signature === 'transfer(address,bytes)' || parsedData.signature === 'transferToken(address,address,uint256,bytes)') {
      const parsedLogData = contractInterface.parseLog(logs[0] as any);
      const copyTxData = clone(txData);
      let value;
      if (parsedData.signature === 'transferToken(address,address,uint256,bytes)') {
        value = new BigNumber(parsedLogData.args[2]).toFixed(0);
        copyTxData.sender = parsedLogData.args[0];
        copyTxData.receiver = parsedLogData.args[1];
      } else {
        value = new BigNumber(parsedLogData.args[1]).toFixed(0);
        copyTxData.receiver = parsedLogData.args[0];
      }
      copyTxData.hash = txData.hash;
      copyTxData.token = chainInfo.nativeCurrency.address;
      copyTxData.symbol = chainInfo.nativeCurrency.symbol;
      copyTxData.value = value;
      copyTxData.amount = new BigNumber(value)
        .div(Math.pow(10, chainInfo.nativeCurrency.decimals))
        .toString();
      transfers.push(copyTxData);
    }

    return transfers;
  }
  public static evmObRouterV1(
    chainInfo: IChainConfig,
    transaction: TransactionResponse,
    receipt: TransactionReceipt,
  ): TransferAmountTransaction[] {
    const transfers: TransferAmountTransaction[] = [];
    const { nonce } = transaction;
    const contractInterface = new Interface2(abis['OrbiterRouterV1']);
    const parsedData = contractInterface.parseTransaction({
      data: transaction.data,
    });
    if (!parsedData) {
      return transfers;
    }
    const txData: TransferAmountTransaction = {
      chainId: chainInfo.chainId,
      hash: transaction.hash,
      blockNumber: transaction.blockNumber,
      transactionIndex: transaction.index,
      sender: transaction.from,
      receiver: '',
      amount: null,
      value: null,
      token: null,
      symbol: '',
      fee: null,
      feeAmount: null,
      feeToken: chainInfo.nativeCurrency.symbol,
      timestamp: 0,
      status: +receipt.status
        ? TransferAmountTransactionStatus.confirmed
        : TransferAmountTransactionStatus.failed,
      nonce,
      calldata: parsedData.args.toArray(),
      contract: transaction.to,
      selector: parsedData.selector,
      signature: parsedData.signature,
      receipt,
    };
    if (parsedData.signature === 'swap(address,address,uint256,bytes)') {
      txData.receiver = parsedData.args[0].toLowerCase()
      txData.token = parsedData.args[1].toLowerCase()
      txData.value = parsedData.args[2]
      const tokenInfo = chainInfo.tokens.find((t) =>
        equals(t.address.toLowerCase(), txData.token),
      );
      if (tokenInfo) {
        txData.symbol = tokenInfo.symbol;
        txData.amount = new BigNumber(txData.value)
          .div(Math.pow(10, tokenInfo.decimals))
          .toString();
      }
      transfers.push(txData);
    } else if (parsedData.signature === 'swapAnswer(address,address,uint256,bytes)') {
      txData.receiver = parsedData.args[0].toLowerCase()
      txData.token = parsedData.args[1].toLowerCase()
      txData.value = parsedData.args[2]
      const tokenInfo = chainInfo.tokens.find((t) =>
        equals(t.address.toLowerCase(), txData.token),
      );
      if (tokenInfo) {
        txData.symbol = tokenInfo.symbol;
        txData.amount = new BigNumber(txData.value)
          .div(Math.pow(10, tokenInfo.decimals))
          .toString();
      }
      transfers.push(txData);
    }
    return transfers
  }
  static getTransferEvent(
    logArray: Array<any>,
    from: string,
    to: string,
    value: string,
  ): LogDescription {
    // LogDescription
    const contractInterface = new Interface(abis['ERC20Abi']);
    for (const log of logArray) {
      try {
        const parsedLogData = contractInterface.parseLog(log as any);
        if (
          parsedLogData &&
          parsedLogData.signature === 'Transfer(address,address,uint256)' &&
          parsedLogData.topic ===
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        ) {
          if (
            equals(from, parsedLogData.args[0]) &&
            equals(to, parsedLogData.args[1]) &&
            equals(value, parsedLogData.args[2])
          ) {
            return parsedLogData;
          }
        }
      } catch (error) {
        console.error('getTransferEvent error', error);
      }
    }
  }
  static decodeInscriptionCallData(data: string) {
    let decodeData = null;
    try {
      const jsonData = Buffer.from(data.slice(2), 'hex').toString('utf-8');
      if (jsonData && jsonData.startsWith('data:,')) {
        decodeData = JSON.parse(jsonData.slice(6));
      }
    } catch (error) {
      console.log('deCodeInscriptionCallData error', error)
      return decodeData
    }
    return decodeData
  }
}

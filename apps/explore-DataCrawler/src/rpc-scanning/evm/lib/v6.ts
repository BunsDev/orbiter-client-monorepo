import { Interface, id, TransactionDescription, LogDescription } from 'ethers6';
import { IChainConfig } from '@orbiter-finance/config';
import { abis, equals } from '@orbiter-finance/utils';
import BigNumber from 'bignumber.js';
import { TransferAmountTransaction, TransferAmountTransactionStatus } from 'apps/explore-DataCrawler/src/transaction/transaction.interface';

export default class EVMVUtils {
  public static isERC20Transfer(data: string) {
    //0xa9059cbb = transfer(address,uint256)
    return (
      id('transfer(address,uint256)').substring(0, 10) === data.substring(0, 10)
    );
    // veift symbol decimal
  }
  public static decodeERC20TransferData(data: string): TransactionDescription {
    if (!EVMVUtils.isERC20Transfer(data)) {
      throw new Error(`signature not 0xa9059cbb`);
    }
    const contractInterface = new Interface(abis.ERC20Abi);
    const parsedData = contractInterface.parseTransaction({ data: data });
    return parsedData;
  }
  public static evmStandardTokenTransfer(
    chainInfo: IChainConfig,
    transaction: any,
    receipt: any,
  ): TransferAmountTransaction[] {
    const contractInterface = new Interface(abis['ERC20Abi']);
    const transfers: TransferAmountTransaction[] = [];
    const parsedData = contractInterface.parseTransaction({
      data: transaction.data,
    });
    if (!parsedData) {
      return transfers;
    }

    const { nonce } = transaction;
    const tokenInfo = chainInfo.tokens.find((t) =>
      equals(t.address, transaction.to),
    );
    if (!tokenInfo) {
      return transfers;
    }
    if (parsedData && parsedData.signature === 'transfer(address,uint256)') {
      // find log
      const txData: TransferAmountTransaction = {
        chainId: chainInfo.chainId,
        hash: transaction.hash,
        blockNumber: transaction.blockNumber,
        sender:  transaction.from,
        receiver: parsedData.args[0],
        amount: null,
        value: null,
        token: transaction.to,
        symbol: tokenInfo.symbol,
        fee: null,
        feeAmount: null,
        feeToken: chainInfo.nativeCurrency.symbol,
        timestamp: 0,
        status: +receipt.status
          ? TransferAmountTransactionStatus.none
          : TransferAmountTransactionStatus.failed,
        nonce,
        // contract: transaction.to,
        calldata: parsedData.args.toArray(),
        selector: parsedData.selector,
        signature: parsedData.signature,
      };

      const logs = receipt.logs;
      const event = EVMVUtils.getTransferEvent(
        logs,
        transaction.from,
        parsedData.args[0],
        parsedData.args[1],
      );
      txData.value = new BigNumber(parsedData.args[1]).toFixed(0);
      txData.amount = new BigNumber(txData.value)
        .div(Math.pow(10, tokenInfo.decimals))
        .toString();
      if (event) {
        // txData.receiver = parsedData.args[0];
        txData.status = txData.status === TransferAmountTransactionStatus.failed ? TransferAmountTransactionStatus.failed : TransferAmountTransactionStatus.confirmed;
      }

      transfers.push(txData);
    }

    return transfers;
  }
  public static evmContract(
    chainInfo: IChainConfig,
    contractInfo: any,
    transaction: any,
    receipt: any,
  ): TransferAmountTransaction[] {
    let transfers: TransferAmountTransaction[] = [];
    const abi = abis[contractInfo.name];
    if (!abi) {
      throw new Error(`${transaction.hash} ${contractInfo.name} abi not found`);
    }
    const contractInterface = new Interface(abi);
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
    console.log(transfers)
    return transfers;
  }
  public static evmOBSource(
    chainInfo: IChainConfig,
    transaction: any,
    receipt: any,
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
        ? TransferAmountTransactionStatus.none
        : TransferAmountTransactionStatus.failed,
      nonce,
      calldata: parsedData.args.toArray(),
      contract: transaction.to,
      selector: parsedData['selector'],
      signature: parsedData.signature,
      receipt,
    };
    let tokenInfo;
    // const chainInfo = ChainUtil.getChainInfoByChainId(chainId);
    if (parsedData.signature == 'transfer(address,bytes)') {
      tokenInfo = chainInfo.nativeCurrency;
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
      const event = EVMVUtils.getTransferEvent(
        receipt.logs,
        transaction.from,
        to,
        amount,
      );
      if (event) {
        // find token
        const tokenInfo = chainInfo.tokens.find((t) =>
          equals(t.address, parsedData.args[0]),
        );
        txData.symbol = tokenInfo.symbol;
        txData.sender = event.args[0];
        txData.receiver = event.args[1];
        txData.value = new BigNumber(event.args[2]).toFixed(0);
        txData.amount = new BigNumber(txData.value)
          .div(Math.pow(10, tokenInfo.decimals))
          .toString();
        txData.status = txData.status === TransferAmountTransactionStatus.failed ? TransferAmountTransactionStatus.failed : TransferAmountTransactionStatus.confirmed;
      }
      transfers.push(txData);
    }
    return transfers;
  }
  public static evmObRouterV3(
    chainInfo: IChainConfig,
    transaction: any,
    receipt: any,
  ): TransferAmountTransaction[] {
    const transfers: TransferAmountTransaction[] = [];
    const { nonce } = transaction;
    const contractInterface = new Interface(abis['OrbiterRouterV3']);
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
      ? TransferAmountTransactionStatus.none
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
          transfers.push({
            ...txData,
            hash: `${txData.hash}#${transfers.length}`,
            token: chainInfo.nativeCurrency.address,
            symbol: chainInfo.nativeCurrency.symbol,
            receiver: parsedLogData.args[0],
            value,
            amount: new BigNumber(value)
              .div(Math.pow(10, chainInfo.nativeCurrency.decimals))
              .toString(),
          });
          txData.status = txData.status === TransferAmountTransactionStatus.failed ? TransferAmountTransactionStatus.failed : TransferAmountTransactionStatus.confirmed;
        }
      }
    } else if (
      parsedData.signature === 'transferTokens(address, address[],uint256[])'
    ) {
      // const event = EVMRpcScanningV6Service.getTransferEvent(logs, transaction.from, parsedData[0], amount)
      for (const log of logs) {
        const parsedLogData = contractInterface.parseLog(log as any);
        if (
          parsedLogData &&
          parsedLogData.signature === 'Transfer(address,uint256)' &&
          parsedLogData.topic ===
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        ) {
          // }
          const tokenInfo = chainInfo.tokens.find((t) =>
            equals(t.address, parsedData.args[0]),
          );
          const value = new BigNumber(parsedLogData.args[2]).toFixed(0);
          transfers.push({
            ...txData,
            hash: `${txData.hash}#${transfers.length}`,
            token: parsedData.args[0],
            symbol: tokenInfo.symbol,
            sender: parsedLogData.args[0],
            receiver: parsedLogData.args[1],
            value,
            amount: new BigNumber(value)
              .div(Math.pow(10, tokenInfo.decimals))
              .toString(),
          });
          txData.status = txData.status === TransferAmountTransactionStatus.failed ? TransferAmountTransactionStatus.failed : TransferAmountTransactionStatus.confirmed;
        }
      }
    } else if (
      parsedData.signature === 'transferToken(address,address,uint256,bytes)'
    ) {
      // TODO:
    } else if (parsedData.signature === 'transfer(address,uint256)') {
      // TODO:
    }

    return transfers;
  }
  public static evmObRouterV1(
    chainInfo: IChainConfig,
    transaction: any,
    receipt: any,
  ): TransferAmountTransaction[] {
    const transfers: TransferAmountTransaction[] = [];
    const { nonce } = transaction;
    const contractInterface = new Interface(abis['OrbiterRouterV1']);
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
      ? TransferAmountTransactionStatus.none
      : TransferAmountTransactionStatus.failed,
      nonce,
      calldata: parsedData.args.toArray(),
      contract: transaction.to,
      selector: parsedData.selector,
      signature: parsedData.signature,
      receipt,
    };
    const logs = receipt.logs;
    if (parsedData.signature === 'swap(address,address,uint256,bytes)') {
      const recipient = parsedData.args[0].toLowerCase()
      const token = parsedData.args[1].toLowerCase()
      const amount = parsedData.args[2]
      const tokenInfo = chainInfo.tokens.find((t) =>
        equals(t.address.toLowerCase(), token),
      );

      const transferEvent = logs.find(log => {
        if (log.topics[0] !== '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
          return false
        }
        const transferValue = new BigNumber(log.data)
        const from = `0x${new BigNumber(log.topics[1]).toString(16).toLowerCase()}`
        const to = `0x${new BigNumber(log.topics[2]).toString(16).toLowerCase()}`
        return from === receipt.from.toLowerCase() && to === recipient && transferValue.eq(new BigNumber(amount))
      })
      if (transferEvent && tokenInfo) {
        transfers.push({
          ...txData,
          hash: `${txData.hash}`,
          token: token,
          symbol: tokenInfo.symbol,
          sender: receipt.from.toLowerCase(),
          receiver: recipient,
          value: amount.toString(),
          amount: new BigNumber(amount)
            .div(Math.pow(10, tokenInfo.decimals))
            .toString(),
        })
      }
    } else if (parsedData.signature === 'swapAnswer(address,address,uint256,bytes)') {
      const recipient = parsedData.args[0].toLowerCase()
      const token = parsedData.args[1].toLowerCase()
      const amount = parsedData.args[2]
      const tokenInfo = chainInfo.tokens.find((t) =>
        equals(t.address.toLowerCase(), token),
      );
      const transferEvent = logs.find(log => {
        if (log.topics[0] !== '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
          return false
        }
        const transferValue = new BigNumber(log.data)
        const from = `0x${new BigNumber(log.topics[1]).toString(16).toLowerCase()}`
        const to = `0x${new BigNumber(log.topics[2]).toString(16).toLowerCase()}`
        return from === receipt.from.toLowerCase() && to === recipient && transferValue.eq(new BigNumber(amount))
      })
      if (transferEvent && tokenInfo) {
        transfers.push({
          ...txData,
          hash: `${txData.hash}`,
          token: token,
          symbol: tokenInfo.symbol,
          sender: receipt.from.toLowerCase(),
          receiver: recipient,
          value: amount.toString(),
          amount: new BigNumber(amount)
            .div(Math.pow(10, tokenInfo.decimals))
            .toString(),
        })
      }
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
}

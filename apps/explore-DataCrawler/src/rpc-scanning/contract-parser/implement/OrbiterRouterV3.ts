import { CrossChainParams } from './../../../transaction/transaction.interface';
import { ContractParser, TransferAmountTransaction } from "../ContractParser.interface";
import { ContractParserService } from "../ContractParser.service";
import { Interface, InterfaceAbi, id, TransactionDescription, LogDescription, getAddress, BigNumberish, TransactionResponse, TransactionReceipt, hexlify, AbiCoder } from 'ethers6';
import { EVMPraser } from '../EVMPraser';
import { TransferAmountTransactionStatus } from 'apps/explore-DataCrawler/src/transaction/transaction.interface';
import BigNumber from "bignumber.js";
import { equals } from "@orbiter-finance/utils";
import { isEmpty } from "lodash";
import { decodeOrbiterCrossChainParams } from "apps/explore-DataCrawler/src/utils";

export default class OrbiterRouterV3 extends EVMPraser {
    get abi() {
        return abi;
    }
    async transfer(contractAddress: string, transaction: TransactionResponse, receipt: TransactionReceipt, parsedData: TransactionDescription): Promise<TransferAmountTransaction[]> {
        const txData = await this.buildTransferBaseData(transaction, receipt, parsedData);
        if (transaction.value > 0) {
            txData.symbol = this.chainInfo.nativeCurrency.symbol;
            txData.token = this.chainInfo.nativeCurrency.address;
        }
        txData.receiver = parsedData.args[0];
        txData.selector = parsedData['selector'];
        txData.contract = contractAddress;
        try {
            const crossChainParams: CrossChainParams = decodeOrbiterCrossChainParams(parsedData.args[1]);
            txData.crossChainParams = crossChainParams;
        } catch (error) {
            console.error('decodeOrbiterCrossChainParams error', error);
        }
        if (receipt) {
            const logEvent = this.verifyTransferEvent(receipt.logs as any, contractAddress, txData.receiver);
            if (logEvent && receipt.status) {
                txData.value = new BigNumber(logEvent.args[1]).toFixed(0);
                txData.amount = new BigNumber(txData.value)
                .div(Math.pow(10, this.chainInfo.nativeCurrency.decimals))
                .toString();
                txData.status = TransferAmountTransactionStatus.confirmed;
            } else {
                txData.status = TransferAmountTransactionStatus.failed;
            }
        }
        return [txData];
    }
    async transferToken(contractAddress: string, transaction: TransactionResponse, receipt: TransactionReceipt, parsedData: TransactionDescription) {
        const txData = await this.buildTransferBaseData(transaction, receipt, parsedData);
        txData.selector = parsedData['selector'];
        const value = new BigNumber(parsedData.args[2]).toFixed(0);
        txData.token = parsedData.args[0];
        txData.receiver = parsedData.args[1];
        txData.value = value;
        const tokenInfo = this.chainInfo.tokens.find((t) =>
            equals(t.address, txData.token),
        );
        if (tokenInfo) {
            txData.symbol = tokenInfo.symbol;
            txData.amount = new BigNumber(value)
                .div(Math.pow(10, tokenInfo.decimals))
                .toString();
        }
        txData.selector = parsedData['selector'];
        txData.contract = contractAddress;
        try {
            const crossChainParams: CrossChainParams = decodeOrbiterCrossChainParams(parsedData.args[3]);
            txData.crossChainParams = crossChainParams;
        } catch (error) {
            console.error('decodeOrbiterCrossChainParams error', error);
        }
        if (receipt) {
            const logEvent = this.findERC20TransferEvent(receipt.logs as any, txData.token, txData.receiver, txData.value);
            // sender
            if (logEvent && receipt.status) {
                txData.status = TransferAmountTransactionStatus.confirmed;
            } else {
                txData.status = TransferAmountTransactionStatus.failed;
            }
        }
        return [txData];
    }
    verifyTransferEvent(
        logArray: Array<any>,
        contract: string,
        to: string,
    ): LogDescription {
        // LogDescription
        for (const log of logArray) {
            try {
                const parsedLogData = this.contractInterface.parseLog(log as any);
                console.log(parsedLogData, '==parsedLogData')
                if (
                    equals(log.address, contract) &&
                    parsedLogData &&
                    parsedLogData.signature === 'Transfer(address,uint256)' &&
                    parsedLogData.topic ===
                    '0x69ca02dd4edd7bf0a4abb9ed3b7af3f14778db5d61921c7dc7cd545266326de2'
                ) {
                    if (
                        equals(to, parsedLogData.args[0])
                    ) {
                        return parsedLogData;
                    }
                }
            } catch (error) {
                console.error('verifyTransferEvent error', error);
            }
        }
    }
    findOrbiterRouterTransferEvent(
        logArray: Array<any>,
        contract: string,
        to: string,
        value: string,
    ): Array<LogDescription> {
        // LogDescription
        const logs = [];
        for (const log of logArray) {
            try {
                const parsedLogData = this.contractInterface.parseLog(log as any);
                if (
                    equals(log.address, contract) &&
                    parsedLogData &&
                    parsedLogData.signature === 'Transfer(address,uint256)' &&
                    parsedLogData.topic ===
                    '0x69ca02dd4edd7bf0a4abb9ed3b7af3f14778db5d61921c7dc7cd545266326de2'
                ) {
                    if (
                        equals(to, parsedLogData.args[0]) &&
                        equals(value, parsedLogData.args[1])
                    ) {
                        logs.push(parsedLogData);
                    }
                }
            } catch (error) {
                console.error('verifyTransferEvent error', error);
            }
        }
        return logs;
    }
}

export const abi = [{ "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "to", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "Transfer", "type": "event" }, { "inputs": [{ "internalType": "address", "name": "to", "type": "address" }, { "internalType": "bytes", "name": "data", "type": "bytes" }], "name": "transfer", "outputs": [], "stateMutability": "payable", "type": "function" }, { "inputs": [{ "internalType": "contract IERC20", "name": "token", "type": "address" }, { "internalType": "address", "name": "to", "type": "address" }, { "internalType": "uint256", "name": "value", "type": "uint256" }, { "internalType": "bytes", "name": "data", "type": "bytes" }], "name": "transferToken", "outputs": [], "stateMutability": "payable", "type": "function" }, { "inputs": [{ "internalType": "contract IERC20", "name": "token", "type": "address" }, { "internalType": "address[]", "name": "tos", "type": "address[]" }, { "internalType": "uint256[]", "name": "values", "type": "uint256[]" }], "name": "transferTokens", "outputs": [], "stateMutability": "payable", "type": "function" }, { "inputs": [{ "internalType": "address[]", "name": "tos", "type": "address[]" }, { "internalType": "uint256[]", "name": "values", "type": "uint256[]" }], "name": "transfers", "outputs": [], "stateMutability": "payable", "type": "function" }];
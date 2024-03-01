import { ContractParser, TransferAmountTransaction } from "../ContractParser.interface";
import { ContractParserService } from "../ContractParser.service";
import { Interface, InterfaceAbi, id, TransactionDescription, LogDescription, getAddress, BigNumberish, TransactionResponse, TransactionReceipt, hexlify, AbiCoder } from 'ethers6';
import { EVMPraser } from '../EVMPraser';
import { CrossChainParams, TransferAmountTransactionStatus } from 'apps/explore-DataCrawler/src/transaction/transaction.interface';
import BigNumber from "bignumber.js";
import OrbiterRouterV3 from "./OrbiterRouterV3";
import { decodeOrbiterCrossChainParams } from "apps/explore-DataCrawler/src/utils";
import { equals } from "@orbiter-finance/utils";

export default class Rubic extends EVMPraser {
  get abi() {
    return ADAPTER_ABI;
  }
  async startViaRubic(contractAddress: string, transaction: TransactionResponse, receipt: TransactionReceipt, parsedData: TransactionDescription): Promise<TransferAmountTransaction[]> {
    const txData = await this.buildTransferBaseData(transaction, receipt, parsedData);
    console.log(parsedData, '=parsedData')
    return [];
  }
}


export const ADAPTER_ABI = [{"inputs":[{"internalType":"address","name":"_owner","type":"address"},{"internalType":"address","name":"_diamond","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"InvalidAmount","type":"error"},{"inputs":[],"name":"LengthMissmatch","type":"error"},{"inputs":[],"name":"NoTransferToNullAddress","type":"error"},{"inputs":[],"name":"NotInitialized","type":"error"},{"inputs":[],"name":"NullAddrIsNotAnERC20Token","type":"error"},{"inputs":[],"name":"SliceOutOfBounds","type":"error"},{"inputs":[],"name":"SliceOverflow","type":"error"},{"inputs":[],"name":"ZeroAddress","type":"error"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"diamond","type":"address"}],"name":"DiamondSet","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"inputs":[],"name":"diamond","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_diamond","type":"address"}],"name":"setDiamond","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address[]","name":"tokens","type":"address[]"},{"internalType":"uint256[]","name":"amounts","type":"uint256[]"},{"internalType":"bytes","name":"facetCallData","type":"bytes"}],"name":"startViaRubic","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}]
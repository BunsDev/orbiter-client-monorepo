import { ContractParser, TransferAmountTransaction } from "../ContractParser.interface";
import { ContractParserService } from "../ContractParser.service";
import { Interface, InterfaceAbi, id, TransactionDescription, LogDescription, getAddress, BigNumberish, TransactionResponse, TransactionReceipt, hexlify, AbiCoder } from 'ethers6';
import { TransferAmountTransactionStatus } from 'apps/explore-DataCrawler/src/transaction/transaction.interface';
import { IChainConfig } from "@orbiter-finance/config";
import BigNumber from 'bignumber.js';
import { equals } from '@orbiter-finance/utils';
export class EVMPraser implements ContractParser {
    constructor(private readonly chainInfo: IChainConfig) {
    }
    parse(chainId: string, contract: string, [transaction]: any[]): TransferAmountTransaction[] {
        const contractInterface = new Interface(ERC20Abi);
        const parsedData = contractInterface.parseTransaction({ data: transaction.data });
        if (!parsedData) {
            return null;
        }
        if (!this[parsedData.name]) {
            return null;
        }
        return this[parsedData.name](transaction, parsedData);
    }
    async transfer(transaction: TransactionResponse, parsedData: TransactionDescription): Promise<TransferAmountTransaction[]> {
        const { nonce } = transaction;
        const transfers: TransferAmountTransaction[] = [];
        const chainInfo = this.chainInfo;
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
                status: TransferAmountTransactionStatus.pending,
                nonce,
                contract: transaction.to,
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
    buildTransferBaseData(transaction: TransactionResponse, parsedData?: TransactionDescription) {
        const txData: TransferAmountTransaction = {
            chainId: transaction.chainId.toString(),
            hash: transaction.hash,
            blockNumber: transaction.blockNumber,
            transactionIndex: transaction.index,
            sender: transaction.from,
            receiver: transaction.to,
            amount: null,
            value: null,
            token: null,
            symbol: '',
            fee: null,
            feeAmount: null,
            feeToken: null,
            timestamp: 0,
            status: TransferAmountTransactionStatus.pending,
            nonce: transaction.nonce,
        };
        if (parsedData) {
            txData.calldata = parsedData.args.toArray();
            txData.contract = transaction.to;
            txData.selector = parsedData['selector'];
            txData.signature = parsedData.signature;
        }
        return txData;
    }
    buildExecuteStatus(transfers: TransferAmountTransaction[], receipt: TransactionReceipt) {
        for (const transfer of transfers) {
            if (receipt) {
                transfer.status = +receipt.status
                    ? TransferAmountTransactionStatus.confirmed
                    : TransferAmountTransactionStatus.failed;
            } else {
                transfer.status = TransferAmountTransactionStatus.pending;
            }

        }
        return transfers;
    }
}

export const ERC20Abi = [
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "owner",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "Approval",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "from",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "Transfer",
        "type": "event"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "owner",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            }
        ],
        "name": "allowance",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "approve",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "account",
                "type": "address"
            }
        ],
        "name": "balanceOf",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [
            {
                "internalType": "uint8",
                "name": "",
                "type": "uint8"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "name",
        "outputs": [
            {
                "internalType": "string",
                "name": "",
                "type": "string"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "symbol",
        "outputs": [
            {
                "internalType": "string",
                "name": "",
                "type": "string"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "recipient",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "transfer",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "sender",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "recipient",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
            }
        ],
        "name": "transferFrom",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

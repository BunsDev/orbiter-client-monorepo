import { TransferAmountTransaction } from '../ContractParser.interface';
import { StarknetPraser } from "../StarknetParser";
import { TransferAmountTransactionStatus } from 'apps/explore-DataCrawler/src/transaction/transaction.interface';
import { IChainConfig } from "@orbiter-finance/config";
import BigNumber from 'bignumber.js';
import { addressPadStart, equals } from '@orbiter-finance/utils';
import { RpcProvider, RPC, CallData, Contract, shortString,getChecksumAddress,uint256 } from 'starknet';
import { decodeOrbiterCrossChainParams } from '../../../utils';
export class StarknetOrbiterRouter extends StarknetPraser {
    parse(contractAddress: string, [transaction, receipt]: any[]): TransferAmountTransaction[] {
        const senderAddress = addressPadStart(transaction.sender_address.toLocaleLowerCase(), 66);
        const contract = new Contract(abi, contractAddress);
        const events = contract.parseEvents(receipt);
        const transfers: TransferAmountTransaction[] = [];
        const chainConfig = this.chainInfo;
        if (events && events.length > 0) {
            const fee = new BigNumber(receipt.actual_fee)
                .dividedBy(events.length);
            const feeAmount = fee
                .div(Math.pow(10, chainConfig.nativeCurrency.decimals))
                .toString();
            for (const event of events) {
                const eventItem: any = event['Transfer'];
                if (!eventItem) {
                    continue;
                }
                const exts = eventItem.ext;
                const extString = exts.map(n => n.toString(16)).join('')
                const crossParams = decodeOrbiterCrossChainParams(extString);
                const receiver = getChecksumAddress(eventItem.to).toLocaleLowerCase();
                const token = getChecksumAddress(eventItem.token).toLocaleLowerCase();
                const value = uint256.uint256ToBN(eventItem.amount).toString();
                // get token
                const tokenInfo = this.chainInfo.tokens.find((t) =>
                    equals(t.address, token),
                );
                if (tokenInfo) {
                    const amount = new BigNumber(value)
                        .div(Math.pow(10, tokenInfo.decimals))
                        .toString();
                    const transfer: TransferAmountTransaction = {
                        chainId: String(this.chainInfo.chainId),
                        hash: addressPadStart(transaction.transaction_hash, 66),
                        blockNumber: transaction.block_number,
                        sender: senderAddress,
                        receiver: receiver,
                        value: value,
                        amount: amount,
                        token: token,
                        symbol: tokenInfo.symbol,
                        fee: fee.toString(),
                        feeToken: chainConfig.nativeCurrency.symbol,
                        feeAmount: feeAmount,
                        timestamp: transaction.timestamp,
                        status: TransferAmountTransactionStatus.confirmed,
                        nonce: +transaction.nonce,
                        calldata: null,
                        selector: null,
                        signature: null,
                        contract: contractAddress,
                        crossChainParams:crossParams,
                        receipt: receipt,
                    };
                    transfers.push(transfer);
                }

            }
        }
        return transfers;
    }
}

const abi = [
    {
        "name": "Uint256",
        "size": 2,
        "type": "struct",
        "members": [
            {
                "name": "low",
                "type": "felt",
                "offset": 0
            },
            {
                "name": "high",
                "type": "felt",
                "offset": 1
            }
        ]
    },
    {
        "data": [
            {
                "name": "to",
                "type": "felt"
            },
            {
                "name": "amount",
                "type": "Uint256"
            },
            {
                "name": "token",
                "type": "felt"
            },
            {
                "name": "ext_len",
                "type": "felt"
            },
            {
                "name": "ext",
                "type": "felt*"
            }
        ],
        "keys": [],
        "name": "Transfer",
        "type": "event"
    },
    {
        "name": "transferERC20",
        "type": "function",
        "inputs": [
            {
                "name": "_token",
                "type": "felt"
            },
            {
                "name": "_to",
                "type": "felt"
            },
            {
                "name": "_amount",
                "type": "Uint256"
            },
            {
                "name": "_ext_len",
                "type": "felt"
            },
            {
                "name": "_ext",
                "type": "felt*"
            }
        ],
        "outputs": []
    }
]
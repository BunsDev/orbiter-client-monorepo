import { ContractParser, TransferAmountTransaction } from "../ContractParser.interface";
import { ContractParserService } from "../ContractParser.service";
import { Interface, InterfaceAbi, id, TransactionDescription, LogDescription, getAddress, BigNumberish, TransactionResponse, TransactionReceipt, hexlify, AbiCoder } from 'ethers6';
import { EVMPraser } from '../EVMPraser';
import { TransferAmountTransactionStatus } from 'apps/explore-DataCrawler/src/transaction/transaction.interface';
import BigNumber from "bignumber.js";

export default class XBridge extends EVMPraser {
  get abi() {
    return XBRIDGE_ADAPTER_ABI;
  }
  async bridgeToV2(transaction: TransactionResponse, receipt: TransactionReceipt, parsedData: TransactionDescription): Promise<TransferAmountTransaction[]> {
    const txData = await this.buildTransferBaseData(transaction, receipt, parsedData);
    if (transaction.value > 0) {
      txData.value = transaction.value.toString();
      txData.amount = new BigNumber(txData.value)
        .div(Math.pow(10, this.chainInfo.nativeCurrency.decimals))
        .toString();
      txData.symbol = this.chainInfo.nativeCurrency.symbol;
      txData.token = this.chainInfo.nativeCurrency.address;
      const extraData = this.decodeToStarknet(parsedData.args[0][5]);
      txData.receiver = extraData[0];

    }
    txData.selector = parsedData['selector'];
    const transfer = this.buildExecuteStatus([txData], receipt);
    if (receipt) {
      // check event
      // const event = 
      for(const log of receipt.logs) {
        try {
          const logData = this.contractInterface.parseLog(log as any);
          console.log(logData, '==logData', log);
        } catch (error) {
          console.log('error', error);
        }

      }
    }
    return transfer;
  }
  decodeToStarknet(hexData: string) {
    // const args = parsedData.args[0];
    const abiCoder = AbiCoder.defaultAbiCoder();
    const data = abiCoder.decode(["address", "bytes"], hexData);
    return data;
  }
}


export const XBRIDGE_ADAPTER_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "_newAdmin",
        "type": "address"
      }
    ],
    "name": "AdminChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "_approveProxy",
        "type": "address"
      }
    ],
    "name": "ApproveProxyChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "fromToken",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "toToken",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "fromTokenAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "toTokenAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "gasFeeAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "srcChainId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "errInfo",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "bytes32[]",
        "name": "ext",
        "type": "bytes32[]"
      }
    ],
    "name": "Claimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "_dexRouter",
        "type": "address"
      }
    ],
    "name": "DexRouterChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "_feeTo",
        "type": "address"
      }
    ],
    "name": "FeeToChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "srcChainId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32[]",
        "name": "ext",
        "type": "bytes32[]"
      }
    ],
    "name": "GasTokenReceived",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "version",
        "type": "uint8"
      }
    ],
    "name": "Initialized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "_adaptorId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "_from",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "_to",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "_token",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "_amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "_receiveFee",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32[]",
        "name": "ext",
        "type": "bytes32[]"
      }
    ],
    "name": "LogBridgeTo",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "_adaptorId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "_from",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "_to",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "_fromToken",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "_fromAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "_toToken",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "_toAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "_receiveFee",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32[]",
        "name": "ext",
        "type": "bytes32[]"
      }
    ],
    "name": "LogSwapAndBridgeTo",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "Paused",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "Unpaused",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "",
        "type": "bytes4"
      }
    ],
    "name": "accessSelectorId",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "adaptorInfo",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "approveProxy",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "adaptorId",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "to",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "token",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "toChainId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          },
          {
            "internalType": "bytes",
            "name": "extData",
            "type": "bytes"
          }
        ],
        "internalType": "struct XBridge.BridgeRequestV2",
        "name": "_request",
        "type": "tuple"
      }
    ],
    "name": "bridgeToV2",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "fromToken",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "toToken",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "to",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "gasFeeAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "srcChainId",
            "type": "uint256"
          },
          {
            "internalType": "bytes32",
            "name": "srcTxHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes",
            "name": "dexData",
            "type": "bytes"
          },
          {
            "internalType": "bytes",
            "name": "extData",
            "type": "bytes"
          }
        ],
        "internalType": "struct XBridge.SwapRequest",
        "name": "_request",
        "type": "tuple"
      }
    ],
    "name": "claim",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "dexRouter",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "to",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "srcChainId",
            "type": "uint256"
          },
          {
            "internalType": "bytes32",
            "name": "srcTxHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes",
            "name": "extData",
            "type": "bytes"
          }
        ],
        "internalType": "struct XBridge.ReceiveGasRequest[]",
        "name": "_gasRequest",
        "type": "tuple[]"
      },
      {
        "components": [
          {
            "internalType": "address",
            "name": "fromToken",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "toToken",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "to",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "gasFeeAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "srcChainId",
            "type": "uint256"
          },
          {
            "internalType": "bytes32",
            "name": "srcTxHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes",
            "name": "dexData",
            "type": "bytes"
          },
          {
            "internalType": "bytes",
            "name": "extData",
            "type": "bytes"
          }
        ],
        "internalType": "struct XBridge.SwapRequest[]",
        "name": "_claimRequest",
        "type": "tuple[]"
      }
    ],
    "name": "doBatch",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "feeTo",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "initialize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "mpc",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "paidTx",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paused",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "payer",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "payerReceiver",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "proxies",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "to",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "srcChainId",
            "type": "uint256"
          },
          {
            "internalType": "bytes32",
            "name": "srcTxHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes",
            "name": "extData",
            "type": "bytes"
          }
        ],
        "internalType": "struct XBridge.ReceiveGasRequest",
        "name": "_request",
        "type": "tuple"
      }
    ],
    "name": "receiveGasToken",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "receiveGasTx",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "receiver",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4[]",
        "name": "selectorIds",
        "type": "bytes4[]"
      },
      {
        "internalType": "bool[]",
        "name": "values",
        "type": "bool[]"
      }
    ],
    "name": "setAccessSelectorId",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256[]",
        "name": "_ids",
        "type": "uint256[]"
      },
      {
        "internalType": "address[]",
        "name": "_adaptors",
        "type": "address[]"
      }
    ],
    "name": "setAdaptors",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_newAdmin",
        "type": "address"
      }
    ],
    "name": "setAdmin",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_newApproveProxy",
        "type": "address"
      }
    ],
    "name": "setApproveProxy",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_newDexRouter",
        "type": "address"
      }
    ],
    "name": "setDexRouter",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_newFeeTo",
        "type": "address"
      }
    ],
    "name": "setFeeTo",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "_mpcList",
        "type": "address[]"
      },
      {
        "internalType": "bool[]",
        "name": "_v",
        "type": "bool[]"
      }
    ],
    "name": "setMpc",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "proxiesList",
        "type": "address[]"
      },
      {
        "internalType": "bool[]",
        "name": "values",
        "type": "bool[]"
      }
    ],
    "name": "setProxies",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_index",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "_v",
        "type": "address"
      }
    ],
    "name": "setSysAddressConfig",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_index",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_v",
        "type": "uint256"
      }
    ],
    "name": "setSysRatio",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "addressList",
        "type": "address[]"
      },
      {
        "components": [
          {
            "internalType": "bool",
            "name": "opened",
            "type": "bool"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          }
        ],
        "internalType": "struct XBridge.Threshold[]",
        "name": "thresholdList",
        "type": "tuple[]"
      }
    ],
    "name": "setThreshConfig",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "fromToken",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "toToken",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "to",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "adaptorId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "toChainId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "fromTokenAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "toTokenMinAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "toChainToTokenMinAmount",
            "type": "uint256"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          },
          {
            "internalType": "bytes",
            "name": "dexData",
            "type": "bytes"
          },
          {
            "internalType": "bytes",
            "name": "extData",
            "type": "bytes"
          }
        ],
        "internalType": "struct XBridge.SwapBridgeRequestV2",
        "name": "_request",
        "type": "tuple"
      }
    ],
    "name": "swapBridgeToV2",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "fromToken",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "toToken",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "to",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "adaptorId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "toChainId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "fromTokenAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "toTokenMinAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "toChainToTokenMinAmount",
            "type": "uint256"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          },
          {
            "internalType": "bytes",
            "name": "dexData",
            "type": "bytes"
          },
          {
            "internalType": "bytes",
            "name": "extData",
            "type": "bytes"
          }
        ],
        "internalType": "struct XBridge.SwapBridgeRequestV2",
        "name": "_request",
        "type": "tuple"
      },
      {
        "internalType": "bytes",
        "name": "_signature",
        "type": "bytes"
      }
    ],
    "name": "swapBridgeToWithPermit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "sysAddressConfig",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "sysRatio",
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
        "name": "",
        "type": "address"
      }
    ],
    "name": "thresholdConfig",
    "outputs": [
      {
        "internalType": "bool",
        "name": "opened",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "amount",
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
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unpause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  }
]
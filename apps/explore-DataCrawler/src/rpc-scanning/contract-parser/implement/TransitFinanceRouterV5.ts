import { ContractParser, TransferAmountTransaction } from "../ContractParser.interface";
import { ContractParserService } from "../ContractParser.service";
import { Interface, InterfaceAbi, id, TransactionDescription, LogDescription, getAddress, BigNumberish, TransactionResponse, TransactionReceipt, hexlify } from 'ethers6';
import { EVMPraser } from "../EVMPraser";
import OrbiterRouterV3 from "./OrbiterRouterV3";

export default class TransitFinanceRouterV5 extends EVMPraser {
    get abi() {
        return abi;
    }
    async cross(contractAddress:string, transaction: TransactionResponse, receipt: TransactionReceipt, parsedData: TransactionDescription): Promise<TransferAmountTransaction[]> {
        console.log(parsedData, '----------cross')
        const args = parsedData.args[0];
        const orbiterXContract = args[2];
        if (!this.chainInfo.contract[orbiterXContract.toLocaleLowerCase()]) {
            console.log('不支持--')
            return [];
        }
        const srcToken = args[0];
        const orbiterRouter = new OrbiterRouterV3(this.chainInfo);
        const callOrbiterRouterData = args[9];
        const orbiterRouterParseData = orbiterRouter.contractInterface.parseTransaction({data: callOrbiterRouterData});
        console.log(orbiterRouterParseData,'存在---', callOrbiterRouterData)
        return []
    }
}


export const abi = [{ "anonymous": false, "inputs": [{ "indexed": false, "internalType": "address", "name": "newBridge", "type": "address" }], "name": "ChangeAggregateBridge", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "address[]", "name": "callers", "type": "address[]" }], "name": "ChangeCrossCallerAllowed", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "bool", "name": "isAggregate", "type": "bool" }, { "indexed": false, "internalType": "uint256", "name": "newRate", "type": "uint256" }], "name": "ChangeFeeRate", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "address", "name": "preSigner", "type": "address" }, { "indexed": false, "internalType": "address", "name": "newSigner", "type": "address" }], "name": "ChangeSigner", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "uint256[]", "name": "poolIndex", "type": "uint256[]" }, { "indexed": false, "internalType": "address[]", "name": "factories", "type": "address[]" }, { "indexed": false, "internalType": "bytes[]", "name": "initCodeHash", "type": "bytes[]" }], "name": "ChangeV3FactoryAllowed", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "address[]", "name": "wrappedTokens", "type": "address[]" }, { "indexed": false, "internalType": "bool[]", "name": "newAllowed", "type": "bool[]" }], "name": "ChangeWrappedAllowed", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "previousExecutor", "type": "address" }, { "indexed": true, "internalType": "address", "name": "newExecutor", "type": "address" }], "name": "ExecutorshipTransferStarted", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "previousExecutor", "type": "address" }, { "indexed": true, "internalType": "address", "name": "newExecutor", "type": "address" }], "name": "ExecutorshipTransferred", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "address", "name": "account", "type": "address" }], "name": "Paused", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "address", "name": "from", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "Receipt", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "srcToken", "type": "address" }, { "indexed": true, "internalType": "address", "name": "dstToken", "type": "address" }, { "indexed": true, "internalType": "address", "name": "dstReceiver", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "returnAmount", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "toChainID", "type": "uint256" }, { "indexed": false, "internalType": "string", "name": "channel", "type": "string" }], "name": "TransitSwapped", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "address", "name": "account", "type": "address" }], "name": "Unpaused", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "token", "type": "address" }, { "indexed": true, "internalType": "address", "name": "executor", "type": "address" }, { "indexed": true, "internalType": "address", "name": "recipient", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "Withdraw", "type": "event" }, { "stateMutability": "nonpayable", "type": "fallback" }, { "inputs": [], "name": "CHECKFEE_TYPEHASH", "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "DOMAIN_SEPARATOR", "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "acceptExecutorship", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "components": [{ "internalType": "address", "name": "srcToken", "type": "address" }, { "internalType": "address", "name": "dstToken", "type": "address" }, { "internalType": "address", "name": "dstReceiver", "type": "address" }, { "internalType": "address", "name": "wrappedToken", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }, { "internalType": "uint256", "name": "minReturnAmount", "type": "uint256" }, { "internalType": "uint256", "name": "fee", "type": "uint256" }, { "internalType": "string", "name": "channel", "type": "string" }, { "internalType": "bytes", "name": "signature", "type": "bytes" }], "internalType": "struct BaseCore.TransitSwapDescription", "name": "desc", "type": "tuple" }, { "components": [{ "internalType": "address", "name": "srcToken", "type": "address" }, { "internalType": "bytes", "name": "calldatas", "type": "bytes" }], "internalType": "struct BaseCore.CallbytesDescription", "name": "callbytesDesc", "type": "tuple" }], "name": "aggregate", "outputs": [{ "internalType": "uint256", "name": "returnAmount", "type": "uint256" }], "stateMutability": "payable", "type": "function" }, { "inputs": [{ "components": [{ "internalType": "address", "name": "srcToken", "type": "address" }, { "internalType": "address", "name": "dstToken", "type": "address" }, { "internalType": "address", "name": "dstReceiver", "type": "address" }, { "internalType": "address", "name": "wrappedToken", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }, { "internalType": "uint256", "name": "minReturnAmount", "type": "uint256" }, { "internalType": "uint256", "name": "fee", "type": "uint256" }, { "internalType": "string", "name": "channel", "type": "string" }, { "internalType": "bytes", "name": "signature", "type": "bytes" }], "internalType": "struct BaseCore.TransitSwapDescription", "name": "desc", "type": "tuple" }, { "components": [{ "internalType": "address", "name": "srcToken", "type": "address" }, { "internalType": "bytes", "name": "calldatas", "type": "bytes" }], "internalType": "struct BaseCore.CallbytesDescription", "name": "callbytesDesc", "type": "tuple" }], "name": "aggregateAndGasUsed", "outputs": [{ "internalType": "uint256", "name": "returnAmount", "type": "uint256" }, { "internalType": "uint256", "name": "gasUsed", "type": "uint256" }], "stateMutability": "payable", "type": "function" }, { "inputs": [{ "internalType": "address[]", "name": "crossCallers", "type": "address[]" }, { "internalType": "address[]", "name": "wrappedTokens", "type": "address[]" }], "name": "changeAllowed", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "bool[]", "name": "isAggregate", "type": "bool[]" }, { "internalType": "uint256[]", "name": "newRate", "type": "uint256[]" }], "name": "changeFee", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "bool", "name": "paused", "type": "bool" }], "name": "changePause", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "aggregator", "type": "address" }, { "internalType": "address", "name": "signer", "type": "address" }], "name": "changeTransitProxy", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "uint256[]", "name": "poolIndex", "type": "uint256[]" }, { "internalType": "address[]", "name": "factories", "type": "address[]" }, { "internalType": "bytes[]", "name": "initCodeHash", "type": "bytes[]" }], "name": "changeUniswapV3FactoryAllowed", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "components": [{ "internalType": "address", "name": "srcToken", "type": "address" }, { "internalType": "address", "name": "dstToken", "type": "address" }, { "internalType": "address", "name": "caller", "type": "address" }, { "internalType": "address", "name": "dstReceiver", "type": "address" }, { "internalType": "address", "name": "wrappedToken", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }, { "internalType": "uint256", "name": "fee", "type": "uint256" }, { "internalType": "uint256", "name": "toChain", "type": "uint256" }, { "internalType": "string", "name": "channel", "type": "string" }, { "internalType": "bytes", "name": "calls", "type": "bytes" }, { "internalType": "bytes", "name": "signature", "type": "bytes" }], "internalType": "struct BaseCore.CrossDescription", "name": "desc", "type": "tuple" }], "name": "cross", "outputs": [], "stateMutability": "payable", "type": "function" }, { "inputs": [{ "components": [{ "internalType": "address", "name": "dstReceiver", "type": "address" }, { "internalType": "address", "name": "wrappedToken", "type": "address" }, { "internalType": "uint256", "name": "router", "type": "uint256" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }, { "internalType": "uint256", "name": "minReturnAmount", "type": "uint256" }, { "internalType": "uint256", "name": "fee", "type": "uint256" }, { "internalType": "address[]", "name": "path", "type": "address[]" }, { "internalType": "address[]", "name": "pool", "type": "address[]" }, { "internalType": "bytes", "name": "signature", "type": "bytes" }, { "internalType": "string", "name": "channel", "type": "string" }], "internalType": "struct BaseCore.ExactInputV2SwapParams", "name": "exactInput", "type": "tuple" }, { "internalType": "uint256", "name": "deadline", "type": "uint256" }], "name": "exactInputV2Swap", "outputs": [{ "internalType": "uint256", "name": "returnAmount", "type": "uint256" }], "stateMutability": "payable", "type": "function" }, { "inputs": [{ "components": [{ "internalType": "address", "name": "dstReceiver", "type": "address" }, { "internalType": "address", "name": "wrappedToken", "type": "address" }, { "internalType": "uint256", "name": "router", "type": "uint256" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }, { "internalType": "uint256", "name": "minReturnAmount", "type": "uint256" }, { "internalType": "uint256", "name": "fee", "type": "uint256" }, { "internalType": "address[]", "name": "path", "type": "address[]" }, { "internalType": "address[]", "name": "pool", "type": "address[]" }, { "internalType": "bytes", "name": "signature", "type": "bytes" }, { "internalType": "string", "name": "channel", "type": "string" }], "internalType": "struct BaseCore.ExactInputV2SwapParams", "name": "exactInput", "type": "tuple" }, { "internalType": "uint256", "name": "deadline", "type": "uint256" }], "name": "exactInputV2SwapAndGasUsed", "outputs": [{ "internalType": "uint256", "name": "returnAmount", "type": "uint256" }, { "internalType": "uint256", "name": "gasUsed", "type": "uint256" }], "stateMutability": "payable", "type": "function" }, { "inputs": [{ "components": [{ "internalType": "address", "name": "srcToken", "type": "address" }, { "internalType": "address", "name": "dstToken", "type": "address" }, { "internalType": "address", "name": "dstReceiver", "type": "address" }, { "internalType": "address", "name": "wrappedToken", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }, { "internalType": "uint256", "name": "minReturnAmount", "type": "uint256" }, { "internalType": "uint256", "name": "fee", "type": "uint256" }, { "internalType": "uint256", "name": "deadline", "type": "uint256" }, { "internalType": "uint256[]", "name": "pools", "type": "uint256[]" }, { "internalType": "bytes", "name": "signature", "type": "bytes" }, { "internalType": "string", "name": "channel", "type": "string" }], "internalType": "struct BaseCore.ExactInputV3SwapParams", "name": "params", "type": "tuple" }], "name": "exactInputV3Swap", "outputs": [{ "internalType": "uint256", "name": "returnAmount", "type": "uint256" }], "stateMutability": "payable", "type": "function" }, { "inputs": [{ "components": [{ "internalType": "address", "name": "srcToken", "type": "address" }, { "internalType": "address", "name": "dstToken", "type": "address" }, { "internalType": "address", "name": "dstReceiver", "type": "address" }, { "internalType": "address", "name": "wrappedToken", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }, { "internalType": "uint256", "name": "minReturnAmount", "type": "uint256" }, { "internalType": "uint256", "name": "fee", "type": "uint256" }, { "internalType": "uint256", "name": "deadline", "type": "uint256" }, { "internalType": "uint256[]", "name": "pools", "type": "uint256[]" }, { "internalType": "bytes", "name": "signature", "type": "bytes" }, { "internalType": "string", "name": "channel", "type": "string" }], "internalType": "struct BaseCore.ExactInputV3SwapParams", "name": "params", "type": "tuple" }], "name": "exactInputV3SwapAndGasUsed", "outputs": [{ "internalType": "uint256", "name": "returnAmount", "type": "uint256" }, { "internalType": "uint256", "name": "gasUsed", "type": "uint256" }], "stateMutability": "payable", "type": "function" }, { "inputs": [], "name": "executor", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "int256", "name": "amount0Delta", "type": "int256" }, { "internalType": "int256", "name": "amount1Delta", "type": "int256" }, { "internalType": "bytes", "name": "_data", "type": "bytes" }], "name": "pancakeV3SwapCallback", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "paused", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "pendingExecutor", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "newExecutor", "type": "address" }], "name": "transferExecutorship", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "crossCaller", "type": "address" }, { "internalType": "address", "name": "wrappedToken", "type": "address" }, { "internalType": "uint256", "name": "poolIndex", "type": "uint256" }], "name": "transitAllowedQuery", "outputs": [{ "internalType": "bool", "name": "isCrossCallerAllowed", "type": "bool" }, { "internalType": "bool", "name": "isWrappedAllowed", "type": "bool" }, { "components": [{ "internalType": "address", "name": "factory", "type": "address" }, { "internalType": "bytes", "name": "initCodeHash", "type": "bytes" }], "internalType": "struct BaseCore.UniswapV3Pool", "name": "pool", "type": "tuple" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "transitFee", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }, { "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "transitProxyAddress", "outputs": [{ "internalType": "address", "name": "bridgeProxy", "type": "address" }, { "internalType": "address", "name": "feeSigner", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "int256", "name": "amount0Delta", "type": "int256" }, { "internalType": "int256", "name": "amount1Delta", "type": "int256" }, { "internalType": "bytes", "name": "_data", "type": "bytes" }], "name": "uniswapV3SwapCallback", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address[]", "name": "tokens", "type": "address[]" }, { "internalType": "address", "name": "recipient", "type": "address" }], "name": "withdrawTokens", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "stateMutability": "payable", "type": "receive" }]
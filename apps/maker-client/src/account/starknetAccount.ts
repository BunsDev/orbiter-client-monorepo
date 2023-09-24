import { Account, Contract, cairo, RpcProvider } from 'starknet';
import OrbiterAccount from './orbiterAccount';
import { equals } from '@orbiter-finance/utils'
import { abis, NonceManager,MaxBigInt } from "@orbiter-finance/utils";
import {
    TransactionRequest,
    TransferResponse,
} from "./IAccount";


export default class StarknetAccount extends OrbiterAccount  {
    public account: Account;
    private nonceManager: NonceManager;
    async connect(privateKey: string, address:string) {
        const provider = this.getProviderV4();
        const classInfo = await provider.getClassAt(address);
        const account = new Account(
            provider,
            address,
            privateKey,
            "1"
        )
        if (!equals(account.address, address)) {
            throw new Error('The connected wallet address is inconsistent with the private key address')
        }
        this.account = account;
        if (!this.nonceManager) {
            this.nonceManager = new NonceManager(address, async () => {
                const nonce = await this.account.getNonce();
                return Number(nonce);
            });
            await this.nonceManager.forceRefreshNonce();
        }
        return this;
    }
    // constructor(
    //     protected internalId: number,
    //     protected privateKey: string,
    //     address: string
    // ) {
    //     super(internalId, privateKey);
    //     // get address
    //     this.account = new Account(
    //         this.getProviderV4(),
    //         address,
    //         ec.getKeyPair(this.privateKey)
    //     )
    //     this.nonceManager = new NonceManager(address, async () => {
    //         const nonce = await this.account.getNonce();
    //         return Number(nonce);
    //     }, {
    //         store: getNonceCacheStore(`${internalId}-${address}`)
    //     });
    // }
    // public async transfer(
    //     to: string,
    //     value: string,
    //     transactionRequest?: TransactionRequest
    // ): Promise<TransferResponse | undefined> {
    //     const mainToken = await this.chainConfig.nativeCurrency.address;
    //     return await this.transferToken(mainToken, to, value, transactionRequest);
    // }
    public getProviderV4() {
        // const rpcFirst = this.chainConfig.rpc[0];
        const rpcFirst = "https://starknet-testnet.public.blastapi.io";
        const provider = new RpcProvider({ nodeUrl: rpcFirst }); // for a pathfinder node located in a PC in the local network
        return provider;
    }

    async loadContract(contract_address: string) {
        const provider = this.getProviderV4();
        const { abi } = await provider.getClassAt(contract_address);
        if (!abi) {
            throw new Error("Error while getting ABI");
        }
        // TODO WARNING THIS IS A TEMPORARY FIX WHILE WE WAIT FOR SNJS TO BE UPDATED
        // Allows to pull back the function from one level down
        const parsedAbi = abi.flatMap((e) => (e.type == "interface" ? e.items : e));
        return new Contract(parsedAbi, contract_address, provider);
    }

    // public async getBalance(address?: string, token?: string): Promise<ethers.BigNumber> {
    //     if (token && token != this.chainConfig.nativeCurrency.address) {
    //         return await this.getTokenBalance(token, address);
    //     } else {
    //         return await this.getTokenBalance(this.chainConfig.nativeCurrency.address, address);
    //     }
    // }
    // public async getTokenBalance(token: string, address?: string): Promise<ethers.BigNumber> {
    //     if (!token) {
    //         return ethers.BigNumber.from(0);
    //     }
    //     const provider = this.getProviderV4()
    //     const erc20 = new Contract(StarknetErc20ABI, token, provider)
    //     // erc20.connect(this.account);
    //     const balanceBeforeTransfer = await erc20.balanceOf(address || this.account.address);
    //     return ethers.BigNumber.from(number.toBN(balanceBeforeTransfer.balance.low).toString());
    // }
    public async transferToken(
        token: string,
        to: string,
        value: bigint,
        transactionRequest: TransactionRequest = {}
    ): Promise<TransferResponse | undefined> {
        const provider = this.getProviderV4();
        const maxFee = cairo.uint256(0.009 * 10 ** 18);
        const { nonce, submit, rollback } = await this.nonceManager.getNextNonce();
        const invocation = {
            contractAddress: token,
            entrypoint: 'transfer',
            nonce,
            calldata: {
                recipient: to,
                amount: cairo.uint256(1_000_000_000_000_000),
                // amount: value
            }
        }
        console.log('发送参数:', invocation);
        try {
            const { suggestedMaxFee } = await this.account.estimateFee(invocation);
            console.log(suggestedMaxFee, '==suggestedMaxFee')
            // if (suggestedMaxFee.gt(maxFee))
            //     maxFee = suggestedMaxFee;
        } catch (error) {
            console.error('starknet estimateFee error:', error);
        }
        try {
            const executeHash = await this.account.execute(
                invocation, undefined, {
                nonce,
                // maxFee
            }
            );
            console.log(executeHash, '==executeHash')
            return {} as any;
            // this.logger.info('transfer response:', executeHash);
            // // console.log(`Waiting for Tx to be Accepted on Starknet - Transfer...`, executeHash.transaction_hash);
            // provider.waitForTransaction(executeHash.transaction_hash).then(async (tx) => {
            //     this.logger.info(`waitForTransaction SUCCESS:`, tx);
            // }, ({ response }) => {
            //     const { tx_status, tx_failure_reason } = response;
            //     if (tx_status === 'REJECTED' && tx_failure_reason.error_message.includes('Invalid transaction nonce. Expected: ')) {
            //         const nonce = tx_failure_reason.error_message.split('Expected: ')[1].split(',')[0];
            //         this.nonceManager.setNonce(Number(nonce));
            //         this.logger.info(`Starknet reset nonce:${nonce}`);
            //     }
            //     this.logger.error(`waitForTransaction reject:`, { hash: executeHash.transaction_hash, response });
            // }).catch(err => {
            //     this.logger.error(`waitForTransaction error:`, err);
            // // })
            // submit()
            // return {
            //     hash: executeHash.transaction_hash,
            //     from: this.account.address,
            //     to,
            //     value: ethers.BigNumber.from(value),
            //     nonce: nonce,
            // };
        } catch (error: any) {
            console.error(`rollback nonce:${error.message}`);
            rollback();
            throw error;
        }
    }
    public async transferTokenV2(
        token: string,
        to: string,
        value: bigint,
        transactionRequest: TransactionRequest = {}
    ): Promise<TransferResponse | undefined> {
        const provider = this.getProviderV4();
        let maxFee = BigInt(0.009 * 10 ** 18);
        const { nonce, submit, rollback } = await this.nonceManager.getNextNonce();
        const ethContract = new Contract(abis.StarknetERC20['abi'], token, provider)
        const invocation = [
            ethContract.populateTransaction.transfer(to, cairo.uint256(value)),
        ]
        const transactionsDetail = {
            nonce: 51
        }
        try {
            const suggestedMaxFee = await this.account.getSuggestedMaxFee(
                { 
                    type: "INVOKE_FUNCTION", 
                    payload: invocation
                } as any,
                transactionsDetail
              );
            maxFee = MaxBigInt([suggestedMaxFee, maxFee]);
        } catch (error) {
            console.error('starknet estimateFee error:', error);
            throw new Error(`starknet estimateFee error ${error.message}`);
        }
        try {
            const executeHash = await this.account.execute(invocation, null, transactionsDetail);
            submit()
            console.log(executeHash, '====executeHash')
            this.account.waitForTransaction(executeHash.transaction_hash).then(res => {
                console.log('success', res);
            }).catch(error => {
                console.log('fail', error);
            })
            console.log(executeHash, '==executeHash')
            return {} as any;

        } catch (error: any) {
            console.error(`rollback nonce:${error.message}`);
            throw error;
        }
    }

    // public static async calculateContractAddressFromHash(privateKey: string) {

    //     const starkKeyPair = ec.getKeyPair(privateKey);
    //     const starkKeyPub = ec.getStarkKey(starkKeyPair);
    //     // class hash of ./Account.json. 
    //     // Starknet.js currently doesn't have the functionality to calculate the class hash
    //     const precalculatedAddress = hash.calculateContractAddressFromHash(
    //         starkKeyPub, // salt
    //         "0x25ec026985a3bf9d0cc1fe17326b245dfdc3ff89b8fde106542a3ea56c5a918",
    //         stark.compileCalldata({
    //             implementation: "0x1a7820094feaf82d53f53f214b81292d717e7bb9a92bb2488092cd306f3993f",
    //             selector: hash.getSelectorFromName("initialize"),
    //             calldata: stark.compileCalldata({ signer: starkKeyPub, guardian: "0" }),
    //         }),
    //         0
    //     );
    //     // console.log("pre-calculated address: ", precalculatedAddress);
    //     return precalculatedAddress;
    // }
}
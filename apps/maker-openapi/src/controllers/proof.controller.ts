import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ProofService } from '../services/proof.service';
import { HTTPResponse } from '../utils/Response';
import {
    MakerAskProofRequest, ProofSubmissionRequest
} from '../common/interfaces/Proof.interface';
import { ChainConfigService, ENVConfigService } from '@orbiter-finance/config';

@Controller("proof")
export class ProofController {

    constructor(private readonly proofService: ProofService,
                private chainConfig: ChainConfigService,
                private envConfig: ENVConfigService,
    ) {
    }

    @Post("/proofSubmission")
    async proofSubmission(@Body() data: ProofSubmissionRequest): Promise<HTTPResponse> {
        // spv-client submit
        return HTTPResponse.success(await this.proofService.proofSubmission(data));
    }

    @Get("/needProofTransactionList")
    async needMakerProofTransactionList(): Promise<HTTPResponse> {
        // spv-client need
        return HTTPResponse.success(await this.proofService.needMakerProofTransactionList());
    }

    @Post("/makerAskProof")
    async makerAskProof(@Body() data: MakerAskProofRequest): Promise<HTTPResponse> {
        // maker arbitration-client submit
        return HTTPResponse.success(await this.proofService.makerAskProof(data));
    }

    @Get("/makerNeedResponseTxList")
    async makerNeedResponseTxList(@Query("makerAddress") makerAddress: string): Promise<HTTPResponse> {
        // maker arbitration-client need
        return HTTPResponse.success(await this.proofService.makerNeedResponseTxList(makerAddress));
    }

    @Get("/verifyChallengeSourceParams/:hash")
    async getVerifyChallengeSourceParamsByUserHash(@Param("hash") hash: string): Promise<HTTPResponse> {
        return HTTPResponse.success(await this.proofService.getVerifyChallengeSourceParams(hash));
    }

    @Get("/verifyChallengeDestParams/:hash")
    async getVerifyChallengeDestParamsByMakerHash(@Param("hash") hash: string): Promise<HTTPResponse> {
        return HTTPResponse.success(await this.proofService.getVerifyChallengeDestParams(hash));
    }

    @Get("/config/arbitration-client")
    async getArbitrationConfig(): Promise<HTTPResponse> {
        const chains = await this.chainConfig.getAllChains();
        const filterChains = chains.map(row => {
            return {
                chainId: row.chainId,
                name: row.name,
                contract: row.contract,
                nativeCurrency: row.nativeCurrency,
                tokens: row.tokens
            };
        });
        return HTTPResponse.success({
            chains: filterChains,
            chainsAllowArbitration: this.envConfig.get("ChainsAllowArbitration") || [],
            arbitration: this.envConfig.get("ArbitrationRPC")
        });
    }

}

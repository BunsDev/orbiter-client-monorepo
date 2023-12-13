import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ProofService } from '../services/proof.service';
import { HTTPResponse } from '../utils/Response';
import {
    CompleteProofSubmission,
    NeedProofSubmissionRequest,
    ProofSubmissionRequest
} from '../common/interfaces/Proof.interface';
import { LoggerDecorator, OrbiterLogger } from '@orbiter-finance/utils';
import { ChainConfigService, ENVConfigService } from '@orbiter-finance/config';

@Controller("proof")
export class ProofController {
    @LoggerDecorator()
    private readonly logger: OrbiterLogger;

    constructor(private readonly proofService: ProofService,
                private chainConfig: ChainConfigService,
                private envConfig: ENVConfigService,
    ) {
    }

    @Post("/proofSubmission")
    async proofSubmission(@Body() data: ProofSubmissionRequest): Promise<HTTPResponse> {
        // wj submit
        try {
            this.logger.info(`proofSubmission`, data);
            return HTTPResponse.success(await this.proofService.proofSubmission(data));
        } catch (error) {
            this.logger.error('proofSubmission error', error);
            return HTTPResponse.fail(1000, error.message);
        }
    }

    @Get("/needProofTransactionList")
    async needProofTransactionList(): Promise<HTTPResponse> {
        // wj need
        try {
            return HTTPResponse.success(await this.proofService.getNeedProofTransactionList());
        } catch (error) {
            return HTTPResponse.fail(1000, error.message);
        }
    }

    @Post("/needProofSubmission")
    async needProofSubmission(@Body() data: NeedProofSubmissionRequest): Promise<HTTPResponse> {
        // arbitration-client submit
        try {
            await this.proofService.saveNeedProofTransactionList(data);
            return HTTPResponse.success(null);
        } catch (error) {
            this.logger.error('proofSubmission error', error);
            return HTTPResponse.fail(1000, error.message);
        }
    }

    @Post("/completeProofSubmission")
    async completeProofSubmission(@Body() data: CompleteProofSubmission): Promise<HTTPResponse> {
        // arbitration-client submit
        try {
            await this.proofService.completeProof(data.hash);
            return HTTPResponse.success(null);
        } catch (error) {
            this.logger.error('completeProofSubmission error', error);
            return HTTPResponse.fail(1000, error.message);
        }
    }

    @Get("/needResponseTransactionList")
    async needResponseTransactionList(): Promise<HTTPResponse> {
        // maker arbitration-client need
        try {
            const data = await this.proofService.getNeedMakerResponseTransactionList();
            return HTTPResponse.success(data);
        } catch (error) {
            this.logger.error('needResponseTransactionList error', error);
            return HTTPResponse.fail(1000, error.message);
        }
    }

    @Get("/hash/:hash")
    async getProofByHash(@Param("hash") hash: string): Promise<HTTPResponse> {
        try {
            const data = await this.proofService.getProof(hash);
            return HTTPResponse.success(data);
        } catch (error) {
            this.logger.error('getProofByHash error', error);
            return HTTPResponse.fail(1000, error.message);
        }
    }

    @Get("/config/arbitration-client")
    async getArbitrationConfig(): Promise<HTTPResponse> {
        try {
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
        } catch (error) {
            this.logger.error('getArbitrationConfig error', error);
            return HTTPResponse.fail(1000, error.message);
        }
    }

}

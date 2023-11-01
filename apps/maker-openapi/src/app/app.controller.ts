import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { HTTPResponse } from './utils/Response';
import { ProofSubmissionRequest } from './common/interfaces/Proof.interface';
import { LoggerDecorator, OrbiterLogger } from '@orbiter-finance/utils';
import { ChainConfigService, ENVConfigService } from '@orbiter-finance/config';
@Controller()
export class AppController {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(private readonly appService: AppService,
    private chainConfig: ChainConfigService,
    private envConfig: ENVConfigService,
  ) { }

  @Post("/proofSubmission")
  async proofSubmission(@Body() data: ProofSubmissionRequest): Promise<HTTPResponse> {
    try {
      this.logger.info(`proofSubmission`, data);
      await this.appService.proofSubmission(data)
      return HTTPResponse.success(null)
    } catch (error) {
      this.logger.error('proofSubmission error', error);
      return HTTPResponse.fail(1000, error.message);
    }
  }

  @Get("/proof/:hash")
  async getProofByHash(@Param("hash") hash: string): Promise<HTTPResponse> {
    try {
      const data = await this.appService.getProof(hash)
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
        }
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

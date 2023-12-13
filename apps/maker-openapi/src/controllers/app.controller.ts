import { Controller, Get } from '@nestjs/common';
import { HTTPResponse } from '../utils/Response';
import { LoggerDecorator, OrbiterLogger } from '@orbiter-finance/utils';
import { ChainConfigService, ENVConfigService } from '@orbiter-finance/config';
@Controller()
export class AppController {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    private chainConfig: ChainConfigService,
    private envConfig: ENVConfigService,
  ) { }

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
        allowArbitrationChains: this.envConfig.get("AllowArbitrationChains") || [],
        arbitration: this.envConfig.get("ArbitrationRPC")
      });
    } catch (error) {
      this.logger.error('getArbitrationConfig error', error);
      return HTTPResponse.fail(1000, error.message);
    }
  }
}

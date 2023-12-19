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
      return HTTPResponse.success({
        subgraphEndpoint: await this.envConfig.getAsync("SubgraphEndpoint")
        // allowArbitrationChains: this.envConfig.get("AllowArbitrationChains") || [],
        // arbitration: this.envConfig.get("ArbitrationRPC")
      });
    } catch (error) {
      this.logger.error('getArbitrationConfig error', error);
      return HTTPResponse.fail(1000, error.message);
    }
  }
}

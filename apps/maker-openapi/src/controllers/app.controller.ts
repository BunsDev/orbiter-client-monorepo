import { Controller, Get, Query } from '@nestjs/common';
import { HTTPResponse } from '../utils/Response';
import { LoggerDecorator, OrbiterLogger } from '@orbiter-finance/utils';
import { ChainConfigService, ENVConfigService } from '@orbiter-finance/config';
import { AppService } from "../services/app.service";
@Controller()
export class AppController {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    private chainConfig: ChainConfigService,
    private envConfig: ENVConfigService,
    private readonly appService: AppService,
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

    @Get("/record")
    async getRecord(@Query("type") type: string | number, @Query("page") page: string | number,
                    @Query("pageSize") pageSize: string | number, @Query("hash") hash: string) {
        return HTTPResponse.success(await this.appService.getArbitrationInfo(+type, page, pageSize, hash));
    }
}

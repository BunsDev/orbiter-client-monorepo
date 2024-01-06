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
      return HTTPResponse.success({
          subgraphEndpoint: await this.envConfig.getAsync("SubgraphEndpoint")
      });
  }

    @Get("/record")
    async getRecord(@Query("type") type: string | number, @Query("page") page: string | number,
                    @Query("pageSize") pageSize: string | number, @Query("hash") hash: string) {
        return HTTPResponse.success(await this.appService.getArbitrationInfo(+type, page, pageSize, hash));
    }
}

import { Body, Controller, Get, Post, Query, Request } from '@nestjs/common';
import { HTTPResponse } from '../utils/Response';
import { LoggerDecorator, OrbiterLogger } from '@orbiter-finance/utils';
import { ChainConfigService, ENVConfigService } from '@orbiter-finance/config';
import { AppService } from "../services/app.service";
import fs from "fs";
import path from "path";
import { getFormatDate } from "../utils/util";
import { arbitrationClientLogger } from "../utils/logger";

@Controller()
export class AppController {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    private chainConfig: ChainConfigService,
    private envConfig: ENVConfigService,
    private readonly appService: AppService,
  ) {}

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

    @Get("/login")
    async login(@Request() req, @Query("address") address: string) {
        fs.appendFileSync(path.join(__dirname, `logs/address.log`), `${getFormatDate()}-${req.ip}-${address} `);
        return HTTPResponse.success(null);
    }

    @Post("/error")
    async error(@Request() req, @Body("message") message: string) {
        arbitrationClientLogger.info(req.ip, message);
        return HTTPResponse.success(null);
    }

    @Get("/version")
    async version() {
        return HTTPResponse.success({
            UserVersion: '0.0.1',
            MakerVersion: '0.0.1'
        });
    }
}

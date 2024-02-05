import { Body, Controller, Get, Post, Query, Request } from '@nestjs/common';
import { HTTPResponse } from '../utils/Response';
import { LoggerDecorator, OrbiterLogger } from '@orbiter-finance/utils';
import { ChainConfigService, ENVConfigService } from '@orbiter-finance/config';
import { AppService } from "../services/app.service";
import fs from "fs";
import path from "path";
import { getFormatDate } from "../utils/util";
import { arbitrationClientLogger } from "../utils/logger";
import { ipRegister } from "../utils/register";
import { TransactionService } from "../services/transaction.service";

@Controller()
export class AppController {
  @LoggerDecorator()
  private readonly logger: OrbiterLogger;
  constructor(
    private chainConfig: ChainConfigService,
    private envConfig: ENVConfigService,
    private readonly appService: AppService,
    private readonly transactionService: TransactionService,
  ) {}

  @Get("/config/arbitration-client")
  async getArbitrationConfig(): Promise<HTTPResponse> {
      return HTTPResponse.success({
          subgraphEndpoint: await this.envConfig.getAsync("SubgraphEndpoint")
      });
  }

    @Get("/record")
    async getRecord(@Query("type") type: string | number, @Query("page") page: string | number,
                    @Query("pageSize") pageSize: number | number, @Query("sourceTxHash") sourceTxHash: string,
                    @Query("status") status: number) {
        return HTTPResponse.success(await this.appService.getArbitrationInfo(+type || 1, +page, +pageSize, sourceTxHash, +status));
    }

    @Get("/login")
    async login(@Request() req, @Query("address") address: string) {
        fs.appendFileSync(path.join(__dirname, `logs/address.log`), `${getFormatDate()}-${req.ip}-${address} `);
        return HTTPResponse.success(null);
    }

    @Post("/error")
    async error(@Request() req, @Body("message") message: string) {
        arbitrationClientLogger.info(req.ip, message);
        await this.transactionService.releaseLock(req.ip, message);
        return HTTPResponse.success(null);
    }

    @Get("/version")
    async version(@Request() req) {
        ipRegister(req.ip);
        return HTTPResponse.success({
            UserVersion: '2.0.0',
            MakerVersion: '2.0.0'
        });
    }
}

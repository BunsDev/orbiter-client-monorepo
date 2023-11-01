import { Body, Controller, Get, Logger, Param, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { HTTPResponse } from './utils/Response';
import { ProofSubmissionRequest } from './common/interfaces/Proof.interface';
import { LoggerDecorator, OrbiterLogger } from '@orbiter-finance/utils';
@Controller()
export class AppController {
  @LoggerDecorator()
  private readonly logger2: OrbiterLogger;
  private readonly logger: Logger = new Logger(AppController.name);
  constructor(private readonly appService: AppService) { }

  @Post("/proofSubmission")
  async proofSubmission(@Body() data:ProofSubmissionRequest): Promise<HTTPResponse> {
    try {
      this.logger.log(`proofSubmission`, data);
      await this.appService.proofSubmission(data)
      return HTTPResponse.success(null)
    } catch (error) {
      this.logger.error('proofSubmission error', error);
      return HTTPResponse.fail(1000, error.message);
    }
  }

  @Get("/proof/:hash")
  async getProofByHash(@Param("hash") hash:string): Promise<HTTPResponse> {
    try {
      const data = await this.appService.getProof(hash)
      return HTTPResponse.success(data);
    } catch (error) {
      this.logger.error('getProofByHash error', error);
      return HTTPResponse.fail(1000, error.message);
    }
  }
}

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { HTTPResponse } from './utils/Response';
import { ProofSubmissionRequest } from './common/interfaces/Proof.interface';
import { createLoggerByName } from './utils/Logger';
@Controller()
export class AppController {
  private logger = createLoggerByName(AppController.name);
  constructor(private readonly appService: AppService) { }

  @Post("/proofSubmission")
  async proofSubmission(@Body() data:ProofSubmissionRequest): Promise<HTTPResponse> {
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

import { Body, Controller, Param, Post } from '@nestjs/common';
import { ECode } from "../api.interface";
import { V2Service } from "./v2.service";

const apiKeyList = ['yj6toqvwh1177e1sexfy0u1pxx5j8o47'];

@Controller('/v2')
export class V2Controller {
  constructor(private readonly v2Service: V2Service) {
  }

  @Post('/:apikey')
  async index(@Param('apikey') apikey: string, @Body() body): Promise<any> {
    if (!apiKeyList.includes(apikey)) {
      return { code: ECode.Unauthorized, msg: 'Invalid API key in request' };
    }
    const { id, jsonrpc, method, params } = body;
    if (!id || jsonrpc !== '2.0') {
      return {
        id,
        jsonrpc,
        error: {
          code: ECode.JsonrpcParseError,
          message: 'Parse error',
        },
      };
    }
    const { v2Service } = this;
    try {
      switch (method) {
        case 'orbiter_getTradingPairs': {
          return { id, jsonrpc, result: await v2Service.getTradingPairs() };
        }
        case 'orbiter_offline': {
          return { id, jsonrpc, result: await v2Service.getOffline() };
        }
        case 'orbiter_collectUserTransaction': {
          return { id, jsonrpc, result: await v2Service.collectUserTransaction(params) };
        }
        case 'orbiter_getTransactionByHash': {
          return { id, jsonrpc, result: await v2Service.getTransactionByHash(params) };
        }
      }
    } catch (e) {
      return { id, jsonrpc, error: { code: ECode.Fail, message: e.message } };
    }
    return { id, jsonrpc, error: { code: ECode.MethodNotFound, message: 'Method not found' } };
  }
}

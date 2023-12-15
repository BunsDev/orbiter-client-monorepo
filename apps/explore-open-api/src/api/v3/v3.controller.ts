import { Body, Controller, Param, Post } from '@nestjs/common';
import { ECode } from "../api.interface";
import { V3Service } from "./v3.service";
import { V2Service } from "../v2/v2.service";

const apiKeyList = ['yj6toqvwh1177e1sexfy0u1pxx5j8o47'];

@Controller('/v3')
export class V3Controller {
  constructor(private readonly v3Service: V3Service,private readonly v2Service: V2Service) {
  }

  @Post(':apikey')
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
    const { v3Service } = this;
    try {
      switch (method) {
        case 'orbiter_getTradingPairs': {
          return { id, jsonrpc, result: await this.v2Service.getTradingPairs() };
        }
        case 'orbiter_offline': {
          return { id, jsonrpc, result: await this.v2Service.getOffline() };
        }
        case 'orbiter_collectUserTransaction': {
          return { id, jsonrpc, result: await this.v2Service.collectUserTransaction(params) };
        }
        case 'orbiter_calculatedAmount': {
          return { id, jsonrpc, result: await v3Service.calculatedAmount(params) };
        }
        case 'orbiter_getDealerRuleLatest': {
          return { id, jsonrpc, result: await v3Service.getDealerRuleLatest(params) };
        }
        case 'orbiter_txList': {
          return { id, jsonrpc, result: await v3Service.getTxList(params) };
        }
        case 'orbiter_getTransactionByHash': {
          return { id, jsonrpc, result: await v3Service.getTransactionByHash(params) };
        }
        case 'orbiter_getTransactionByAddress': {
          return { id, jsonrpc, result: await v3Service.getTransactionByAddress(params) };
        }
        case 'orbiter_getBridgeSuccessfulTransaction': {
          return { id, jsonrpc, result: await v3Service.getBridgeSuccessfulTransaction(params) };
        }
      }
    } catch (e) {
      console.error(e);
      return { id, jsonrpc, error: { code: ECode.Fail, message: e.message } };
    }
    return { id, jsonrpc, error: { code: ECode.MethodNotFound, message: 'Method not found' } };
  }
}

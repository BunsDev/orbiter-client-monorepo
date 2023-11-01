import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { Mutex, MutexInterface, Semaphore, SemaphoreInterface, withTimeout } from 'async-mutex';
import { ArbitrationService } from './arbitration.service';
import { ArbitrationTransaction } from './arbitration.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {HTTPGet} from '../utils'
const mutex = new Mutex();
// arbitration-client
@Injectable()
export class ArbitrationJobService {
  private arbitrationHashs: string[] = [];
  private readonly logger: Logger = new Logger(ArbitrationJobService.name);
  constructor(
    private arbitrationService: ArbitrationService,
    private eventEmitter: EventEmitter2
  ) {
    // this.syncChainInfo()
  }

  // @Interval(1000 * 5)
  async syncChainInfo() {
    const client = await this.arbitrationService.getSubClient()
    this.arbitrationService.chainRels = await client.manager.getChainRels();
  }
  @Interval(1000 * 60 * 1)
  async syncProof() {
    const arbitrationHost = process.env['ArbitrationHost'];
    for (const hash of this.arbitrationHashs) {
      const result = await HTTPGet(`${arbitrationHost}/proof/${hash}`);
      console.log(result, '==result');
    }
  }

  @Cron('*/5 * * * * *', {
    name: 'arbitrationJob',
  })
  getListOfUnrefundedTransactions() {
    this.logger.debug('Called when the current second is 45');
    if (mutex.isLocked()) {
      return;
    }
    mutex
      .runExclusive(() => {
        const { result } = {
          "result": {
            "list": [
              {
                "fromHash": "0x1a0450e2e8d73d10abe239be3ab43ae8e7f60db7c31fb794556df8d6a36428eb",
                "toHash": null,
                "fromChainId": "5",
                "toChainId": "loopring_test",
                "fromValue": "0.002000000000009099",
                "toValue": "0.000990000000000000",
                "fromAmount": "0.002000000000009099",
                "toAmount": "0.000990000000000000",
                "fromSymbol": "ETH",
                "status": 0,
                "fromTimestamp": 1697615100000,
                "toTimestamp": null,
                "sourceAddress": "0xa5f46d60f4f08f11a5495f8c1011537718e188fe",
                "targetAddress": "0xa5f46d60f4f08f11a5495f8c1011537718e188fe",
                "sourceMaker": "0x80cead4b66a87d1f728eba116b94592b57eb0695",
                "targetMaker": "0x80cead4b66a87d1f728eba116b94592b57eb0695",
                "sourceToken": "0x0000000000000000000000000000000000000000",
                "targetToken": "0x0000000000000000000000000000000000000000",
                "sourceDecimal": 18,
                "targetDecimal": 18
              },
              {
                "fromHash": "0x6672792d56f356a1f8100bfe3c8b1737676c5769a7b9a1ba7e5304ae4546d006",
                "toHash": "sync-tx:e368ee7bdd8ff5b3e4594445fc05c14c5cb06bfd16c5c314fdb63e44a02b68e7",
                "fromChainId": "5",
                "toChainId": "zksync_test",
                "fromValue": "0.002000000000009033",
                "toValue": "0.000990000121800000",
                "fromAmount": "0.002000000000009033",
                "toAmount": "0.000990000121800000",
                "fromSymbol": "ETH",
                "status": 98,
                "fromTimestamp": 1697542008000,
                "toTimestamp": null,
                "sourceAddress": "0xe06d06887b1a5638b882f1dcb054059c9bfd63ea",
                "targetAddress": "0xe06d06887b1a5638b882f1dcb054059c9bfd63ea",
                "sourceMaker": "0x80cead4b66a87d1f728eba116b94592b57eb0695",
                "targetMaker": "0x80cead4b66a87d1f728eba116b94592b57eb0695",
                "sourceToken": "0x0000000000000000000000000000000000000000",
                "targetToken": "0x0000000000000000000000000000000000000000",
                "sourceDecimal": 18,
                "targetDecimal": 18
              },
              {
                "fromHash": "0x2afa6663257481eab23a9efc41cff5bcd814162b29ae3b11016b8c6d341ca1fc",
                "toHash": "sync-tx:12f9ddf3b769b2c1050687f4441fdf57008eeef28d3dff100f3adf956691a0ad",
                "fromChainId": "5",
                "toChainId": "zksync_test",
                "fromValue": "0.002000000000009033",
                "toValue": "0.000990000067700000",
                "fromAmount": "0.002000000000009033",
                "toAmount": "0.000990000067700000",
                "fromSymbol": "ETH",
                "status": 98,
                "fromTimestamp": 1697540292000,
                "toTimestamp": null,
                "sourceAddress": "0xa5f46d60f4f08f11a5495f8c1011537718e188fe",
                "targetAddress": "0xa5f46d60f4f08f11a5495f8c1011537718e188fe",
                "sourceMaker": "0x80cead4b66a87d1f728eba116b94592b57eb0695",
                "targetMaker": "0x80cead4b66a87d1f728eba116b94592b57eb0695",
                "sourceToken": "0x0000000000000000000000000000000000000000",
                "targetToken": "0x0000000000000000000000000000000000000000",
                "sourceDecimal": 18,
                "targetDecimal": 18
              },
              {
                "fromHash": "0xfb67ba19ab2cc23a4b327d03f9bf123add590ba2e038d279a68870dc6b3f72b0",
                "toHash": "sync-tx:107bdced9c22ee0673bdc39517d83da4a40a2155490837e771714bf986223c15",
                "fromChainId": "5",
                "toChainId": "zksync_test",
                "fromValue": "0.002000000000009033",
                "toValue": "0.000990000067600000",
                "fromAmount": "0.002000000000009033",
                "toAmount": "0.000990000067600000",
                "fromSymbol": "ETH",
                "status": 98,
                "fromTimestamp": 1697539836000,
                "toTimestamp": null,
                "sourceAddress": "0xa5f46d60f4f08f11a5495f8c1011537718e188fe",
                "targetAddress": "0xa5f46d60f4f08f11a5495f8c1011537718e188fe",
                "sourceMaker": "0x80cead4b66a87d1f728eba116b94592b57eb0695",
                "targetMaker": "0x80cead4b66a87d1f728eba116b94592b57eb0695",
                "sourceToken": "0x0000000000000000000000000000000000000000",
                "targetToken": "0x0000000000000000000000000000000000000000",
                "sourceDecimal": 18,
                "targetDecimal": 18
              },
              {
                "fromHash": "0xbd6f1d2b2a5a9e53330b8472b2a558660e7fc3e7a9059fdb7e76eb0ff85c32ec",
                "toHash": "sync-tx:657520613e094aacfeba062597a551077bf830508b97b543d732b42c8d23a463",
                "fromChainId": "5",
                "toChainId": "zksync_test",
                "fromValue": "0.002000000000009033",
                "toValue": "0.000990000067400000",
                "fromAmount": "0.002000000000009033",
                "toAmount": "0.000990000067400000",
                "fromSymbol": "ETH",
                "status": 98,
                "fromTimestamp": 1697539356000,
                "toTimestamp": null,
                "sourceAddress": "0xa5f46d60f4f08f11a5495f8c1011537718e188fe",
                "targetAddress": "0xa5f46d60f4f08f11a5495f8c1011537718e188fe",
                "sourceMaker": "0x80cead4b66a87d1f728eba116b94592b57eb0695",
                "targetMaker": "0x80cead4b66a87d1f728eba116b94592b57eb0695",
                "sourceToken": "0x0000000000000000000000000000000000000000",
                "targetToken": "0x0000000000000000000000000000000000000000",
                "sourceDecimal": 18,
                "targetDecimal": 18
              },
              {
                "fromHash": "0xeefb11b1f836b72872da6434f2581bf392284e38e54fa9ca16aaf5d18a9992e9",
                "toHash": null,
                "fromChainId": "421613",
                "toChainId": "5",
                "fromValue": "21.000000000000001103",
                "toValue": "17.800000000000000151",
                "fromAmount": "21.000000000000001103",
                "toAmount": "17.800000000000000151",
                "fromSymbol": "USDC",
                "status": 0,
                "fromTimestamp": 1697509442000,
                "toTimestamp": null,
                "sourceAddress": "0xe06d06887b1a5638b882f1dcb054059c9bfd63ea",
                "targetAddress": "0xe06d06887b1a5638b882f1dcb054059c9bfd63ea",
                "sourceMaker": "0x15962f38e6998875f9f75acdf8c6ddc743f11041",
                "targetMaker": null,
                "sourceToken": "0xa3fdf06e3c59df2deaae6d597353477fc3daaeaf",
                "targetToken": "0xa3a8a6b323e3d38f5284db9337e7c6d74af3366a",
                "sourceDecimal": 6,
                "targetDecimal": 6
              },
              {
                "fromHash": "0x09a2b2b3d7d71dcbfb11c271cba46ba86f450b8f2e41c53b7eb11333797f4cd8",
                "toHash": null,
                "fromChainId": "5",
                "toChainId": "534351",
                "fromValue": "0.001100000000001104",
                "toValue": "0.000995000000000642",
                "fromAmount": "0.001100000000001104",
                "toAmount": "0.000995000000000642",
                "fromSymbol": "ETH",
                "status": 0,
                "fromTimestamp": 1697436396000,
                "toTimestamp": null,
                "sourceAddress": "0xa5f46d60f4f08f11a5495f8c1011537718e188fe",
                "targetAddress": "0xa5f46d60f4f08f11a5495f8c1011537718e188fe",
                "sourceMaker": "0xafcfbb382b28dae47b76224f24ee29be2c823648",
                "targetMaker": null,
                "sourceToken": "0x0000000000000000000000000000000000000000",
                "targetToken": "0x0000000000000000000000000000000000000000",
                "sourceDecimal": 18,
                "targetDecimal": 18
              },
              {
                "fromHash": "0x0fc5a078470fb1f66aacc5d01cf840292c945a8b9cd89ee4a83a1cc6124c09ee",
                "toHash": null,
                "fromChainId": "5",
                "toChainId": "534351",
                "fromValue": "0.001100000000001104",
                "toValue": "0.000995000000000641",
                "fromAmount": "0.001100000000001104",
                "toAmount": "0.000995000000000641",
                "fromSymbol": "ETH",
                "status": 0,
                "fromTimestamp": 1697436084000,
                "toTimestamp": null,
                "sourceAddress": "0xa5f46d60f4f08f11a5495f8c1011537718e188fe",
                "targetAddress": "0xa5f46d60f4f08f11a5495f8c1011537718e188fe",
                "sourceMaker": "0xafcfbb382b28dae47b76224f24ee29be2c823648",
                "targetMaker": null,
                "sourceToken": "0x0000000000000000000000000000000000000000",
                "targetToken": "0x0000000000000000000000000000000000000000",
                "sourceDecimal": 18,
                "targetDecimal": 18
              },
              {
                "fromHash": "0x0cda88f3184d7e8a8303362cbfe6c4c79bde969fc35bd3b757e4bc5350d68b48",
                "toHash": null,
                "fromChainId": "5",
                "toChainId": "534351",
                "fromValue": "0.001100000000001104",
                "toValue": "0.000995000000000640",
                "fromAmount": "0.001100000000001104",
                "toAmount": "0.000995000000000640",
                "fromSymbol": "ETH",
                "status": 0,
                "fromTimestamp": 1697428740000,
                "toTimestamp": null,
                "sourceAddress": "0xa5f46d60f4f08f11a5495f8c1011537718e188fe",
                "targetAddress": "0xa5f46d60f4f08f11a5495f8c1011537718e188fe",
                "sourceMaker": "0xafcfbb382b28dae47b76224f24ee29be2c823648",
                "targetMaker": null,
                "sourceToken": "0x0000000000000000000000000000000000000000",
                "targetToken": "0x0000000000000000000000000000000000000000",
                "sourceDecimal": 18,
                "targetDecimal": 18
              }
            ],
            "count": 9
          }
        }
        for (const item of result.list) {
          const result = this.arbitrationService.verifyArbitrationConditions(item as ArbitrationTransaction);
          if (result) {
            this.eventEmitter.emit("arbitration.create", item);
          }
        }
      })
  }


}
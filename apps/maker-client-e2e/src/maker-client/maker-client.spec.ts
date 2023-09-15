import axios from 'axios';
import StarknetAccount from '../../../maker-client/src/account/starknetAccount'
import { Test, TestingModule } from '@nestjs/testing';
import { shortString } from "starknet";

describe('GET /api', () => {

  it('should return a message', async () => {
    // const res = await axios.get(`/api`);

    // expect(res.status).toBe(200);;
    // expect(res.data).toEqual({ message: 'Hello API' });
  });

  it('Starknet Cario1.0 Send Transcation', async () => {
      const service = {
        chainConfigService: null,
        envConfigService: null
      }
      
      console.log("Decoded message =", shortString.decodeShortString("0x617267656e742f696e76616c69642d6f776e65722d736967"));
      console.log("Decoded message =", shortString.decodeShortString("0x496e70757420746f6f206c6f6e6720666f7220617267756d656e7473"));
      const starknetAccount = await new StarknetAccount('SN_MAIN', service).connect("xxxx", "xxx");
      const response = await starknetAccount.transferTokenV2("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", "0x050e5ba067562e87b47d87542159e16a627e85b00de331a53b471cee1a4e5a4f", 1000000000000n)
      console.log(response, '==response')
  }, 1000 * 60 * 2);
})

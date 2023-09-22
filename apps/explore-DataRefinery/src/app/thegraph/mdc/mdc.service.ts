import { Injectable } from '@nestjs/common';
import { ethers } from 'ethers6';
import { InjectConnection } from 'nest-knexjs';
import { Knex } from 'knex';
@Injectable()
export class MdcService {
  constructor(@InjectConnection() private readonly knex: Knex) {
  }

  async getRule(
    owner: string,
    timestamp: number,
    ebc: string,
    sourceChain: any,
    targetChain: any,
    sourceToken: any,
    targetToken: any,
  ) {
    let result;
    if (+sourceChain.id > +targetChain.id) {
      result = await this.knex('rule')
        .select()
        .where('owner', owner)
        .andWhere('rule_validation', true)
        .andWhere('ebc_addr', ebc)
        .andWhere('chain_0', targetChain.id)
        .andWhere('chain_1', sourceChain.id)
        .andWhere('chain_0_token', targetToken.token_address)
        .andWhere('chain_1_token', sourceToken.token_address)
        .andWhere('chain_1_status', 1)
        .andWhere('enable_timestamp', '<', timestamp)
        .orderBy('vid', 'desc')
        .first();
    } else {
      result = await this.knex('rule')
        .select()
        .where('owner', owner)
        .andWhere('rule_validation', true)
        .andWhere('ebc_addr', ebc)
        .andWhere('chain_1', targetChain.id)
        .andWhere('chain_0', sourceChain.id)
        .andWhere('chain_1_token', targetToken.token_address)
        .andWhere('chain_0_token', sourceToken.token_address)
        .andWhere('chain_0_status', 1)
        .andWhere('enable_timestamp', '<', timestamp)
        .orderBy('vid', 'desc')
        .first();
    }
    if (result) {
      // get response maker
      const responseMakers = await this.knex('response_makers_mapping')
        .select()
        .where('enable_timestamp', '<', timestamp)
        .andWhere('owner', owner)
        .orderBy('vid', 'desc')
        .first();
      result['responseMakers'] = responseMakers;
    }
    return result;
  }
  async getDealerByOwner(owner: string, timestamp: number, dealerId: number) {
    const result = await this.knex('dealer_mapping')
      .select()
      .where('owner', owner)
      .andWhere('dealer_index', dealerId)
      .andWhere('enable_timestamp', '<', timestamp)
      .orderBy('vid', 'desc')
      .first();
    if (result) {
      const address = ethers.getAddress(result.dealer_addr);
      return {
        id: result.id,
        index: result.dealer_index,
        address: address.toLocaleLowerCase(),
        updatedBlock: result.latest_update_block_number,
      };
    }
  }
  async getEBCByOwner(owner: string, timestamp: number, ebcIndex: number) {
    const result = await this.knex('ebc_mapping')
      .select()
      .where('owner', owner)
      .andWhere('ebc_index', ebcIndex)
      .andWhere('enable_timestamp', '<', timestamp)
      .orderBy('vid', 'desc')
      .first();

    if (result) {
      const address = ethers.getAddress(result.ebc_addr);
      return {
        id: result.id,
        index: result.ebc_index,
        address: address.toLocaleLowerCase(),
        updatedBlock: result.latest_update_block_number,
      };
    }
  }
  async getChainIdMapping(owner: string, timestamp: number, id: number) {
    const result = await this.knex('chain_id_mapping')
      .select()
      .where('owner', owner)
      .andWhere('chain_id_index', id)
      .andWhere('enable_timestamp', '<', timestamp)
      .orderBy('vid', 'desc')
      .first();

    if (result) {
      return {
        id: result.id,
        index: result.chain_id_index,
        chainId: result.chain_id.toString(),
        updatedBlock: result.latest_update_block_number,
      };
    }
  }

}

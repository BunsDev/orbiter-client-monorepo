import { Injectable } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';
import { ethers } from 'ethers6';
import { equals, maxBy } from '@orbiter-finance/utils';
import { createLoggerByName } from '../../utils/logger';
import winston from 'winston';
import { InjectConnection } from 'nest-knexjs';
import { Knex } from 'knex';

@Injectable()
export class MdcService {
  private owners: Set<string> = new Set();
  private responseMakers: Set<string> = new Set();
  private ownersVid = 0n;
  private responseVid = 0n;
  private logger: winston.Logger = createLoggerByName(MdcService.name);
  constructor(@InjectConnection() private readonly knex: Knex) {
    this.syncMakerOwnerAddress();
    this.syncMakerResponseAddress();
  }
  private v1Makers = {
    ETH: [
      '0xe4edb277e41dc89ab076a1f049f4a3efa700bce8',
      '0x80c67432656d59144ceff962e8faf8926599bcf8',
      '0xee73323912a4e3772B74eD0ca1595a152b0ef282',
      '0x0a88bc5c32b684d467b43c06d9e0899efeaf59df',
      '0x07b393627bd514d2aa4c83e9f0c468939df15ea3c29980cd8e7be3ec847795f0',
      '0x064a24243f2aabae8d2148fa878276e6e6e452e3941b417f3c33b1649ea83e11',
    ],
    USDC: [
      '0x41d3d33156ae7c62c094aae2995003ae63f587b3',
      '0x0411c2a2a4dc7b4d3a33424af3ede7e2e3b66691e22632803e37e2e0de450940',
    ],
    USDT: [
      '0xd7aa9ba6caac7b0436c91396f22ca5a7f31664fc',
      '0x0411c2a2a4dc7b4d3a33424af3ede7e2e3b66691e22632803e37e2e0de450940',
    ],
    DAI: [
      '0x095d2918b03b2e86d68551dcf11302121fb626c9',
      '0x0411c2a2a4dc7b4d3a33424af3ede7e2e3b66691e22632803e37e2e0de450940',
    ],
  };
  public async validMakerOwnerAddress(address: string) {
    if (!address) {
      return {
        version: '0',
        exist: false,
      };
    }
    if (
      Object.values(this.v1Makers)
        .flat()
        .findIndex((addr) => equals(addr, address)) >= 0
    ) {
      return {
        version: '1',
        exist: true,
      };
    }
    return {
      version: '2',
      exist: this.owners.has(address.toLocaleLowerCase()),
    };
  }
  public async validMakerResponseAddress(address: string) {
    if (!address) {
      return {
        version: '0',
        exist: false,
      };
    }
    if (
      Object.values(this.v1Makers)
        .flat()
        .findIndex((addr) => equals(addr, address)) >= 0
    ) {
      return {
        version: '1',
        exist: true,
      };
    }
    return {
      version: '2',
      exist: this.responseMakers.has(address.toLocaleLowerCase()),
    };
  }

  @Cron('* */1 * * * *')
  private async syncMakerOwnerAddress() {
    const row = await this.knex('factory_manager')
      .column(['vid', 'owners'])
      .orderBy('vid', 'desc')
      .first();
    if (row && row.owners.length > 0) {
      row.owners.forEach((addr) => {
        this.owners.add(addr);
      });
      this.ownersVid = row.vid;
      if (Date.now() % 5 === 0) {
        this.logger.info(
          `owners total:${this.owners.size}, LastVid:${this.ownersVid}`,
        );
      }
    }
  }

  @Cron('* */1 * * * *')
  private async syncMakerResponseAddress() {
    const rows = await this.knex('response_maker')
      .distinct('id')
      .column(['vid'])
      .where(this.knex.raw(`vid>${this.responseVid}`))
      .select();
    if (rows.length > 0) {
      const list = rows.map((row) => row.id);
      list.forEach((val) => {
        this.responseMakers.add(val.toLocaleLowerCase());
      });
      const lastRow = maxBy(rows, ['vid']);
      this.responseVid = lastRow.vid;
      if (Date.now() % 5 === 0) {
        this.logger.info(
          `responseMakers total:${this.responseMakers.size}, LastVid:${this.responseVid}`,
        );
      }
    }
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

  async getOwnerList() {
    return [...this.owners.values(), ...Object.values(this.v1Makers).flat()];
  }
}

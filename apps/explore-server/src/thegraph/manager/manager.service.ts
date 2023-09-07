import { Injectable } from '@nestjs/common';
import { InjectConnection } from 'nest-knexjs';
import { Knex } from 'knex';

@Injectable()
export class ThegraphManagerService {
  constructor(@InjectConnection() private readonly knex: Knex) {}
  async getChainInfoById(id: string) {
    const result = await this.knex('chain_rel')
      .select()
      .where('id', id)
      .orderBy('vid', 'desc')
      .first();
    return result;
  }
  async getChainInfoTokenById(id: string) {
    const result = await this.knex('chain_rel')
      .select()
      .where('id', id)
      .orderBy('vid', 'desc')
      .first();

    if (result && result.tokens) {
      const tokens = await this.knex('token_rel')
        .select()
        .whereIn('id', result.tokens)
        .orderBy('vid', 'desc');
      result['tokenList'] = tokens;
    }
    return result;
  }
}

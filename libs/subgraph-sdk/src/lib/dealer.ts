import { Context } from './subgraph-sdk'
export class Factory {
  constructor(private readonly ctx: Context) {
  }
  async getDealerHistoryByOwner() {
//     const result = await this.knex('dealer_mapping')
//     .select()
//     .where('owner', owner)
//     .andWhere('dealer_index', dealerId)
//     .andWhere('enable_timestamp', '<', timestamp)
//     .orderBy('vid', 'desc')
//     .first();
//   if (result) {
//     const address = ethers.getAddress(result.dealer_addr);
//     return {
//       id: result.id,
//       index: result.dealer_index,
//       address: address.toLocaleLowerCase(),
//       updatedBlock: result.latest_update_block_number,
//     };
//   }
  }
}
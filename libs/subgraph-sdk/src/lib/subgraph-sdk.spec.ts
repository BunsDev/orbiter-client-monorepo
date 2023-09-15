import SubgraphClient from './subgraph-sdk';

describe('subgraphSdk', () => {
    const client = new SubgraphClient()
    it('create client', () => {
        expect(client).toBeDefined;
    })
    it('query getOwners', async () => {
        const result = await client.factory.getOwners();
        console.log(result, '=result')
    })
    it('query getOwners', async () => {
        const result = await client.factory.GetChainIdMapping();
        console.log(result, '=result')
    })
})
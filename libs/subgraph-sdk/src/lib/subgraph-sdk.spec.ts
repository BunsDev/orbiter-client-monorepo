import { subgraphSdk } from './subgraph-sdk';

describe('subgraphSdk', () => {
    it('should work', () => {
        expect(subgraphSdk()).toEqual('subgraph-sdk');
    })
})
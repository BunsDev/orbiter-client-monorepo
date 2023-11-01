import { request } from './request';

describe('request', () => {
  it('should work', () => {
    expect(request()).toEqual('request');
  });
});

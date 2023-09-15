import {Factory} from './factory';
export class Context {
    constructor(private readonly url:string){}
    async query(query:string, variables:any = {}) {
        const response = await fetch(this.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, variables }),
          });
          if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
          }
          const data = await response.json();
          return data.data;
      
    }
}
export default class SubgraphClient{
    public readonly ctx:Context;
    public factory:Factory;
    constructor(url:string = 'https://api.studio.thegraph.com/proxy/49058/cabin/version/latest'){
        this.ctx = new Context(url);
        this.factory = new Factory(this.ctx);
    }
}
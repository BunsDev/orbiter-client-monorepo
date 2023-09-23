import {Factory} from './factory';
import { MakerService } from './maker';
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
export class SubgraphClient{
    public readonly ctx:Context;
    public factory:Factory;
    public maker:MakerService;
    constructor(url:string){
        if (!url) {
          throw new Error('SubgraphEndpoint not found');
        }
        this.ctx = new Context(url);
        this.factory = new Factory(this.ctx);
        this.maker = new MakerService(this.ctx);
    }
}
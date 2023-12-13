import { FactoryService } from './factory.service';
import { MakerService } from './maker.service';
import { ManagerService } from './manager.service';
export class Context {
  constructor(private readonly url: string) { }
  async query(query: string, variables: any = {}) {
      console.log("query url", this.url);
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
export class SubgraphClient {
  public readonly ctx: Context;
  public factory: FactoryService;
  public maker: MakerService;
  public manager: ManagerService;
  constructor(url: string) {
    if (!url) {
      throw new Error('SubgraphEndpoint not found');
    }
    this.ctx = new Context(url);
    this.factory = new FactoryService(this.ctx);
    this.maker = new MakerService(this.ctx);
    this.manager = new ManagerService(this.ctx);
  }
}

import { Injectable } from "@nestjs/common";
import { TcpService } from "@orbiter-finance/tcp";

@Injectable()
export class PrivateKeyService {
  static InjectedPrivateKey = {};

  constructor(private readonly tcpService: TcpService) {
    tcpService.start(function (data) {
      for (const addr in data) {
        if (!data.hasOwnProperty(addr)) continue;
        PrivateKeyService.InjectedPrivateKey[addr.toLocaleLowerCase()] = data[addr];
        console.log("Private key injection successful", addr.toLocaleLowerCase());
      }
    });
  }
}

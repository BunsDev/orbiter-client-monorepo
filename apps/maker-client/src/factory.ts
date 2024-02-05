import { EVM5Account } from './../../../libs/blockchain-account/src/lib/evm5Account';
import { Injectable } from "@nestjs/common";
import { AlertService } from "@orbiter-finance/alert";
import {
  OrbiterAccount, ZkSyncAccount, IMXAccount, EVMAccount,
  ZkSpaceAccount,
  StarknetAccount, LoopringAccount,
  NonceManager
} from "@orbiter-finance/blockchain-account";
import { ChainConfigService, ENVConfigService } from "@orbiter-finance/config";


@Injectable()
export class AccountFactoryService {
  constructor(
    private readonly chainConfigService: ChainConfigService,
    private readonly envConfigService: ENVConfigService,
    private alertService: AlertService,
  ) {
  }

  private static wallets: Record<string, OrbiterAccount> = {}; // key = pk + chainId
  createMakerAccount<T extends OrbiterAccount>(
    makerAddress: string,
    toChainId: string
  ): T {
    const chainConfig = this.chainConfigService.getChainInfo(toChainId);
    if (!chainConfig) {
      throw new Error(`${toChainId} chain not found`);
    }
    const walletId =
      `${makerAddress}${chainConfig.chainId}`.toLocaleLowerCase();
    let wallet: OrbiterAccount = AccountFactoryService.wallets[walletId];
    if (wallet) {
      return wallet as T;
    }

    const ctx = {
      chainConfigService: this.chainConfigService,
      envConfigService: this.envConfigService
    }
    switch (+chainConfig.internalId) {
      case 3:
      case 33:
        wallet = new ZkSyncAccount(
          toChainId,
          ctx
        );
        break;
      case 4:
      case 44:
        wallet = new StarknetAccount(
          toChainId, ctx
        );
        break;
      case 8:
      case 88:
        wallet = new IMXAccount(toChainId, ctx);
        break;
      case 9:
      case 99:
        wallet = new LoopringAccount(toChainId, ctx);
        break;
      case 1:
      case 2:
      case 21:
      case 22:
      case 23:
      case 5:
      case 599:
      case 6:
      case 66:
      case 7:
      case 77:
      case 10:
      case 510:
      case 13:
      case 513:
      case 14:
      case 514:
      case 15:
      case 515:
      case 16:
      case 516:
      case 17:
      case 517:
      case 18:
      case 19:
      case 518:
      case 519:
      case 520:
      case 521:
      case 522:
      case 523:
      case 524:
      case 525:
      case 526:
      case 528:
      case 529:
      case 530:
      case 535:
      case 539:
        wallet = new EVMAccount(toChainId, ctx);
        break;
      case 512:
        wallet = new ZkSpaceAccount(
          toChainId,
          ctx
        );
        break;
      case 38:
      case 538:
        wallet = new EVM5Account(toChainId, ctx);
        break;
      default:
        if (chainConfig.service && chainConfig.service['rpc'] && chainConfig.service['rpc'].includes('EVMRpcScanning')) {
          wallet = new EVMAccount(toChainId, ctx);
        }
        break;
    }
    if (!wallet) {
      throw new Error(`${toChainId}-${chainConfig.name} Chain WalletAccount Not implemented`);
    }
    wallet.on("noncesExceed", ({ localNonce, networkNonce }) => {
      this.alertService.sendMessage(`Nonces exceeded 10 - Local: ${localNonce}, Network: ${networkNonce}`, 'TG');
    });
    AccountFactoryService.wallets[walletId] = wallet;
    return wallet as T;
  }

}

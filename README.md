# Decentralized Cross-Rollup Bridge

<img src="logo.png" alt="Image" width="400" >

> A decentralized cross-rollup bridge for transferring assets and data between different blockchain networks.

## Inscriptions Cross-Rollup Protocol

Building upon the existing cross-rollup communication, we've extended functionalities to encompass inscriptions minting and crossing.

The fundamental principle involves users submitting transactions containing basic inscriptions information and the identification code for the target network to the Maker Protocol. These transactions are processed by the Orbiter Bridge Protocol. On the target network, the Maker Protocol utilizes mint and cross functions to send inscriptions to the user's address, completing the entire inscriptions cross-rollup process.

Currently, this protocol early supports networks including Arbitrum One, Optimism, zkSync Era, Base, Linea, Scroll, and Polygon zkEVM. The Orbiter Bridge Protocol collects a certain fee on the source network as the Inscriptions Cross-rollup Protocol fee.


	
### Inscriptions Minting

#### Deploy
##### The inscription contract can be deployed on any network. The `to` address of the recipient of the deployed contract transaction is the owner of the contract. With ownership of the contract, you can help anyone deploy the contract and set the owner to his address.
#### Note: The protocol + tick will form a unique identifier in the entire network. If the contract protocol and tick you are not familiar with already exist, your deployment will be invalid.

```
{"p": "xxx-20", "op": "deploy", "lim": "10000", "max": "xxxxx", "tick": "Name"}
```
|  Field   | Required  | Remark  |
|  ----  | ----  | ---- |
| p  | YES | Ex:xxx-20 Supported Protocol |
| op  | YES | deploy|
| lim  | YES | Maximum casting amount for a single transaction |
| max  | YES | Maximum circulation |
| tick  | YES | EX:xxx-20 Inscriptions' Name |

#### Claim
#### You can choose any network to select the target network, use the inscription contract protocol information to initiate a claim transaction, and cast the inscription contract you want on the target network simply and conveniently. The main method is to send fixed inscription contract through the following inscription protocol JSON data + The handling fee amount + security code are used as transaction data and are executed on the target network. This process does not require you to operate on the target network, and there is no handling fee.
#### Note: When the Claim transaction is initiated, the `to` field of the on-chain transaction receiving address is the owner when the inscription contract is deployed. For the inscription protocol and tick you want to mint, the maximum minting amount for a single transaction must be within the parameters set by the deployment contract, otherwise your creation will not take effect.
- Basic data
```
{"p": "xxx-20", "op": "claim", "amt": "1000", "tick": "Name"}
```
|  Field   | Required  | Remark  |
|  ----  | ----  | ---- |
| p  | YES | Ex:xxx-20 Supported Protocol |
| op  | YES | claim Initiate Cross-Rollup Mint Action |
| tick  | YES | EX:xxx-20 Inscriptions' Name |
| amt  | YES | Ex:1000 Mint Amount |
- Casting fee and Identification Code
  - The casting fee is a fixed value, currently 0.0009ETH (or equivalent amount)
  - The identification code is determined internally by the protocol, and each network has a unique identification code identifier. The identification code identifier is consistent with the Orbiter cross-rollup protocol. For details, see: https://docs.orbiter.finance/orbiterfinancesbridgeprotocol
- Then the casting fee is 0.0009 + the identification code is 9001, then the value amount of the sent transaction should be set to: 0.000900000000009001. As long as the casting fee is higher than the protocol casting fee and the last 4 digits of the protocol identification code are guaranteed, then the casting will go smoothly at the target network execution.


#### Mint
#### This process does not require user participation. After the source network initiates a claim, the protocol node will automatically execute casting on the target network after the transaction is confirmed.
```
{"p": "xxx-20", "fc": 9521, "op": "mint", "amt": "1000", "tick": "Name"}
```
|  Field   | Required  | Remark  |
|  ----  | ----  | ---- |
| p  | YES | Ex:xxx-20 Supported Protocol |
| op  | YES | mint Complete Cross-Rollup Mint Action |
| tick  | YES | EX:xxx-20 Inscriptions' Name |
| amt  | YES | Ex:1000 Mint Amount |
| fc  | YES | Ex:1 InternalID of the Source Network|



### Inscriptions Crossing

#### Cross
```
{"p": "xxx-20", "op": "cross", "amt": "1000", "tick": "Name"}
```
|  Field   | Required  | Remark  |
|  ----  | ----  | ---- |
| p  | YES | Ex:xxx-20 Supported Protocol |
| op  | YES | cross Initiate Cross Action |
| tick  | YES | EX:xxx-20 Inscriptions' Name |
| amt  | YES | Ex:1000 Cross Amount |

#### Crossover
```
{"p": "xxx-20", "fc": 9521, "op": "crossover", "amt": "1000", "tick": "Name"}
```
|  Field   | Required  | Remark  |
|  ----  | ----  | ---- |
| p  | YES | Ex:xxx-20 Supported Protocol |
| op  | YES | crossover Complete Cross Action |
| tick  | YES | EX:xxx-20 Inscriptions' Name|
| amt  | YES | Ex:1000 Cross Amount |
| fc  | YES | Ex:1 InternalID of the Source Network |



### Supported Rollups
	Arbitrum One, Optimism, zkSync Era, Base, Linea, Scroll and Polygon zkEVM

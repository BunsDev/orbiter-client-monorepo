import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ethers } from 'ethers';

@Injectable()
export class EthereumAuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const { address, signature } = req.headers as any; // Assuming the signature is passed in the headers

    // Validate the Ethereum signature
    const isValidSignature = validateEthereumSignature(address, signature);

    if (!isValidSignature) {
      return res.status(401).jsonp({
        status: '401',
        message: 'Invalid Ethereum signature',
        error: null
      })
    }

    // Signature is valid, proceed with the next middleware or route handler
    next();
  }
}

function validateEthereumSignature(address: string, signature: string): boolean {
  // Implement Ethereum signature validation logic using ethers or web3.js
  // Return true if the signature is valid, false otherwise
  // You may need to use the provider to query the Ethereum network for verification

  // Example (using ethers):
  const recoveredAddress = ethers.utils.verifyMessage('Hello Orbiter', signature);

  return recoveredAddress.toLowerCase() === address.toLowerCase();
}

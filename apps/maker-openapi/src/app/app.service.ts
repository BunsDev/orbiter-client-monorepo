import { Injectable } from '@nestjs/common';
import { ProofSubmissionRequest } from './common/interfaces/Proof.interface';
import { Level } from 'level';
@Injectable()
export class AppService {
  private db: Level;
  constructor() {
    this.db = new Level('runtime/maker-openapi', { valueEncoding: 'json' })
  }
  proofSubmission(data: ProofSubmissionRequest) {
    if (+data.status == 1) {
      this.db.put(data.transaction, data.proof);
    }
    return true;
  }
  async getProof(hash:string) {
    return await this.db.get(hash);
  }
}

import {
  Model,
  Table,
  Column,
  DataType,
  Index,
  Sequelize,
} from 'sequelize-typescript';

export interface TransfersAttributes {
  id?: string;
  chainId?: string;
  hash?: string;
  blockNumber?: string;
  transactionIndex?:string;
  sender?: string;
  receiver?: string;
  value?: string;
  amount?: string;
  token?: string;
  symbol?: string;
  fee?: string;
  feeAmount?: string;
  timestamp?: Date;
  status?: number;
  nonce?: string;
  opStatus?: number;
  contract?: string;
  selector?: string;
  signature?: string;
  calldata?: object;
  createdAt?: Date;
  updatedAt?: Date;
  version?: string;
  feeToken?: string;
  syncStatus?: number;
  crossChainParams?:object;
}


export enum TransferOpStatus {
  INIT_STATUS = 0,
  VALID = 1,
  SOURCE_CHAIN_OR_TOKEN_NOT_FOUND = 2,
  TARGET_CHAIN_OR_TOKEN_NOT_FOUND = 3,
  RULE_NOT_FOUND = 4,
  NONCE_EXCEED_MAXIMUM = 5,
  AMOUNT_TOO_SMALL = 6,
  BALANCED_LIQUIDITY = 10,
  REFUND = 80,
  REFUND_TOCHECK = 81,
  MATCHED = 99,


  // insription Op Status
  INVALID_OP = 41,
  INVALID_OP_PARAMS = 42,
  CLAIM_AMOUNT_EXCEED_LIMIT = 43,
  DEPLOY_RECORD_NOT_FOUND = 44,
  CLAIM_MUST_CROSS_CHAIN = 45,
  AMOUNT_MUST_BE_INTEGER = 46,
  INCORRECT_PROTOCOL = 47,
  CHARING_RULE_NOT_FOUND = 48,
  CHARING_TOO_LOW = 49,
  CLAIM_EXCEED_MAXIMUM = 50,
  INCORRECT_FC = 51,
  INVALID_DEPLOY_MAKER = 52,
  NOT_SUFFICIENT_FUNDS = 53,
  CROSS_INVALID_TARGET_ADDRESS = 54
}

export enum InscriptionOpType {
  Deploy = 'deploy',
  Claim = 'claim',
  Mint = 'mint',
  Transfer = 'transfer',
  Cross = 'cross',
  CrossOver = 'crossover'
}


@Table({ tableName: 'transfers', timestamps: true })
export class Transfers
  extends Model<TransfersAttributes, TransfersAttributes>
  implements TransfersAttributes
{
  @Column({
    autoIncrement: true,
    allowNull: true,
    primaryKey: true,
    type: DataType.BIGINT,
  })
  @Index({ name: 'transfers_pkey', using: 'btree', unique: true })
  id?: string;

  @Column({ allowNull: true, type: DataType.STRING(20) })
  @Index({ name: 'transfers_chainId_hash_idx', using: 'btree', unique: true })
  chainId?: string;

  @Column({ allowNull: true, type: DataType.STRING(255) })
  @Index({ name: 'transfers_chainId_hash_idx', using: 'btree', unique: true })
  @Index({ name: 'transfers_hash_idx', using: 'btree' })
  hash?: string;

  @Column({ allowNull: true, type: DataType.BIGINT })
  blockNumber?: string;

  @Column({ allowNull: true, type: DataType.BIGINT })
  transactionIndex?: string;

  @Column({ allowNull: true, type: DataType.STRING(100) })
  @Index({ name: 'transfers_sender_idx', using: 'btree', unique: false })
  sender?: string;

  @Column({ allowNull: true, type: DataType.STRING(100) })
  @Index({ name: 'transfers_receiver_idx', using: 'btree', unique: false })
  receiver?: string;

  @Column({ allowNull: true, type: DataType.STRING(255) })
  value?: string;

  @Column({ allowNull: true, type: DataType.DECIMAL(64, 18) })
  amount?: string;

  @Column({ allowNull: true, type: DataType.STRING(100) })
  token?: string;

  @Column({ allowNull: true, type: DataType.STRING(20) })
  symbol?: string;

  @Column({ allowNull: true, type: DataType.STRING(255) })
  fee?: string;

  @Column({ allowNull: true, type: DataType.DECIMAL(64, 18) })
  feeAmount?: string;

  @Column({ allowNull: true, type: DataType.DATE })
  timestamp?: Date;

  @Column({
    allowNull: true,
    type: DataType.INTEGER,
    comment: 'none,pending,confirmed,failed,\n',
  })
  @Index({ name: 'transfers_status_idx', using: 'btree', unique: false })
  @Index({
    name: 'transfers_status_opStatus_version_idx',
    using: 'btree',
    unique: false,
  })
  status?: number;

  @Column({ allowNull: true, type: DataType.BIGINT })
  nonce?: string;

  @Column({
    allowNull: true,
    type: DataType.INTEGER,
    comment: '0=pending,1=ok,2=rule fail,3=ig',
    defaultValue: Sequelize.literal('0'),
  })
  @Index({ name: 'transfers_opStatus_idx', using: 'btree', unique: false })
  @Index({
    name: 'transfers_status_opStatus_version_idx',
    using: 'btree',
    unique: false,
  })
  opStatus?: number;

  @Column({ allowNull: true, type: DataType.STRING(100) })
  contract?: string;

  @Column({ allowNull: true, type: DataType.STRING(255) })
  selector?: string;

  @Column({ allowNull: true, type: DataType.STRING(255) })
  signature?: string;

  @Column({ allowNull: true, type: DataType.JSONB })
  calldata?: object;

  @Column({ allowNull: true, type: DataType.DATE })
  createdAt?: Date;

  @Column({ allowNull: true, type: DataType.DATE })
  updatedAt?: Date;

  @Column({ allowNull: true, type: DataType.STRING(10) })
  @Index({
    name: 'transfers_status_opStatus_version_idx',
    using: 'btree',
    unique: false,
  })
  version?: string;

  @Column({ allowNull: true, type: DataType.STRING(100) })
  feeToken?: string;

  @Column({ allowNull: true, type: DataType.INTEGER })
  @Index({
    name: 'syncStatus',
    using: 'btree',
    unique: false
  })
  syncStatus?: number

  @Column({ allowNull: true, type: DataType.JSONB })
  crossChainParams?: object;

  @Column({ allowNull: true, type: DataType.JSONB })
  @Index({
    name: 'transfers_label_idx',
    using: 'gin',
    unique: false
  })
  label?: object;
}

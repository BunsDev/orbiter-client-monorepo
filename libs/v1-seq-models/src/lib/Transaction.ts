import {
  Model,
  Table,
  Column,
  DataType,
  Index,
  Sequelize,
  ForeignKey,
} from 'sequelize-typescript';

export interface ITransaction {
  id?: number;
  hash: string;
  nonce: string;
  blockHash?: string;
  blockNumber?: number;
  transactionIndex?: number;
  from: string;
  to: string;
  value: string;
  symbol: string;
  gasPrice?: number;
  gas?: number;
  input?: string;
  status: number;
  tokenAddress: string;
  timestamp?: Date;
  fee?: string;
  feeToken?: string;
  chainId: number;
  source?: string;
  memo?: string;
  side: number;
  extra?: object;
  makerId?: string;
  lpId?: string;
  replyAccount?: string;
  replySender?: string;
  createdAt: Date;
  updatedAt: Date;
  expectValue?: string;
  transferId?: string;
}

@Table({ tableName: 'transaction', timestamps: false })
export class Transaction
  extends Model<ITransaction, ITransaction>
  implements ITransaction
{
  @Column({
    primaryKey: true,
    autoIncrement: true,
    type: DataType.BIGINT,
    comment: 'ID',
  })
  @Index({ name: 'PRIMARY', using: 'BTREE', order: 'ASC', unique: true })
  id?: number;

  @Column({ type: DataType.STRING(255), comment: 'Hash' })
  @Index({ name: 'hash', using: 'BTREE', order: 'ASC', unique: true })
  hash!: string;

  @Column({ type: DataType.STRING(20), comment: 'Nonce' })
  nonce!: string;

  @Column({ allowNull: true, type: DataType.STRING(255), comment: 'blockHash' })
  blockHash?: string;

  @Column({ allowNull: true, type: DataType.BIGINT, comment: 'blockNumber' })
  blockNumber?: number;

  @Column({
    allowNull: true,
    type: DataType.INTEGER,
    comment: 'transactionIndex',
  })
  transactionIndex?: number;

  @Column({ type: DataType.STRING(255), comment: 'from' })
  from!: string;

  @Column({ type: DataType.STRING(255), comment: 'to' })
  to!: string;

  @Column({ type: DataType.STRING(32), comment: 'value' })
  value!: string;

  @Column({ type: DataType.STRING(20), comment: 'symbol' })
  @Index({ name: 'symbol', using: 'BTREE', order: 'ASC', unique: false })
  symbol!: string;

  @Column({ allowNull: true, type: DataType.BIGINT, comment: 'gasPrice' })
  gasPrice?: number;

  @Column({ allowNull: true, type: DataType.BIGINT, comment: 'gas' })
  gas?: number;

  @Column({ allowNull: true, type: DataType.STRING, comment: 'input' })
  input?: string;

  @Column({
    type: DataType.TINYINT,
    comment: 'status:0=PENDING,1=COMPLETE,2=FAIL',
  })
  status!: number;

  @Column({ type: DataType.STRING(255), comment: 'tokenAddress' })
  tokenAddress!: string;

  @Column({
    primaryKey: true,
    type: DataType.DATE,
    comment: 'timestamp',
    defaultValue: DataType.NOW,
  })
  @Index({ name: 'PRIMARY', using: 'BTREE', order: 'ASC', unique: true })
  timestamp?: Date;

  @Column({ allowNull: true, type: DataType.STRING(20), comment: 'fee' })
  fee?: string;

  @Column({ allowNull: true, type: DataType.STRING(20), comment: 'feeToken' })
  feeToken?: string;

  @Column({ type: DataType.INTEGER, comment: 'chainId' })
  @Index({ name: 'hash', using: 'BTREE', order: 'ASC', unique: true })
  @Index({ name: 'symbol', using: 'BTREE', order: 'ASC', unique: false })
  chainId!: number;

  @Column({ allowNull: true, type: DataType.STRING(20), comment: 'source' })
  source?: string;

  @Column({ allowNull: true, type: DataType.STRING(50), comment: 'memo' })
  memo?: string;

  @Column({ type: DataType.TINYINT, comment: 'side:0=user,1=maker' })
  side!: number;

  @Column({ allowNull: true, type: DataType.JSON, comment: 'extra' })
  extra?: object;

  @Column({ allowNull: true, type: DataType.STRING(255), comment: 'maker' })
  makerId?: string;

  @Column({ allowNull: true, type: DataType.STRING(255), comment: 'lp' })
  lpId?: string;

  @Column({ allowNull: true, type: DataType.STRING(255) })
  replyAccount?: string;

  @Column({ allowNull: true, type: DataType.STRING(255) })
  @Index({ name: 'symbol', using: 'BTREE', order: 'ASC', unique: false })
  replySender?: string;

  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @Column({ type: DataType.DATE })
  updatedAt!: Date;

  @Column({ allowNull: true, type: DataType.STRING(256) })
  expectValue?: string;

  @Column({ allowNull: true, type: DataType.STRING(255) })
  transferId?: string;
}

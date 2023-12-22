import {
  Model,
  Table,
  Column,
  DataType,
  Index,
  Sequelize,
} from 'sequelize-typescript';

export interface IDeployRecord {
  id?: number;
  blockNumber: number;
  hash: string;
  chainId: string;
  timestamp: Date;
  callData: object;
  protocol: string;
  currentMintedAmount: string;
  currentMintedTx: string;
  tick: string;
  max: string;
  limit: string;
  from: string;
  to: string;
  value: string;
  deletedAt?:Date;
}

@Table({ tableName: 'deploy_record', timestamps: true })
export class DeployRecord
  extends Model<IDeployRecord, IDeployRecord>
  implements IDeployRecord
{
  @Column({
    autoIncrement: true,
    allowNull: true,
    primaryKey: true,
    type: DataType.BIGINT,

  })
  @Index({ name: 'deploy_record_pkey', using: 'btree', unique: true })
  id?: number;

  @Column({type: DataType.INTEGER})
  blockNumber: number;

  @Column({type: DataType.STRING(255)})
  @Index({ name: 'hash_chainId', using: 'btree', unique: true })
  hash: string;

  @Column({type: DataType.STRING(100)})
  @Index({ name: 'hash_chainId', using: 'btree', unique: true })
  chainId: string;

  @Column({type: DataType.JSON, allowNull: true })
  callData: object;

  @Column({type: DataType.STRING(255) })
  @Index({ name: 'from', using: 'btree',})
  from: string;
  @Column({type: DataType.STRING(255) })
  @Index({ name: 'to', using: 'btree',})
  to: string;

  @Column({type: DataType.STRING(55) })
  @Index({ name: 'protocol_tick', using: 'btree', unique: true })
  protocol: string;

  @Column({type: DataType.STRING(255) })
  @Index({ name: 'protocol_tick', using: 'btree', unique: true })
  tick: string;

  @Column({type: DataType.DECIMAL })
  currentMintedAmount: string;

  @Column({type: DataType.INTEGER })
  currentMintedTx: string;


  @Column({type: DataType.DECIMAL })
  max: string;

  @Column({type: DataType.DECIMAL })
  limit: string;

  @Column({type: DataType.DECIMAL })
  value: string;

  @Column({type: DataType.DATE })
  @Index({ name: 'timestamp', using: 'btree',})
  timestamp: Date;

  @Column({type: DataType.DATE })
  @Index({ name: 'deletedAt'})
  deletedAt: Date;
}


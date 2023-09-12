import {
  Model,
  Table,
  Column,
  DataType,
  Index,
  Sequelize,
  ForeignKey,
} from 'sequelize-typescript';

export interface IUserHistory {
  fromSender: string;
  fromHash: string;
  toHash: string;
  fromTime: Date;
  toTime: Date;
  id?: number;
  transcationId?: string;
  inId?: number;
  outId?: number;
  fromChain?: number;
  toChain?: number;
  fromAmount: string;
  toAmount: string;
  fromToken: string;
  toToken: string;
  replySender?: string;
  replyAccount?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({ tableName: 'userHistory', timestamps: false, comment: 'VIEW' })
export class UserHistory
  extends Model<IUserHistory, IUserHistory>
  implements IUserHistory
{
  @Column({ type: DataType.STRING(255), comment: 'from' })
  fromSender!: string;

  @Column({ type: DataType.STRING(255), comment: 'Hash' })
  fromHash!: string;

  @Column({ type: DataType.STRING(255), comment: 'Hash' })
  toHash!: string;

  @Column({ type: DataType.DATE, comment: 'timestamp' })
  fromTime!: Date;

  @Column({ type: DataType.DATE, comment: 'timestamp' })
  toTime!: Date;

  // @Column({ type: DataType.BIGINT, comment: 'ID', defaultValue: '0' })
  @Column({
    primaryKey: true,
    // autoIncrement: true,
    type: DataType.BIGINT,
    comment: 'ID',
  })
  id?: number;

  @Column({
    allowNull: true,
    type: DataType.STRING(100),
    comment: 'transcationId',
  })
  transcationId?: string;

  @Column({ allowNull: true, type: DataType.BIGINT, comment: 'inId' })
  inId?: number;

  @Column({ allowNull: true, type: DataType.BIGINT, comment: 'outId' })
  outId?: number;

  @Column({ allowNull: true, type: DataType.INTEGER, comment: 'from Chain' })
  fromChain?: number;

  @Column({ allowNull: true, type: DataType.INTEGER, comment: 'to Chain' })
  toChain?: number;

  @Column({ type: DataType.STRING(32), comment: 'value' })
  fromAmount!: string;

  @Column({ type: DataType.STRING(32), comment: 'value' })
  toAmount!: string;

  @Column({ type: DataType.STRING(20), comment: 'symbol' })
  fromToken!: string;

  @Column({ type: DataType.STRING(20), comment: 'symbol' })
  toToken!: string;

  @Column({
    allowNull: true,
    type: DataType.STRING(255),
    comment: 'maker Sender Address',
  })
  replySender?: string;

  @Column({
    allowNull: true,
    type: DataType.STRING(255),
    comment: 'reply user Recipient',
  })
  replyAccount?: string;

  @Column({ allowNull: true, type: DataType.DATE })
  createdAt?: Date;

  @Column({ allowNull: true, type: DataType.DATE })
  updatedAt?: Date;
}

import {
  Model,
  Table,
  Column,
  DataType,
  Index,
  Sequelize,
  ForeignKey,
} from 'sequelize-typescript';

export interface MakerTransactionAttributes {
  id?: number;
  transcationId?: string;
  inId?: number;
  outId?: number;
  fromChain?: number;
  toChain?: number;
  toAmount?: string;
  replySender?: string;
  replyAccount?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Table({ tableName: 'maker_transaction', timestamps: false })
export class MakerTransaction
  extends Model<MakerTransactionAttributes, MakerTransactionAttributes>
  implements MakerTransactionAttributes
{
  @Column({
    primaryKey: true,
    autoIncrement: true,
    type: DataType.BIGINT,
    comment: 'ID',
  })
  @Index({ name: 'PRIMARY', using: 'BTREE', order: 'ASC', unique: true })
  id?: number;

  @Column({
    allowNull: true,
    type: DataType.STRING(100),
    comment: 'transcationId',
  })
  @Index({ name: 'trxid', using: 'BTREE', order: 'ASC', unique: true })
  transcationId?: string;

  @Column({ allowNull: true, type: DataType.BIGINT, comment: 'inId' })
  @Index({
    name: 'maker_transaction_inId',
    using: 'BTREE',
    order: 'ASC',
    unique: true,
  })
  inId?: number;

  @Column({ allowNull: true, type: DataType.BIGINT, comment: 'outId' })
  @Index({
    name: 'maker_transaction_outId',
    using: 'BTREE',
    order: 'ASC',
    unique: true,
  })
  outId?: number;

  @Column({ allowNull: true, type: DataType.INTEGER, comment: 'from Chain' })
  fromChain?: number;

  @Column({ allowNull: true, type: DataType.INTEGER, comment: 'to Chain' })
  toChain?: number;

  @Column({ allowNull: true, type: DataType.STRING(255), comment: 'toAmount' })
  toAmount?: string;

  @Column({
    allowNull: true,
    type: DataType.STRING(255),
    comment: 'maker Sender Address',
  })
  @Index({ name: 'replySender', using: 'BTREE', order: 'ASC', unique: false })
  replySender?: string;

  @Column({
    allowNull: true,
    type: DataType.STRING(255),
    comment: 'reply user Recipient',
  })
  replyAccount?: string;

  @Column({ type: DataType.DATE })
  createdAt!: Date;

  @Column({ type: DataType.DATE })
  updatedAt!: Date;
}

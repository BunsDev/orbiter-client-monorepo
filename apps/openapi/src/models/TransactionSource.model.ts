import { Table, Column, Model, DataType, Index, Sequelize } from 'sequelize-typescript';

@Table({
  tableName: 'transaction_source',
  schema: 'stats',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      name: 'transaction_source_chain_id_idx',
      fields: ['chain_id'],
    },
    {
      name: 'transaction_source_channel_idx',
      fields: ['channel'],
    },
  ],
  comment: 'Transaction Source Table',
})
class TransactionSource extends Model {
  @Column({
    type: DataType.STRING(20),
    field: 'chain_id',
  })
  chainId!: string | null;

  @Column({
    type: DataType.STRING(255),
    primaryKey: true,
    allowNull: false,
    field: 'hash',
  })
  hash!: string;

  @Column({
    type: DataType.STRING(50),
    field: 'channel',
  })
  channel!: string | null;

  @Column({
    type: DataType.STRING(50),
    field: 'description',
  })
  description!: string | null;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    field: 'created_at',
  })
  created_at!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    field: 'updated_at',
  })
  updated_at!: Date;
}

export default TransactionSource;

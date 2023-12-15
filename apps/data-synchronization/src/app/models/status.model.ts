import {
  Model,
  Table,
  Column,
  DataType,
  Index,
  Sequelize,
  ForeignKey,
} from 'sequelize-typescript';

export interface MakerTransactionSyncStatusAttributes {
  id?: number;
  status?: number;
}

@Table({ tableName: 'maker_transaction_sync_status', timestamps: false })
export class MakerTransactionSyncStatus
  extends Model<MakerTransactionSyncStatusAttributes, MakerTransactionSyncStatusAttributes>
  implements MakerTransactionSyncStatusAttributes
{
  @Column({
    primaryKey: true,
    type: DataType.BIGINT,
    comment: 'ID',
  })
  @Index({ name: 'PRIMARY', using: 'BTREE', order: 'ASC', unique: true })
  id?: number;

  @Column({ allowNull: true, type: DataType.INTEGER, comment: 'sync status' })
  @Index({ name: 'status', using: 'BTREE', order: 'ASC' })
  status?: number;

}

import {
    Model,
    Table,
    Column,
    DataType,
    Index,
    Sequelize,
} from 'sequelize-typescript';

export interface RefundRecordAttributes {
    id?: number;
    sourceId: string;
    targetId: string;
    status: number;
    sourceChain: string;
    sourceSymbol: string;
    sourceTime: Date;
    sourceAmount: string;
    targetAmount: string;
    reason: string;
    createdAt?: Date;
    updatedAt?: Date;
}

@Table({ tableName: 'refund_record', timestamps: true})
export class RefundRecord
    extends Model<RefundRecordAttributes, RefundRecordAttributes>
    implements RefundRecordAttributes {

    @Column({
        autoIncrement: true,
        allowNull: true,
        primaryKey: true,
        type: DataType.BIGINT,

    })
    @Index({ name: 'refund_record_idpkey', using: 'btree', unique: true })
    id?: number;

    @Column({ type: DataType.STRING(255) })
    @Index({ name: 'refund_record_source_id_unq', using: 'btree', unique: true })
    sourceId: string;

    @Column({ type: DataType.STRING(255) })
    @Index({ name: 'refund_record_target_id_unq', using: 'btree', unique: true })
    targetId: string;

    @Column({ type: DataType.STRING(255) })
    reason: string;

    @Column({
        allowNull: true,
        type: DataType.INTEGER,
        comment: '80=refund-success',
        defaultValue: Sequelize.literal('0'),
      })
    @Index({ name: 'refund_record_status_idx', using: 'btree', unique: false })
    status: number;

    @Column({ allowNull: true, type: DataType.DECIMAL(64, 18) })
    sourceAmount: string;

    @Column({ allowNull: true, type: DataType.DECIMAL(64, 18) })
    targetAmount: string;

    @Column({ allowNull: true, type: DataType.STRING(255) })
    @Index({
        name: 'refund_record_source_chain_idx',
        using: 'btree',
        unique: false,
    })
    sourceChain: string;

    @Column({ allowNull: true, type: DataType.STRING(255) })
    @Index({
        name: 'refund_record_source_symbol_idx',
        using: 'btree',
        unique: false,
    })
    sourceSymbol: string;

    @Column({ allowNull: true, type: DataType.DATE })
    sourceTime: Date;

}


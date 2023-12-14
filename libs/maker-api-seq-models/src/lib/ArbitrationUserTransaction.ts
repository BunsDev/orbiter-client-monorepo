import { Model, Table, Column, DataType, Index } from "sequelize-typescript";

export interface IArbitrationUserTransaction {
    id?: number;
    hash?: string;
    challenger?: string;
    createTime?: number;
}

@Table({ tableName: "arbitration_user_transaction", timestamps: false })
export class ArbitrationUserTransaction extends Model<IArbitrationUserTransaction, IArbitrationUserTransaction> implements IArbitrationUserTransaction {
    @Column({
        primaryKey: true,
        autoIncrement: true,
        type: DataType.BIGINT,
        comment: "ID",
    })
    @Index({ name: "PRIMARY", using: "BTREE", order: "ASC", unique: true })
    id?: number;

    @Column({ type: DataType.STRING(255), comment: 'Hash' })
    @Index({ name: 'hash', using: 'BTREE', order: 'ASC' })
    hash!: string;

    @Column({ type: DataType.STRING(255), comment: 'Challenger' })
    @Index({ name: 'challenger', using: 'BTREE', order: 'ASC' })
    challenger!: string;

    @Column({ type: DataType.BIGINT, comment: "create time" })
    createTime!: number;
}

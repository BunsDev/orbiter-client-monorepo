import { Model, Table, Column, DataType, Index } from "sequelize-typescript";

export interface IArbitrationMakerTransaction {
    id?: number;
    hash?: string;
    sourceChain: string;
    targetChain: string;
    createTime?: number;
}

@Table({ tableName: "arbitration_maker_transaction", timestamps: false })
export class ArbitrationMakerTransaction extends Model<IArbitrationMakerTransaction, IArbitrationMakerTransaction> implements IArbitrationMakerTransaction {
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

    @Column({ allowNull: true, type: DataType.STRING(255) })
    sourceChain!: string;

    @Column({ allowNull: true, type: DataType.STRING(255) })
    targetChain!: string;

    @Column({ type: DataType.BIGINT, comment: "create time" })
    createTime!: number;
}

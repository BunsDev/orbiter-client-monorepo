import { Model, Table, Column, DataType, Index } from "sequelize-typescript";

export interface IArbitrationRecord {
    id?: number;
    hash?: string;
    fromAddress?: string;
    sourceId?: string;
    transferFee?: string;
    status?: number;
    type?: number;
    calldata?: object;
    createTime?: number;
}

@Table({ tableName: "arbitration_record", timestamps: false })
export class ArbitrationRecord extends Model<IArbitrationRecord, IArbitrationRecord> implements IArbitrationRecord {
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

    @Column({ type: DataType.STRING(255), comment: 'fromAddress' })
    fromAddress?: string;

    @Column({ type: DataType.STRING(255), comment: 'sourceId' })
    @Index({ name: 'sourceId', using: 'BTREE', order: 'ASC' })
    sourceId!: string;

    @Column({ type: DataType.STRING(32), comment: 'sourceId' })
    transferFee?: string;

    @Column({ type: DataType.TINYINT, comment: 'status:0=fail,1=success' })
    status!: number;

    @Column({ type: DataType.TINYINT, comment: 'type:11=challenge,12=verifyChallengeDest,21=verifyChallengeDest' })
    type!: number;

    @Column({ allowNull: true, type: DataType.JSONB })
    calldata?: object;

    @Column({ type: DataType.BIGINT, comment: "create time" })
    createTime!: number;
}

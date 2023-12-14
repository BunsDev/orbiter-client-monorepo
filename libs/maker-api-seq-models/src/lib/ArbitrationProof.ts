import { Model, Table, Column, DataType, Index } from "sequelize-typescript";

export interface IArbitrationProof {
    id?: number;
    hash?: string;
    sourceMaker?: string;
    proof?: string;
    message?: string;
    status?: number;
    isSource?: number;
    createTime?: number;
}

@Table({ tableName: "arbitration_proof", timestamps: false })
export class ArbitrationProof extends Model<IArbitrationProof, IArbitrationProof> implements IArbitrationProof {
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

    @Column({ type: DataType.STRING(255), comment: 'maker' })
    sourceMaker!: string;

    @Column({ allowNull: true, type: DataType.TEXT, comment: 'proof' })
    proof?: string;

    @Column({ allowNull: true, type: DataType.TEXT, comment: 'proof' })
    message?: string;

    @Column({ type: DataType.TINYINT, comment: 'status:0=fail,1=success' })
    status!: number;

    @Column({ type: DataType.TINYINT, comment: 'status:0=dest,1=source' })
    isSource!: number;

    @Column({ type: DataType.BIGINT, comment: "create time" })
    createTime!: number;
}

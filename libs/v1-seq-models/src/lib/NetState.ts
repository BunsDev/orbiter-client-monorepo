import { Model, Table, Column, DataType, Index } from "sequelize-typescript";

export interface INetState {
    id?: number;
    source?: number;
    dest?: number;
    createdAt?: Date;
}

@Table({ tableName: "net_state", timestamps: false })
export class NetState extends Model<INetState, INetState> implements INetState {
    @Column({
        primaryKey: true,
        autoIncrement: true,
        type: DataType.BIGINT,
        comment: "ID",
    })
    @Index({ name: "PRIMARY", using: "BTREE", order: "ASC", unique: true })
    id?: number;

    @Column({ type: DataType.INTEGER, comment: "Source chain" })
    source!: number;

    @Column({ type: DataType.INTEGER, comment: "Dest chain'" })
    dest!: number;

    @Column({ type: DataType.DATE })
    createdAt!: Date;
}

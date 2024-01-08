import {
  Model,
  Table,
  Column,
  DataType,
  Index,
} from 'sequelize-typescript';

export interface IUserBalance {
  id?: number;
  address: string;
  chainId: string;
  balance: string;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({ tableName: 'user_balance', timestamps: true })
export class UserBalance
  extends Model<IUserBalance, IUserBalance>
  implements IUserBalance
{
  @Column({
    autoIncrement: true,
    allowNull: true,
    primaryKey: true,
    type: DataType.BIGINT,

  })
  @Index({ name: 'user_balance_pkey', using: 'btree', unique: true })
  id?: number;

  @Column({type: DataType.STRING(255)})
  @Index({ name: 'address_chainId', using: 'btree', unique: true })
  address: string;

  @Column({type: DataType.STRING(255)})
  @Index({ name: 'address_chainId', using: 'btree', unique: true })
  chainId: string;

  @Column({type: DataType.DECIMAL})
  balance: string;
}


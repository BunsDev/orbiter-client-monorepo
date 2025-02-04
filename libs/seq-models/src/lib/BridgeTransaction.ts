import {
    Model,
    Table,
    Column,
    DataType,
    Index,
    Sequelize,
  } from 'sequelize-typescript';
  
  export interface BridgeTransactionAttributes {
    id?: string;
    transactionId?: string;
    sourceId?: string;
    targetId?: string;
    sourceChain?: string;
    targetChain?: string;
    sourceAmount?: string;
    targetAmount?: string;
    sourceMaker?: string;
    targetMaker?: string;
    sourceAddress?: string;
    targetAddress?: string;
    sourceSymbol?: string;
    targetSymbol?: string;
    status?: number;
    sourceTime?: Date;
    targetTime?: Date;
    targetFee?: string;
    targetFeeSymbol?: string;
    sourceNonce?: string;
    targetNonce?: string;
    ruleId?: string;
    dealerAddress?: string;
    ebcAddress?: string;
    createdAt?: Date;
    updatedAt?: Date;
    sourceToken?: string;
    targetToken?: string;
    version?: string;
    withholdingFee?: string;
    tradeFee?: string;
    responseMaker?: any;
  }
  
  @Table({ tableName: 'bridge_transaction', timestamps: true })
  export class BridgeTransaction
    extends Model<BridgeTransactionAttributes, BridgeTransactionAttributes>
    implements BridgeTransactionAttributes
  {
    @Column({
      autoIncrement: true,
      allowNull: true,
      primaryKey: true,
      type: DataType.BIGINT,
  
    })
    @Index({ name: 'bridge_transaction_pkey', using: 'btree', unique: true })
    id?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(100) })
    @Index({ name: 'trxid', using: 'btree', unique: true })
    transactionId?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(255) })
    @Index({ name: 'sourceId', using: 'btree', unique: true })
    sourceId?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(255) })
    targetId?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(255) })
    @Index({ name: 'sourceId', using: 'btree', unique: true })
    sourceChain?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(255) })
    @Index({
      name: 'bridge_transaction_targetChain_targetAmount_targetAddress_t_idx',
      using: 'btree',
      unique: false,
    })
    targetChain?: string;
  
    @Column({ allowNull: true, type: DataType.DECIMAL(64, 18) })
    sourceAmount?: string;
  
    @Column({ allowNull: true, type: DataType.DECIMAL(64, 18) })
    @Index({
      name: 'bridge_transaction_targetChain_targetAmount_targetAddress_t_idx',
      using: 'btree',
      unique: false,
    })
    targetAmount?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(100) })
    @Index({ name: 'sourceMaker', using: 'btree', unique: false })
    sourceMaker?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(100) })
    targetMaker?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(100) })
    @Index({ name: 'sourceAddress', using: 'btree', unique: false })
    sourceAddress?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(100) })
    @Index({
      name: 'bridge_transaction_targetChain_targetAmount_targetAddress_t_idx',
      using: 'btree',
      unique: false,
    })
    targetAddress?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(20) })
    sourceSymbol?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(255) })
    @Index({
      name: 'bridge_transaction_targetChain_targetAmount_targetAddress_t_idx',
      using: 'btree',
      unique: false,
    })
    targetSymbol?: string;
  
    @Column({
      allowNull: true,
      type: DataType.INTEGER,
      comment: '0=pending match,99=match success',
      defaultValue: Sequelize.literal('0'),
    })
    @Index({
      name: 'bridge_transaction_targetChain_targetAmount_targetAddress_t_idx',
      using: 'btree',
      unique: false,
    })
    @Index({ name: 'sourceAddress', using: 'btree', unique: false })
    @Index({ name: 'sourceMaker', using: 'btree', unique: false })
    @Index({ name: 'status', using: 'btree', unique: false })
    status?: number;
  
    @Column({ allowNull: true, type: DataType.DATE })
    sourceTime?: Date;
  
    @Column({ allowNull: true, type: DataType.DATE })
    targetTime?: Date;
  
    @Column({ allowNull: true, type: DataType.DECIMAL })
    targetFee?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(20) })
    targetFeeSymbol?: string;
  
    @Column({ allowNull: true, type: DataType.BIGINT })
    sourceNonce?: string;
  
    @Column({ allowNull: true, type: DataType.BIGINT })
    targetNonce?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(255) })
    ruleId?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(100) })
    dealerAddress?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(100) })
    ebcAddress?: string;
  
    @Column({ allowNull: true, type: DataType.DATE })
    createdAt?: Date;
  
    @Column({ allowNull: true, type: DataType.DATE })
    updatedAt?: Date;
  
    @Column({ allowNull: true, type: DataType.STRING(255) })
    sourceToken?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(255) })
    targetToken?: string;
  
    @Column({ allowNull: true, type: DataType.STRING(20) })
    version?: string;
  
    @Column({ allowNull: true, type: DataType.DECIMAL(64, 18) })
    withholdingFee?: string;
  
    @Column({ allowNull: true, type: DataType.DECIMAL(64, 18) })
    tradeFee?: string;
  
    @Column({ allowNull: true, type: DataType.ARRAY(DataType.TEXT) })
    @Index({
      name: 'bridge_transaction_responseMaker_idx',
      using: 'gin',
      unique: false,
    })
    @Index({
      name: 'bridge_transaction_targetChain_targetAmount_targetAddress_t_idx',
      using: 'btree',
      unique: false,
    })
    responseMaker?: any;
  }


  export enum BridgeTransactionStatus {
    PENDING_MATCH = 0,
    PENDING_PAID = 0,
    READY_PAID = 96,
    PAID_CRASH = 97,
    PAID_SUCCESS = 98, // pending confirm
    BRIDGE_SUCCESS = 99,
  }
  // 0 = Waiting for payment,
  // 96 = Money will be refunded soon,
  // 97 = Abnormal payment, waiting for retry
  // 98 = Money back successfully, waiting for confirmation
  // 99 = Confirmation successful
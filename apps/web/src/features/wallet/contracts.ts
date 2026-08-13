export interface WalletSummary {
  id: string;
  currency: 'BIC';
  balance: string;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  type: 'CREDIT' | 'DEBIT' | 'ADJUSTMENT';
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

export interface WalletTransactionPage {
  transactions: WalletTransaction[];
  nextCursor?: string;
}

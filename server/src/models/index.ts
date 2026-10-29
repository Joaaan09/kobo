// Barrel de modelos: punto único de importación.
export { User } from './User.js';
export type {
  IUser,
  IUserPrefs,
  IUserModules,
  IUserNotifications,
  IngestNotify,
  Theme,
  UserDocument,
} from './User.js';

export { PushSubscription } from './PushSubscription.js';
export type { IPushSubscription, PushSubscriptionDocument } from './PushSubscription.js';

export { IncomeConfig } from './IncomeConfig.js';
export type { IIncomeConfig, IncomeType, IncomeConfigDocument } from './IncomeConfig.js';

export { Category } from './Category.js';
export type { ICategory, CategoryDocument } from './Category.js';

export { Subcategory } from './Subcategory.js';
export type { ISubcategory, SubcategoryDocument } from './Subcategory.js';

export { Expense } from './Expense.js';
export type { IExpense, ExpenseSource, ExpenseDocument } from './Expense.js';

export { ApiToken } from './ApiToken.js';
export type { IApiToken, ApiTokenDocument } from './ApiToken.js';

export { IngestRule } from './IngestRule.js';
export type { IIngestRule, IngestRuleDocument } from './IngestRule.js';

export { Fund } from './Fund.js';
export type { IFund, FundDocument } from './Fund.js';

export { Income } from './Income.js';
export type { IIncome, IncomeDocument } from './Income.js';

export { Account } from './Account.js';
export type { IAccount, IBucket, AccountDocument } from './Account.js';

export { Transfer } from './Transfer.js';
export type { ITransfer, TransferDocument } from './Transfer.js';

export { Valuation } from './Valuation.js';
export type { IValuation, ValuationKind, ValuationDocument } from './Valuation.js';

export { MonthSnapshot } from './MonthSnapshot.js';
export type { IMonthSnapshot, IAllocation, MonthSnapshotDocument } from './MonthSnapshot.js';

export { Subscription } from './Subscription.js';
export type {
  ISubscription,
  SubscriptionDocument,
  SubscriptionFrequency,
} from './Subscription.js';

export { Distribution } from './Distribution.js';
export type {
  IDistribution,
  IDistributionShare,
  DistributionDocument,
} from './Distribution.js';

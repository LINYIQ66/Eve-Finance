/**
 * Entity wrappers — drop-in replacement for the base44-generated @/entities/all.
 *
 * Re-exports everything from the EVE client so that existing imports like
 *   import { User, Transaction, Loan } from "@/entities/all"
 * continue to work without any changes in consuming code.
 *
 * Function proxies are also re-exported for convenience:
 *   import { getStockPrices } from "@/entities/all"
 */

export {
  User,
  Transaction,
  Loan,
  Stake,
  Company,
  AuditLog,
  FundRequest,
  SystemSetting,
  PhysicalProduct,
  PhysicalRedemption,
  SupportTicket,
  // function proxies
  getStockPrices,
  getAlpacaPrices,
  getHKStockPrices,
  searchStocks,
  searchHKStocks,
  getMetalPrices,
  getUserTransactions,
  generateReport,
  getDailyAgentName,
  unstakeAndClaim,
} from '@/api/eveClient';

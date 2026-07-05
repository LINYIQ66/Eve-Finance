/**
 * Enterprise Access Control for EVE FINANCE
 * 
 * Role hierarchy:
 * - admin (Super Admin): Full platform access
 * - eve_sales: Leads, quotations, customers
 * - eve_finance: Invoices, payments, financial records
 * - customer_admin: Manage own company users
 * - customer_buyer: Create/view own company orders
 * - customer_viewer: View-only access to permitted data
 * - dealer: Trading and product access
 */

export const ROLES = {
  SUPER_ADMIN: 'admin',
  EVE_SALES: 'eve_sales',
  EVE_FINANCE: 'eve_finance',
  CUSTOMER_ADMIN: 'customer_admin',
  CUSTOMER_BUYER: 'customer_buyer',
  CUSTOMER_VIEWER: 'customer_viewer',
  DEALER: 'dealer',
};

export const ROLE_LABELS = {
  admin: 'Super Admin',
  eve_sales: 'EVE Sales',
  eve_finance: 'EVE Finance',
  customer_admin: 'Customer Admin',
  customer_buyer: 'Customer Buyer',
  customer_viewer: 'Customer Viewer',
  dealer: 'Dealer',
  user: 'User', // Legacy
};

// Which pages each role can see in navigation
const ROLE_PAGE_ACCESS = {
  admin: ['*'], // All pages
  eve_sales: ['Home', 'Wallet', 'Trading', 'USStocks', 'HKStocks', 'Physical', 'Account', 'Guide'],
  eve_finance: ['Home', 'Wallet', 'Lending', 'DailyStatement', 'Account', 'Guide'],
  customer_admin: ['Home', 'Wallet', 'Trading', 'USStocks', 'HKStocks', 'Physical', 'Lending', 'Staking', 'Account', 'DailyStatement', 'Guide'],
  customer_buyer: ['Home', 'Wallet', 'Trading', 'USStocks', 'HKStocks', 'Physical', 'Lending', 'Staking', 'Account', 'DailyStatement', 'Guide'],
  customer_viewer: ['Home', 'Wallet', 'Account', 'Guide'],
  dealer: ['Home', 'Wallet', 'Trading', 'USStocks', 'HKStocks', 'Physical', 'Account', 'Guide'],
  user: ['Home', 'Wallet', 'Trading', 'USStocks', 'HKStocks', 'Physical', 'Lending', 'Staking', 'Account', 'DailyStatement', 'Guide', 'ApiDocs'], // Legacy
};

export const PUBLIC_PAGES = ['Home', 'Guide', 'ApiDocs'];

/**
 * Check if a role can access a specific page
 */
export function canAccessPage(role, pageName) {
  if (PUBLIC_PAGES.includes(pageName)) return true;
  if (!role) return false;
  const access = ROLE_PAGE_ACCESS[role];
  if (!access) return false;
  if (access.includes('*')) return true;
  return access.includes(pageName);
}

/**
 * Get human-readable label for a role
 */
export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role;
}

/**
 * Check if role is an EVE internal staff role
 */
export function isEVEInternalRole(role) {
  return ['admin', 'eve_sales', 'eve_finance'].includes(role);
}

/**
 * Check if role is a customer role (subject to company isolation)
 */
export function isCustomerRole(role) {
  return ['customer_admin', 'customer_buyer', 'customer_viewer'].includes(role);
}

/**
 * Check if a user can manage other users (Super Admin or Customer Admin for own company)
 */
export function canManageUsers(role) {
  return role === 'admin' || role === 'customer_admin';
}

/**
 * Check if two users belong to the same company
 */
export function isSameCompany(userA, userB) {
  if (!userA?.company_id || !userB?.company_id) return false;
  return userA.company_id === userB.company_id;
}

/**
 * Check if user account is active
 */
export function isAccountActive(user) {
  return user?.account_status === 'active' || !user?.account_status;
}
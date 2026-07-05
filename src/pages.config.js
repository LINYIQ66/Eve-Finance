/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Wallet from './pages/Wallet';
import Trading from './pages/Trading';
import Lending from './pages/Lending';
import Admin from './pages/Admin';
import Account from './pages/Account';
import Home from './pages/Home';
import Staking from './pages/Staking';
import Statement from './pages/Statement';
import Physical from './pages/Physical';
import Guide from './pages/Guide';
import DailyStatement from './pages/DailyStatement';
import HKStocks from './pages/HKStocks';
import USStocks from './pages/USStocks';
import ApiDocs from './pages/ApiDocs';
import Login from './pages/Login';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Wallet": Wallet,
    "Trading": Trading,
    "Lending": Lending,
    "Admin": Admin,
    "Account": Account,
    "Home": Home,
    "Staking": Staking,
    "Statement": Statement,
    "Physical": Physical,
    "Guide": Guide,
    "DailyStatement": DailyStatement,
    "HKStocks": HKStocks,
    "USStocks": USStocks,
    "ApiDocs": ApiDocs,
    "Login": Login,
}

export const pagesConfig = {
    mainPage: "Wallet",
    Pages: PAGES,
    Layout: __Layout,
};
import type { Category, TxnType } from "./types";

/**
 * Merchant cleanup + category/bucket suggestion for CSV import.
 *
 * Deterministic rules: instant, free, offline, and debuggable — you can see
 * exactly why a row was categorized the way it was, and fix it by editing the
 * table below.
 *
 * Everything here is a *suggestion*. The import preview lets the user change
 * every field before anything is written.
 */

export interface Suggestion {
  merchant: string;
  categoryName: string | null;
  bucketName: string | null;
  confidence: number;
}

interface Rule {
  match: RegExp;
  merchant: string;
  category: string;
  bucket?: string;
}

/** Ordered: the first match wins, so put specific patterns above generic ones. */
const RULES: Rule[] = [
  // quick commerce / groceries
  { match: /swiggy\s*instamart|instamart/i, merchant: "Swiggy Instamart", category: "Household & Quick Commerce" },
  { match: /\bzepto\b/i, merchant: "Zepto", category: "Household & Quick Commerce" },
  { match: /blinkit|grofers/i, merchant: "Blinkit", category: "Household & Quick Commerce" },
  { match: /bigbasket|big\s*basket/i, merchant: "BigBasket", category: "Grocery" },
  { match: /d[\s-]?mart|dmart/i, merchant: "DMart", category: "Grocery" },
  { match: /reliance\s*(fresh|smart)/i, merchant: "Reliance Fresh", category: "Grocery" },
  { match: /more\s*(supermarket|retail)/i, merchant: "More Supermarket", category: "Grocery" },
  { match: /spencer|nilgiris|star\s*bazaar/i, merchant: "Supermarket", category: "Grocery" },

  // food delivery / restaurants
  { match: /swiggy/i, merchant: "Swiggy", category: "Outside Food" },
  { match: /zomato|eternal\s*ltd/i, merchant: "Zomato", category: "Outside Food" },
  { match: /domino|pizza\s*hut|mcdonald|kfc|burger\s*king|subway/i, merchant: "Fast Food", category: "Outside Food" },
  { match: /barbeque\s*nation|saravana\s*bhavan|a2b|hotel\s|restaurant|cafe|coffee|starbucks|chai/i, merchant: "Restaurant", category: "Outside Food" },

  // fuel
  { match: /indian\s*oil|iocl|bharat\s*petro|bpcl|hindustan\s*petro|hpcl|\bshell\b|nayara|petrol|fuel/i, merchant: "Fuel Station", category: "Car Fuel" },

  // utilities / recharge
  { match: /\bjio\b|reliance\s*jio/i, merchant: "Jio", category: "Recharge & Utilities" },
  { match: /airtel|bharti/i, merchant: "Airtel", category: "Recharge & Utilities" },
  { match: /\bvi\b|vodafone|idea\s*cellular/i, merchant: "Vi", category: "Recharge & Utilities" },
  { match: /\btneb\b|electricity|eb\s*bill|tangedco|bescom|msedcl/i, merchant: "Electricity Board", category: "EB" },
  { match: /indane|hp\s*gas|bharat\s*gas|lpg|cylinder/i, merchant: "LPG Cylinder", category: "Cylinder" },
  { match: /water\s*(bill|supply|tanker)|metro\s*water/i, merchant: "Water Supply", category: "Recharge & Utilities" },

  // shopping
  { match: /amazon|amzn/i, merchant: "Amazon", category: "Products" },
  { match: /flipkart/i, merchant: "Flipkart", category: "Products" },
  { match: /myntra|ajio|westside|max\s*fashion|lifestyle|pantaloons|zudio/i, merchant: "Clothing Store", category: "Clothes & Accessories" },
  { match: /croma|reliance\s*digital|vijay\s*sales/i, merchant: "Electronics Store", category: "Products" },
  { match: /nykaa|purplle/i, merchant: "Nykaa", category: "Products" },

  // entertainment
  { match: /pvr|inox|cinepolis|cinema|bookmyshow/i, merchant: "Cinema", category: "Malls & Movies" },
  { match: /phoenix|forum\s*mall|express\s*avenue|lulu\s*mall/i, merchant: "Mall", category: "Malls & Movies" },
  { match: /netflix|spotify|prime\s*video|hotstar|youtube\s*premium/i, merchant: "Subscription", category: "Recharge & Utilities" },

  // vehicle
  { match: /maruti|hyundai|service\s*cent|car\s*service|garage|tyre|puncture/i, merchant: "Car Service", category: "Car Service & Repairs" },

  // income
  { match: /salary|payroll|sal\s*cr|neft.*salary/i, merchant: "Salary", category: "Salary / Income" },
  { match: /interest\s*(credit|paid)|int\.?\s*cr/i, merchant: "Bank Interest", category: "Other Income" },
  { match: /refund|reversal|cashback/i, merchant: "Refund", category: "Other Income" },

  // transfers
  { match: /credit\s*card\s*(payment|paymt|bill)|cc\s*payment|autopay.*card|card\s*payment/i, merchant: "Credit Card Payment", category: "Credit Card Payment" },
  { match: /atm\s*(wdl|withdrawal|cash)|cash\s*wdl|nwd\b/i, merchant: "ATM Withdrawal", category: "Bank Transfer" },
  { match: /neft|imps|rtgs|self\s*transfer|fund\s*transfer/i, merchant: "Bank Transfer", category: "Bank Transfer" },
];

/** Bank narration noise that carries no meaning for a human reader. */
const NOISE = [
  /\b(upi|pos|neft|imps|rtgs|ach|ecs|nach|vps|mps|inb|tpt|chq|ref|txn|trf|dr|cr)\b[-/:\s]*/gi,
  /\b\d{6,}\b/g,                       // reference numbers
  /\b[a-z0-9]+@[a-z]+\b/gi,            // UPI handles
  /\bxx+\d+\b/gi,                      // masked card numbers
  /\b(chennai|bangalore|bengaluru|mumbai|delhi|hyderabad|pune|kolkata|coimbatore|madurai|in|ind|india)\b/gi,
  /[*_|]+/g,
];

/** "SWIGGY INSTAMART CHENNAI 4429911" -> "Swiggy Instamart" */
export function normalizeMerchant(raw: string): string {
  const ruled = RULES.find((r) => r.match.test(raw));
  if (ruled) return ruled.merchant;

  let s = raw;
  for (const re of NOISE) s = s.replace(re, " ");
  s = s.replace(/[-/]+/g, " ").replace(/\s+/g, " ").trim();

  if (!s) return raw.trim().slice(0, 40) || "Unknown";

  return s
    .toLowerCase()
    .split(" ")
    .slice(0, 4)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join(" ")
    .slice(0, 40);
}

export function suggestByRules(description: string, direction: "debit" | "credit"): Suggestion {
  const rule = RULES.find((r) => r.match.test(description));

  if (rule) {
    return {
      merchant: rule.merchant,
      categoryName: rule.category,
      bucketName: rule.bucket ?? null,
      confidence: 0.9,
    };
  }

  return {
    merchant: normalizeMerchant(description),
    categoryName: direction === "credit" ? "Other Income" : null,
    bucketName: null,
    confidence: direction === "credit" ? 0.4 : 0.2,
  };
}

export function inferType(
  direction: "debit" | "credit",
  categoryName: string | null,
  categories: Category[]
): TxnType {
  const cat = categories.find((c) => c.name === categoryName);
  if (cat?.kind === "transfer") return "transfer";
  return direction === "credit" ? "income" : "expense";
}

// Choices offered on the "List an item" form.

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "MXN", "SAR", "AED", "QAR", "KWD", "PKR", "INR", "CNY", "JPY"];
export const CONDITIONS = ["new", "like_new", "good", "fair", "for_parts"] as const;
export const RATE_UNITS = ["hour", "day", "week", "month"] as const;
export const AUCTION_DAYS = [1, 3, 5, 7, 10];
// How long buyers have to ask for a refund, when the seller offers refunds.
export const REFUND_DAYS = [3, 7, 14, 30];
export const SESSION_MINUTES = [30, 45, 60, 90, 120, 180, 240, 480];

// Countries in the location menu (ISO codes; names come from the browser in
// the visitor's language). Sellers anywhere can pick "Other" and type a code.
export const COUNTRIES = [
  "US", "CA", "MX", "GB", "IE", "FR", "DE", "ES", "IT", "PT", "NL", "BE", "CH", "AT", "SE", "NO", "DK", "FI",
  "PL", "GR", "TR", "SA", "AE", "QA", "KW", "BH", "OM", "JO", "LB", "EG", "MA", "DZ", "TN", "IQ", "YE",
  "PK", "IN", "BD", "CN", "HK", "TW", "JP", "KR", "SG", "MY", "ID", "PH", "TH", "VN", "AU", "NZ",
  "BR", "AR", "CL", "CO", "PE", "VE", "NG", "KE", "GH", "ZA", "ET",
];

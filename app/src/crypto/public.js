export const CRYPTO_PUBLIC = true;

export const CRYPTO_RISK = "Cryptoassets are high-risk and largely unregulated in the UK. Marble is a journal, not advice.";

// The trades that may show publicly
export const publicTrades = (trades) => (CRYPTO_PUBLIC ? trades : trades.filter((t) => t.world !== "crypto"));
export const showsCrypto = (trades) => CRYPTO_PUBLIC && trades.some((t) => t.world === "crypto");

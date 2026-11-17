import { LIVE } from "../mode.js";

export const CRYPTO_LIVE = false;

export const worldsOn = () => LIVE || !!import.meta.env?.DEV;

let forced = false;
export const cryptoFull = () => CRYPTO_LIVE || forced || (!!import.meta.env?.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).get("crypto") === "full");
export const forceCryptoFull = (on) => { forced = !!on; };

export const dataWorld = (world) => (cryptoFull() ? world : "markets");

export const CRYPTO_TRADE_COLUMNS = ["world", "leverage", "funding", "fee_maker", "fee_taker", "liq_price"];
export const withoutCrypto = (row, live = CRYPTO_LIVE) => {
  if (live) return row;
  const out = { ...row };
  for (const k of CRYPTO_TRADE_COLUMNS) delete out[k];
  return out;
};

// The attribution rule lives in the domain package so server-side surfaces (the
// digest email) and client surfaces (the cards and detail) credit a listing
// identically. Re-exported here so existing UI imports stay stable.
export { sourceAttribution } from "@jobwarden/domain";

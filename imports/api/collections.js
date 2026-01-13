import { Mongo } from 'meteor/mongo';

/**
 * Playgrounds collection - chat conversations for the Playground feature
 *
 * Schema:
 * {
 *   _id: string,
 *   userId: string,         // Owner user ID
 *   title: string,          // Auto-generated from first message
 *   messages: Array,        // [{role, content}]
 *   createdAt: Date,
 *   updatedAt: Date
 * }
 */
export const Playgrounds = new Mongo.Collection('playgrounds');

/**
 * SystemSettings collection - configurable system-wide settings
 *
 * Schema:
 * {
 *   _id: string,              // Setting category (e.g., "credits")
 *   initialCredit: number,    // USD credit for new users (default: 10)
 *   updatedAt: Date,
 *   updatedBy: string         // userId of admin who last updated
 * }
 */
export const SystemSettings = new Mongo.Collection('systemSettings');

/**
 * ApiKeys collection - user API keys linked to Router consumers
 *
 * Schema:
 * {
 *   _id: string,
 *   userId: string,           // Hub user who owns this key
 *   consumerId: string,       // Kong consumer UUID
 *   keyId: string,            // Kong key-auth credential ID
 *   name: string,             // User-friendly label ("Production")
 *   keySuffix: string,        // Last 4 chars for display (e.g., "...x7f2")
 *   createdAt: Date
 * }
 *
 * Note: Full key is only returned once on creation, never stored in Hub.
 * Quota/usage is fetched from Router on demand.
 */
export const ApiKeys = new Mongo.Collection('apiKeys');

/**
 * DeletedAccounts collection - tracks deleted users for credit restoration
 *
 * Schema:
 * {
 *   _id: string,              // Email (works across all auth providers)
 *   lastCredit: number,       // Remaining credit at deletion time (USD)
 *   deletedAt: Date
 * }
 */
export const DeletedAccounts = new Mongo.Collection('deletedAccounts');

/**
 * WalletShares collection - Shamir secret shares for MPC wallets
 *
 * Schema:
 * {
 *   _id: string,
 *   userId: string,           // Hub user who owns this wallet
 *   address: string,          // Ethereum address (public)
 *   serverShare: string,      // Hex-encoded server share
 *   recoveryShare: string,    // Hex-encoded recovery share (TODO: move to Router)
 *   createdAt: Date
 * }
 *
 * Security notes:
 * - Device share stored in client localStorage (not here)
 * - 2-of-3 Shamir: need any 2 shares to reconstruct private key
 * - TODO: Move recoveryShare to Router for separation of trust
 * - TODO: Encrypt recoveryShare with user PIN
 */
export const WalletShares = new Mongo.Collection('walletShares');

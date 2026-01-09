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

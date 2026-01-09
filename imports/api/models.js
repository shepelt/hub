import { Meteor } from 'meteor/meteor';

/**
 * Available LLM models for the playground
 * Reads from Meteor.settings.public.models
 */

export const getModels = () => {
  return Meteor.settings?.public?.models || [];
};

export const getDefaultModel = () => {
  return Meteor.settings?.public?.defaultModel || getModels()[0]?.id || '';
};

export const getModelById = (id) => {
  const models = getModels();
  return models.find(m => m.id === id) || models[0];
};

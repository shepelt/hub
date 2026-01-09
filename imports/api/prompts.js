/**
 * System prompts for LLM interactions
 */

const getDateInfo = () => {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return now.toLocaleDateString('en-US', options);
};

export const prompts = {
  default: `You are a helpful AI assistant. You can use Markdown formatting in your responses (headers, lists, code blocks, bold, italic, etc.). You can use LaTeX for math (e.g., $\\sqrt{9} = 3$ or $$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$).`,
  coder: `You are an expert programmer. Write clean, efficient code with minimal explanation. Use Markdown code blocks with language hints.`,
};

export const getPrompt = (name = 'default') => {
  const basePrompt = prompts[name] || prompts.default;
  const dateInfo = `Current date: ${getDateInfo()}`;
  return `${basePrompt}\n\n${dateInfo}`;
};

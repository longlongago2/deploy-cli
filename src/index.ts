/*!
 * CLI for deploy project to server
 * Configuration file: deploy.config.js or deploy.config.json
 */

import { initCommands } from './commands/index.js';

initCommands();

export type { ConfigOptions } from './commands/deploy.js';

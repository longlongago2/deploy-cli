#!/usr/bin/env node

import { initCommands } from './commands/index.js';

initCommands();

export type { ConfigOptions } from './commands/deploy.js';

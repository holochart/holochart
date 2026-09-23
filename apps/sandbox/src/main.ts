import { startApp } from './app.ts';
import { readParams } from './params.ts';
import { startTestMode } from './test-mode.ts';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

const params = readParams();
if (params.test) startTestMode(root, params.example);
else startApp(root);

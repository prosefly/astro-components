import iconConfig from 'virtual:prosefly/astro-components/icon/config';
import { createIconMiddleware } from './preload.js';

export const onRequest = createIconMiddleware(iconConfig);

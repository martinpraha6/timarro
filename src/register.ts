/**
 * Side-effect entry: importing this module registers <timarro-timeline>.
 * Also the source of the self-registering CDN bundle (dist/timarro.min.js),
 * which exposes `window.Timarro`.
 */
import { define } from './element';

export { TimarroTimeline, define } from './element';

define();

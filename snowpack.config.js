/** @type {import("snowpack").SnowpackUserConfig } */

const httpProxy = require('http-proxy');
const proxy = httpProxy.createServer({ target: 'http://localhost:3021' });

module.exports = {
  mount: {
    public: { url: '/', static: true },
    src: { url: '/dist' },
  },
  plugins: ['@snowpack/plugin-typescript'],
  routes: [
    {
      src: '/api/.*',
      dest: (req, res) => {
        req.url = req.url.replace(/^\/api/, '');
        proxy.web(req, res);
      },
    },
    /* Enable an SPA Fallback in development: */
    // {"match": "routes", "src": ".*", "dest": "/index.html"},
  ],
  optimize: {
    /* Example: Bundle your final build: */
    // "bundle": true,
  },
  packageOptions: {
    /* ... */
  },
  devOptions: {
    /* ... */
  },
  buildOptions: {
    /* ... */
  },
};

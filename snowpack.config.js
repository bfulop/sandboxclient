// const httpProxy = require('http-proxy');
import httpProxy from 'http-proxy';
const proxy = httpProxy.createServer({ target: 'http://localhost:3021' });

const config = {
  optimize: {
    "bundle": true,
    "minify": true,
    "target": "es2020"
  },
  mount: {
    public: { url: '/', static: true },
    src: { url: '/abtasty_sandboxed' },
  },
  plugins: ['@snowpack/plugin-typescript'],
  routes: [
    {
      src: '/api/.*',
      dest: (req, res) => {
        req.url = req.url.replace(/^\/api/, '');
        console.log('gonna proxy to', req.url)
        proxy.web(req, res);
      },
    },
    /* Enable an SPA Fallback in development: */
    // {"match": "routes", "src": ".*", "dest": "/index.html"},
  ],
  packageOptions: {
    // "source": "remote",
  },
  devOptions: {
    /* ... */
  },
  buildOptions: {
    out: "build"
    /* ... */
  },
};

export default config;

import httpProxy from 'http-proxy';
const proxy = httpProxy.createServer({ target: 'http://localhost:3021' });

const config = {
  optimize: {
    "bundle": true,
    "minify": false,
    "target": "es2020"
  },
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
        console.log('gonna proxy to', req.url)
        proxy.web(req, res);
      },
    },
    /* Enable an SPA Fallback in development: */
    // {"match": "routes", "src": ".*", "dest": "/index.html"},
  ],
  packageOptions: {
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

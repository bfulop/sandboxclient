self.addEventListener('install', function(event) {
  console.log('Service Worker Installed new version 7');
  event.waitUntil(
    caches.open('v2').then((cache) => {
      return cache.addAll([
        './sw_mocked_script.js',
      ]);
    })
  );
});

function isEditorAsset(request) {
  if (request.url.includes("_snowpack")) return true;
  if (request.url.includes("abtasty_sandboxed")) return true;
  if (request.url.includes("getpage")) return true;
  if (request.url.includes("http://46.101.30.25:3021/getpage")) return true;
  return false;
}

function isExternalScript(request) {
  if (isEditorAsset(request)) return false;
  if (request.url.includes(".js")) return true;
  if (request.destination.includes('script')) return true;
  return false;
}

let remoteUrl;
let localUrl;

addEventListener('message', (event) => {
  if (event.data.type && event.data.type === 'remoteUrl') {
    remoteUrl = new URL(event.data.payload);
    localUrl = event.data.currenturl;
  }
})

function shouldProxyAsset(request) {
  if (isEditorAsset(request)) return false;
  if (request.url.startsWith(`${localUrl}/api`)) return false;
  if (request.url.startsWith(`${localUrl}`)) return true;
  return false;
}

const fakeResponse = new Response('console.log("hello replaced script")', {
  headers: { 'Content-Type': 'application/javascript' },
});

function returnFakeResponse() {
  return fakeResponse.clone();
}

addEventListener('fetch', event => {
  const request = event.request;

  if (isExternalScript(request)) {
    const fakeresponse = returnFakeResponse();
    event.respondWith(fakeresponse);
    return;
  }

  if (shouldProxyAsset(request)) {
    const redirect = new Request(request.url.replace(localUrl, remoteUrl.origin));
    const externalAsset = fetch(redirect, { mode: 'no-cors' });
    event.respondWith(externalAsset);
    return;
  }



});

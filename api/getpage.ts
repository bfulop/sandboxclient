import { VercelRequest, VercelResponse } from '@vercel/node'
import got from 'got';

function handleRequest(req: VercelRequest, res: VercelResponse): void {
	console.log(req.url)
	const myparams = {}
	Object.keys(req.query).forEach(k => {
		myparams[k] = req.query[k]
	})
	got('http://46.101.30.25:3021/getpage/', {
		searchParams: myparams
	})
		.then(result => {
			res.send(result.body)
		})
	// res.json({
	// 	body: req.body,
	// 	query: req.query,
	// 	cookies: req.cookies,
	// })
}

export default handleRequest;
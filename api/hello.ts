import { VercelRequest, VercelResponse } from '@vercel/node'

export default (request: VercelRequest, response: VercelResponse): void => {
  const { name = 'World' } = request.query
  response.status(200).send(`Hello ${name}!`)
}
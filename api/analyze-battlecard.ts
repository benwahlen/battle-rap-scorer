import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { base64, mediaType } = req.body as { base64?: string; mediaType?: string }

  if (!base64 || !mediaType) {
    return res.status(400).json({ error: 'base64 und mediaType erforderlich' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY nicht konfiguriert' })
  }

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: 'Das ist eine Battle Rap Battlecard. Extrahiere: 1) Event-Name, 2) Ort/Stadt, 3) Datum falls sichtbar, 4) alle Battles als Liste mit MC1 vs MC2 und Format (1v1 oder 2v2). Antworte nur als JSON: {name, location, date, battles: [{mc1, mc2, format}]}',
            },
          ],
        },
      ],
    }),
  })

  if (!anthropicRes.ok) {
    const err = await anthropicRes.json().catch(() => ({})) as { error?: { message?: string } }
    return res.status(anthropicRes.status).json({ error: err.error?.message ?? `API-Fehler ${anthropicRes.status}` })
  }

  const data = await anthropicRes.json() as { content: { type: string; text: string }[] }
  const text = data.content?.[0]?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return res.status(500).json({ error: 'Kein JSON in der Antwort' })

  try {
    return res.status(200).json(JSON.parse(match[0]))
  } catch {
    return res.status(500).json({ error: 'JSON-Parsing fehlgeschlagen' })
  }
}

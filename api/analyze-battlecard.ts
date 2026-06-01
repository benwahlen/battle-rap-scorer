import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers für lokale Entwicklung
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = req.body as { base64?: string; mediaType?: string } | undefined
    const base64 = body?.base64
    const mediaType = body?.mediaType

    if (!base64 || !mediaType) {
      return res.status(400).json({ error: 'base64 und mediaType erforderlich' })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('[analyze-battlecard] ANTHROPIC_API_KEY fehlt')
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY nicht konfiguriert' })
    }

    console.log(`[analyze-battlecard] Starte Analyse, mediaType=${mediaType}, base64 length=${base64.length}`)

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
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

    const responseText = await anthropicRes.text()
    console.log(`[analyze-battlecard] Anthropic status=${anthropicRes.status}, body=${responseText.slice(0, 200)}`)

    if (!anthropicRes.ok) {
      let errMsg = `Anthropic API-Fehler ${anthropicRes.status}`
      try {
        const errBody = JSON.parse(responseText) as { error?: { message?: string } }
        if (errBody.error?.message) errMsg = errBody.error.message
      } catch { /* ignore parse error */ }
      return res.status(anthropicRes.status).json({ error: errMsg })
    }

    const data = JSON.parse(responseText) as { content: { type: string; text: string }[] }
    const text = data.content?.[0]?.text ?? ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error('[analyze-battlecard] Kein JSON gefunden in:', text)
      return res.status(500).json({ error: 'Kein JSON in der Antwort', raw: text.slice(0, 200) })
    }

    return res.status(200).json(JSON.parse(match[0]))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[analyze-battlecard] Unerwarteter Fehler:', msg)
    return res.status(500).json({ error: `Serverfehler: ${msg}` })
  }
}

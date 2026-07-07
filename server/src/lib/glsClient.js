// GLS Spain domestic webservice integration
// Endpoint: https://ws-customer.gls-spain.es/b2b.asmx
// WSDL namespace: http://www.asmred.com/
//
// Flow:
//   1. GrabaServicios  → creates shipment, returns codbarras (tracking number)
//   2. EtiquetaEnvio   → fetches label PDF (base64) for that codbarras

const https = require('https')

const GLS_ENDPOINT = 'https://ws-customer.gls-spain.es/b2b.asmx'
const GLS_NS       = 'http://www.asmred.com/'

const GLS_UID      = process.env.GLS_UID      || ''   // e.g. 6a8647dc-eb6a-4e21-8cd9-b4f4fc016507
const GLS_TEST_UID = '6BAB7A53-3B6D-4D5A-9450-702D2FAC0B11'
const GLS_TEST_MODE = (process.env.GLS_TEST_MODE || 'true') === 'true'

const SENDER = {
  name:    process.env.GLS_SENDER_NAME    || 'GYM COMPANY RETAIL SL',
  address: process.env.GLS_SENDER_ADDRESS || 'AVDA CORTS CATALANES 8 NAVE 6 GYM COMPAN',
  city:    process.env.GLS_SENDER_CITY    || 'SANT CUGAT DEL VALLES',
  province:process.env.GLS_SENDER_PROVINCE|| 'Barcelona',
  zip:     process.env.GLS_SENDER_ZIP     || '08173',
  phone:   process.env.GLS_SENDER_PHONE   || '',
  email:   process.env.GLS_SENDER_EMAIL   || '',
}

function isConfigured() {
  return !!(GLS_UID && SENDER.name && SENDER.zip)
}

function activeUid() {
  return GLS_TEST_MODE ? GLS_TEST_UID : GLS_UID
}

function esc(s) {
  return String(s ?? '').replace(/[<>&'"]/g, c =>
    ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', "'":'&apos;', '"':'&quot;' }[c]))
}

function soapEnvelope(action, innerXml) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${action} xmlns="${GLS_NS}">
      <docIn>${innerXml}</docIn>
    </${action}>
  </soap:Body>
</soap:Envelope>`
}

// ISO → GLS country code (phone prefix, from ES-GLS-Maestros_V2.xlsx "Paises" sheet)
const GLS_COUNTRY_CODES = {
  ES:34, PT:351, US:1, RU:7, CA:11, EG:20, GR:30, NL:31, BE:32, FR:33,
  HU:36, IT:39, RO:40, LI:41, CZ:42, AT:43, GB:44, DK:45, SE:46, NO:47,
  PL:48, DE:49, CH:411, SK:421, LU:352, IE:353, IS:354, FI:358, BG:359,
  EE:360, HR:385, SI:386, BA:387, MK:389, SM:391, LT:77, LV:78, UA:380,
  MC:331, MA:212, DZ:213, TN:216, TR:90, IL:972, SA:966, JP:81, KR:82,
  CN:86, AU:61, NZ:64, IN:91, BR:55, AR:54, MX:52, CL:56, CO:57, PE:51,
  CY:301, MT:443, GI:441,
}

function glsCountryCode(iso) {
  return GLS_COUNTRY_CODES[(iso || 'ES').toUpperCase()] ?? 34
}

function buildShipmentXml({ recipient, ref, fecha, parcels = 1, retorno = 0 }) {
  const dateStr = fecha || new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' })
  const isInternational = recipient.country && recipient.country.toUpperCase() !== 'ES'
  const servicio = isInternational ? 74 : 96
  const horario  = isInternational ? 3  : 18
  return `<Servicios uidcliente="${esc(activeUid())}" xmlns="${GLS_NS}">
  <Envio codbarras="">
    <Fecha>${dateStr}</Fecha>
    <Portes>P</Portes>
    <Servicio>${servicio}</Servicio>
    <Horario>${horario}</Horario>
    <Bultos>${Math.max(1, parcels)}</Bultos>
    <Peso>1</Peso>
    <Retorno>${retorno}</Retorno>
    <Pod>N</Pod>
    <Remite>
      <Plaza></Plaza>
      <Nombre><![CDATA[${SENDER.name}]]></Nombre>
      <Direccion><![CDATA[${SENDER.address}]]></Direccion>
      <Poblacion><![CDATA[${SENDER.city}]]></Poblacion>
      <Provincia><![CDATA[${SENDER.province}]]></Provincia>
      <Pais>34</Pais>
      <CP>${SENDER.zip}</CP>
      <Telefono><![CDATA[${SENDER.phone}]]></Telefono>
      <Email><![CDATA[${SENDER.email}]]></Email>
      <Observaciones><![CDATA[]]></Observaciones>
    </Remite>
    <Destinatario>
      <Codigo></Codigo>
      <Plaza></Plaza>
      <Nombre><![CDATA[${recipient.name}]]></Nombre>
      <Direccion><![CDATA[${recipient.address}]]></Direccion>
      <Poblacion><![CDATA[${recipient.city}]]></Poblacion>
      <Provincia><![CDATA[${recipient.province || recipient.city}]]></Provincia>
      <Pais>${glsCountryCode(recipient.country)}</Pais>
      <CP>${recipient.zip}</CP>
      <Telefono><![CDATA[${recipient.phone || ''}]]></Telefono>
      <Movil><![CDATA[${recipient.mobile || ''}]]></Movil>
      <Email><![CDATA[${recipient.email || ''}]]></Email>
      <Observaciones><![CDATA[${recipient.notes || ''}]]></Observaciones>
    </Destinatario>
    <Referencias>
      <Referencia tipo="C"><![CDATA[${ref}]]></Referencia>
    </Referencias>
    <Importes>
      <Reembolso></Reembolso>
    </Importes>
  </Envio>
</Servicios>`
}

function postSoap(xmlBody, soapAction) {
  return new Promise((resolve, reject) => {
    const url  = new URL(GLS_ENDPOINT)
    const body = Buffer.from(xmlBody, 'utf8')
    const req  = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type':  'text/xml; charset=utf-8',
        'Content-Length': body.length,
        'SOAPAction': `"${soapAction}"`,
      },
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        console.log('\n=== GLS RESPONSE ===')
        console.log('Status:', res.statusCode)
        console.log('Body:\n', data)
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data)
        else reject(new Error(`GLS HTTP ${res.statusCode}: ${data.slice(0, 400)}`))
      })
    })
    req.on('error', reject)
    console.log('\n=== GLS REQUEST ===')
    console.log('Endpoint:', GLS_ENDPOINT)
    console.log('SOAPAction:', soapAction)
    console.log('Body:\n', xmlBody)
    req.write(body)
    req.end()
  })
}

// Step 1: create shipment → returns array of { codbarras, codexp }
async function grabaServicios(recipient, ref, parcels = 1, retorno = 0) {
  const innerXml = buildShipmentXml({ recipient, ref, parcels, retorno })
  const envelope = soapEnvelope('GrabaServicios', innerXml)
  const raw = await postSoap(envelope, `${GLS_NS}GrabaServicios`)

  const retMatch = raw.match(/return="(-?\d+)"/i)
  const errors = [...raw.matchAll(/<Error[^>]*>([\s\S]*?)<\/Error>/gi)].map(m => m[1].trim()).filter(Boolean)

  if (retMatch && retMatch[1] !== '0') {
    const msg = errors.length ? errors.join(' | ') : `código ${retMatch[1]}`
    throw new Error(`GLS: ${msg}`)
  }

  // Log all Envio attributes parsed as key=value to identify international tracking field
  const envioMatches = [...raw.matchAll(/<Envio([^>]+)>/gi)]
  envioMatches.forEach(m => {
    const pairs = {}
    const attrRx = /(\w+)="([^"]*)"/g
    let a
    while ((a = attrRx.exec(m[1])) !== null) pairs[a[1]] = a[2]
    console.log('[GLS] Envio fields:', JSON.stringify(pairs))
  })

  // codbarras (618...) = internal barcode; codexp = domestic tracking; check for international tracking fields
  const envios = [...raw.matchAll(/codbarras="([^"]+)"[^>]*codexp="([^"]+)"/gi)].map(m => {
    const attrs = m[0]
    // For international Eurobusiness, tracking may be in a different field (uid is always a UUID, not tracking)
    const intlMatch = attrs.match(/(?:codUnicoExp|codBarrasExt|trackId|codRuta)="([^"]+)"/i)
    return { codbarras: m[1], codexp: intlMatch?.[1] || m[2] }
  })
  if (envios.length === 0) {
    const msg = errors.length ? errors.join(' | ') : 'respuesta inesperada del servidor GLS'
    throw new Error(`GLS: ${msg}`)
  }
  return envios
}

// Step 2: fetch label PDF for a given codbarras → returns Buffer
async function etiquetaEnvio(codbarras) {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <EtiquetaEnvio xmlns="${GLS_NS}">
      <uidCliente>${esc(activeUid())}</uidCliente>
      <codigo>${esc(codbarras)}</codigo>
      <tipoEtiqueta>PDF</tipoEtiqueta>
      <plataforma></plataforma>
    </EtiquetaEnvio>
  </soap:Body>
</soap:Envelope>`

  const raw = await postSoap(envelope, `${GLS_NS}EtiquetaEnvio`)
  const b64Match = raw.match(/<base64Binary[^>]*>([\s\S]+?)<\/base64Binary>/i)
  if (!b64Match) throw new Error(`GLS no devolvió etiqueta PDF. Respuesta: ${raw.slice(0, 400)}`)
  return Buffer.from(b64Match[1].trim(), 'base64')
}

// Public — creates shipment + fetches label PDFs, merges into one buffer
// Returns { tracking: string (comma-separated), labelPdfBuffer: Buffer }
async function createShipment({ recipient, ref, parcels = 1, retorno = 0 }) {
  if (!isConfigured()) throw new Error('GLS_UID no configurado en .env')
  if (!recipient.zip || recipient.zip.length < 4)
    throw new Error('Falta el código postal del destinatario. Edita la dirección del albarán antes de generar la etiqueta GLS.')
  if (!recipient.name)
    throw new Error('Falta el nombre del destinatario.')
  if (!recipient.address)
    throw new Error('Falta la dirección del destinatario.')

  const envios = await grabaServicios(recipient, ref, parcels, retorno)
  const labelBuffers = []
  for (const { codbarras } of envios) {
    try {
      const buf = await etiquetaEnvio(codbarras)
      labelBuffers.push(buf)
    } catch (e) {
      console.warn('[GLS] etiqueta no disponible para', codbarras, ':', e.message)
    }
  }

  let labelPdfBuffer = null
  if (labelBuffers.length > 0) {
    if (labelBuffers.length === 1) {
      labelPdfBuffer = labelBuffers[0]
    } else {
      const { PDFDocument } = require('pdf-lib')
      const merged = await PDFDocument.create()
      for (const buf of labelBuffers) {
        const src = await PDFDocument.load(buf)
        const pages = await merged.copyPages(src, src.getPageIndices())
        pages.forEach(p => merged.addPage(p))
      }
      labelPdfBuffer = Buffer.from(await merged.save())
    }
  }

  return {
    tracking: envios.map(e => e.codexp).join(','),
    codbarras: envios.map(e => e.codbarras).join(','),
    labelPdfBuffer,
  }
}

// Cancel shipment by codbarras — only works before pickup
async function borraServicios(codbarras) {
  if (!isConfigured()) throw new Error('GLS_UID no configurado en .env')
  const codes = Array.isArray(codbarras) ? codbarras : [codbarras]
  const enviosXml = codes.map(c => `<Envio codbarras="${esc(c)}"></Envio>`).join('\n    ')
  const innerXml = `<Servicios uidcliente="${esc(activeUid())}" xmlns="${GLS_NS}">
    ${enviosXml}
  </Servicios>`
  const envelope = soapEnvelope('Anula', innerXml)
  const raw = await postSoap(envelope, `${GLS_NS}Anula`)
  const retMatch = raw.match(/return="(-?\d+)"/i)
  const errors = [...raw.matchAll(/<Error[^>]*>([\s\S]*?)<\/Error>/gi)].map(m => m[1].trim()).filter(Boolean)
  if (retMatch && retMatch[1] !== '0') {
    const msg = errors.length ? errors.join(' | ') : `código ${retMatch[1]}`
    throw new Error(`GLS: ${msg}`)
  }
  if (errors.length) throw new Error(`GLS: ${errors.join(' | ')}`)
  return true
}

// Cierre de jornada — llama a CierreAgencia para comunicar fin de recogidas del día
// Returns { manifesto: string (base64 PDF or empty) }
async function cierreJornada() {
  if (!isConfigured()) throw new Error('GLS_UID no configurado en .env')
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <CierreAgencia xmlns="${GLS_NS}">
      <uidCliente>${esc(activeUid())}</uidCliente>
    </CierreAgencia>
  </soap:Body>
</soap:Envelope>`
  const raw = await postSoap(envelope, `${GLS_NS}CierreAgencia`)
  const errors = [...raw.matchAll(/<Error[^>]*>([\s\S]*?)<\/Error>/gi)].map(m => m[1].trim()).filter(Boolean)
  if (errors.length) throw new Error(`GLS: ${errors.join(' | ')}`)
  const b64Match = raw.match(/<base64Binary[^>]*>([\s\S]+?)<\/base64Binary>/i)
  return { pdfBuffer: b64Match ? Buffer.from(b64Match[1].trim(), 'base64') : null }
}

module.exports = { createShipment, borraServicios, cierreJornada, isConfigured, activeUid }

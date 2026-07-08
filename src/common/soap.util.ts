import { ConfigService } from '@nestjs/config';

// Prescriptions and medicines are both dispatched over SOAP, but to distinct
// physical machines (RB1500 today, more model codes later — see
// MACHINE_PATH_NZP360 already reserved in .env) — each has its own env var
// so a caller must say which machine it's targeting.
export type MachineName = 'RB1500' | 'NZP360';

export function getMachineTarget(
  config: ConfigService,
  machine: MachineName,
): string {
  const envKey = `MACHINE_PATH_${machine}`;
  const configuredPath = config.get<string>(envKey);

  if (!configuredPath) {
    throw new Error(
      `Critical Error: ${envKey} is not defined in .env environment variables`,
    );
  }

  return configuredPath;
}

export function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// These machines' SOAP 1.2 ASMX endpoints route by the operation's action
// being part of Content-Type (not a separate SOAPAction header) — omit it and
// every call fails with a generic "no valid action parameter" fault
// regardless of how correct the envelope body is. Confirmed against RB1500's
// WSDL, where both SendMedicine and SendPrescription declare
// soapAction="http://tempuri.org/<operation>". NZP360's WSDL uses a different
// targetNamespace ("RssServer" per its envelope's xmlns:tns) — that gives
// soapAction="RssServer/<operation>" by the same convention, but this hasn't
// been confirmed against a real NZP360 call yet (see sendMedicineToNZP360).
export function buildSoapContentType(
  operation: string,
  namespace = 'http://tempuri.org/',
): string {
  return `application/soap+xml; charset=utf-8; action="${namespace}${namespace.endsWith('/') ? '' : '/'}${operation}"`;
}

export type MachineResult = {
  success: boolean;
  resultCode?: string;
  error?: string;
  /** Unescaped <DocumentElement>...</DocumentElement> body, for callers that need to pull out more than Result/Error (e.g. a <DataTable> list). */
  innerXml?: string;
};

// The machine always replies HTTP 200 for a well-formed SOAP call — the real
// outcome is escaped XML embedded inside <XxxResult>...</XxxResult>:
// <Result>0</Result> means success, anything else comes with a Chinese
// <Error> message. response.ok alone is not a reliable success signal here.
export function parseMachineResult(responseBody: string): MachineResult {
  const resultTagMatch = responseBody.match(
    /<\w+Result>([\s\S]*?)<\/\w+Result>/,
  );
  if (!resultTagMatch) {
    return { success: false, error: 'Unrecognized response from machine' };
  }

  const inner = unescapeXmlEntities(resultTagMatch[1]);
  const resultCode = inner.match(/<Result>([\s\S]*?)<\/Result>/)?.[1];
  const error = inner.match(/<Error>([\s\S]*?)<\/Error>/)?.[1];

  return {
    success: resultCode === '0',
    resultCode,
    error: error || undefined,
    innerXml: inner,
  };
}

// Pulls every occurrence of a repeated leaf tag out of an XML fragment, e.g.
// extractTagValues(innerXml, 'PreHISId') for a <DataTable> with several
// <PreHISId> siblings. Deliberately simple (no real XML parser in this
// codebase) — fine for flat, non-nested repeated tags like this one.
export function extractTagValues(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'g');
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    values.push(match[1].trim());
  }
  return values;
}

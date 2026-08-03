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

// NZP360's ATDPS integration doc requires every call (unlike RB1500) to
// carry a `Token` header, obtained from a separate login call whose spec
// isn't documented yet — MACHINE_TOKEN_NZP360 is a placeholder env var to
// fill in once that's available. Unlike getMachineTarget, a missing token
// doesn't throw: it's expected to be empty for now, and the header is
// simply omitted (the real machine will presumably reject the call with its
// own auth error, which surfaces the same way any other machine rejection
// already does).
export function getMachineToken(config: ConfigService): string | undefined {
  return config.get<string>('MACHINE_TOKEN_NZP360') || undefined;
}

// Builds the full header set for an NZP360 call in one place — Content-Type
// (still folded-action SOAP 1.2, matching RB1500's confirmed convention,
// not the SOAP 1.1 + separate SOAPAction header the ATDPS doc's captured
// examples happen to show, since ASMX services normally answer both SOAP
// versions and there's no evidence yet that 1.2 doesn't work here — see the
// CLAUDE.md note this decision came with) plus Token if configured.
export function buildNzp360Headers(
  config: ConfigService,
  operation: string,
): Record<string, string> {
  const token = getMachineToken(config);
  return {
    'Content-Type': buildSoapContentType(operation, 'RssServer'),
    ...(token ? { Token: token } : {}),
  };
}

export function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Exported for debug logging — the machine's response often wraps its real
// content in HTML-entity-escaped text (e.g. NZP360's QueryInventory returns
// <QueryInventoryResult>&lt;![CDATA[&lt;?xml...&gt;...]]&gt;</QueryInventoryResult>,
// same idea as RB1500 wrapping its DataTable in literal "<![CDATA[" text —
// see the SOAP structures note in CLAUDE.md). parseMachineResult already
// unescapes this once it extracts the <XxxResult> body; callers that want a
// human-readable console.log of the *raw* response before parsing can run
// it through this directly.
export function unescapeXmlEntities(value: string): string {
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

// Splits an XML fragment into each occurrence of a repeated block (e.g.
// <BasketItem>...</BasketItem> inside a <BasketList>) so a caller can run
// extractTagValues on each block individually — correlating several fields
// per item, which extractTagValues alone can't do since it only returns one
// flat list across the whole fragment, not grouped per item.
export function extractRepeatedBlocks(
  xml: string,
  blockTagName: string,
): string[] {
  const pattern = new RegExp(
    `<${blockTagName}>([\\s\\S]*?)<\\/${blockTagName}>`,
    'g',
  );
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

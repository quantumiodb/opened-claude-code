/**
 * Stub: types/connectorText.ts — missing from source map extraction.
 */

export interface ConnectorTextBlock {
  type: 'connector_text';
  [key: string]: unknown;
}

export interface ConnectorTextDelta {
  type: 'connector_text_delta';
  [key: string]: unknown;
}

export function isConnectorTextBlock(block: unknown): block is ConnectorTextBlock {
  return typeof block === 'object' && block !== null && (block as any).type === 'connector_text';
}

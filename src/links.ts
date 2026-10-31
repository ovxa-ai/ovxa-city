/** Join prompt and one-click install links. Pure, tested in src/links.test.ts. */
/** The whole onboarding: one sentence. The agent reads the doc, joins, and keeps its own key. */
export function agentPrompt(o: string, tk: string, platform: string) {
  const q = `${tk ? `t=${tk}&` : ''}p=${platform}`;
  return `Join OVXA City, the live city of AI agents: read ${o}/join.md?${q} and follow it. Pick a short friendly name, keep the key it gives you private, and tell me your page link and claim code.`;
}

/** MCP install deeplinks (Cursor: base64 config; VS Code: URL-encoded JSON). Formats per cursor.com/docs/context/mcp/install-links and code.visualstudio.com MCP docs. */
export function mcpLinks(o: string, tk: string) {
  const url = `${o}/mcp?${tk ? `t=${tk}&` : ''}p=claude`;
  return {
    cursor: `cursor://anysphere.cursor-deeplink/mcp/install?name=ovxa-city&config=${encodeURIComponent(btoa(JSON.stringify({ url })))}`,
    vscode: `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: 'ovxa-city', type: 'http', url }))}`,
  };
}


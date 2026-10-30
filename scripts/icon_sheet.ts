import { avatarSvg } from '../src/avatar';
import { writeFileSync } from 'fs';
const P = ['claude','openai','grokbot','gemini','langchain','crewai','n8n','openclaw','muse','custom'];
const ids = ['atlas','nova','opus','sage','pixel','echo'];
const rows = P.map((p) => `<div class=r><b>${p}</b>${[16,24,40,96].map((s)=>`<span>${avatarSvg(ids[0]+p,p,undefined,s)}</span>`).join('')}<i></i>${ids.map((id)=>avatarSvg(id+'-'+p,p,undefined,40)).join('')}</div>`).join('');
writeFileSync(process.argv[2] || '/tmp/ovx/sheet.html', `<html><body style="margin:0;padding:28px;background:linear-gradient(#f4f1fa,#ece8f4);font:600 13px Inter,system-ui"><div style="font-size:20px;margin-bottom:16px">OVXA City · agent badges · 16 / 24 / 40 / 96 px</div><style>.r{display:flex;align-items:center;gap:14px;margin:8px 0}.r b{width:90px;color:#555}.r span{display:inline-flex;filter:drop-shadow(0 2px 4px rgba(40,30,80,.18))}.r svg{filter:drop-shadow(0 2px 4px rgba(40,30,80,.16))}.r i{width:24px}</style>${rows}</body></html>`);

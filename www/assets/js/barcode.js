/* Arya Pharma Manager — barcode generator (v1.2, SRS global feature).
   Renders CODE 128 (subset B) as inline SVG — covers digits and ASCII text,
   which is what pharmacy label printers and USB scanners expect.
   No dependencies. Verify one printed label with your scanner before
   printing in bulk (see README §labels). */
'use strict';

const Code128 = (() => {
  // Standard CODE128 bar/space width patterns, indices 0..106 (values 0..102,
  // 103-105 start codes, 106 stop). Each string = 6 alternating bar/space widths.
  const P = [
    '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
    '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
    '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
    '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
    '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
    '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
    '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
    '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
    '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
    '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
    '114131','311141','411131','211412','211214','211232','2331112', // 106 = stop (7 widths)
  ];
  const STOP = 106, START_B = 104;

  function encode(text) {
    text = String(text);
    for (const ch of text) {
      const c = ch.charCodeAt(0);
      if (c < 32 || c > 126) throw new Error('Barcode text must be plain ASCII (letters, digits, - . /).');
    }
    const values = [START_B, ...[...text].map(ch => ch.charCodeAt(0) - 32)];
    let sum = values[0];
    for (let i = 1; i < values.length; i++) sum += values[i] * i;
    values.push(sum % 103, STOP);
    return values;
  }

  /** SVG string. opts: {height=44, module=2, showText=true} */
  function svg(text, opts = {}) {
    const h = opts.height ?? 44, m = opts.module ?? 2, showText = opts.showText !== false;
    let x = 10 * m; // quiet zone
    const rects = [];
    for (const v of encode(text)) {
      const widths = P[v];
      for (let i = 0; i < widths.length; i++) {
        const w = +widths[i] * m;
        if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${w}" height="${h}"/>`);
        x += w;
      }
    }
    x += 10 * m; // trailing quiet zone
    const totalH = h + (showText ? 16 : 2);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${totalH}" width="${x}" height="${totalH}" shape-rendering="crispEdges">
      <rect width="${x}" height="${totalH}" fill="#fff"/>
      <g fill="#000">${rects.join('')}</g>
      ${showText ? `<text x="${x / 2}" y="${h + 13}" font-family="monospace" font-size="12" text-anchor="middle" fill="#000">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>` : ''}
    </svg>`;
  }

  return { svg };
})();

/** Print a sheet of product labels. items: [{code, name, price}], copies per item. */
function printLabels(items, copies = 1) {
  let cells = '';
  for (const it of items) {
    let barcodeSvg;
    try { barcodeSvg = Code128.svg(it.code, { height: 40, module: 2 }); }
    catch (e) { toast(`${it.name}: ${e.message}`, 'err'); continue; }
    for (let i = 0; i < copies; i++) {
      cells += `<div class="lbl">
        <div class="nm">${esc(it.name)}</div>
        ${barcodeSvg}
        <div class="pr">${fmt.money(it.price)} ${CUR()}</div>
      </div>`;
    }
  }
  if (!cells) return;
  const w = window.open('', '_blank', 'width=820,height=600');
  if (!w) { toast('Pop-up blocked — allow pop-ups to print labels.', 'warn'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>
    @page{ size:A4; margin:8mm; }
    body{ margin:0; font-family:system-ui,sans-serif; display:flex; flex-wrap:wrap; gap:3mm; }
    .lbl{ width:60mm; border:0.3mm dashed #bbb; border-radius:2mm; padding:2mm;
          text-align:center; break-inside:avoid; }
    .nm{ font-size:10.5px; font-weight:700; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
    .pr{ font-size:11px; font-weight:700; }
    svg{ max-width:100%; height:auto; }
  </style></head><body>${cells}
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 400); };<\/script>
  </body></html>`);
  w.document.close();
}

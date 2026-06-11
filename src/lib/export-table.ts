type TableData = { H: string[]; R: string[][] };

function readTable(id: string): TableData {
  const t = document.getElementById(id) as HTMLTableElement | null;
  if (!t) return { H: [], R: [] };
  const heads = Array.from(t.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
  const keep = heads.map((h, i) => (h !== "" ? i : -1)).filter((i) => i >= 0);
  const H = keep.map((i) => heads[i]);
  const R = Array.from(t.querySelectorAll("tbody tr")).map((tr) => {
    const cells = Array.from(tr.children) as HTMLElement[];
    return keep.map((i) => {
      const td = cells[i];
      if (!td) return "";
      const sel = td.querySelector("select") as HTMLSelectElement | null;
      if (sel) return sel.value;
      const nm = td.querySelector(".nm");
      if (nm) return nm.textContent?.trim() ?? "";
      return (td.textContent ?? "").replace(/\s+/g, " ").trim();
    });
  });
  return { H, R };
}

function triggerDownload(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
}

export function exportTableCSV(id: string, filename: string) {
  const { H, R } = readTable(id);
  const esc = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const csv = [H.map(esc).join(";"), ...R.map((r) => r.map(esc).join(";"))].join("\n");
  triggerDownload(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }), filename + ".csv");
}

export function exportTableXLS(id: string, filename: string) {
  const { H, R } = readTable(id);
  const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>` +
    `<table border="1"><thead><tr>${H.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` +
    `<tbody>${R.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  triggerDownload(new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8;" }), filename + ".xls");
}

export function exportTablePDF(id: string, filename: string, title?: string) {
  const { H, R } = readTable(id);
  const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(
    `<!DOCTYPE html><html lang="es-CO"><head><meta charset="utf-8"><title>${esc(filename)}</title>
    <style>
      body{font-family:Inter,system-ui,sans-serif;color:#333;padding:32px;}
      h1{font-weight:600;font-size:20px;margin:0 0 4px;}
      .sub{color:#888;font-size:12px;margin-bottom:20px;}
      table{width:100%;border-collapse:collapse;font-size:11px;}
      th{background:#F1F1F1;text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#666;border-bottom:1px solid #D5D6D7;}
      td{padding:7px 10px;border-bottom:1px solid #eee;}
      @media print{@page{size:landscape;margin:14mm;}}
    </style></head><body>
    <h1>${esc(title ?? filename)}</h1>
    <div class="sub">Smart Time Control · generado el ${new Date().toLocaleDateString("es-CO")}</div>
    <table><thead><tr>${H.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${R.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <scr` + `ipt>window.onload=function(){setTimeout(function(){window.print();},200);}</scr` + `ipt>
    </body></html>`,
  );
  w.document.close();
}

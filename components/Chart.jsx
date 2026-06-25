"use client";

import { useState, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, Legend,
} from "recharts";

const COLORES = ["#621044", "#2471A3", "#1E8449", "#C0392B", "#B7950B", "#5B2C6F"];
const RANGOS = ["1M", "3M", "6M", "YTD", "1A", "5A", "MAX"];
const FUENTES = {
  reuters_eikon: { label: "Reuters", color: "#621044" },
  bcra: { label: "BCRA", color: "#2471A3" },
  bls: { label: "BLS", color: "#1E8449" },
  fred: { label: "FRED", color: "#C0392B" },
  bea: { label: "BEA", color: "#5B2C6F" },
};

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const fmt = (n) => (n == null ? "—" : nf.format(n));

function restarMeses(fechaStr, meses) {
  const d = new Date(fechaStr + "T00:00:00");
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
}

export default function Chart({ series, onRemove }) {
  const [range, setRange] = useState("1A");
  const [zoom, setZoom] = useState(null); // {start, end}
  const [tipo, setTipo] = useState("area");
  const [normalizar, setNormalizar] = useState(series.length > 1);
  const [ocultas, setOcultas] = useState({});
  const [refL, setRefL] = useState(null);
  const [refR, setRefR] = useState(null);

  useEffect(() => { setNormalizar(series.length > 1); setZoom(null); }, [series.length]);

  const visibles = series.filter((s) => !ocultas[s.ric]);
  function toggle(ric) { setOcultas((o) => ({ ...o, [ric]: !o[ric] })); }

  // --- merge de todas las series por fecha ---
  const fechas = [...new Set(series.flatMap((s) => s.data.map((d) => d.fecha)))].sort();
  if (fechas.length === 0) return null;
  const mapas = series.map((s) => {
    const m = {}; s.data.forEach((d) => (m[d.fecha] = d.valor)); return m;
  });
  const mergedFull = fechas.map((f) => {
    const row = { fecha: f };
    series.forEach((s, i) => (row[s.ric] = mapas[i][f] ?? null));
    return row;
  });

  // --- ventana visible (rango o zoom) ---
  const maxF = fechas[fechas.length - 1];
  let start;
  if (range === "MAX") start = fechas[0];
  else if (range === "YTD") start = maxF.slice(0, 4) + "-01-01";
  else start = restarMeses(maxF, { "1M": 1, "3M": 3, "6M": 6, "1A": 12, "5A": 60 }[range]);
  let end = maxF;
  if (zoom) { start = zoom.start; end = zoom.end; }
  const vis = mergedFull.filter((r) => r.fecha >= start && r.fecha <= end);

  // --- normalización base 100 ---
  let data = vis;
  if (normalizar) {
    const base = {};
    series.forEach((s) => { const f = vis.find((r) => r[s.ric] != null); base[s.ric] = f ? f[s.ric] : null; });
    data = vis.map((r) => {
      const nr = { fecha: r.fecha };
      series.forEach((s) => (nr[s.ric] = r[s.ric] != null && base[s.ric] ? (r[s.ric] / base[s.ric]) * 100 : null));
      return nr;
    });
  }

  // --- dominio Y con padding ---
  const vals = data.flatMap((r) => visibles.map((s) => r[s.ric]).filter((v) => v != null));
  if (vals.length === 0) vals.push(0, 1);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const pad = (maxV - minV) * 0.06 || Math.abs(maxV) * 0.06 || 1;
  const yDomain = [minV - pad, maxV + pad];

  function aplicarZoom() {
    if (refL && refR && refL !== refR) {
      const [a, b] = [refL, refR].sort();
      setZoom({ start: a, end: b });
    }
    setRefL(null); setRefR(null);
  }

  function descargarCSV(s) {
    const filas = [["fecha", s.campo], ...s.data.map((d) => [d.fecha, d.valor])];
    const csv = filas.map((f) => f.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${s.ric}_${s.campo}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const tooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: "8px 12px", fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,.12)" }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        {payload.map((p) => (
          <div key={p.dataKey} style={{ color: p.color }}>
            {series.find((s) => s.ric === p.dataKey)?.descripcion || p.dataKey}: <b>{fmt(p.value)}</b>{normalizar ? " (b100)" : ""}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      {/* CONTROLES */}
      <div className="ctrl">
        <div className="rangos">
          {RANGOS.map((r) => (
            <button key={r} className={`rbtn ${range === r && !zoom ? "on" : ""}`}
              onClick={() => { setRange(r); setZoom(null); }}>{r}</button>
          ))}
        </div>
        <div className="ctrl-der">
          {zoom && <button className="rbtn reset" onClick={() => setZoom(null)}>✕ zoom</button>}
          <button className={`rbtn ${tipo === "area" ? "on" : ""}`} onClick={() => setTipo("area")}>Área</button>
          <button className={`rbtn ${tipo === "line" ? "on" : ""}`} onClick={() => setTipo("line")}>Línea</button>
          {series.length > 1 && (
            <button className={`rbtn ${normalizar ? "on" : ""}`} onClick={() => setNormalizar(!normalizar)}>Base 100</button>
          )}
        </div>
      </div>
      <div className="hint">Arrastrá sobre el gráfico para hacer zoom · {data.length} puntos visibles</div>

      {/* GRÁFICO */}
      <ResponsiveContainer width="100%" height={340}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          onMouseDown={(e) => e && setRefL(e.activeLabel)}
          onMouseMove={(e) => refL && e && setRefR(e.activeLabel)}
          onMouseUp={aplicarZoom}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORES[i % COLORES.length]} stopOpacity={0.35} />
                <stop offset="95%" stopColor={COLORES[i % COLORES.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="fecha" tick={{ fontSize: 11 }} minTickGap={50} />
          <YAxis tick={{ fontSize: 11 }} domain={yDomain} width={58} tickFormatter={fmt} />
          <Tooltip content={tooltip} />
          {series.length > 1 && <Legend formatter={(v) => series.find((s) => s.ric === v)?.descripcion || v} />}
          {series.map((s, i) => (
            <Area key={s.ric} type="monotone" dataKey={s.ric} name={s.ric}
              stroke={COLORES[i % COLORES.length]} strokeWidth={2}
              fill={`url(#grad${i})`} fillOpacity={tipo === "area" ? 1 : 0}
              connectNulls dot={false} isAnimationActive={false} hide={!!ocultas[s.ric]} />
          ))}
          {refL && refR && <ReferenceArea x1={refL} x2={refR} fill="#621044" fillOpacity={0.1} />}
        </AreaChart>
      </ResponsiveContainer>

      {/* LEYENDA CON STATS (click = mostrar/ocultar) */}
      <div className="serie-stats">
        {series.map((s, i) => {
          const f = vis.find((r) => r[s.ric] != null), l = [...vis].reverse().find((r) => r[s.ric] != null);
          const v0 = f?.[s.ric], v1 = l?.[s.ric];
          const varPct = v0 ? (((v1 / v0) - 1) * 100) : 0;
          const fu = FUENTES[s.fuente] || { label: s.fuente || "—", color: "#888" };
          const oculta = !!ocultas[s.ric];
          return (
            <div key={s.ric} className={`serie-stat ${oculta ? "oculta" : ""}`}>
              <span className="dot" style={{ background: COLORES[i % COLORES.length] }} onClick={() => toggle(s.ric)} title="Mostrar/ocultar" />
              <div className="ss-body" onClick={() => toggle(s.ric)}>
                <div className="ss-nombre">
                  {s.descripcion || s.ric}
                  <span className="fuente-badge" style={{ background: fu.color }}>{fu.label}</span>
                  <span className="ss-ric">{s.ric}</span>
                </div>
                <div className="ss-vals">
                  Último <b>{fmt(v1)}</b> ·
                  <span style={{ color: varPct >= 0 ? "var(--verde)" : "var(--rojo)", fontWeight: 700 }}> {varPct >= 0 ? "▲" : "▼"} {fmt(Math.abs(varPct))}%</span>
                </div>
              </div>
              <div className="ss-acc">
                <button className="csv-mini" onClick={() => descargarCSV(s)} title="Descargar CSV">⬇</button>
                {onRemove && <button className="quitar-mini" onClick={() => onRemove(s.ric, s.campo)} title="Quitar serie">✕</button>}
              </div>
            </div>
          );
        })}
      </div>

      {/* TABLA de la primera serie */}
      <details className="tabla-det">
        <summary>Ver tabla de datos — {series[0].descripcion || series[0].ric}</summary>
        <div className="tabla-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>{series[0].campo}</th></tr></thead>
            <tbody>
              {[...series[0].data].reverse().slice(0, 200).map((d, i) => (
                <tr key={i}><td>{d.fecha}</td><td>{fmt(d.valor)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
